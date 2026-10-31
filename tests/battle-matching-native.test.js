import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "two real browsers complete Word Matching with private grading, original source filters and human-readable saved pairs",
  {
    skip: !process.env.SATCHI_TEST_AUTH_BIN,
    timeout: 240000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      extraUsers: true,
      officialServices: process.env.SATCHI_TEST_OFFICIAL_SERVICES === "1",
    });
    t.after(() => app.close());
    await app.upgrade();
    const book = await app.json(
      "with b as(insert into vocabulary_books(title,published)values('Original matching acceptance',false)returning id)select to_jsonb(id)from b",
    );
    const set = await app.json(
      `with s as(insert into vocabulary_sets(book_id,title)values('${book}','Original matching set')returning id)select to_jsonb(id)from s`,
    );
    const pairs = [
      ["bright", "giving much light"],
      ["gentle", "using little force"],
      ["rapid", "moving very quickly"],
      ["scarce", "available in small amounts"],
    ];
    for (const [word, definition] of pairs)
      await app.sql(
        `insert into vocabulary_words(set_id,word,definition)values('${set}','${word}','${definition}')`,
      );
    await app.sql(
      `update vocabulary_books set published=true where id='${book}'`,
    );
    const clients = [];
    for (const name of ["student", "studentB"]) {
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
      t.after(async () => {
        await client.removeAllChannels();
        client.realtime.disconnect();
        client.auth.stopAutoRefresh();
      });
    }
    const action = async (client, action, data) => {
      const result = await client.rpc("battle_action", {
        p_action: action,
        p_data: data,
      });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const host = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      reducedMotion: "reduce",
    });
    const guest = await browser.newPage({
      viewport: { width: 390, height: 844 },
      reducedMotion: "reduce",
    });
    const errors = [];
    for (const page of [host, guest])
      page.on("pageerror", (error) => errors.push(error.message));
    const login = async (page, name) => {
      await page.goto(`${app.appUrl}/login`);
      await page
        .getByLabel("Email", { exact: true })
        .fill(name + "@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL(/\/dashboard/);
      await page.goto(`${app.appUrl}/battles`);
    };
    await login(host, "student");
    await host
      .getByLabel("Category", { exact: true })
      .selectOption("Vocabulary");
    await host
      .getByLabel("Vocabulary mode", { exact: true })
      .selectOption("word-matching");
    await host
      .getByText("Vocabulary book and topic sets", { exact: true })
      .click();
    await host
      .getByLabel("Vocabulary book", { exact: true })
      .selectOption(book);
    await host
      .getByRole("checkbox", { name: "Original matching set", exact: true })
      .check();
    await host.getByLabel("Matching rounds", { exact: false }).fill("1");
    await host
      .getByRole("button", { name: "Create Battle", exact: true })
      .click();
    await expect(
      host.getByRole("button", { name: "Mark ready", exact: true }),
    ).toBeVisible();
    const row = await app.json(
      `select to_jsonb(b)from battles b where host_id='${student}'and state='LOBBY'order by created_at desc limit 1`,
    );
    assert.deepEqual(row.filters.sets, [set]);
    await login(guest, "studentB");
    await guest.getByLabel("Invitation code").fill(row.code);
    await guest
      .getByRole("button", { name: "Join lobby", exact: true })
      .click();
    await guest
      .getByRole("button", { name: "Mark ready", exact: true })
      .click();
    await host.bringToFront();
    await host.getByRole("button", { name: "Mark ready", exact: true }).click();
    await host
      .getByRole("button", { name: "Start Battle", exact: true })
      .click();
    await expect(
      host.getByRole("group", {
        name: "Four word-definition pairs",
        exact: true,
      }),
    ).toBeVisible({ timeout: 15000 });
    const playing = await action(clients[1], "state", { id: row.id });
    assert.equal(playing.question.accepted_answers, undefined);
    assert.equal(playing.review, null);
    assert.equal(playing.question.matching_words.length, 4);
    assert.ok(
      playing.question.matching_words.every(
        (word) => word.definition === undefined,
      ),
    );
    await assert.rejects(
      () =>
        action(clients[1], "answer", {
          id: row.id,
          round: 1,
          response: "[0,0,1,2]",
        }),
      /four distinct/,
    );
    const correct = playing.question.matching_words.map(
      (word) => pairs.find((pair) => pair[0] === word.word)[1],
    );
    for (const [index, word] of playing.question.matching_words.entries())
      await host
        .getByLabel(`Definition for ${word.word}`, { exact: true })
        .selectOption({ label: correct[index] });
    await guest.bringToFront();
    const wrong = [...correct];
    [wrong[0], wrong[1]] = [wrong[1], wrong[0]];
    for (const [index, word] of playing.question.matching_words.entries())
      await guest
        .getByLabel(`Definition for ${word.word}`, { exact: true })
        .selectOption({ label: wrong[index] });
    await mkdir("test-results", { recursive: true });
    await guest.screenshot({
      path: "test-results/word-matching-mobile.png",
      fullPage: true,
    });
    assert.ok(
      await guest.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await host.bringToFront();
    await host.screenshot({
      path: "test-results/word-matching-laptop.png",
      fullPage: true,
    });
    await host
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      host.getByText("Answer submitted. Waiting for the other players…", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      (await action(clients[1], "state", { id: row.id })).review,
      null,
    );
    await guest.bringToFront();
    await guest
      .getByRole("button", { name: "Submit answer", exact: true })
      .click();
    await expect(
      guest.getByRole("region", { name: "Correct pairs", exact: true }),
    ).toBeVisible();
    await expect(
      guest.getByRole("heading", { name: "Battle completed", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await host.bringToFront();
    await expect(
      host.getByRole("heading", { name: "Top of the arena", exact: true }),
    ).toBeVisible();
    const finished = await action(clients[0], "state", { id: row.id });
    assert.equal(finished.state, "FINISHED");
    assert.equal(
      finished.members.find((member) => member.user_id === student).score,
      100,
    );
    assert.equal(
      finished.members.find((member) => member.user_id !== student).score,
      0,
    );
    assert.equal(finished.history[0].points, 100);
    assert.equal(JSON.parse(finished.history[0].response).length, 4);
    await host
      .getByText("Question 1 · Correct · 100 points", { exact: true })
      .click();
    const savedPairs = host.getByRole("region", {
      name: "Your pairs",
      exact: true,
    });
    for (const definition of correct)
      await expect(savedPairs).toContainText(definition);
    assert.deepEqual(errors, []);
  },
);
