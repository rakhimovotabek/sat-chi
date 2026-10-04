import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const run = promisify(execFile);
if (
  (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
  "ileffhbbaomfimwulvpw"
)
  throw new Error("Unexpected project");
const { stdout } = await run(
  "npx",
  [
    "--offline",
    "supabase@2.119.0",
    "db",
    "query",
    "--linked",
    "select j.source_file,count(q.id) questions,count(q.id) filter(where q.image_url like '%/question-assets/%') visuals,count(q.id) filter(where a.correct_answer is not null and q.source_page is not null and q.import_metadata ? 'answer_key_page') keyed from public.import_jobs j left join public.book_topics t on t.book_id=j.book_id left join public.questions q on q.topic_id=t.id left join public.question_answers a on a.question_id=q.id where j.category='Math' or j.source_file ilike '%HardBook%' or j.source_file ilike '%800 Challenge%' group by j.source_file order by j.source_file",
    "--output",
    "json",
  ],
  { maxBuffer: 1024 * 1024 },
);
const rows = JSON.parse(stdout.slice(stdout.indexOf("{"))).rows,
  manifest = JSON.parse(await readFile("local-imports/manifest.json", "utf8"));
let details = "";
let report =
  "\n## Math recovery continuation — October 4, 2026\n\nCounts verified from the linked database. Images are optimized question regions in private Storage; original PDFs remain local. All recovered material is draft. Letter answers are printed chapter keys, or independently agreeing summary/written-solution keys for 800 Challenge. Numeric responses remain excluded until a numeric grading model exists. Region counts are not a complete verified question inventory.\n\n| Source | Recovered / imported | Visuals | Key/page matches | Remaining status |\n| --- | ---: | ---: | ---: | --- |\n";
for (const row of rows) {
  const r = manifest.find((x) => x.source_file === row.source_file);
  let recovery;
  try {
    recovery = JSON.parse(
      await readFile(
        `local-imports/math/${r.fingerprint}/recovery.json`,
        "utf8",
      ),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  report += `| ${row.source_file} | ${recovery?.accepted.length || 0} / ${row.questions} | ${row.visuals} | ${row.keyed} | ${recovery ? `${recovery.unresolved.length} excluded region records` : "Dedicated scanned-layout recovery remains open"} |\n`;
  if (recovery) {
    details += `\n### Recovery details: ${row.source_file}\n\n`;
    const groups = Map.groupBy(recovery.unresolved, (r) => r.reason);
    for (const [reason, items] of groups) {
      const pages = [...new Set(items.map((r) => r.page).filter(Boolean))].sort(
        (a, b) => a - b,
      );
      details += `- ${reason}: **${items.length}** region records. Physical pages: **${pages.join(", ") || "unknown"}**.\n`;
      const unknown = items.filter((r) => !r.page);
      if (unknown.length)
        details += `- Unrecovered headers: ${unknown.map((r) => `${r.section} #${r.number} (chapter pages ${r.chapter_pages?.join("–") || "unknown"})`).join("; ")}.\n`;
    }
    if (row.source_file.includes("Advanced"))
      details +=
        "- Selective recovery used physical key page 155 and individually checked question headers/choice labels on selected pages 97–119. Remaining question pages 1–96, 100–101, 103, 105–110, 113–114, 118, 120–150 and key pages 151–154, 156–157 are not claimed recovered. No whole-book OCR. Additional key/page processing remains an automated follow-up, not a request for photographs.\n";
  }
}
report += details;
report +=
  "\n### College Panda scanned layout\n\nEmbedded text is absent. Rendered physical pages **390 and 405** show one or two printed book pages placed at varying size near the bottom of a much larger white PDF canvas. Chapter 27 contains boxed letter/numeric answers with worked solutions; the underlying questions are chapter/exercise-scoped. Reliable recovery requires detecting/cropping the actual scan bounds and reconciling chapter + exercise + printed-page coordinates. Whole-book OCR and guessed key offsets were avoided. **0 imported**; the source is recoverable in principle and remains an automated layout-adapter task. No manual whole-book photographs requested. These two samples do not establish an exhaustive unresolved-page inventory.\n";
const original = await readFile("docs/book-import-report.md", "utf8");
await writeFile(
  "docs/book-import-report.md",
  original.split("\n## Math recovery continuation")[0] + report,
);
console.log(
  `Reported ${rows.length} Math sources; ${rows.reduce((n, r) => n + r.questions, 0)} actual questions.`,
);
