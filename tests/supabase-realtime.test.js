import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
import { verifyBattleRealtime } from "./helpers/battle-realtime.js";

test(
  "actual isolated Realtime delivers member-only Battle revisions",
  {
    skip: process.env.SATCHI_TEST_OFFICIAL_SERVICES !== "1",
    timeout: 120000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      extraUsers: true,
      officialServices: true,
    });
    t.after(() => app.close());
    await app.upgrade();
    const clients = [];
    for (const name of ["student", "studentE"]) {
      const client = createClient(
        app.apiUrl,
        app.tokenFor(student, { role: "anon" }),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      assert.ifError(
        (
          await client.auth.signInWithPassword({
            email: name + "@fixture.invalid",
            password: "disposable-test-only",
          })
        ).error,
      );
      clients.push(client);
      t.after(() => client.realtime.disconnect());
    }
    const rpc = async (client, name, args) => {
      const result = await client.rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    await verifyBattleRealtime({
      app,
      learner: clients[0],
      outsider: clients[1],
      rpc,
    });
  },
);
