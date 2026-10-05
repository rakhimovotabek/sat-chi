import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { privateStorageClient } from "../imports/private-storage.js";

const run = promisify(execFile);
const project = "ileffhbbaomfimwulvpw";
async function query(sql) {
  if ((await readFile("supabase/.temp/project-ref", "utf8")).trim() !== project)
    throw new Error("Unexpected linked project");
  const { stdout } = await run(
    "npx",
    [
      "--offline",
      "supabase@2.119.0",
      "db",
      "query",
      "--linked",
      sql,
      "--output",
      "json",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout.slice(stdout.indexOf("{"))).rows;
}
if (!process.argv.includes("--apply"))
  throw new Error("Explicit --apply required");
const client = await privateStorageClient(project);
const assets = await query(`select bucket_id,name from storage.objects o where
 (bucket_id='book-covers' and name like 'books/%' or bucket_id='question-assets')
 and not exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.kind<>'book' and i.question::text like '%'||o.name||'%')
 and not exists(select 1 from public.homework_questions h where h.question::text like '%'||o.name||'%')
 order by bucket_id,name`);
const sql = await readFile(
  new URL("delete-imported-content.sql", import.meta.url),
  "utf8",
);
console.log(JSON.stringify({ database: await query(sql) }));
let removed = 0;
for (const bucket of new Set(assets.map((a) => a.bucket_id))) {
  const names = assets.filter((a) => a.bucket_id === bucket).map((a) => a.name);
  for (let i = 0; i < names.length; i += 100) {
    const { error } = await client.storage
      .from(bucket)
      .remove(names.slice(i, i + 100));
    if (error) throw error;
    removed += Math.min(100, names.length - i);
  }
}
// Remove derived book content only. Original source PDFs are outside this project.
// Vocabulary imports and unrelated workflow artifacts remain in place.
const manifest = JSON.parse(
  await readFile("local-imports/manifest.json", "utf8"),
);
const vocabulary = manifest.filter((r) => r.source_type === "vocabulary");
const fingerprints = manifest
  .filter((r) => r.source_type === "book")
  .map((r) => r.fingerprint);
const sourceNames = manifest
  .filter((r) => r.source_type === "book")
  .map((r) => r.source_file);
async function clean(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (
        ["math", "math-scans"].includes(entry.name) ||
        fingerprints.includes(entry.name)
      )
        await rm(path, { recursive: true });
      else await clean(path);
    } else if (
      fingerprints.some((f) => entry.name.includes(f)) ||
      sourceNames.some(
        (f) =>
          entry.name.includes(f) || entry.name === f.replace(/\.pdf$/i, ".txt"),
      ) ||
      /^(math|hardbook|preppros|800-|scan-options|correction-(options|metadata|crop|player)|writing-page|grammar-page|remote-audit|final-triage|scan\.json|cover-backfill)/.test(
        entry.name,
      )
    ) {
      await rm(path);
    }
  }
}
// Cover directories use entity IDs, rather than source fingerprints.
const vocabIds = await query("select id from public.vocabulary_books");
for (const entry of await readdir("local-imports/covers"))
  if (!vocabIds.some((v) => v.id === entry))
    await rm(`local-imports/covers/${entry}`, { recursive: true });
await clean("local-imports");
await writeFile(
  "local-imports/manifest.json",
  JSON.stringify(vocabulary, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    storage_objects_deleted: removed,
    remaining: await query(
      "select (select count(*) from public.books) books,(select count(*) from public.questions) book_questions",
    ),
  }),
);
