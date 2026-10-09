import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "PostgreSQL17 Homework editing, group delivery and completed recurring history",
  {
    skip: !(
      process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST
    ),
    timeout: 180000,
  },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    const version = await app.json(
      "select to_jsonb(current_setting('server_version'))",
    );
    assert.match(
      version,
      /^17\./,
      "This staging rehearsal must run on PostgreSQL17",
    );
    await app.upgrade();
    const permissions = await app.json(`select jsonb_build_object(
      'authenticated_picker',has_function_privilege('authenticated','public.question_bank(jsonb,integer)','EXECUTE'),
      'anonymous_picker',has_function_privilege('anon','public.question_bank(jsonb,integer)','EXECUTE'),
      'private_candidates',has_function_privilege('authenticated','public.bank_candidate_ids(jsonb)','EXECUTE'),
      'direct_answer_write',has_table_privilege('authenticated','public.book_practice_items','UPDATE'))`);
    assert.deepEqual(permissions, {
      authenticated_picker: true,
      anonymous_picker: false,
      private_candidates: false,
      direct_answer_write: false,
    });
    const group = await app.json(
      `with added as (insert into public.groups(name)values('Disposable staging group')returning id)select to_jsonb(id)from added`,
    );
    await app.sql(
      `insert into public.group_members(group_id,student_id)values('${group}','${student}')`,
    );
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const teacher = await (await browser.newContext()).newPage();
    const pupil = await (await browser.newContext()).newPage();
    const errors = [],
      failed = [],
      outside = [];
    for (const page of [teacher, pupil]) {
      page.setDefaultTimeout(15000);
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400)
          failed.push([response.status(), new URL(response.url()).pathname]);
      });
      page.on("request", (request) => {
        if (
          !request.url().startsWith("http://127.0.0.1:") &&
          !request.url().startsWith("data:")
        )
          outside.push(request.url());
      });
      page.on("dialog", (dialog) => dialog.accept());
    }
    const login = async (page, who) => {
      await page.goto(app.appUrl + "/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill(who + "@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(
        page.getByRole("heading", {
          name:
            who === "admin"
              ? "Admin Dashboard"
              : "Your SAT journey starts here.",
          exact: true,
        }),
      ).toBeVisible();
    };
    await login(teacher, "admin");
    await login(pupil, "student");
    const studentHomework = async () => {
      await pupil
        .getByRole("link", { name: "Homework", exact: true })
        .first()
        .click();
      await expect(
        pupil.getByRole("heading", { name: "Homework", exact: true }),
      ).toBeVisible();
    };
    const editOnce = async () => {
      await teacher.goto(app.appUrl + "/admin/homework");
      await teacher
        .getByRole("row")
        .filter({ hasText: "PG17 one-time delivery" })
        .getByRole("button", { name: "Edit", exact: true })
        .click();
      return teacher.getByRole("dialog", { name: "Edit one-time homework" });
    };
    const items = (sid) =>
      app.json(
        `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id='${sid}'`,
      );
    let hid, sid, originalLabels;
    await t.test(
      "admin creates ten questions and student receives and starts the assignment",
      async () => {
        await teacher.goto(app.appUrl + "/admin/homework");
        await teacher
          .getByRole("button", { name: "New homework", exact: true })
          .click();
        const form = teacher.locator("form");
        await form.getByLabel("Homework title").fill("PG17 one-time delivery");
        await form
          .getByLabel("Section title", { exact: true })
          .fill("Staging questions");
        await form
          .getByLabel("Due date and time (Asia/Tashkent)")
          .fill("2026-12-01T12:00");
        await form.getByLabel("Disposable Student", { exact: true }).check();
        await form.getByLabel("Question count", { exact: true }).fill("10");
        await form.getByLabel("Question selection").selectOption("specific");
        await expect(
          form.locator(".question-picker input").first(),
        ).toBeVisible();
        for (let n = 0; n < 10; n++)
          await form
            .locator(".question-picker input:not(:checked)")
            .first()
            .check();
        await form
          .getByRole("button", {
            name: "Create and assign homework",
            exact: true,
          })
          .click();
        try {
          await expect(form).toHaveCount(0);
        } catch (error) {
          throw new Error(
            error.message +
              "\n" +
              (await teacher.locator("body").innerText()) +
              "\n" +
              JSON.stringify(failed),
          );
        }
        hid = await app.json(
          "select to_jsonb(id) from public.homeworks where title='PG17 one-time delivery'",
        );
        assert.equal(
          await app.json(
            `select count(*)::int from public.homework_assignments where homework_id='${hid}' and active`,
          ),
          1,
        );
        await studentHomework();
        await pupil
          .locator("article")
          .filter({ hasText: "PG17 one-time delivery" })
          .getByRole("button", { name: "Start homework", exact: true })
          .click();
        await expect(
          pupil.getByText("Question 1 of 10", { exact: true }),
        ).toBeVisible();
        sid = new URL(pupil.url()).pathname.split("/").at(-1);
        const first = (await items(sid))[0];
        if (first.question.question_type === "open")
          await pupil.getByLabel("Your answer", { exact: true }).fill("8.6");
        else await pupil.getByRole("radio").nth(1).check();
        await expect(
          pupil.getByText("All changes saved", { exact: true }),
        ).toBeVisible();
      },
    );
    assert.ok(sid, "Creation/start must succeed before editing tests");
    await t.test(
      "picker grows ten to twenty and shrinks to ten while retaining unchanged saved answers",
      async () => {
        let dialog = await editOnce();
        await dialog.getByLabel("Question selection").selectOption("specific");
        await expect(
          dialog.locator(".question-picker input:checked"),
        ).toHaveCount(10);
        originalLabels = await dialog
          .locator(".question-picker label")
          .evaluateAll((labels) =>
            labels
              .filter((label) => label.querySelector("input").checked)
              .map((label) => label.textContent),
          );
        for (let n = 0; n < 10; n++)
          await dialog
            .locator(".question-picker input:not(:checked)")
            .first()
            .check();
        await expect(dialog.getByText(/20 selected ·/)).toBeVisible();
        const saved = (await items(sid)).filter(
          (item) => item.selected_answer !== null,
        );
        await dialog
          .getByRole("button", { name: "Save homework", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        assert.equal((await items(sid)).length, 20);
        for (const item of saved)
          assert.equal(
            (await items(sid)).find((row) => row.id === item.id)
              .selected_answer,
            item.selected_answer,
          );
        await pupil.reload();
        await expect(
          pupil.getByText("Question 1 of 20", { exact: true }),
        ).toBeVisible();
        dialog = await editOnce();
        await expect(
          dialog.locator(".question-picker input:checked"),
        ).toHaveCount(20);
        for (const label of await dialog
          .locator(".question-picker label")
          .all())
          if (
            !originalLabels.includes(await label.textContent()) &&
            (await label.locator("input").isChecked())
          )
            await label.locator("input").uncheck();
        await expect(dialog.getByText(/10 selected ·/)).toBeVisible();
        await dialog
          .getByRole("button", { name: "Save homework", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        assert.equal((await items(sid)).length, 10);
        await pupil.reload();
        await expect(
          pupil.getByText("Question 1 of 10", { exact: true }),
        ).toBeVisible();
      },
    );
    await t.test(
      "group recipient changes synchronize access without duplicate assignments",
      async () => {
        const dialog = await editOnce();
        await dialog
          .getByLabel("Disposable Student", { exact: true })
          .uncheck();
        await dialog
          .getByLabel("Disposable staging group", { exact: true })
          .check();
        await dialog
          .getByRole("button", { name: "Save homework", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        assert.equal(
          await app.json(
            `select count(*)::int from public.homework_assignments where homework_id='${hid}'`,
          ),
          1,
        );
        await studentHomework();
        await pupil.waitForLoadState("networkidle");
        await app.sql(
          `delete from public.group_members where group_id='${group}' and student_id='${student}'`,
        );
        await pupil.reload();
        await expect(
          pupil
            .locator("article")
            .filter({ hasText: "PG17 one-time delivery" }),
        ).toHaveCount(0);
        await assert.rejects(
          app.sql(
            app.as(
              student,
              `select public.save_practice_changes('${sid}','[]')`,
            ),
          ),
          /Assignment unavailable/,
        );
        await app.sql(
          `insert into public.group_members(group_id,student_id)values('${group}','${student}')`,
        );
        await pupil.reload();
        await expect(
          pupil
            .locator("article")
            .filter({ hasText: "PG17 one-time delivery" }),
        ).toBeVisible();
        assert.equal(
          await app.json(
            `select count(*)::int from public.homework_assignments where homework_id='${hid}' and active`,
          ),
          1,
        );
      },
    );
    await t.test(
      "new recurring assignment delivers today; later edits preserve completed occurrence and frozen answers",
      async () => {
        await teacher.goto(app.appUrl + "/admin/homework");
        await teacher
          .getByRole("button", { name: "New homework", exact: true })
          .click();
        const form = teacher.locator("form");
        await form.getByLabel("Homework type").selectOption("daily");
        await form.getByLabel("Homework title").fill("PG17 recurring delivery");
        await form
          .getByLabel("Disposable staging group", { exact: true })
          .check();
        await form.getByLabel("Question selection").selectOption("specific");
        await form.getByLabel("Questions per day").fill("10");
        await expect(
          form.locator(".question-picker input").first(),
        ).toBeVisible();
        for (let n = 0; n < 10; n++)
          await form
            .locator(".question-picker input:not(:checked)")
            .first()
            .check();
        await form
          .getByRole("button", {
            name: "Create and assign homework",
            exact: true,
          })
          .click();
        await expect(form).toHaveCount(0);
        await studentHomework();
        await pupil.reload();
        const occurrence = pupil
          .locator("article")
          .filter({ hasText: "PG17 recurring delivery" });
        await expect(occurrence.getByText(/10 questions/)).toBeVisible();
        await occurrence
          .getByRole("button", { name: "Start", exact: true })
          .click();
        await expect(
          pupil.getByText("Question 1 of 10", { exact: true }),
        ).toBeVisible();
        const dailySid = new URL(pupil.url()).pathname.split("/").at(-1);
        const started = await app.json(
          `select to_jsonb(i) from public.daily_homework_instances i where session_id='${dailySid}'`,
        );
        assert.equal(
          await app.json(
            app.as(
              student,
              `select to_jsonb(public.start_daily_homework('${started.template_id}','${started.study_date}'))`,
            ),
          ),
          dailySid,
        );
        assert.equal(
          await app.json(
            `select count(*)::int from public.daily_homework_instances where template_id='${started.template_id}' and student_id='${student}' and study_date='${started.study_date}'`,
          ),
          1,
        );
        const changes = (await items(dailySid)).map((item) => ({
          id: item.id,
          expected_revision: item.answer_revision,
          selected_answer: item.question.question_type === "open" ? 0 : 1,
          ...(item.question.question_type === "open"
            ? { selected_response: "8.6" }
            : {}),
        }));
        await app.sql(
          app.as(
            student,
            `select public.save_practice_changes('${dailySid}','${JSON.stringify(changes)}'::jsonb);select public.finish_book_practice('${dailySid}')`,
          ),
        );
        const history = await items(dailySid);
        const frozen = await app.json(
          `select to_jsonb(i) from public.daily_homework_instances i where session_id='${dailySid}'`,
        );
        assert.ok(frozen.completed_at);
        await teacher.goto(app.appUrl + "/admin/homework");
        await teacher
          .getByRole("row")
          .filter({ hasText: "PG17 recurring delivery" })
          .getByRole("button", { name: "Edit", exact: true })
          .click();
        const dialog = teacher.getByRole("dialog", {
          name: "Edit recurring homework assignment",
        });
        await dialog.getByLabel("Questions per day").fill("12");
        for (let n = 0; n < 2; n++)
          await dialog
            .locator(".question-picker input:not(:checked)")
            .first()
            .check();
        await dialog
          .getByRole("button", { name: "Save recurring homework", exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        assert.deepEqual(await items(dailySid), history);
        assert.deepEqual(
          await app.json(
            `select to_jsonb(i) from public.daily_homework_instances i where session_id='${dailySid}'`,
          ),
          frozen,
        );
        assert.equal(
          await app.json(
            `select (data->>'count')::int from public.daily_homework_versions where template_id='${frozen.template_id}' order by revision desc limit 1`,
          ),
          12,
        );
        await studentHomework();
        await expect(
          pupil
            .locator("article")
            .filter({ hasText: "PG17 recurring delivery" })
            .getByRole("button", { name: "View results", exact: true }),
        ).toBeVisible();
      },
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(outside, []);
  },
);
