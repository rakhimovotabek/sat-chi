import test from "node:test";
import assert from "node:assert/strict";
import { localProcessEnvironment } from "./helpers/local-process-env.js";
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
