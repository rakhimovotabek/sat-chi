import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  sourcePath,
  fingerprintFile,
  findSources,
  atomicJson,
} from "./source-files.js";
import { renderFirstPage } from "./cover-render.js";
const project = "ileffhbbaomfimwulvpw",
  run = promisify(execFile);
if ((await readFile("supabase/.temp/project-ref", "utf8")).trim() !== project)
  throw new Error("Unexpected linked project");
const apply = process.argv.includes("--apply"),
  sourceIndex = process.argv.indexOf("--source"),
  only = sourceIndex < 0 ? null : process.argv[sourceIndex + 1];
if (sourceIndex >= 0 && !only) throw new Error("Missing source filename");
async function cli(args) {
  try {
    const { stdout } = await run(
      "npx",
      ["--offline", "supabase@2.119.0", ...args, "--output", "json"],
      { maxBuffer: 4 * 1024 * 1024, timeout: 60000 },
    );
    return JSON.parse(
      stdout.slice(
        Math.min(
          ...[stdout.indexOf("{"), stdout.indexOf("[")].filter((n) => n >= 0),
        ),
      ),
    );
  } catch {
    throw new Error(
      "Supabase CLI unavailable; verify your login and retry. No credentials are written to disk.",
    );
  }
}
// Credentials exist only in process memory. Never print CLI key output, errors
// containing a response body, or a privileged client configuration.
let client;
async function storageClient() {
  if (client) return client;
  const keys = await cli([
    "projects",
    "api-keys",
    "--project-ref",
    project,
    "--reveal",
  ]);
  const entries = Array.isArray(keys) ? keys : keys.keys || keys.api_keys || [];
  const key =
    entries.find((k) => k.name === "service_role")?.api_key ||
    entries.find((k) => k.type === "secret")?.api_key;
  if (!key || key.includes("***"))
    throw new Error(
      "A privileged Storage credential is unavailable; no cover records changed.",
    );
  client = createClient(`https://${project}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
const sql = `select c.*,j.id source_id,j.source_file,j.source_path,j.fingerprint from (
 select 'books' kind,id,title,cover_url,cover_path,cover_metadata from public.books
 union all select 'vocabulary_books',id,title,cover_url,cover_path,cover_metadata from public.vocabulary_books
 ) c left join lateral(select * from public.import_jobs where (case when c.kind='books' then book_id else vocabulary_book_id end)=c.id order by updated_at desc limit 1) j on true order by c.kind,c.title`;
const catalog = (await cli(["db", "query", "--linked", sql])).rows;
const root = join(homedir(), "Desktop", "Books"),
  inventory = await findSources(root),
  results = [];
for (const book of catalog) {
  if (only && book.source_file !== only) continue;
  const entry = {
    id: book.id,
    title: book.title,
    kind: book.kind,
    source_file: book.source_file,
    source_id: book.source_id,
  };
  try {
    if (book.cover_url || book.cover_path) {
      results.push({
        ...entry,
        status: "already_has_cover",
        cover_path: book.cover_path,
        metadata: book.cover_metadata,
      });
      continue;
    }
    if (!book.source_path || !book.source_file) {
      results.push({ ...entry, status: "no_matched_source" });
      continue;
    }
    const source = await sourcePath(root, book.source_path);
    const hash = await fingerprintFile(source);
    if (hash !== book.fingerprint)
      throw new Error(
        "Source fingerprint differs from imported source; manual matching required",
      );
    const cover = await renderFirstPage(
      source,
      join("local-imports", "covers", book.id),
    );
    if (cover.status !== "generated") {
      results.push({ ...entry, ...cover });
      continue;
    }
    const path = `${book.kind === "books" ? "books" : "vocabulary"}/${book.id}/${hash}.webp`;
    const metadata = {
      source_id: book.source_id,
      source_file: book.source_file,
      source_sha256: hash,
      source_page: 1,
      extraction_method: cover.extraction_method,
      width: cover.width,
      height: cover.height,
      bytes: cover.bytes,
      generated_at: new Date().toISOString(),
    };
    if (apply) {
      const db = await storageClient();
      const { error: uploadError } = await db.storage
        .from("book-covers")
        .upload(path, await readFile(cover.path), {
          contentType: "image/webp",
          cacheControl: "300",
          upsert: true,
        });
      if (uploadError)
        throw new Error(
          "Derived thumbnail upload failed; existing book retained",
        );
      const { data, error } = await db
        .from(book.kind)
        .update({ cover_path: path, cover_metadata: metadata })
        .eq("id", book.id)
        .is("cover_path", null)
        .or("cover_url.is.null,cover_url.eq.")
        .select("id");
      if (error)
        throw new Error("Cover association failed; existing book retained");
      if (!data.length) {
        results.push({ ...entry, status: "concurrent_cover_preserved" });
        continue;
      }
    }
    results.push({
      ...entry,
      status: apply ? "attached" : "generated_preview",
      cover_path: path,
      metadata,
    });
  } catch (e) {
    results.push({ ...entry, status: "failed", error: e.message });
  }
  await atomicJson("local-imports/cover-backfill-checkpoint.json", {
    apply,
    results,
  });
}
if (!only)
  for (const source of inventory.files.filter((f) => /\.pdf$/i.test(f))) {
    if (!catalog.some((b) => b.source_path === source))
      results.push({
        source_file: source,
        status: "no_catalog_book",
        note: "Source has no imported book record; no book created for a cover.",
      });
  }
const totals = Object.fromEntries(
  [
    ...new Set([
      "attached",
      "generated_preview",
      "already_has_cover",
      "blank_first_page",
      "no_matched_source",
      "failed",
      "concurrent_cover_preserved",
      "no_catalog_book",
      ...results.map((r) => r.status),
    ]),
  ].map((s) => [s, results.filter((r) => r.status === s).length]),
);
await atomicJson("local-imports/cover-backfill-report.json", {
  checked_at: new Date().toISOString(),
  apply,
  totals,
  results,
});
if (!only) {
  const safe = (value) =>
    String(value || "—")
      .replaceAll("|", "\\|")
      .replaceAll("\n", " ");
  await writeFile(
    "docs/book-cover-report.md",
    `# First-page cover report\n\n${apply ? "Applied" : "Preview only"}: ${new Date().toISOString()}. Only ~/Desktop/Books was inspected. No books duplicated or PDFs uploaded. Derived assets remain in private Storage; source metadata is retained on existing book records.\n\nTotals: ${Object.entries(
      totals,
    )
      .map(([s, n]) => `${s}: ${n}`)
      .join(
        "; ",
      )}.\n\n| Book/source | Source filename | Status | Notes |\n| --- | --- | --- | --- |\n${results.map((r) => `| ${safe(r.title || r.source_file)} | ${safe(r.source_file)} | ${safe(r.status)} | ${safe(r.error || r.note || (r.metadata ? `${r.metadata.width}×${r.metadata.height}, ${r.metadata.bytes} bytes, page 1` : ""))} |`).join("\n")}\n`,
  );
}
console.log(JSON.stringify({ apply, totals }));
