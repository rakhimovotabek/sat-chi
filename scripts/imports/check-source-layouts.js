import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
import { sourcePath, atomicJson } from "./source-files.js";
const manifest = JSON.parse(
    await readFile("local-imports/manifest.json", "utf8"),
  ),
  results = [];
const normalize = (t) =>
  t
    .normalize("NFKC")
    .toLowerCase()
    .replace(/([a-z])-\s*\n(?=[a-z])/g, "$1")
    .replace(/[^\p{L}\p{N}_]+/gu, " ")
    .trim();
for (const r of manifest.filter((r) => r.resolution_status === "partial")) {
  const file = await sourcePath(
    join(homedir(), "Desktop", "Books"),
    r.source_path,
  );
  const raw = (
    await promisify(execFile)("pdftotext", ["-raw", file, "-"], {
      maxBuffer: 60 * 1024 * 1024,
    })
  ).stdout.split("\f");
  const p = JSON.parse(
      await readFile("local-imports/" + r.intermediate_file, "utf8"),
    ),
    samples = [];
  let flat = 0;
  for (const t of p.topics) {
    const targets = new Set([
      0,
      Math.floor(t.questions.length / 2),
      t.questions.length - 1,
    ]);
    for (let i = 0; i < t.questions.length; i++, flat++)
      if (targets.has(i)) {
        const q = t.questions[i],
          e = r.evidence.find((e) => e.question_index === flat),
          page = normalize(raw[e.page - 1] || "");
        if (
          q.source_page !== e.page ||
          q.import_metadata?.source_number !== e.number
        )
          throw new Error(
            "Question provenance does not match persisted evidence",
          );
        const supplied = [q.question, q.passage, ...q.options].join(" "),
          tokens = normalize(supplied)
            .split(" ")
            .filter((x) => x.length > 3);
        const missing = [...new Set(tokens.filter((w) => !page.includes(w)))];
        // Token coverage is independent of layout reconstruction. Exact source keys are
        // separately scoped by chapter/section in the adapter and retained in evidence.
        if (missing.length)
          throw new Error(
            `${r.source_file} page ${e.page}: unmatched extracted tokens (${missing.length}); inspect private samples`,
          );
        samples.push({
          topic: t.title,
          source_number: e.number,
          page: e.page,
          position:
            i === 0
              ? "beginning"
              : i === t.questions.length - 1
                ? "end"
                : "middle",
          choice_count: q.options.length,
          correct_answer: q.correctAnswer,
          passage_present: !!q.passage,
          raw_source_token_check: "passed",
          answer_mapping: "explicit scoped printed table",
        });
      }
  }
  results.push({
    source_file: r.source_file,
    accepted_payload: p.topics.reduce((n, t) => n + t.questions.length, 0),
    remote_imported: r.imported_count,
    samples,
  });
}
await atomicJson("local-imports/layout-sample-validation.json", results);
console.log(
  results
    .map(
      (r) =>
        `${r.source_file}: ${r.samples.length} independent raw-page samples passed`,
    )
    .join("\n"),
);
