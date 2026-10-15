import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
  admin,
  studentB,
} from "./helpers/native-app-environment.js";

const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "platform improvements on isolated PostgreSQL 17 / PostgREST and real browsers",
  { skip: !enabled, timeout: 300000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    const legacySession = "f9000000-0000-0000-0000-000000000001";
    await app.sql(`insert into public.book_practice_sessions(id,student_id,title,kind,submitted_at,started_at)values('${legacySession}','${student}','Legacy final-only evidence','book',now()-interval '20 days',now()-interval '21 days');
  insert into public.book_practice_items(session_id,position,question,selected_answer,correct)select '${legacySession}',0,to_jsonb(q),1,true from public.questions q where id='${app.ids[20]}';`);
    const before = await app.json(
      "select jsonb_build_object('items',(select count(*) from book_practice_items),'checks',(select count(*) from question_check_attempts),'keys',(select md5(string_agg(to_jsonb(k)::text,',' order by item_id))from book_practice_keys k))",
    );
    await app.upgrade();
    const after = await app.json(
      "select jsonb_build_object('items',(select count(*) from book_practice_items),'checks',(select count(*) from question_check_attempts),'keys',(select md5(string_agg(to_jsonb(k)::text,',' order by item_id))from book_practice_keys k))",
    );
    assert.deepEqual(
      after,
      before,
      "migration preserves all existing items, checks and keys",
    );
    assert.match(
      await app.json("select to_jsonb(current_setting('server_version'))"),
      /^17\./,
    );
    const legacy = await app.json(
      app.as(student, "select public.learning_metrics()"),
    );
    assert.equal(legacy.first_unknown, 1);
    assert.equal(legacy.first_accuracy, null);
    assert.equal(legacy.eventually_correct, 1);
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const context = await browser.newContext();
    const page = await context.newPage();
    const failures = [],
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("response", (r) => {
      if (r.status() >= 400)
        failures.push([r.status(), new URL(r.url()).pathname]);
    });
    const login = async (target, account = "student") => {
      await target.goto(app.appUrl + "/login");
      await target
        .getByLabel("Email", { exact: true })
        .fill(account + "@fixture.invalid");
      await target
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await target
        .getByRole("button", { name: "Sign In", exact: true })
        .click();
      await target.waitForURL(
        account === "admin" ? /\/admin\/dashboard$/ : /\/dashboard$/,
      );
    };
    await login(page);
    await t.test(
      "wrong then corrected retains initial accuracy after refresh and fresh login",
      async () => {
        const sid = await app.json(
          app.as(student, `select public.start_book_practice('${app.topic}')`),
        );
        await page.goto(app.appUrl + "/practice/" + sid);
        await page.getByRole("radio").nth(0).check();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Incorrect",
        );
        await page.getByRole("radio").nth(1).check();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await page.reload();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await page.goto(app.appUrl + "/dashboard");
        const card = page.locator("article").filter({
          has: page.locator("small", { hasText: /^First-attempt accuracy$/ }),
        });
        await expect(card.locator("strong")).toHaveText("0%");
        const totals = await app.json(
          app.as(student, "select public.learning_metrics()"),
        );
        assert.equal(totals.first_incorrect, 1);
        assert.equal(totals.first_unknown, 1);
        assert.equal(totals.eventually_correct, 2);
        await page
          .getByRole("button", { name: "Log out", exact: true })
          .click();
        await login(page);
        await expect(card.locator("strong")).toHaveText("0%");
      },
    );
    await t.test(
      "private evidence and other students' statistics remain inaccessible",
      async () => {
        await app.sql(
          `insert into auth.users(id,email)values('${studentB}','studentB@fixture.invalid')`,
        );
        await assert.rejects(
          app.sql(
            app.as(studentB, `select public.learning_metrics('${student}')`),
          ),
          /unavailable/,
        );
        await assert.rejects(
          app.sql(
            app.as(
              student,
              "insert into public.practice_grade_events(item_id,source,first_known)select id,'submission',true from book_practice_items limit 1",
            ),
          ),
          /permission denied/,
        );
        const visible = await app.json(
          app.as(
            studentB,
            "select count(*) from public.question_check_attempts",
          ),
        );
        assert.equal(visible, 0);
        assert.equal(
          (
            await app.json(
              app.as(admin, `select public.learning_metrics('${student}')`),
            )
          ).first_incorrect,
          1,
        );
      },
    );
    await t.test(
      "subtopic history is visible in parent and bank without new homework submissions",
      async () => {
        const parent = await app.json(
          `with p as(insert into public.book_topics(book_id,title,position)values('${app.book}','Advanced Math fixture parent',0)returning id)select to_jsonb(id)from p`,
        );
        await app.sql(
          `update public.book_topics set parent_id='${parent}' where id='${app.topic}'`,
        );
        const canonical = await app.json(
          `select to_jsonb(i.question->>'id')from public.book_practice_items i join public.question_check_attempts a on a.item_id=i.id order by a.created_at limit 1`,
        );
        const sid = await app.json(
          app.as(student, `select public.start_book_practice('${parent}')`),
        );
        const position = await app.json(
          `select position from public.book_practice_items where session_id='${sid}' and question->>'id'='${canonical}'`,
        );
        await page.goto(app.appUrl + "/practice/" + sid);
        await page.getByRole("button", { name: /Question \d+ of/ }).click();
        await page
          .getByRole("dialog")
          .getByRole("button", {
            name: new RegExp(`^Question ${position + 1},`),
          })
          .click();
        await expect(
          page.getByRole("region", { name: "Previous question activity" }),
        ).toContainText("Corrected after mistake");
        await expect(page.getByRole("radio").nth(1)).not.toBeChecked();
        await page
          .getByText("View recorded answer history", { exact: true })
          .click();
        await expect(page.locator(".prior-history ol li")).toHaveCount(2);
        await page.reload();
        await expect(
          page.getByRole("region", { name: "Previous question activity" }),
        ).toContainText("Corrected after mistake");
        const bank = await app.json(
          app.as(
            student,
            `select public.start_bank_practice('{"book":"${app.book}","status":"corrected"}',1,false)`,
          ),
        );
        await page.goto(app.appUrl + "/practice/" + bank);
        await expect(page.locator(".prior-history")).toContainText(
          "Previous answer: Choice B",
        );
        await page.getByRole("button", { name: /Question \d+ of/ }).click();
        await expect(
          page
            .getByRole("dialog")
            .getByRole("button", { name: /^Question 1,/ }),
        ).toHaveClass(/is-previously-corrected/);
        assert.equal(
          await app.json(
            `select count(*) from book_practice_items where session_id='${app.session}' and selected_answer is not null`,
          ),
          0,
        );
      },
    );
    await t.test(
      "entire 1,263-question book is ordered, navigable and durable without eager image rendering",
      async () => {
        const largeBook = await app.json(
          "with b as(insert into books(title,category,published)values('Large ordered book fixture','Math',true)returning id)select to_jsonb(id)from b",
        );
        const topic = await app.json(
          `with t as(insert into book_topics(book_id,title,position)values('${largeBook}','Large section',0)returning id)select to_jsonb(id)from t`,
        );
        await app.sql(`insert into questions(topic_id,position,question_text,options,image_url)select '${topic}',n-1,'Large book fixture question '||n,'["1","2","3","4"]','https://fixture.invalid/storage/v1/object/authenticated/book-package-assets/${app.path}' from generate_series(1,1263)n;
      insert into question_answers(question_id,correct_answer,explanation)select id,1,'Large fixture explanation'from questions where topic_id='${topic}';`);
        await page.goto(app.appUrl + "/books/" + largeBook);
        await page
          .getByRole("button", { name: "Practice Entire Book", exact: true })
          .click();
        await page.waitForURL(/\/practice\//);
        const sid = page.url().split("/").at(-1);
        await expect(
          page.getByRole("button", { name: "Question 1 of 1263", exact: true }),
        ).toBeVisible();
        assert.equal(
          await app.json(
            `select count(*) from book_practice_items where session_id='${sid}'`,
          ),
          1263,
        );
        assert.equal(
          await app.json(
            app.as(
              student,
              `select public.start_entire_book_practice('${largeBook}')`,
            ),
          ),
          sid,
        );
        await page
          .getByRole("button", { name: "Question 1 of 1263", exact: true })
          .click();
        await expect(page.locator(".question-numbers button")).toHaveCount(100);
        await page
          .getByRole("button", { name: "Last questions", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: /^Question 1263,/ })
          .click();
        await expect(
          page.getByRole("button", {
            name: "Question 1263 of 1263",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          page.locator(".question-stem, .question-text, .answers-panel"),
        ).toContainText("Large book fixture question 1263");
        assert.ok(
          (await page
            .locator(
              ".player-workspace img, .practice-workspace img, .stimulus-panel img",
            )
            .count()) <= 4,
        );
        await page.getByRole("radio").nth(1).check();
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
        await page.reload();
        await page.getByRole("button", { name: /Question \d+ of/ }).click();
        if (
          await page
            .getByRole("button", { name: "Last questions", exact: true })
            .isEnabled()
        )
          await page
            .getByRole("button", { name: "Last questions", exact: true })
            .click();
        await page
          .getByRole("dialog")
          .getByRole("button", { name: /^Question 1263,/ })
          .click();
        await expect(page.getByRole("radio").nth(1)).toBeChecked();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Correct",
        );
      },
    );
    await t.test(
      "administrator profile opens read-only book review; backend rejects answer writes",
      async () => {
        const teacher = await (await browser.newContext()).newPage();
        await login(teacher, "admin");
        await teacher.goto(app.appUrl + "/admin/students/" + student);
        await teacher
          .getByRole("link", {
            name: /SATakror disposable fixture.*Review read-only/,
          })
          .click();
        await teacher
          .getByLabel("Show questions", { exact: true })
          .selectOption("corrected");
        await expect(
          teacher.getByRole("region", { name: "Read-only student answer" }),
        ).toContainText("Initial result: Incorrect");
        await expect(
          teacher.getByRole("region", { name: "Read-only student answer" }),
        ).toContainText("Currently correct");
        await expect(teacher.getByRole("radio")).toHaveCount(0);
        await expect(
          teacher.getByRole("button", { name: /^(Check|Submit|Save answer)/ }),
        ).toHaveCount(0);
        const source = await app.json(
          `select row_to_json(r)from(select i.id,i.session_id from book_practice_items i join question_check_attempts a on a.item_id=i.id order by a.created_at limit 1)r`,
        );
        await assert.rejects(
          app.sql(
            app.as(
              admin,
              `select public.save_practice_changes('${source.session_id}','[{"id":"${source.id}","expected_revision":0,"selected_answer":2}]')`,
            ),
          ),
          /unavailable/,
        );
        await assert.rejects(
          app.sql(
            app.as(
              admin,
              `select public.finish_book_practice('${source.session_id}')`,
            ),
          ),
          /unavailable/,
        );
        await teacher.close();
      },
    );
    await t.test(
      "dashboard countdown persists across reload and isolates ticking from database reads",
      async () => {
        await page.goto(app.appUrl + "/dashboard");
        await page
          .getByRole("button", { name: "Set exam date", exact: true })
          .click();
        await page
          .getByLabel("SAT exam date", { exact: true })
          .fill("2099-12-05");
        await page
          .getByLabel("Exam timezone", { exact: true })
          .fill("Asia/Tashkent");
        await page
          .getByRole("button", { name: "Save exam date", exact: true })
          .click();
        await expect(page.locator(".countdown-convention")).toContainText(
          "2099-12-05 · Asia/Tashkent",
        );
        await page.reload();
        await expect(page.locator(".countdown-convention")).toContainText(
          "2099-12-05 · Asia/Tashkent",
        );
        let queries = 0;
        const observe = (r) => {
          if (r.url().includes("/rest/v1/")) queries++;
        };
        page.on("request", observe);
        const before = await page.locator(".countdown-digits").innerText();
        await expect
          .poll(() => page.locator(".countdown-digits").innerText())
          .not.toBe(before);
        page.off("request", observe);
        assert.equal(queries, 0, "one-second ticks do not fetch database data");
        await page.setViewportSize({ width: 390, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          "dashboard fits mobile viewport",
        );
        await page.setViewportSize({ width: 1280, height: 800 });
      },
    );
    assert.deepEqual(errors, [], "no browser exceptions");
    assert.deepEqual(failures, [], "no unexpected request failures");
  },
);
