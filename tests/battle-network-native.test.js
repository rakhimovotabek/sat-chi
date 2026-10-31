import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  fixtureAccounts,
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "twenty distinct real Auth clients finish simultaneous network rounds with exact persistent scores",
  {
    skip: !process.env.SATCHI_TEST_AUTH_BIN,
    timeout: 240000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      extraUsers: 20,
      officialServices: process.env.SATCHI_TEST_OFFICIAL_SERVICES === "1",
    });
    t.after(() => app.close());
    await app.upgrade();
    const clients = [],
      identities = new Set();
    for (const [name, id] of fixtureAccounts(20)) {
      const client = createClient(
        app.apiUrl,
        app.tokenFor(student, { role: "anon" }),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const result = await client.auth.signInWithPassword({
        email: name + "@fixture.invalid",
        password: "disposable-test-only",
      });
      assert.ifError(result.error);
      assert.equal(result.data.user.id, id);
      identities.add(result.data.user.id);
      clients.push(client);
      t.after(() => {
        client.auth.stopAutoRefresh();
        client.realtime.disconnect();
      });
    }
    assert.equal(identities.size, 20);
    const action = async (client, action, data = {}) => {
      const result = await client.rpc("battle_action", {
        p_action: action,
        p_data: data,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const waitUntil = (deadline) =>
      new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, Date.parse(deadline) - Date.now() + 100),
        ),
      );
    let room = await action(clients[0], "create", {
      category: "Math",
      capacity: 20,
      questionCount: 2,
      seconds: 60,
      public: true,
      filters: { book: app.book },
    });
    const id = room.id;
    await Promise.all(
      clients.slice(1).map((client) => action(client, "join", { id })),
    );
    await Promise.all(clients.map((client) => action(client, "ready", { id })));
    room = await action(clients[0], "start", { id });
    assert.equal(room.members.length, 20);
    assert.equal(new Set(room.members.map((member) => member.seat)).size, 20);
    await waitUntil(room.deadline);
    for (let round = 1; round <= 2; round++) {
      const snapshots = await Promise.all(
        clients.map((client) => action(client, "state", { id })),
      );
      room = snapshots[0];
      assert.equal(room.state, "PLAYING");
      assert.ok(
        snapshots.every(
          (snapshot) =>
            snapshot.question.id === room.question.id &&
            snapshot.review === null,
        ),
      );
      const response =
        round === 2
          ? "0"
          : room.question.question_type === "open"
            ? "8.6"
            : "1";
      // Every player replays the same answer concurrently. Forty intents must
      // produce twenty saved answers and twenty awards, never forty awards.
      await Promise.all(
        clients.map((client) =>
          Promise.all([
            action(client, "answer", { id, round, response }),
            action(client, "answer", { id, round, response }),
          ]),
        ),
      );
      room = await action(clients[0], "state", { id });
      assert.equal(room.state, "ROUND_RESULTS");
      assert.equal(
        room.members.reduce((sum, member) => sum + member.score, 0),
        2000,
      );
      assert.ok(room.members.every((member) => member.score === 100));
      await waitUntil(room.deadline);
    }
    const finished = await Promise.all(
      clients.map((client) => action(client, "state", { id })),
    );
    assert.ok(
      finished.every(
        (snapshot) =>
          snapshot.state === "FINISHED" &&
          snapshot.history.length === 2 &&
          snapshot.history[0].points === 100 &&
          snapshot.history[1].points === 0,
      ),
    );
    const histories = await Promise.all(
      clients.map((client) => action(client, "list")),
    );
    assert.ok(
      histories.every(
        (list) => list.history.find((match) => match.id === id).score === 100,
      ),
    );
    assert.equal(
      await app.json(
        `select count(*)from battle_answers where battle_id='${id}'`,
      ),
      40,
    );
  },
);
