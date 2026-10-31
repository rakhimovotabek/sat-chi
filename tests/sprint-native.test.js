import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
import { assertIsolatedTarget } from "../scripts/testing/isolated-target.js";

// Explicit opt-in prevents the default unit suite from starting browsers/services.
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN &&
    process.env.SATCHI_TEST_POSTGREST &&
    process.env.SATCHI_TEST_AUTH_BIN,
);
test(
  "native Auth/PostgREST importer and independent multiplayer clients",
  { skip: !enabled, timeout: 300000 },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      extraUsers: true,
    });
    t.after(() => app.close());
    assertIsolatedTarget(app.apiUrl);
    await app.upgrade();
    const anon = app.tokenFor(student, { role: "anon" });
    const clients = [];
    for (const name of ["admin", "student", "studentB", "studentC"]) {
      const client = createClient(app.apiUrl, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error } = await client.auth.signInWithPassword({
        email: `${name}@fixture.invalid`,
        password: "disposable-test-only",
      });
      assert.ifError(error);
      clients.push(client);
      t.after(() => client.auth.stopAutoRefresh());
    }
    const [teacher, learner] = clients;
    const rpc = async (client, name, args = {}) => {
      const { data, error } = await client.rpc(name, args);
      if (error) throw new Error(`${name}: ${error.message}`);
      return data;
    };
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const teacherPage = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      reducedMotion: "reduce",
    });
    teacherPage.setDefaultTimeout(30000);
    const errors = [];
    teacherPage.on("pageerror", (error) => errors.push(error.message));
    const login = async (page, name) => {
      await page.goto(`${app.appUrl}/login`);
      await page
        .getByLabel("Email", { exact: true })
        .fill(`${name}@fixture.invalid`);
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL(/\/(admin|dashboard)/);
    };
    const repairFolder = await mkdtemp(
      join(tmpdir(), "satchi-original-option-"),
    );
    t.after(() => rm(repairFolder, { recursive: true, force: true }));
    const replacement = join(repairFolder, "option-b.png");
    execFileSync("magick", [
      "assets/examples/math-repair/two-column.png",
      "-crop",
      "250x70+350+70",
      "+repage",
      replacement,
    ]);
    let book, job, firstId;
    await t.test(
      "browser uploads actual ZIP bytes, resumes durable draft and edits canonical question",
      async () => {
        await login(teacherPage, "admin");
        await teacherPage.goto(`${app.appUrl}/admin/books`);
        await teacherPage
          .getByRole("button", { name: "Import Book", exact: true })
          .click();
        await teacherPage
          .getByLabel("Choose or drop a satchi-book-v1 ZIP")
          .setInputFiles(
            "assets/examples/satchi-book-v1/acceptance-math-30.zip",
          );
        await expect(
          teacherPage.getByRole("heading", {
            name: "SAT’chi Original Acceptance — Math",
          }),
        ).toBeVisible();
        await teacherPage
          .getByRole("button", { name: "Import as draft", exact: true })
          .click();
        await expect(
          teacherPage
            .getByRole("status")
            .filter({ hasText: "30/30 questions saved" }),
        ).toContainText("draft", { timeout: 30000 });
        const row = await app.json(
          "select to_jsonb(j) from universal_book_jobs j order by created_at desc limit 1",
        );
        book = row.book_id;
        job = row.id;
        assert.equal(row.asset_cursor, 6);
        assert.equal(
          (await learner.from("books").select("id").eq("id", book)).data.length,
          0,
        );
        assert.equal(
          await app.json(
            `select count(*) from universal_book_ids where job_id='${job}'`,
          ),
          30,
        );
        await teacherPage
          .getByRole("link", { name: "Manage book", exact: true })
          .click();
        await teacherPage
          .getByText("Review and correct imported questions", { exact: true })
          .click();
        const record = JSON.parse(
          await teacherPage
            .getByLabel("Question record", { exact: true })
            .inputValue(),
        );
        record.explanation += " Verified local draft correction.";
        await teacherPage
          .getByLabel("Question record", { exact: true })
          .fill(JSON.stringify(record));
        await teacherPage
          .getByRole("button", { name: "Save validated correction" })
          .click();
        await expect(
          teacherPage.getByText("Correction saved.", { exact: false }),
        ).toBeVisible();
        firstId = await app.json(
          `select to_jsonb(question_id) from universal_book_ids where job_id='${job}' and source_id='q0001'`,
        );
        await teacherPage.reload();
        await teacherPage
          .getByText("Review and correct imported questions", { exact: true })
          .click();
        await expect(
          teacherPage.getByLabel("Question record", { exact: true }),
        ).toHaveValue(/Verified local draft correction/);
        await teacherPage
          .getByRole("combobox", { name: "Question", exact: true })
          .selectOption("1");
        await teacherPage
          .getByLabel("Replacement PNG, JPEG or WebP")
          .setInputFiles(replacement);
        await expect(
          teacherPage.getByAltText("Replacement image preview"),
        ).toHaveJSProperty("naturalWidth", 250);
        await teacherPage
          .getByRole("button", { name: "Save validated correction" })
          .click();
        await expect(
          teacherPage.getByText("Correction saved.", { exact: false }),
        ).toBeVisible();
        await teacherPage.goto(`${app.appUrl}/admin/books`);
        await teacherPage
          .getByRole("button", { name: "Import Book", exact: true })
          .click();
        await teacherPage
          .getByLabel("Choose or drop a satchi-book-v1 ZIP")
          .setInputFiles(
            "assets/examples/satchi-book-v1/acceptance-math-30.zip",
          );
        await teacherPage
          .getByRole("button", { name: "Import as draft", exact: true })
          .click();
        await expect(
          teacherPage
            .getByRole("status")
            .filter({ hasText: "30/30 questions saved" }),
        ).toBeVisible();
        await teacherPage.getByRole("checkbox", { name: /reviewed/ }).check();
        await teacherPage
          .getByRole("button", { name: "Publish validated book" })
          .click();
        await expect(
          teacherPage.getByText("Published in Books and Question Bank.", {
            exact: true,
          }),
        ).toBeVisible();
        assert.equal(
          await app.json("select count(*) from universal_book_jobs"),
          1,
        );
      },
    );
    if (!book) return;
    await t.test(
      "student solves image MCQ and SPR, refreshes, sees canonical Bank identity and preserved lifecycle history",
      async () => {
        const page = await browser.newPage({
          viewport: { width: 1366, height: 768 },
          reducedMotion: "reduce",
        });
        await login(page, "student");
        await page.goto(`${app.appUrl}/books/${book}`);
        await expect(
          page.getByRole("heading", {
            name: "SAT’chi Original Acceptance — Math",
            exact: true,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Practice Entire Book", exact: true })
          .click();
        await page.waitForURL(/\/practice\//);
        const session = page.url().split("/").at(-1);
        await page.getByRole("radio").nth(1).check();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(
          page.getByRole("button", { name: /Explanation/ }),
        ).toBeVisible();
        await page.getByRole("button", { name: /Explanation/ }).click();
        await expect(
          page.getByText("Verified local draft correction", { exact: false }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await expect(page.locator(".book-option-content img")).toHaveCount(4);
        const optionImages = await page
          .locator(".book-option-content img")
          .all();
        for (const [index, img] of optionImages.entries())
          await expect(img).toHaveJSProperty(
            "naturalWidth",
            index === 1 ? 250 : 120,
          );
        await page.getByRole("radio").nth(1).check();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback strong")).toHaveText(
          "Correct",
        );
        await page.reload();
        await expect(page.getByRole("radio").nth(1)).toBeChecked();
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page.getByRole("textbox", { name: /Your answer/ }).fill("1/2");
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Explanation", exact: true }),
        ).toBeVisible();
        const bank = await rpc(learner, "question_bank", {
          p_filters: { book },
          p_page: 0,
        });
        const bankPage2 = await rpc(learner, "question_bank", {
          p_filters: { book },
          p_page: 1,
        });
        assert.ok(JSON.stringify([bank, bankPage2]).includes(firstId));
        await expect
          .poll(() =>
            app.json(
              `select count(*) from question_check_attempts a join book_practice_items i on i.id=a.item_id where i.session_id='${session}'`,
            ),
          )
          .toBe(3);
        const before = await app.json(
          `select jsonb_agg(to_jsonb(a) order by a.id)from question_check_attempts a join book_practice_items i on i.id=a.item_id where i.session_id='${session}'`,
        );
        assert.equal(before.length, 3);
        await rpc(teacher, "manage_book_lifecycle", {
          p_book: book,
          p_action: "hide",
        });
        assert.equal(
          (await learner.from("books").select("id").eq("id", book)).data.length,
          0,
        );
        const draft = await rpc(teacher, "universal_draft_records", {
          p_book: book,
        });
        const correction = draft.records.find(
          (r) => r.questionId === firstId,
        ).record;
        correction.answer = 2;
        assert.ifError(
          (
            await teacher.functions.invoke("import-book", {
              body: { jobId: job, correction },
            })
          ).error,
        );
        const audit = await teacher
          .from("universal_book_corrections")
          .select("actor,previous_record,corrected_record")
          .eq("question_id", firstId)
          .order("created_at", { ascending: false });
        assert.ifError(audit.error);
        assert.equal(
          audit.data[0].actor,
          (await teacher.auth.getUser()).data.user.id,
        );
        assert.equal(audit.data[0].previous_record.answer, 1);
        assert.equal(audit.data[0].corrected_record.answer, 2);
        assert.equal(
          (await learner.from("universal_book_corrections").select("id")).data
            .length,
          0,
        );
        await rpc(teacher, "manage_book_lifecycle", {
          p_book: book,
          p_action: "archive",
        });
        await rpc(teacher, "manage_book_lifecycle", {
          p_book: book,
          p_action: "restore",
        });
        await rpc(teacher, "universal_publish", {
          p_job: job,
          p_publish: true,
        });
        const after = await app.json(
          `select jsonb_agg(to_jsonb(a) order by a.id)from question_check_attempts a join book_practice_items i on i.id=a.item_id where i.session_id='${session}'`,
        );
        assert.deepEqual(after, before);
        await mkdir("test-results", { recursive: true });
        await page.screenshot({
          path: "test-results/native-import-practice.png",
        });
        await page.close();
      },
    );
    await t.test(
      "actual HTTP handler rejects student uploads and malformed bytes without creating jobs",
      async () => {
        const zip = await readFile(
          "assets/examples/satchi-book-v1/acceptance-math-30.zip",
        );
        const { data: session } = await learner.auth.getSession();
        const unauthorized = await fetch(
          `${app.apiUrl}/functions/v1/import-book`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${session.session.access_token}`,
              "content-type": "application/zip",
            },
            body: zip,
          },
        );
        assert.equal(unauthorized.status, 403);
        const bad = await teacher.functions.invoke("import-book", {
          body: new Blob(["invalid ZIP"]),
          headers: { "Content-Type": "application/zip" },
        });
        assert.ok(bad.error);
        const publishedReplacement = await teacher.functions.invoke(
          "import-book",
          {
            body: new Blob([await readFile(replacement)]),
            headers: { "Content-Type": "image/png", "x-satchi-job": job },
          },
        );
        assert.ok(publishedReplacement.error);
        assert.match(
          (await publishedReplacement.error.context.json()).error,
          /hide the book/,
        );
        assert.equal(
          await app.json("select count(*) from universal_book_jobs"),
          1,
        );
      },
    );
    await t.test(
      "independently authenticated network clients finish 1v1 and 2v2 with reconnect and replay protection",
      async () => {
        const action = (client, action, data = {}) =>
          rpc(client, "battle_action", { p_action: action, p_data: data });
        const waitDeadline = async (value) =>
          new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.max(0, Date.parse(value) - Date.now() + 80),
            ),
          );
        for (const players of [[clients[1], clients[2]], clients]) {
          let room = await action(players[0], "create", {
            category: "Math",
            capacity: players.length,
            teamSize: players.length === 4 ? 2 : 0,
            questionCount: 1,
            seconds: 60,
            public: true,
            filters: { book: app.book },
          });
          const id = room.id;
          const listed = await action(players[1], "list");
          assert.ok(listed.lobbies.some((lobby) => lobby.id === id));
          await Promise.all(
            players.slice(1).map((client) => action(client, "join", { id })),
          );
          await Promise.all(
            players.map((client) => action(client, "ready", { id })),
          );
          room = await action(players[0], "start", { id });
          assert.equal(room.question, null);
          await waitDeadline(room.deadline);
          room = await action(players[0], "state", { id });
          assert.equal(room.state, "PLAYING");
          assert.equal(room.review, null);
          const response = room.question.question_type === "open" ? "8.6" : "1";
          await action(players[0], "answer", { id, round: 1, response });
          // Fresh Auth session restores the same authoritative seat and saved submission.
          const reconnect = createClient(app.apiUrl, anon, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const email = players.length === 4 ? "admin" : "student";
          assert.ifError(
            (
              await reconnect.auth.signInWithPassword({
                email: `${email}@fixture.invalid`,
                password: "disposable-test-only",
              })
            ).error,
          );
          const snapshot = await action(reconnect, "state", { id });
          assert.equal(snapshot.submitted, true);
          assert.equal(snapshot.members.length, players.length);
          assert.ok(snapshot.members.every((member) => member.score === 0));
          await action(reconnect, "answer", { id, round: 1, response });
          reconnect.auth.stopAutoRefresh();
          await Promise.all(
            players
              .slice(1)
              .map((client) =>
                action(client, "answer", { id, round: 1, response }),
              ),
          );
          room = await action(players[0], "state", { id });
          assert.equal(room.state, "ROUND_RESULTS");
          assert.equal(
            room.members.reduce((n, member) => n + member.score, 0),
            players.length * 100,
          );
          if (players.length === 4)
            for (const team of [1, 2])
              assert.equal(
                room.members
                  .filter((member) => member.team === team)
                  .reduce((n, member) => n + member.score, 0),
                200,
              );
          await waitDeadline(room.deadline);
          room = await action(players[0], "state", { id });
          assert.equal(room.state, "FINISHED");
          assert.equal(room.history.length, 1);
          assert.equal(room.history[0].points, 100);
          const history = await action(players[0], "list");
          assert.equal(
            history.history.find((match) => match.id === id).score,
            100,
          );
        }
      },
    );
    await t.test(
      "concurrent network joins cannot exceed capacity; host leave transfers control",
      async () => {
        const action = (client, action, data = {}) =>
          rpc(client, "battle_action", { p_action: action, p_data: data });
        let room = await action(clients[1], "create", {
          category: "Math",
          capacity: 2,
          teamSize: 0,
          questionCount: 1,
          seconds: 60,
          public: true,
          filters: { book: app.book },
        });
        const id = room.id;
        const joins = await Promise.allSettled([
          action(clients[2], "join", { id }),
          action(clients[3], "join", { id }),
        ]);
        assert.equal(joins.filter((r) => r.status === "fulfilled").length, 1);
        const winner =
          joins[0].status === "fulfilled" ? clients[2] : clients[3];
        const loser = winner === clients[2] ? clients[3] : clients[2];
        await assert.rejects(
          () => action(loser, "state", { id }),
          /Join this battle/,
        );
        await action(clients[1], "leave", { id });
        room = await action(winner, "state", { id });
        assert.equal(room.host_id, room.me);
        assert.equal(room.members.length, 1);
        assert.equal(
          (await action(winner, "cancel", { id })).state,
          "CANCELLED",
        );
      },
    );
    await t.test(
      "Progress renders exact persisted canonical results after an answer-key correction",
      async () => {
        const aggregate = await rpc(learner, "progress_activity", {
          p_days: 7,
          p_section: "Math",
        });
        assert.equal(aggregate.questions, 3);
        assert.equal(aggregate.correct, 3);
        assert.equal(aggregate.accuracy, 100);
        const page = await browser.newPage({
          viewport: { width: 1366, height: 768 },
          reducedMotion: "reduce",
        });
        await login(page, "student");
        await page.goto(`${app.appUrl}/progress`);
        const panel = page.getByRole("region", {
          name: "First-attempt activity",
        });
        await panel.getByLabel("Activity period").selectOption("7");
        await panel.getByLabel("Activity subject").selectOption("Math");
        await expect(panel.getByRole("status")).toContainText(
          "3 distinct graded questions",
        );
        await expect(panel.getByRole("status")).toContainText(
          "100% first-attempt accuracy",
        );
        await expect(panel.locator(".progress-chart")).toHaveAttribute(
          "data-motion",
          "complete",
        );
        await panel
          .getByText("Daily values and sample sizes", { exact: true })
          .click();
        await expect(panel.locator("tbody tr")).toHaveCount(7);
        await page.screenshot({
          path: "test-results/native-progress-laptop.png",
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: "test-results/native-progress-mobile.png",
          fullPage: true,
        });
        await page.close();
      },
    );
    await t.test(
      "browser selects a published vocabulary set and submits a typed word to the authoritative server",
      async () => {
        const vocabBook = await app.json(
          "with created as(insert into vocabulary_books(title,published)values('Original network vocabulary',false)returning id)select to_jsonb(id)from created",
        );
        const set = await app.json(
          `with created as(insert into vocabulary_sets(book_id,title)values('${vocabBook}','Original topic')returning id)select to_jsonb(id)from created`,
        );
        const pairs = [
          ["bright", "giving much light"],
          ["gentle", "using little force"],
          ["rapid", "moving very quickly"],
          ["scarce", "available in small amounts"],
          ["silent", "making no sound"],
        ];
        for (const [word, definition] of pairs)
          await app.sql(
            `insert into vocabulary_words(set_id,word,definition)values('${set}','${word}','${definition}')`,
          );
        await app.sql(
          `update vocabulary_books set published=true where id='${vocabBook}'`,
        );
        const battlePage = await browser.newPage({
          viewport: { width: 1366, height: 768 },
          reducedMotion: "reduce",
        });
        battlePage.on("pageerror", (error) => errors.push(error.message));
        await login(battlePage, "student");
        await battlePage.goto(`${app.appUrl}/battles`);
        await battlePage
          .getByLabel("Category", { exact: true })
          .selectOption("Vocabulary");
        await battlePage
          .getByLabel("Vocabulary mode", { exact: true })
          .selectOption("typed-word");
        await battlePage
          .getByText("Vocabulary book and topic sets", { exact: true })
          .click();
        await battlePage
          .getByLabel("Vocabulary book", { exact: true })
          .selectOption(vocabBook);
        await battlePage
          .getByRole("checkbox", { name: "Original topic", exact: true })
          .check();
        await battlePage.getByLabel("Questions", { exact: false }).fill("1");
        await battlePage
          .getByRole("button", { name: "Create Battle", exact: true })
          .click();
        await expect(
          battlePage.getByRole("button", { name: "Mark ready", exact: true }),
        ).toBeVisible();
        const room = await app.json(
          "select to_jsonb(b)from battles b where host_id='f1000000-0000-0000-0000-000000000002'and state='LOBBY'order by created_at desc limit 1",
        );
        assert.deepEqual(room.filters.sets, [set]);
        const action = (client, action, data) =>
          rpc(client, "battle_action", { p_action: action, p_data: data });
        await action(clients[2], "join", { code: room.code });
        await action(clients[2], "ready", { id: room.id });
        await battlePage
          .getByRole("button", { name: "Mark ready", exact: true })
          .click();
        await battlePage
          .getByRole("button", { name: "Start Battle", exact: true })
          .click();
        await expect(
          battlePage.getByRole("textbox", {
            name: "Type the word",
            exact: true,
          }),
        ).toBeVisible({ timeout: 15000 });
        await expect(
          battlePage.getByRole("region", {
            name: "Passage and reference material",
          }),
        ).toHaveCount(0);
        const snapshot = await action(clients[2], "state", { id: room.id });
        assert.equal(snapshot.question.accepted_answers, undefined);
        const word = pairs.find(
          (pair) => pair[1] === snapshot.question.question_text,
        )[0];
        await battlePage
          .getByRole("textbox", { name: "Type the word", exact: true })
          .fill(word.toUpperCase());
        await battlePage
          .getByRole("button", { name: "Submit answer", exact: true })
          .click();
        await expect(
          battlePage.getByText(
            "Answer submitted. Waiting for the other players…",
            { exact: true },
          ),
        ).toBeVisible();
        const reveal = await action(clients[2], "answer", {
          id: room.id,
          round: 1,
          response: "wrong",
        });
        assert.equal(reveal.state, "ROUND_RESULTS");
        assert.equal(
          reveal.members.find((member) => member.user_id === room.host_id)
            .score,
          100,
        );
        assert.equal(
          reveal.members.find((member) => member.user_id === reveal.me).score,
          0,
        );
        await expect(
          battlePage.getByText(`${word}:`, { exact: false }),
        ).toBeVisible();
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, Date.parse(reveal.deadline) - Date.now() + 80),
          ),
        );
        const finished = await action(learner, "state", { id: room.id });
        assert.equal(finished.state, "FINISHED");
        assert.equal(finished.history[0].points, 100);
        assert.equal(finished.history[0].response, word.toUpperCase());
        await battlePage.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await battlePage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await battlePage.screenshot({
          path: "test-results/native-typed-vocabulary-mobile.png",
          fullPage: true,
        });
      },
    );
    await t.test(
      "original Reading & Writing package publishes and supplies a passage battle",
      async () => {
        const bytes = await readFile(
          "assets/examples/satchi-book-v1/acceptance-reading-6.zip",
        );
        const uploaded = await teacher.functions.invoke("import-book", {
          body: new Blob([bytes]),
          headers: { "Content-Type": "application/zip" },
        });
        assert.ifError(uploaded.error);
        let readingJob = uploaded.data;
        for (
          let step = 0;
          readingJob.status === "importing" && step < 10;
          step++
        ) {
          const result = await teacher.functions.invoke("import-book", {
            body: { jobId: readingJob.id },
          });
          assert.ifError(result.error);
          readingJob = result.data;
        }
        assert.equal(readingJob.status, "draft");
        await rpc(teacher, "universal_publish", { p_job: readingJob.id });
        const action = (client, action, data) =>
          rpc(client, "battle_action", { p_action: action, p_data: data });
        let room = await action(clients[2], "create", {
          category: "Reading & Writing",
          capacity: 2,
          teamSize: 0,
          questionCount: 1,
          seconds: 60,
          public: false,
          filters: {
            book: readingJob.book_id,
            domain: "Information and Ideas",
          },
        });
        await action(clients[3], "join", { code: room.code });
        await Promise.all([
          action(clients[2], "ready", { id: room.id }),
          action(clients[3], "ready", { id: room.id }),
        ]);
        room = await action(clients[2], "start", { id: room.id });
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.max(0, Date.parse(room.deadline) - Date.now() + 80),
          ),
        );
        room = await action(clients[3], "state", { id: room.id });
        assert.ok(room.question.passage.includes("rain collector"));
        await Promise.all([
          action(clients[2], "answer", {
            id: room.id,
            round: 1,
            response: "1",
          }),
          action(clients[3], "answer", {
            id: room.id,
            round: 1,
            response: "0",
          }),
        ]);
        room = await action(clients[3], "state", { id: room.id });
        assert.equal(room.state, "ROUND_RESULTS");
        assert.equal(room.review.answer, 1);
        assert.equal(
          room.members.reduce((sum, member) => sum + member.score, 0),
          100,
        );
      },
    );
    await t.test(
      "admin heatmap reads submitted Homework grades and denies a student the aggregate endpoint",
      async () => {
        const items = await app.json(
          `select jsonb_agg(to_jsonb(i)order by position)from book_practice_items i where session_id='${app.session}'`,
        );
        await rpc(learner, "save_practice_changes", {
          p_session: app.session,
          p_changes: items.slice(0, 2).map((item, index) => ({
            id: item.id,
            expected_revision: item.answer_revision,
            selected_answer: index === 0 ? 1 : 0,
          })),
        });
        await rpc(learner, "finish_book_practice", {
          p_session_id: app.session,
        });
        await assert.rejects(
          () =>
            rpc(learner, "homework_question_performance", {
              p_homework: app.homework,
            }),
          /Admin required/,
        );
        const data = await rpc(teacher, "homework_question_performance", {
          p_homework: app.homework,
        });
        assert.equal(data.completed_sessions, 1);
        assert.equal(data.total_questions, 8);
        assert.deepEqual(
          data.rows.slice(0, 2).map((row) => row.accuracy),
          [100, 0],
        );
        await teacherPage.goto(`${app.appUrl}/admin/homework/${app.homework}`);
        const heatmap = teacherPage.getByRole("region", {
          name: "Question performance",
          exact: true,
        });
        await expect(heatmap.locator(".heatmap-cell")).toHaveCount(8);
        await heatmap
          .getByRole("button", {
            name: "Question 1, 100% from 1 known grades",
            exact: true,
          })
          .focus();
        await teacherPage.keyboard.press("Enter");
        await expect(
          heatmap.getByRole("region", {
            name: "Question 1 details",
            exact: true,
          }),
        ).toContainText("1 first correct / 1 known initial grades");
        await heatmap.getByLabel("Heatmap view").selectOption("time");
        await expect(heatmap.locator(".heatmap-cell").first()).toContainText(
          "No time",
        );
        await teacherPage.screenshot({
          path: "test-results/native-admin-heatmap-laptop.png",
          fullPage: true,
        });
        await teacherPage.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await teacherPage.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await teacherPage.screenshot({
          path: "test-results/native-admin-heatmap-mobile.png",
          fullPage: true,
        });
      },
    );
    assert.deepEqual(errors, []);
  },
);
