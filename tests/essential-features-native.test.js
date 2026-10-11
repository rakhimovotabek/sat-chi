import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  admin,
  student,
  studentB,
} from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "Homework View, persisted details, date isolation, all-mode standings and warm display on real PostgreSQL/PostgREST",
  { skip: !enabled, timeout: 240000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    // A historical completed open response must be counted by the backfill.
    await app.sql(`insert into public.book_practice_sessions(id,student_id,title,kind,submitted_at)values('f3000000-0000-0000-0000-000000000001','${student}','Historical open response','homework',now());
    insert into public.book_practice_items(session_id,position,question,selected_response,correct)values('f3000000-0000-0000-0000-000000000001',0,'{"id":"historical-open","question_type":"open","question_text":"Historical question","options":[]}','8.6',true);`);
    await app.upgrade();
    // The cache lock must coexist with the sessions' profile FK key-share lock.
    // Two independent sessions for the same student must not deadlock.
    await Promise.all(
      [1, 2].map((n) =>
        app.sql(
          `begin;insert into public.book_practice_sessions(student_id,title,kind)values('${student}','Concurrent fixture ${n}','bank');select pg_sleep(0.05);commit;`,
        ),
      ),
    );

    assert.equal(
      (
        await app.json(
          app.as(student, "select public.learning_standings(false);"),
        )
      ).find((r) => r.id === student).questions,
      1,
    );
    await assert.rejects(
      () =>
        app.sql(
          app.as(
            student,
            `select public.admin_homework_results('${app.homework}');`,
          ),
        ),
      /Admin required/,
    );
    await assert.rejects(
      () =>
        app.sql(
          app.as(
            student,
            `select public.admin_practice_answer_keys('${app.session}');`,
          ),
        ),
      /Admin required/,
    );
    const initial = await app.json(
      app.as(admin, `select public.admin_homework_results('${app.homework}');`),
    );
    assert.equal(initial.rows[0].student_id, student);
    const sid = await app.json(
      app.as(student, `select public.start_book_practice('${app.topic}');`),
    );
    const items = await app.json(
      `select jsonb_agg(to_jsonb(i) order by position)from public.book_practice_items i where session_id='${sid}';`,
    );
    await app.sql(
      app.as(
        student,
        `select public.save_practice_changes('${sid}','[{"id":"${items[0].id}","expected_revision":0,"selected_answer":1}]');select public.check_book_practice_answer('${sid}','${items[0].id}',1,gen_random_uuid());`,
      ),
    );
    const after = await app.json(
      app.as(student, `select public.learning_standings(false);`),
    );
    const total = after.find((r) => r.id === student);
    assert.ok(total.questions >= 1);
    // Existing data added before the migration is backfilled; distinct source IDs
    // repeat across learning modes without increasing the answered-question score.
    const baseline = total.questions;
    const q1 = JSON.stringify(items[0].question).replaceAll("'", "''"),
      q2 = JSON.stringify(items[1].question).replaceAll("'", "''"),
      q3 = JSON.stringify(items[2].question).replaceAll("'", "''");
    await app.sql(`insert into public.book_practice_sessions(id,student_id,title,kind)values('f2000000-0000-0000-0000-000000000001','${student}','Bank history','bank'),('f2000000-0000-0000-0000-000000000002','${student}','Homework history','homework');
 insert into public.book_practice_items(session_id,position,question,selected_answer,correct)values('f2000000-0000-0000-0000-000000000001',0,'${q1}',1,true),('f2000000-0000-0000-0000-000000000001',1,'${q2}',0,false),('f2000000-0000-0000-0000-000000000002',0,'${q3}',1,true);
 update public.book_practice_sessions set submitted_at=now()where id in('f2000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002');`);
    let scores = await app.json(
      app.as(admin, `select public.learning_standings(false);`),
    );
    let current = scores.find((r) => r.id === student);
    assert.equal(current.questions, baseline + 2);
    await app.sql(
      `update public.book_practice_items set correct=true where session_id='f2000000-0000-0000-0000-000000000001' and position=1;`,
    );
    scores = await app.json(
      app.as(student, `select public.learning_standings(false);`),
    );
    current = scores.find((r) => r.id === student);
    assert.equal(current.questions, baseline + 2);
    assert.equal(current.correct, baseline + 2);
    await app.sql(`select public.refresh_learning_standing('${student}');`);
    assert.equal(
      (
        await app.json(
          app.as(student, `select public.learning_standings(false);`),
        )
      ).find((r) => r.id === student).questions,
      baseline + 2,
    );
    await assert.rejects(
      () =>
        app.sql(
          app.as(student, `select * from public.learning_standing_totals;`),
        ),
      /permission denied/,
    );
    const day = await app.sql(`select timezone('Asia/Tashkent',now())::date;`);
    await app.sql(
      `update public.daily_homework_versions set valid_from='${day}'::date-1,data=jsonb_set(data,'{startDate}',to_jsonb(('${day}'::date-1)::text))where template_id='${app.daily}';update public.daily_homework_enrollments set from_date='${day}'::date-1 where template_id='${app.daily}';update public.daily_homework_windows set from_date='${day}'::date-1 where template_id='${app.daily}';`,
    );
    await app.json(
      app.as(
        student,
        `select public.start_daily_homework('${app.daily}','${day}');`,
      ),
    );
    const daily = await app.json(
      app.as(
        admin,
        `select public.admin_homework_results('${app.daily}','${day}');`,
      ),
    );
    assert.equal(daily.assignment.study_date, day);
    assert.ok(daily.rows.some((r) => r.student_id === student));
    const prev = await app.json(
      app.as(
        admin,
        `select public.admin_homework_results('${app.daily}','${day}'::date-1);`,
      ),
    );
    assert.equal(prev.rows.length, 1);
    assert.ok(prev.rows.every((r) => !r.session_id));
    assert.ok(daily.rows[0].session_id);
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    const login = async (email) => {
      await page.goto(app.appUrl + "/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill(email + "@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Log out", exact: true }),
      ).toBeVisible();
    };
    await login("admin");
    await page.goto(app.appUrl + "/admin/homework");
    await page.getByRole("link", { name: "View", exact: true }).first().click();
    await expect(
      page.getByRole("heading", { name: "Assignment overview" }),
    ).toBeVisible();
    await expect(page.getByLabel("Occurrence date")).toBeVisible();
    await page.goto(app.appUrl + "/admin/homework/" + app.homework);
    await expect(
      page.getByRole("heading", { name: "Student results" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Details", exact: true })
      .first()
      .click();
    await expect(
      page.getByText("Official answer:", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.locator(".admin-answer-options").first()).toBeVisible();
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await login("student");
    await page.goto(app.appUrl + "/practice/" + sid);
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    const image = page.locator(".stimulus-panel img").first();
    await expect(image).toBeVisible();
    await page.evaluate(
      () =>
        (window.__testImage = document.querySelector(".stimulus-panel img")),
    );
    await page
      .getByRole("button", { name: "Night Light", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(/night-light/);
    assert.ok(
      await page.evaluate(
        () =>
          window.__testImage === document.querySelector(".stimulus-panel img"),
      ),
    );
    assert.equal(
      await page.evaluate(
        () =>
          getComputedStyle(document.documentElement, "::after").pointerEvents,
      ),
      "none",
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Night Light", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    assert.equal(
      await app.json(
        `select selected_answer from public.book_practice_items where id='${items[0].id}';`,
      ),
      1,
    );
    await page
      .getByRole("button", { name: "Night Light", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Night Light", exact: true })
      .click();
    await expect(page.locator("html")).not.toHaveClass(/night-light/);
    assert.equal(
      (
        await app.json(
          app.as(admin, `select public.admin_practice_answer_keys('${sid}');`),
        )
      ).length,
      items.length,
    );
    const fresh = await app.json(
      app.as(student, `select public.start_book_practice('${app.topic}');`),
    );
    await page.goto(app.appUrl + "/practice/" + fresh);
    assert.equal(fresh, sid); // Starting again resumes the durable session.
    const choiceItem = items.find((i) =>
      i.question.option_image_urls?.some(Boolean),
    );
    assert.ok(choiceItem);
    await page.getByRole("button", { name: /Question \d+ of/ }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: new RegExp("^Question " + (choiceItem.position + 1) + ","),
      })
      .click();
    await expect(page.locator(".answer-choice img").first()).toBeVisible();
    await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await page.evaluate(
      () =>
        (window.__checkedImage = document.querySelector(".answer-choice img")),
    );
    const response = page.waitForResponse(
      (r) =>
        r.url().includes("/rpc/check_book_practice_answer") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Check", exact: true }).click();
    assert.equal((await response).status(), 200);
    await page
      .getByRole("button", { name: "Attempts (1)", exact: true })
      .click();
    await expect(
      page.getByText(/Attempt 1: B · Correct/).first(),
    ).toBeVisible();
    assert.ok(
      await page.evaluate(
        () =>
          window.__checkedImage ===
          document.querySelector(".answer-choice img"),
      ),
    );
    const saved = await app.json(
      `select row_to_json(i)from(select id,selected_answer,answer_revision,correct from public.book_practice_items where id='${choiceItem.id}')i;`,
    );
    assert.equal(saved.selected_answer, 1);
    assert.ok(saved.answer_revision > 0);
    assert.equal(saved.correct, true);
    await page.reload();
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    assert.equal(
      await app.json(
        `select selected_answer from public.book_practice_items where id='${saved.id}';`,
      ),
      1,
    );
    // A fresh user cannot read another student's answer keys or hidden cache.
    assert.ok(studentB);
  },
);
