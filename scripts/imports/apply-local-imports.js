import { processSequentially } from "./sequential.js";
import { buildImportSql } from "./import-sql.js";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { validateLocalImport as validateImport } from "./local-validation.js";
import { validateVocabulary } from "../../src/features/learning/vocabulary-validation.js";
import { fingerprintFile, sourcePath, atomicJson } from "./source-files.js";
const run = promisify(execFile),
  expected = "ileffhbbaomfimwulvpw",
  root = await realpath(join(homedir(), "Desktop", "Books"));
if ((await readFile("supabase/.temp/project-ref", "utf8")).trim() !== expected)
  throw new Error("Refusing to import into an unexpected Supabase project.");
const manifest = JSON.parse(
  await readFile("local-imports/manifest.json", "utf8"),
);
const requested = process.argv.find((a) => a.startsWith("--source="))?.slice(9),
  apply = process.argv.includes("--apply");
if (
  requested &&
  !manifest.some(
    (r) => r.source_file === requested || r.source_path === requested,
  )
)
  throw new Error("Source not found in inspected manifest.");
await processSequentially(
  manifest,
  async (report) => {
    if (
      requested &&
      report.source_file !== requested &&
      report.source_path !== requested
    )
      return;
    if (
      report.source_root !== root ||
      report.source_file !== basename(report.source_file) ||
      !/^[a-f0-9]{64}$/.test(report.fingerprint)
    )
      throw new Error("Unsafe or outdated manifest; run inspection again.");
    const source = await sourcePath(root, report.source_path);
    if ((await fingerprintFile(source)) !== report.fingerprint)
      throw new Error("Source changed; inspect again.");
    // Successfully checkpointed sources are not reprocessed. --retry verifies and
    // repairs a remotely deleted job/book using the transactional duplicate guard.
    if (
      apply &&
      report.applied_parser_version === report.parser_version &&
      !process.argv.includes("--retry")
    ) {
      console.log(`Resume: ${report.source_path} already recorded.`);
      return;
    }
    let payload;
    if (["validated", "imported"].includes(report.status)) {
      if (report.intermediate_file !== `${report.fingerprint}.json`)
        throw new Error("Unsafe intermediate filename.");
      if (
        (await fingerprintFile(
          resolve("local-imports", report.intermediate_file),
        )) !== report.intermediate_hash
      )
        throw new Error(
          "Intermediate JSON changed; re-inspect instead of importing unverified edits.",
        );
      payload = JSON.parse(
        await readFile(`local-imports/${report.intermediate_file}`, "utf8"),
      );
      const errors =
        report.source_type === "vocabulary"
          ? validateVocabulary(payload)
          : validateImport(payload).errors;
      if (
        errors.length ||
        report.errors.length ||
        (report.source_type === "vocabulary"
          ? payload.published
          : payload.book.published) !== false
      )
        throw new Error(
          `Invalid or non-draft intermediate JSON: ${report.source_file}`,
        );
    }
    const safeReport = Object.fromEntries(
      [
        "fingerprint",
        "source_file",
        "source_path",
        "title",
        "status",
        "source_type",
        "category",
        "detected_topics",
        "detected_questions",
        "detected_vocabulary_sets",
        "detected_words",
        "needs_review_count",
        "parser_version",
        "imported_count",
        "skipped_count",
        "warnings",
        "errors",
        "evidence",
        "review_items",
        "asset_pages",
        "asset_references",
        "has_tables",
        "aliases",
        "investigation",
        "resolution_status",
        "verified_key_count",
      ].map((k) => [k, report[k]]),
    );
    const file = `local-imports/${report.fingerprint}.sql`;
    await writeFile(file, buildImportSql(safeReport, payload), { mode: 0o600 });
    if (!apply) {
      console.log(`Prepared ${report.source_path} (${report.status}).`);
      return;
    }
    try {
      // Use the previously installed CLI cache only; ingestion never downloads tools.
      const { stdout } = await run(
        "npx",
        [
          "--offline",
          "supabase@2.119.0",
          "db",
          "query",
          "--linked",
          "--file",
          file,
          "--output",
          "json",
        ],
        { maxBuffer: 2 * 1024 * 1024 },
      );
      const result = JSON.parse(stdout.slice(stdout.indexOf("{")));
      const recorded = result.rows?.[0];
      if (!recorded)
        throw new Error("No database outcome returned; retry safely.");
      report.status = recorded.status;
      report.imported_count = recorded.imported_count;
      report.skipped_count = recorded.skipped_count;
      report.book_id = recorded.book_id;
      report.vocabulary_book_id = recorded.vocabulary_book_id;
      report.applied_parser_version = report.parser_version;
      report.applied_at = new Date().toISOString();
      delete report.deployment_error;
      if (recorded.book_id || recorded.vocabulary_book_id) {
        try {
          const { stdout: coverOutput } = await run(
            "node",
            [
              "scripts/imports/backfill-covers.js",
              "--apply",
              "--source",
              report.source_file,
            ],
            { timeout: 180000, maxBuffer: 1024 * 1024 },
          );
          report.cover_checkpoint = JSON.parse(coverOutput.trim()).totals;
          delete report.cover_warning;
        } catch {
          report.cover_warning =
            "Cover backfill failed; content import remains intact. Retry import:covers.";
        }
      }

      console.log(
        `${report.source_path}: ${report.status}; ${report.imported_count} imported, ${report.skipped_count} skipped`,
      );
    } catch (error) {
      report.deployment_error = error.stderr || error.message;
      console.error(`Failed ${report.source_path}; checkpoint kept for retry.`);
    }
    await atomicJson(`local-imports/${report.fingerprint}.report.json`, report);
    await atomicJson("local-imports/manifest.json", manifest);
  },
  async (report, error) => {
    report.deployment_error = error.message;
    console.error(
      `Validation failed for ${report.source_file}; other sources will continue.`,
    );
    if (/^[a-f0-9]{64}$/.test(report.fingerprint))
      await atomicJson(
        `local-imports/${report.fingerprint}.report.json`,
        report,
      );
    await atomicJson("local-imports/manifest.json", manifest);
  },
);
if (manifest.some((r) => r.deployment_error)) process.exitCode = 1;
