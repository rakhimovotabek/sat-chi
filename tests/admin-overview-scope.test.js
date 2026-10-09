import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  admin,
  student,
} from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "admin dashboard scopes active one-time and daily history and counts open responses",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const rpc = async (uid, name, args = {}, status = 200) => {
      const r = await fetch(app.apiUrl + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: {
          authorization: "Bearer " + app.tokenFor(uid),
          "Content-Type": "application/json",
          "x-satchi-client-version": "20261008",
        },
        body: JSON.stringify(args),
      });
      const raw = await r.text();
      assert.equal(r.status, status, raw);
      return raw ? JSON.parse(raw) : null;
    };
    // Historical withdrawn completion remains represented by its own history
    // counter. Synthetic fixture rows never touch production users or content.
    await app.sql(`update public.book_practice_items set selected_answer=1 where session_id='${app.session}';
    update public.book_practice_items set selected_answer=null,selected_response='8.6' where session_id='${app.session}' and position=0;
    update public.book_practice_sessions set submitted_at=now() where id='${app.session}';
    update public.homework_assignments set active=false where id='${app.assignment}';`);
    const day = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Tashkent",
    });
    const sid = await rpc(student, "start_daily_homework", {
      p_template: app.daily,
      p_day: day,
    });
    let counts = await rpc(admin, "admin_overview");
    assert.equal(
      counts.assignments,
      0,
      "withdrawn recipients are not active assignments",
    );
    assert.equal(
      counts.completed,
      1,
      "completed one-time history is preserved",
    );
    assert.equal(counts.daily_started, 1);
    assert.equal(counts.daily_completed, 0);
    assert.equal(counts.questions, 8, "open responses count alongside MCQ");
    const items = await app.json(
      `select jsonb_agg(to_jsonb(i) order by position)from public.book_practice_items i where session_id='${sid}'`,
    );
    await rpc(student, "save_practice_changes", {
      p_session: sid,
      p_changes: items.map((i) => ({
        id: i.id,
        expected_revision: i.answer_revision,
        selected_answer: 1,
      })),
    });
    await rpc(student, "finish_book_practice", { p_session_id: sid }, 204);
    counts = await rpc(admin, "admin_overview");
    assert.equal(counts.daily_started, 1);
    assert.equal(counts.daily_completed, 1);
    assert.equal(counts.questions, 15);
    const timed = await rpc(admin, "save_daily_homework", {
      p_data: {
        title: "Incomplete timed overview fixture",
        timezone: "Asia/Tashkent",
        startDate: day,
        count: 2,
        selection: "fixed",
        questionIds: app.ids.slice(3, 5),
        students: [student],
        filters: {},
        timeLimit: 60,
        allowLate: true,
        allowRepeat: false,
      },
    });
    const partial = await rpc(student, "start_daily_homework", {
      p_template: timed,
      p_day: day,
    });
    const first = await app.json(
      `select to_jsonb(i)from public.book_practice_items i where session_id='${partial}' order by position limit 1`,
    );
    await rpc(student, "save_practice_changes", {
      p_session: partial,
      p_changes: [
        {
          id: first.id,
          expected_revision: first.answer_revision,
          selected_answer: 1,
        },
      ],
    });
    await app.sql(
      `update public.book_practice_sessions set started_at=now()-interval '120 seconds' where id='${partial}'`,
    );
    await rpc(student, "finish_book_practice", { p_session_id: partial }, 204);
    assert.equal(
      await app.json(
        `select coalesce(to_jsonb(completed_at),'null'::jsonb)from public.daily_homework_instances where session_id='${partial}'`,
      ),
      null,
    );
    counts = await rpc(admin, "admin_overview");
    assert.equal(counts.daily_started, 2);
    assert.equal(
      counts.daily_completed,
      1,
      "a timed partial submission earns no daily completion credit",
    );
    assert.equal(counts.questions, 16);
    await rpc(student, "admin_overview", {}, 403);
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(app.appUrl + "/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("admin@fixture.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Admin Dashboard", exact: true }),
    ).toBeVisible();
    for (const [label, value] of [
      ["Active one-time assignments", "0"],
      ["Completed one-time assignments", "1"],
      ["Started daily assignments", "2"],
      ["Completed daily assignments", "1"],
      ["Answers in submitted sessions", "16"],
    ]) {
      const card = page
        .locator(".metric-card")
        .filter({ has: page.getByText(label, { exact: true }) });
      await expect(card.locator("strong")).toHaveText(value);
    }
    await page.reload();
    await expect(
      page.getByText("Started daily assignments", { exact: true }),
    ).toBeVisible();
  },
);
