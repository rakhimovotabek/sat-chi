import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
test(
  "two disposable real Auth clients and browsers persist speed-scored Battle results and standings",
  { skip: !process.env.SATCHI_TEST_AUTH_BIN, timeout: 180000 },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      extraUsers: true,
    });
    t.after(() => app.close());
    await app.upgrade();
    const clients = [];
    for (const name of ["student", "studentB"]) {
      const c = createClient(
        app.apiUrl,
        app.tokenFor(student, { role: "anon" }),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      assert.ifError(
        (
          await c.auth.signInWithPassword({
            email: name + "@fixture.invalid",
            password: "disposable-test-only",
          })
        ).error,
      );
      clients.push(c);
      t.after(() => {
        c.auth.stopAutoRefresh();
        c.realtime.disconnect();
      });
    }
    const rpc = async (c, a, d = {}) => {
      const r = await c.rpc("battle_action", { p_action: a, p_data: d });
      assert.ifError(r.error);
      return r.data;
    };
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const pages = [];
    for (const name of ["student", "studentB"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      pages.push(page);
      await page.goto(app.appUrl + "/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill(name + "@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL(/dashboard/);
    }
    let room = await rpc(clients[0], "create", {
      category: "Math",
      capacity: 2,
      teamSize: 0,
      questionCount: 1,
      seconds: 60,
    });
    const id = room.id;
    await rpc(clients[1], "join", { code: room.code });
    await rpc(clients[1], "ready", { id });
    await rpc(clients[0], "ready", { id });
    for (const page of pages) {
      await page.goto(app.appUrl + "/battles");
      await page.evaluate(
        (id) => sessionStorage.setItem("satchi-battle", id),
        id,
      );
      await page.reload();
      await page.getByText("Ready for the challenge?").waitFor();
    }
    room = await rpc(clients[0], "state", { id });
    assert.ok(
      room.members.every(
        (m) => m.display_name && !m.display_name.includes("@"),
      ),
    );
    await pages[0]
      .getByRole("button", { name: "Start Battle", exact: true })
      .click();
    await app.sql(
      `update battles set deadline=clock_timestamp()-interval '1 second' where id='${id}'`,
    );
    room = await rpc(clients[0], "state", { id });
    const key = await app.json(
      `select correct_answer from battle_rounds where battle_id='${id}' and round=1`,
    );
    await pages[0].getByRole("radio").nth(Number(key)).check();
    await pages[0].getByRole("button", { name: "Submit answer" }).click();
    await pages[0]
      .getByText("Answer submitted. Waiting for the other players…")
      .waitFor();
    await new Promise((r) => setTimeout(r, 1800));
    await pages[1].getByRole("radio").nth(Number(key)).check();
    await pages[1].getByRole("button", { name: "Submit answer" }).click();
    room = await rpc(clients[0], "state", { id });
    assert.equal(room.state, "ROUND_RESULTS");
    const scores = room.members.map((m) => m.score);
    assert.ok(scores[0] > scores[1]);
    assert.ok(scores.every((v) => v >= 100 && v <= 150));
    const replay = await rpc(clients[0], "answer", {
      id,
      round: 1,
      response: String(key),
    });
    assert.deepEqual(
      replay.members.map((m) => m.score),
      scores,
    );
    await pages[0].reload();
    room = await rpc(clients[0], "state", { id });
    assert.equal(room.members.length, 2);
    assert.deepEqual(
      room.members.map((m) => m.score),
      scores,
    );
    await app.sql(
      `update battles set deadline=clock_timestamp()-interval '1 second' where id='${id}'`,
    );
    room = await rpc(clients[0], "state", { id });
    assert.equal(room.state, "FINISHED");
    const board = await clients[0].rpc("battle_leaderboard", {
      p_period: "all",
    });
    assert.ifError(board.error);
    assert.equal(board.data.rows.length, 2);
    assert.equal(board.data.rows[0].wins, 1);
    assert.equal(board.data.rows[0].points, scores[0]);
    await pages[0].goto(app.appUrl + "/battles");
    await pages[0].evaluate(() => sessionStorage.removeItem("satchi-battle"));
    await pages[0].reload();
    await pages[0]
      .getByRole("heading", { name: "Battle leaderboard" })
      .waitFor();
    await pages[0].emulateMedia({ reducedMotion: "reduce" });
    await pages[0].screenshot({
      path: ".impeccable/review/premium-native-leaderboard.png",
      fullPage: true,
    });
  },
);
