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
  "real Homework Delete confirmation, saved history, fresh login and concurrent start/submission are safe",
  { skip: !process.env.SATCHI_TEST_AUTH_BIN, timeout: 300000 },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
    });
    t.after(() => app.close());
    await app.upgrade();
    const clients = [];
    const client = async (who) => {
      const sdk = createClient(
        app.apiUrl,
        app.tokenFor(student, { role: "anon" }),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      clients.push(sdk);
      assert.ifError(
        (
          await sdk.auth.signInWithPassword({
            email: who + "@fixture.invalid",
            password: "disposable-test-only",
          })
        ).error,
      );
      return sdk;
    };
    const teacher = await client("admin"),
      teacherB = await client("admin"),
      pupil = await client("student");
    t.after(() =>
      clients.forEach((sdk) => {
        sdk.realtime.disconnect();
        sdk.auth.stopAutoRefresh();
      }),
    );
    const rpc = async (sdk, name, args = {}) => {
      const result = await sdk.rpc(name, args);
      if (result.error)
        throw Object.assign(new Error(result.error.message), {
          code: result.error.code,
        });
      return result.data;
    };
    const create = (title) =>
      rpc(teacher, "create_homework", {
        p_data: {
          title,
          dueAt: "2026-12-01T12:00:00Z",
          students: [student],
          sections: [
            {
              title: "Original fixture",
              count: 2,
              questionIds: app.ids.slice(2, 4),
            },
          ],
        },
      });
    const remove = (sdk, id) =>
      rpc(sdk, "delete_homework", {
        p_kind: "one-time",
        p_homework: id,
        p_confirm: true,
      });
    const assignment = (id) =>
      app.json(
        `select to_jsonb(id)from homework_assignments where homework_id='${id}'`,
      );
    const save = async (sid) => {
      const items = await app.json(
        `select jsonb_agg(to_jsonb(i)order by position)from book_practice_items i where session_id='${sid}'`,
      );
      await rpc(pupil, "save_practice_changes", {
        p_session: sid,
        p_changes: items.map((item, index) => ({
          id: item.id,
          expected_revision: item.answer_revision,
          selected_answer: index === 0 ? 1 : 0,
        })),
      });
    };
    const inputs = (sid) =>
      app.json(
        `select jsonb_agg(jsonb_build_object('id',id,'selected',selected_answer,'response',selected_response)order by position)from book_practice_items where session_id='${sid}'`,
      );
    const hid = await create("Original completed deletion");
    const sid = await rpc(pupil, "start_homework", {
      p_assignment: await assignment(hid),
    });
    await save(sid);
    await rpc(pupil, "finish_book_practice", { p_session_id: sid });
    const before = await rpc(pupil, "learning_metrics");
    const beforeInputs = await inputs(sid);
    const gradeRows = await app.json(
      `select jsonb_agg(to_jsonb(e)order by e.id)from practice_grade_events e join book_practice_items i on i.id=e.item_id where i.session_id='${sid}'`,
    );
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const login = async (who) => {
      await page.goto(app.appUrl + "/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill(who + "@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await page.waitForURL(
        who === "admin" ? /\/admin\/dashboard/ : /\/dashboard/,
      );
    };
    await login("admin");
    await page.goto(app.appUrl + "/admin/homework");
    const manager = page.getByRole("region", {
      name: "One-time homework management",
    });
    const row = manager
      .getByRole("row")
      .filter({ hasText: "Original completed deletion" });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.locator("summary").click();
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "Delete homework",
      exact: true,
    });
    await expect(
      dialog.getByRole("heading", { name: "Original completed deletion" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(dialog).toContainText("grades will be retained");
    await expect(
      dialog.getByRole("button", { name: "Delete homework", exact: true }),
    ).toBeDisabled();
    await mkdir("test-results", { recursive: true });
    await dialog.screenshot({
      path: "test-results/homework-delete-desktop.png",
    });
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await dialog.evaluate((node) => node.scrollWidth > node.clientWidth),
        false,
      );
      await dialog.screenshot({
        path: `test-results/homework-delete-${width}.png`,
      });
    }
    await dialog
      .getByLabel("I understand and want to delete this homework.")
      .check();
    await dialog
      .getByRole("button", { name: "Delete homework", exact: true })
      .click();
    await expect(dialog).toHaveCount(0, { timeout: 15000 });
    await expect(row).toHaveCount(0);
    await expect(manager.getByRole("status")).toContainText(
      "grades are retained",
    );
    await manager.getByRole("link", { name: "View retained history" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "This homework was deleted" }),
    ).toContainText("Saved attempts and grades are retained");
    await page.goto(app.appUrl + "/admin/homework");
    await expect(
      manager
        .getByRole("row")
        .filter({ hasText: "Original completed deletion" }),
    ).toHaveCount(0);
    assert.deepEqual(await inputs(sid), beforeInputs);
    assert.deepEqual(
      await app.json(
        `select jsonb_agg(to_jsonb(e)order by e.id)from practice_grade_events e join book_practice_items i on i.id=e.item_id where i.session_id='${sid}'`,
      ),
      gradeRows,
    );
    const after = await rpc(pupil, "learning_metrics");
    for (const key of [
      "attempted",
      "first_correct",
      "first_known",
      "first_incorrect",
      "eventually_correct",
      "study_seconds",
    ])
      assert.deepEqual(after[key], before[key]);
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.waitForURL(/\/login/);
    await login("student");
    await page.goto(app.appUrl + "/homework");
    await expect(
      page.getByRole("heading", { name: "Homework", level: 1, exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      page.getByText("Original completed deletion", { exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("Loading learning materials…", { exact: true }),
    ).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await page.waitForURL(/\/login/);
    await login("admin");
    const recurring = await rpc(teacher, "save_daily_homework", {
      p_data: {
        title: "Original recurring delete UI",
        timezone: "UTC",
        startDate: new Date().toISOString().slice(0, 10),
        count: 2,
        selection: "fixed",
        questionIds: app.ids.slice(2, 4),
        students: [student],
        allowLate: true,
        allowRepeat: true,
        active: false,
      },
    });
    await page.goto(app.appUrl + "/admin/homework");
    const dailyRow = page
      .getByRole("row")
      .filter({ hasText: "Original recurring delete UI" });
    await expect(dailyRow).toBeVisible({ timeout: 15000 });
    await dailyRow.locator("summary").click();
    await dailyRow.getByRole("button", { name: "Delete", exact: true }).click();
    const dailyDialog = page.getByRole("dialog", {
      name: "Delete homework",
      exact: true,
    });
    await expect(dailyDialog).toContainText(
      "Future daily assignments will stop",
    );
    await dailyDialog
      .getByLabel("I understand and want to delete this homework.")
      .check();
    await dailyDialog
      .getByRole("button", { name: "Delete homework", exact: true })
      .click();
    await expect(dailyDialog).toHaveCount(0, { timeout: 15000 });
    await expect(dailyRow).toHaveCount(0);
    assert.equal(
      await app.json(
        `select count(*)from daily_homework_templates where id='${recurring}'`,
      ),
      0,
    );
    assert.equal(
      (
        await pupil.rpc("start_daily_homework", {
          p_template: recurring,
          p_day: new Date().toISOString().slice(0, 10),
        })
      ).error?.code,
      "42501",
    );
    // Both outcomes of the lock race are valid: start wins and is retained, or
    // delete wins and start is rejected. Never a returned session that was erased.
    for (let iteration = 0; iteration < 3; iteration++) {
      const id = await create("Original concurrent deletion " + iteration),
        aid = await assignment(id);
      const [deleted, started] = await Promise.allSettled([
        remove(teacher, id),
        rpc(pupil, "start_homework", { p_assignment: aid }),
      ]);
      assert.equal(deleted.status, "fulfilled");
      if (started.status === "fulfilled") {
        assert.equal(deleted.value.mode, "retained");
        assert.equal(
          await app.json(
            `select count(*)from book_practice_sessions where id='${started.value}'`,
          ),
          1,
        );
        assert.equal(
          (await pupil.rpc("start_homework", { p_assignment: aid })).error
            ?.code,
          "42501",
        );
      } else assert.equal(deleted.value.mode, "permanent");
    }
    const racing = await create("Original submission delete race"),
      racingSid = await rpc(pupil, "start_homework", {
        p_assignment: await assignment(racing),
      });
    await save(racingSid);
    const savedInputs = await inputs(racingSid);
    const [finished, deleted] = await Promise.allSettled([
      rpc(pupil, "finish_book_practice", { p_session_id: racingSid }),
      remove(teacher, racing),
    ]);
    assert.equal(deleted.status, "fulfilled");
    assert.equal(deleted.value.mode, "retained");
    assert.deepEqual(await inputs(racingSid), savedInputs);
    const submitted = await app.json(
      `select to_jsonb(submitted_at is not null)from book_practice_sessions where id='${racingSid}'`,
    );
    assert.equal(submitted, finished.status === "fulfilled");
    if (finished.status === "rejected")
      assert.match(finished.reason.message, /unavailable/i);
    const duplicate = await create("Original duplicate requests");
    const repeated = await Promise.all([
      remove(teacher, duplicate),
      remove(teacherB, duplicate),
    ]);
    assert.equal(repeated.filter((result) => result.already_deleted).length, 1);
    assert.equal(
      await app.json(
        `select count(*)from homework_deletions where homework_id='${duplicate}'`,
      ),
      1,
    );
    assert.equal(
      await app.json(
        `select count(*)from questions where id=any(array[${app.ids.map((id) => `'${id}'::uuid`).join(",")}])`,
      ),
      app.ids.length,
    );
    assert.deepEqual(errors, []);
  },
);
