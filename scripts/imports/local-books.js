import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { basename, extname, join } from "node:path";
import { homedir } from "node:os";
import { parseGrammar, inspectText } from "./parsers.js";
import { validateImport } from "../../src/features/books/import-validation.js";
const run = promisify(execFile);
const desktop = join(homedir(), "Desktop"),
  output = "local-imports";
await mkdir(output, { recursive: true });
const reports = [];
const entries = [];
for (const directory of ["", "Books"]) {
  let files;
  try {
    files = await readdir(join(desktop, directory), { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") continue;
    throw e;
  }
  for (const entry of files)
    if (
      entry.isFile() &&
      /\.(pdf|txt|json|docx|epub)$/i.test(entry.name) &&
      (directory === "Books" ||
        /(sat|math|prep|grammar|vocab|book)/i.test(entry.name))
    )
      entries.push({ name: entry.name, directory });
}
if (!entries.length)
  throw new Error(
    "No relevant sources found; previous reports were preserved.",
  );
const seen = new Set();
for (const entry of entries) {
  const file = join(desktop, entry.directory, entry.name),
    bytes = await readFile(file),
    fingerprint = createHash("sha256").update(bytes).digest("hex");
  if (seen.has(fingerprint)) continue;
  seen.add(fingerprint);
  const report = {
    source_directory: entry.directory,
    source_file: basename(file),
    fingerprint,
    title: basename(file, extname(file)),
    status: "review",
    detected_topics: 0,
    detected_questions: 0,
    imported_count: 0,
    skipped_count: 0,
    warnings: [],
    errors: [],
  };
  try {
    let text, payload;
    if (extname(file).toLowerCase() === ".pdf")
      text = (
        await run("pdftotext", ["-layout", file, "-"], {
          maxBuffer: 30 * 1024 * 1024,
        })
      ).stdout;
    else if (extname(file).toLowerCase() === ".txt")
      text = bytes.toString("utf8");
    else if (extname(file).toLowerCase() === ".json")
      payload = JSON.parse(bytes.toString("utf8"));
    else
      report.warnings.push(
        "This format needs a source-specific extraction adapter; no content imported.",
      );
    if (text) {
      const inspection = inspectText(text);
      report.detected_topics = inspection.topics.length;
      report.detected_questions = inspection.detectedQuestions;
      if (inspection.sparse)
        report.warnings.push(
          "Image-based PDF: OCR and diagram review required.",
        );
      if (/^Ultimate Grammar Book\.pdf$/i.test(entry.name)) {
        const parsed = parseGrammar(text, entry.name);
        payload = parsed.payload;
        report.errors.push(...parsed.errors);
      } else
        report.warnings.push(
          "Columns, answer alignment and assets require review. Raw text is never imported.",
        );
    }
    if (payload) {
      const validation = validateImport(payload);
      report.errors.push(...validation.errors);
      report.detected_topics = validation.topics;
      report.detected_questions = validation.questions;
      if (!report.errors.length) {
        report.status = "validated";
        report.intermediate_file = `${fingerprint}.json`;
        await writeFile(
          join(output, report.intermediate_file),
          JSON.stringify(payload, null, 2),
        );
      }
    }
    report.skipped_count =
      report.status === "review" ? report.detected_questions : 0;
  } catch (e) {
    report.errors.push(e.message);
  }
  await writeFile(
    join(output, `${fingerprint}.report.json`),
    JSON.stringify(report, null, 2),
  );
  reports.push(report);
}
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(reports, null, 2),
);
console.log(
  JSON.stringify(
    reports.map(
      ({
        source_file,
        status,
        detected_topics,
        detected_questions,
        errors,
        warnings,
      }) => ({
        source_file,
        status,
        detected_topics,
        detected_questions,
        errors,
        warnings,
      }),
    ),
    null,
    2,
  ),
);
