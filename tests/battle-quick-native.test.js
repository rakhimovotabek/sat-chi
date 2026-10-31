import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "concurrent real Auth Quick Match clients form two public 1v1s and retain exact finished results",
  {
    skip: !process.env.SATCHI_TEST_AUTH_BIN,
    timeout: 180000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      extraUsers: true,
      officialServices: process.env.SATCHI_TEST_OFFICIAL_SERVICES === "1",
    });
    t.after(() => app.close());
    await app.upgrade();
    const clients = [];
    for (const name of ["student", "studentB", "studentC", "studentD"]) {
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
    const rpc = async (client, name, args) => {
      const result = await client.rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const action = (client, action, data) =>
      rpc(client, "battle_action", { p_action: action, p_data: data });
    const settings = {
      category: "Math",
      questionCount: 1,
      seconds: 60,
      totalSeconds: 120,
      filters: { book: app.book, domains: ["Algebra"] },
    };
    const matched = await Promise.all(
      clients.map((client, index) =>
        rpc(client, "battle_quick_match", {
          p_data: {
            ...settings,
            filters:
              index % 2
                ? {
                    domains: ["Algebra", "Algebra"],
                    book: app.book,
                    skills: [],
                  }
                : settings.filters,
          },
        }),
      ),
    );
    const ids = [...new Set(matched.map((room) => room.id))];
    assert.equal(
      ids.length,
      2,
      "simultaneous requests form pairs rather than four separate lobbies",
    );
    assert.ok(
      matched.every(
        (room) => room.public && room.capacity === 2 && room.team_size === 0,
      ),
    );
    const repeated = await Promise.all(
      clients.map((client) =>
        rpc(client, "battle_quick_match", { p_data: settings }),
      ),
    );
    assert.ok(
      repeated.every(
        (room, index) =>
          room.id === matched[index].id && room.members.length === 2,
      ),
    );
    const players = clients.filter((_, index) => matched[index].id === ids[0]);
    const hostIndex = matched.findIndex(
      (room) => room.id === ids[0] && room.host_id === room.me,
    );
    const host = clients[hostIndex];
    const outsider = clients.find((_, index) => matched[index].id !== ids[0]);
    await assert.rejects(
      () => action(outsider, "state", { id: ids[0] }),
      /Join this battle/,
    );
    await Promise.all(
      players.map((client) => action(client, "ready", { id: ids[0] })),
    );
    let room = await action(host, "start", { id: ids[0] });
    const waitUntil = (deadline) =>
      new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, Date.parse(deadline) - Date.now() + 100),
        ),
      );
    await waitUntil(room.deadline);
    room = await action(host, "state", { id: room.id });
    const response = room.question.question_type === "open" ? "8.6" : "1";
    await Promise.all(
      players.map((client) =>
        action(client, "answer", { id: room.id, round: 1, response }),
      ),
    );
    room = await action(host, "state", { id: room.id });
    assert.equal(room.state, "ROUND_RESULTS");
    assert.ok(room.members.every((member) => member.score === 100));
    await waitUntil(room.deadline);
    room = await action(host, "state", { id: room.id });
    assert.equal(room.state, "FINISHED");
    assert.equal(room.history[0].points, 100);
    assert.equal(
      (await action(host, "list", {})).history.find(
        (match) => match.id === room.id,
      ).score,
      100,
    );
  },
);
