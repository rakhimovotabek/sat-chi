import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "real network whole-match time expires naturally and preserves only earned points",
  {
    skip: !process.env.SATCHI_TEST_AUTH_BIN,
    timeout: 180000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      officialServices: process.env.SATCHI_TEST_OFFICIAL_SERVICES === "1",
    });
    t.after(() => app.close());
    await app.upgrade();
    const clients = [];
    for (const name of ["admin", "student"]) {
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
      t.after(() => {
        client.realtime.disconnect();
        client.auth.stopAutoRefresh();
      });
    }
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
      capacity: 2,
      questionCount: 2,
      seconds: 0,
      totalSeconds: 30,
      public: false,
      filters: { book: app.book },
    });
    const id = room.id;
    await action(clients[1], "join", { code: room.code });
    await Promise.all(clients.map((client) => action(client, "ready", { id })));
    room = await action(clients[0], "start", { id });
    const matchDeadline = room.match_deadline;
    await waitUntil(room.deadline);
    room = await action(clients[0], "state", { id });
    assert.equal(room.state, "PLAYING");
    assert.equal(room.deadline, matchDeadline);
    const response = room.question.question_type === "open" ? "8.6" : "1";
    await action(clients[0], "answer", { id, round: 1, response });
    const observer = await action(clients[1], "state", { id });
    assert.equal(observer.review, null);
    assert.ok(observer.members.every((member) => member.score === 0));
    await waitUntil(matchDeadline);
    await assert.rejects(
      () =>
        action(clients[1], "answer", {
          id,
          round: 1,
          response,
          deadline: "2100-01-01",
        }),
      /Round is closed/,
    );
    room = await action(clients[0], "state", { id });
    assert.equal(room.state, "FINISHED");
    assert.equal(room.history.length, 2);
    assert.equal(room.history[0].points, 100);
    assert.equal(room.history[1].points, 0);
    assert.equal(
      room.members.reduce((sum, member) => sum + member.score, 0),
      100,
    );
    assert.equal(
      (await action(clients[0], "list")).history.find(
        (match) => match.id === id,
      ).score,
      100,
    );
    assert.equal(
      await app.json(
        `select count(*)from battle_answers where battle_id='${id}'`,
      ),
      1,
    );
  },
);
