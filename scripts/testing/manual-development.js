// Disposable local PostgreSQL/PostgREST/Vite; never reads production credentials.
// Auth and Storage are synthetic fixture services, not hosted Supabase verification.
import { homedir } from "node:os";
import { join } from "node:path";
import { nativeAppEnvironment } from "../../tests/helpers/native-app-environment.js";
const cache = join(homedir(), ".cache/satchi-test-tools");
process.env.SATCHI_TEST_POSTGRES_BIN ||= join(cache, "pg17/opt/pgsql-17/bin");
process.env.SATCHI_TEST_POSTGREST ||= join(cache, "postgrest14/postgrest");
process.env.LD_LIBRARY_PATH =
  join(cache, "pg17/opt/pgsql-17/lib") +
  (process.env.LD_LIBRARY_PATH ? ":" + process.env.LD_LIBRARY_PATH : "");
const app = await nativeAppEnvironment();
try {
  await app.upgrade();
} catch (error) {
  await app.close();
  throw error;
}
console.log(
  `Isolated SAT'chi: ${app.appUrl}\nAdmin: admin@fixture.invalid\nStudent: student@fixture.invalid\nPassword for both: disposable-test-only\nAll migrations applied to disposable PostgreSQL 17 only. Auth/Storage use fixture services.\nData survives reload/login during this run; restarting this command creates fresh fixtures. Ctrl+C stops the environment.`,
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    await app.close();
    process.exit(0);
  });
