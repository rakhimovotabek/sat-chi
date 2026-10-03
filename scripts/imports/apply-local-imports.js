import { buildImportSql } from "./import-sql.js";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { validateImport } from "../../src/features/books/import-validation.js";
const run = promisify(execFile),
  expected = "ileffhbbaomfimwulvpw";
if ((await readFile("supabase/.temp/project-ref", "utf8")).trim() !== expected)
  throw new Error("Refusing to import into an unexpected Supabase project.");
const manifest = JSON.parse(
  await readFile("local-imports/manifest.json", "utf8"),
);
const requested = process.argv.find((a) => a.startsWith("--source="))?.slice(9);
if (requested && !manifest.some((r) => r.source_file === requested))
  throw new Error("Source not found in the inspected manifest.");
for (const report of manifest) {
  if (requested && report.source_file !== requested) continue;
  if (
    report.source_file !== basename(report.source_file) ||
    !/^[a-f0-9]{64}$/.test(report.fingerprint)
  )
    throw new Error("Unsafe manifest entry.");
  if (!["", "Books"].includes(report.source_directory || ""))
    throw new Error("Unsafe source folder.");
  const source = await readFile(
    join(
      homedir(),
      "Desktop",
      report.source_directory || "",
      report.source_file,
    ),
  );
  if (createHash("sha256").update(source).digest("hex") !== report.fingerprint)
    throw new Error("Source changed; inspect it again before importing.");
  let payload;
  if (report.status === "validated" || report.status === "imported") {
    payload = JSON.parse(
      await readFile(`local-imports/${report.fingerprint}.json`, "utf8"),
    );
    const validation = validateImport(payload);
    if (validation.errors.length || report.errors.length)
      throw new Error(`Invalid intermediate JSON: ${report.source_file}`);
  }
  const safeReport = Object.fromEntries(
    [
      "fingerprint",
      "source_file",
      "title",
      "status",
      "detected_topics",
      "detected_questions",
      "imported_count",
      "skipped_count",
      "warnings",
      "errors",
    ].map((k) => [k, report[k]]),
  );
  const sql = buildImportSql(safeReport, payload);
  const file = `local-imports/${report.fingerprint}.sql`;
  await writeFile(file, sql, { mode: 0o600 });
  if (process.argv.includes("--apply")) {
    const { stdout } = await run(
      "npx",
      ["supabase@latest", "db", "query", "--linked", "--file", file],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    console.log(stdout.trim());
  } else
    console.log(
      `Prepared ${report.source_file} (${report.status}). Run with --apply to import into the verified linked project.`,
    );
}
