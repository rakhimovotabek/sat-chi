import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
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
    });
    teacherPage.setDefaultTimeout(15000);
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
        for (const img of await page.locator(".book-option-content img").all())
          await expect(img).toHaveJSProperty("naturalWidth", 120);
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
    assert.deepEqual(errors, []);
  },
);
