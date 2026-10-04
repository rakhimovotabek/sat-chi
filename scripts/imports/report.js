import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { atomicJson } from "./source-files.js";
if (
  (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
  "ileffhbbaomfimwulvpw"
)
  throw new Error("Unexpected project");
const sql = `select j.source_file,j.fingerprint,j.status,j.source_metadata->>'resolution_status' outcome,j.imported_count,j.skipped_count,j.category,j.source_type,b.published,
(select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=j.book_id) actual_questions,
(select count(*) from public.vocabulary_sets s where s.book_id=j.vocabulary_book_id) actual_sets,
(select count(*) from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id where s.book_id=j.vocabulary_book_id) actual_words,
(select count(*) from public.vocabulary_passages p join public.vocabulary_sets s on s.id=p.set_id where s.book_id=j.vocabulary_book_id) actual_passages,
(select count(*) from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id where s.book_id=j.vocabulary_book_id) actual_exercises
from public.import_jobs j left join public.books b on b.id=j.book_id order by j.source_file`;
const { stdout } = await promisify(execFile)(
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
  { maxBuffer: 4 * 1024 * 1024 },
);
const rows = JSON.parse(stdout.slice(stdout.indexOf("{"))).rows;
await atomicJson("local-imports/remote-audit.json", {
  checked_at: new Date().toISOString(),
  rows,
});
const manifest = JSON.parse(
  await readFile("local-imports/manifest.json", "utf8"),
);
const cell = (v) =>
  String(v ?? "")
    .replaceAll("|", " / ")
    .replace(/\s+/g, " ")
    .trim();
let report = `# Local book import report\n\nAudited ${new Date().toISOString()}. Source scope: \`~/Desktop/Books\` only. Project: \`ileffhbbaomfimwulvpw\`.\n\nCompleted checkpoints were resumed, not restarted. Counts below are actual remote counts; candidate counts in parentheses are extraction heuristics, not verified inventories. Extracted material is private in ignored \`local-imports/\`. Newly imported content stays draft. Existing admin publication decisions are preserved.\n\n| Source | Classification | Status | Topics | Questions (candidates) | Sets / words / passages / exercises | Duplicates | Review / warnings / errors |\n| --- | --- | --- | ---: | ---: | --- | --- | --- |\n`;
for (const r of manifest) {
  const db = rows.find((x) => x.fingerprint === r.fingerprint);
  if (!db) throw new Error(`Missing remote checkpoint: ${r.source_file}`);
  if (
    r.source_type === "book" &&
    db.status === "imported" &&
    db.actual_questions !== db.imported_count
  )
    throw new Error(`Question count mismatch: ${r.source_file}`);
  const outcome =
    db.outcome ||
    (db.status === "imported"
      ? db.published
        ? "imported"
        : "imported_review"
      : db.status === "failed"
        ? "failed"
        : "manual");
  const labels = {
    imported: "Imported",
    imported_review: "Imported — needs review",
    partial: "Partially imported",
    manual: "Manual review required",
    unsupported: "Unsupported",
    failed: "Failed",
  };
  const classification = /HardBook/i.test(r.source_file)
    ? "SAT Math"
    : /^Transition \(2\)/i.test(r.source_file)
      ? "Reference / Strategy"
      : /vocab/i.test(r.source_file)
        ? "Vocabulary"
        : /math/i.test(r.source_file)
          ? "SAT Math"
          : /reading|central ideas|dual texts/i.test(r.source_file)
            ? "SAT Reading & Writing"
            : /grammar|apostrophe|verbs|modifiers|pronoun|punctuation|agreement|tense/i.test(
                  r.source_file,
                )
              ? "Grammar"
              : /writing|transition/i.test(r.source_file)
                ? "SAT Reading & Writing"
                : "Mixed SAT / review";
  for (const filename of [r.source_path, ...(r.aliases || [])])
    report += `| ${cell(filename)} | ${classification} | ${labels[outcome]}${db.published ? " (admin published)" : ""} | ${r.source_type === "vocabulary" ? db.actual_sets : r.detected_topics} | ${db.actual_questions} (${r.detected_questions}) | ${db.actual_sets} / ${db.actual_words} / ${db.actual_passages} / ${db.actual_exercises} | ${filename === r.source_path ? "No duplicate source import" : "Identical source alias; skipped"} | ${cell([`${r.needs_review_count} questions excluded/review`, ...r.warnings, ...r.errors].join("; "))} |\n`;
}
report +=
  "\n## Review requirements\n\nAll source-derived vocabulary and newly imported questions require admin review before publication. Unknown answer mapping, essential images and unresolved source structures remain NEEDS_REVIEW. No answer keys are inferred. Zero candidates means the heuristic found none, not that the book contains no questions. Source evidence and exclusions are visible to admins in Import status.\n";
await writeFile("docs/book-import-report.md", report);
console.log(
  `Audited ${rows.length} remote jobs; ${rows.reduce((n, r) => n + r.actual_questions, 0)} questions, ${rows.reduce((n, r) => n + r.actual_words, 0)} words.`,
);

const outcomes = {};
for (const r of rows) {
  const o =
    r.outcome ||
    (r.status === "imported"
      ? r.published
        ? "imported"
        : "imported_review"
      : r.status === "failed"
        ? "failed"
        : "manual");
  outcomes[o] = (outcomes[o] || 0) + 1;
}
report += "\n## Catalog totals\n\n";
report += `Sources: ${rows.length}. Imported: ${outcomes.imported || 0}; imported needing review: ${outcomes.imported_review || 0}; partial: ${outcomes.partial || 0}; manual review: ${outcomes.manual || 0}; unsupported: ${outcomes.unsupported || 0}; failed: ${outcomes.failed || 0}. SAT questions: **${rows.reduce((n, r) => n + r.actual_questions, 0)}** (before this phase: 822). Vocabulary: **${rows.reduce((n, r) => n + r.actual_words, 0)} words / ${rows.reduce((n, r) => n + r.actual_sets, 0)} sets / ${rows.reduce((n, r) => n + r.actual_passages, 0)} passages / ${rows.reduce((n, r) => n + r.actual_exercises, 0)} exercises**. OCR-derived catalog items: **0**; OCR is diagnostic only, never silently approved.\n`;
let samples = [];
try {
  samples = JSON.parse(
    await readFile("local-imports/layout-sample-validation.json", "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
report +=
  "\n## Validation of the 18 previously unresolved sources\n\nEmbedded text was measured before OCR. Counts of sparse pages use fewer than 100 non-whitespace characters; image counts also include logos and do not measure vector figures. Each source was sampled at beginning, middle and end. OCR confidence is word-recognition evidence, **not** answer or mathematical correctness. Source files/renderings and rejected candidate text remain private.\n";
for (const r of manifest.filter((r) => r.investigation)) {
  const d = r.investigation,
    db = rows.find((x) => x.fingerprint === r.fingerprint),
    validation = samples.find((x) => x.source_file === r.source_file);
  report += `\n### ${cell(r.source_file)}\n\n- Source type: PDF; ${d.page_count} pages, ${d.embedded_chars} embedded characters, ${d.sparse_pages} sparse pages. Extraction: ${d.extraction_method}; parser: ${cell(r.parser_version)}.\n- Diagnosis: ${cell(d.diagnosis)}\n- Actual imported SAT questions: ${db.actual_questions}; excluded/skipped checkpoint markers: ${db.skipped_count}. These are not a complete inventory for unsupported layouts. Review region records: ${r.review_items?.length || 0}; a source-level manual task is retained.\n- Sample physical pages: ${d.samples.map((x) => x.page).join(", ")}. ${validation ? `${validation.samples.length} additional first/middle/last-per-topic raw-source token checks passed; complete choices, supplied passages and explicit scoped keys checked.` : "No automatic catalog records accepted; samples establish the documented blocker."}\n`;
  for (const o of d.samples.filter((x) => x.method === "ocr"))
    report += `- OCR page ${o.page}: ${o.word_count} words; mean confidence ${o.mean_confidence}/100; ${o.low_confidence_words} below 70 (${Math.round(o.low_confidence_ratio * 100)}%). All require manual image comparison.\n`;
}
await writeFile("docs/book-import-report.md", report);
