import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const cache = join(homedir(), ".cache/satchi-test-tools");
const bin =
  process.env.SATCHI_TEST_POSTGRES_BIN || join(cache, "pg17/opt/pgsql-17/bin");
const rest =
  process.env.SATCHI_TEST_POSTGREST || join(cache, "postgrest14/postgrest");
const auth = process.env.SATCHI_TEST_AUTH_BIN || join(cache, "auth2197/auth");
const env = {
  ...process.env,
  SATCHI_TEST_POSTGRES_BIN: bin,
  SATCHI_TEST_POSTGREST: rest,
  SATCHI_TEST_AUTH_BIN: auth,
  LD_LIBRARY_PATH: [join(bin, "../lib"), process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(":"),
};
for (const file of [
  join(bin, "postgres"),
  join(bin, "pg_dump"),
  join(bin, "pg_restore"),
  rest,
  auth,
]) {
  try {
    await access(file);
  } catch {
    throw Error(
      "Required isolated test tool missing: " +
        file +
        ". See docs/platform-improvements-report.md. This command must not silently skip native tests.",
    );
  }
}
for (const [file, pattern] of [
  [join(bin, "postgres"), /PostgreSQL\) 17\./],
  [rest, /PostgREST 14\./],
]) {
  const result = spawnSync(file, ["--version"], { env, encoding: "utf8" });
  if (result.status !== 0 || !pattern.test(result.stdout))
    throw Error("Test tool version mismatch: " + file);
  process.stdout.write(result.stdout);
}
const files = [
  "tests/first-attempt-statistics.test.js",
  "tests/context-statistics.test.js",
  "tests/shared-question-history.test.js",
  "tests/admin-student-books.test.js",
  "tests/password-recovery.test.js",
  "tests/dashboard-countdown.test.js",
  "tests/question-bank-taxonomy.test.js",
  "tests/platform-improvements-native.test.js",
  "tests/platform-restoration-native.test.js",
  "tests/password-recovery-native.test.js",
  "tests/postgres-concurrency.test.js",
  "tests/homework-pg17-workflows.test.js",
  "tests/check-recovery-native.test.js",
];
const result = spawnSync(
  process.execPath,
  [
    "--expose-gc",
    "--import",
    "./scripts/testing/release-memory.js",
    "--test",
    "--test-concurrency=1",
    ...files,
  ],
  { env, stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
