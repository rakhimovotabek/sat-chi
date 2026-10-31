import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "real Reading & Writing and both multiple-choice Vocabulary modes persist exact final histories",
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
    const clients = [];
    for (const name of ["admin", "student", "studentB"]) {
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
    const rpc = async (client, name, args = {}) => {
      const result = await client.rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const action = (client, action, data) =>
      rpc(client, "battle_action", { p_action: action, p_data: data });
    const waitUntil = (deadline) =>
      new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, Date.parse(deadline) - Date.now() + 100),
        ),
      );
    const finishMatch = async (category, filters, chooseAnswer, inspect) => {
      let room = await action(clients[1], "create", {
        category,
        capacity: 2,
        questionCount: 1,
        seconds: 60,
        public: false,
        filters,
      });
      const id = room.id;
      await action(clients[2], "join", { code: room.code });
      await Promise.all(
        clients.slice(1).map((client) => action(client, "ready", { id })),
      );
      room = await action(clients[1], "start", { id });
      await waitUntil(room.deadline);
      room = await action(clients[1], "state", { id });
      assert.equal(room.state, "PLAYING");
      assert.equal(room.review, null);
      assert.equal(room.question.correct_answer, undefined);
      inspect?.(room.question);
      const answer = chooseAnswer(room.question);
      assert.ok(answer >= 0 && answer < 4);
      await action(clients[1], "answer", {
        id,
        round: 1,
        response: String(answer),
      });
      await action(clients[1], "answer", {
        id,
        round: 1,
        response: String(answer),
      });
      assert.equal((await action(clients[2], "state", { id })).review, null);
      room = await action(clients[2], "answer", {
        id,
        round: 1,
        response: String((answer + 1) % 4),
      });
      assert.equal(room.state, "ROUND_RESULTS");
      assert.equal(room.review.answer, answer);
      await waitUntil(room.deadline);
      const histories = await Promise.all(
        clients.slice(1).map((client) => action(client, "state", { id })),
      );
      for (const [index, result] of histories.entries()) {
        assert.equal(result.state, "FINISHED");
        assert.equal(result.history.length, 1);
        assert.equal(result.history[0].points, index === 0 ? 100 : 0);
        assert.equal(
          result.members.reduce((sum, member) => sum + member.score, 0),
          100,
        );
        const list = await action(clients[index + 1], "list", {});
        assert.equal(
          list.history.find((match) => match.id === id).score,
          index === 0 ? 100 : 0,
        );
      }
      assert.equal(
        await app.json(
          `select count(*)from battle_answers where battle_id='${id}'`,
        ),
        2,
      );
      return histories[0];
    };
    const upload = await clients[0].functions.invoke("import-book", {
      body: new Blob([
        await readFile(
          "assets/examples/satchi-book-v1/acceptance-reading-6.zip",
        ),
      ]),
      headers: { "Content-Type": "application/zip" },
    });
    assert.ifError(upload.error);
    let job = upload.data;
    for (let step = 0; job.status === "importing" && step < 10; step++) {
      const result = await clients[0].functions.invoke("import-book", {
        body: { jobId: job.id },
      });
      assert.ifError(result.error);
      job = result.data;
    }
    assert.equal(job.status, "draft");
    await rpc(clients[0], "universal_publish", { p_job: job.id });
    const reading = await finishMatch(
      "Reading & Writing",
      { book: job.book_id, domain: "Information and Ideas" },
      () => 1,
      (question) => {
        assert.equal(question.section, "Reading & Writing");
        assert.match(question.passage, /rain collector/);
      },
    );
    const bank = await rpc(clients[1], "question_bank", {
      p_filters: { book: job.book_id },
      p_page: 0,
    });
    assert.ok(JSON.stringify(bank).includes(reading.history[0].question.id));
    const vocabBook = await app.json(
      "with b as(insert into vocabulary_books(title,published)values('Original network meanings',false)returning id)select to_jsonb(id)from b",
    );
    const set = await app.json(
      `with s as(insert into vocabulary_sets(book_id,title)values('${vocabBook}','Original network topic')returning id)select to_jsonb(id)from s`,
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
      `update vocabulary_books set published=true where id='${vocabBook}'`,
    );
    for (const mode of ["meaning-rush", "reverse-meaning"])
      await t.test(
        mode + " completes over independent authenticated HTTP clients",
        async () => {
          await finishMatch(
            "Vocabulary",
            { book: vocabBook, sets: [set], mode },
            (question) => {
              const pair = pairs.find(
                (pair) =>
                  pair[mode === "meaning-rush" ? 0 : 1] ===
                  question.question_text,
              );
              assert.ok(pair);
              return question.options.indexOf(
                pair[mode === "meaning-rush" ? 1 : 0],
              );
            },
          );
        },
      );
  },
);
