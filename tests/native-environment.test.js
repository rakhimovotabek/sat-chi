import test from "node:test";
import assert from "node:assert/strict";
import { localProcessEnvironment } from "./helpers/local-process-env.js";
import { fixtureAccounts } from "./helpers/native-app-environment.js";
test("disposable account provisioning stays bounded and preserves existing fixture identities", () => {
  assert.equal(fixtureAccounts().length, 2);
  assert.equal(fixtureAccounts(true).length, 6);
  const accounts = fixtureAccounts(20);
  assert.equal(new Set(accounts.map(([, id]) => id)).size, 20);
  assert.deepEqual(accounts.slice(0, 6), fixtureAccounts(true));
  for (const count of [1, 21, 2.5, NaN])
    assert.throws(() => fixtureAccounts(count), /between 2 and 20/);
});
test("native child services cannot inherit hosted connection URLs, keys, ports or Auth settings", () => {
  assert.deepEqual(
    localProcessEnvironment({
      PATH: "/usr/bin",
      LANG: "C.UTF-8",
      PGRST_DB_URI: "hosted-uri",
      PGHOST: "hosted",
      PGPASSWORD: "test",
      SUPABASE_URL: "hosted",
      SUPABASE_SERVICE_ROLE_KEY: "test",
      GOTRUE_DATABASE_URL: "hosted",
      VITE_SUPABASE_URL: "hosted",
      DATABASE_URL: "hosted",
      PORT: "5432",
      API_EXTERNAL_URL: "hosted",
    }),
    { PATH: "/usr/bin", LANG: "C.UTF-8" },
  );
});
