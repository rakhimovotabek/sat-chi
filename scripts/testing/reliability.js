import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
const cache = join(homedir(), ".cache", "satchi-test-tools");
const bin =
  process.env.SATCHI_TEST_POSTGRES_BIN ||
  join(cache, "pg17", "opt", "pgsql-17", "bin");
const rest =
  process.env.SATCHI_TEST_POSTGREST || join(cache, "postgrest14", "postgrest");
const env = {
  ...process.env,
  SATCHI_TEST_POSTGRES_BIN: bin,
  SATCHI_TEST_POSTGREST: rest,
  LD_LIBRARY_PATH: [join(bin, "..", "lib"), process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(":"),
};
for (const file of [
  join(bin, "postgres"),
  join(bin, "initdb"),
  join(bin, "psql"),
  rest,
]) {
  try {
    await access(file);
  } catch {
    throw Error(
      "Required native test tool missing: " +
        file +
        ". Configure PostgreSQL17/PostgREST14; native tests must not silently skip.",
    );
  }
}
for (const [file, pattern] of [
  [join(bin, "postgres"), /PostgreSQL\) 17\./],
  [rest, /PostgREST 14\./],
]) {
  const r = spawnSync(file, ["--version"], { env, encoding: "utf8" });
  if (r.status !== 0 || !pattern.test(r.stdout))
    throw Error("Required native tool version mismatch: " + file);
  process.stdout.write(r.stdout);
}
// Serialize heavy PGlite/native/browser suites. Multi-student work inside the
// native journey has its own bounded concurrency; no production configuration.
const files = [
  "tests/practice-persistence.test.js",
  "tests/study-time-batch.test.js",
  "tests/homework-indexed-pool.test.js",
  "tests/reliability-release-readiness.test.js",
  "tests/real-user-reliability.test.js",
  "tests/large-practice-transport.test.js",
  "tests/book-progress-history.test.js",
  "tests/book-open-progress.test.js",
  "tests/book-jpeg-explanation.test.js",
  "tests/vocabulary-context-pages.test.js",
  "tests/admin-overview-scope.test.js",
  "tests/homework-pg17-workflows.test.js",
  "tests/postgres-concurrency.test.js",
  "tests/practice-answer-integrity.test.js",
  "tests/admin-open-review.test.js",
  "tests/book-approval-cache.test.js",
];
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...files],
  { env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
