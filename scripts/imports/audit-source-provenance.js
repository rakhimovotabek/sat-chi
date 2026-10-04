import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { atomicJson } from "./source-files.js";
if (
  (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
  "ileffhbbaomfimwulvpw"
)
  throw new Error("Unexpected project");
const manifest = JSON.parse(
    await readFile("local-imports/manifest.json", "utf8"),
  ),
  sources = manifest.filter(
    (r) => r.resolution_status === "partial" && r.intermediate_file,
  ),
  expected = new Map();
for (const r of sources) {
  const p = JSON.parse(
    await readFile("local-imports/" + r.intermediate_file, "utf8"),
  );
  const flat = [];
  const walk = (ts) =>
    ts.forEach((t) => {
      flat.push(...(t.questions || []));
      walk(t.children || []);
    });
  walk(p.topics);
  expected.set(r.source_file, flat);
}
const sql = `select j.source_file,public.local_question_fingerprint(jsonb_build_object('question',q.question_text,'passage',q.passage,'stimulus',q.stimulus,'options',q.options,'imageUrl',q.image_url,'table',q.stimulus_table)) content_fp,q.source_page,q.import_metadata,a.correct_answer from public.import_jobs j join public.book_topics t on t.book_id=j.book_id join public.questions q on q.topic_id=t.id join public.question_answers a on a.question_id=q.id where j.fingerprint in(${sources.map((r) => "'" + r.fingerprint + "'").join(",")})`;
await writeFile("local-imports/provenance-audit.sql", sql, { mode: 0o600 });
const { stdout } = await promisify(execFile)(
  "npx",
  [
    "--offline",
    "supabase@2.119.0",
    "db",
    "query",
    "--linked",
    "--file",
    "local-imports/provenance-audit.sql",
    "--output",
    "json",
  ],
  { maxBuffer: 4 * 1024 * 1024, timeout: 120000 },
);
const catalog = JSON.parse(stdout.slice(stdout.indexOf("{"))).rows,
  rows = [];
for (const r of sources) {
  const actual = catalog.filter((q) => q.source_file === r.source_file),
    payload = expected.get(r.source_file);
  if (actual.length !== r.imported_count)
    throw new Error("Remote source count mismatch");
  const jsonb = (v) =>
    Array.isArray(v)
      ? "[" + v.map(jsonb).join(", ") + "]"
      : v && typeof v === "object"
        ? "{" +
          Object.keys(v)
            .sort((a, b) => a.length - b.length || a.localeCompare(b))
            .map((k) => JSON.stringify(k) + ": " + jsonb(v[k]))
            .join(", ") +
          "}"
        : JSON.stringify(v ?? null);
  const byFingerprint = new Map(
    payload.map((q) => [
      createHash("md5")
        .update(
          jsonb([
            q.question,
            q.passage || "",
            q.stimulus || "",
            q.options,
            q.imageUrl || null,
            q.table || null,
          ]),
        )
        .digest("hex"),
      q,
    ]),
  );
  for (const a of actual) {
    const q = byFingerprint.get(a.content_fp);
    if (
      !q ||
      q.source_page !== a.source_page ||
      q.correctAnswer !== a.correct_answer ||
      JSON.stringify(q.import_metadata) !==
        JSON.stringify(
          Object.fromEntries(
            Object.keys(q.import_metadata).map((k) => [
              k,
              a.import_metadata[k],
            ]),
          ),
        )
    )
      throw new Error("Remote source content/key/provenance mismatch");
  }
  rows.push({
    source_file: r.source_file,
    payload_items: payload.length,
    matched_catalog_items: actual.length,
    page_mismatches: 0,
    answer_mismatches: 0,
    metadata_mismatches: 0,
  });
}
await atomicJson("local-imports/provenance-audit.json", {
  checked_at: new Date().toISOString(),
  rows,
});
console.log(
  `${catalog.length} remote questions: all pages, keys and provenance match verified source evidence.`,
);
