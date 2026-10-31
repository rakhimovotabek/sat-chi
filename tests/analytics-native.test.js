import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "Progress accuracy line and Dashboard motion reconcile real persisted Check events including a later correction",
  {
    skip: !process.env.SATCHI_TEST_AUTH_BIN,
    timeout: 240000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      officialServices: process.env.SATCHI_TEST_OFFICIAL_SERVICES === "1",
    });
    t.after(() => app.close());
    await app.upgrade();
    const client = createClient(
      app.apiUrl,
      app.tokenFor(student, { role: "anon" }),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    t.after(() => {
      client.realtime.disconnect();
      client.auth.stopAutoRefresh();
    });
    assert.ifError(
      (
        await client.auth.signInWithPassword({
          email: "student@fixture.invalid",
          password: "disposable-test-only",
        })
      ).error,
    );
    const rpc = async (name, args = {}) => {
      const result = await client.rpc(name, args);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    };
    const session = await rpc("start_book_practice", { p_topic_id: app.topic });
    const items = await app.json(
      `select jsonb_agg(to_jsonb(i)order by position)from book_practice_items i where session_id='${session}'and question->>'question_type'='mcq'and question->'options'->>0<>''`,
    );
    const checks = [];
    const check = async (item, choice) => {
      const revision = await app.json(
        `select answer_revision from book_practice_items where id='${item.id}'`,
      );
      await rpc("save_practice_changes", {
        p_session: session,
        p_changes: [
          { id: item.id, expected_revision: revision, selected_answer: choice },
        ],
      });
      const event = randomUUID();
      await rpc("check_book_practice_answer", {
        p_session: session,
        p_item: item.id,
        p_choice: choice,
        p_event: event,
      });
      return event;
    };
    checks.push(await check(items[0], 1));
    checks.push(await check(items[1], 0));
    const correction = await check(items[1], 1);
    checks.push(await check(items[2], 1));
    checks.push(await check(items[3], 1));
    // Only synthetic fixture dates are backdated, after actual HTTP Check saves,
    // to exercise several local days and a correction-only gap. No time invented.
    const dayStart =
      "(date_trunc('day',clock_timestamp()at time zone 'UTC')at time zone 'UTC')";
    await app.sql(
      `update question_check_attempts set created_at=${dayStart}-interval '3 days'+interval '12 hours'where id in('${checks[0]}','${checks[1]}');update question_check_attempts set created_at=${dayStart}-interval '2 days'+interval '12 hours'where id='${checks[2]}';update question_check_attempts set created_at=${dayStart}-interval '1 day'+interval '12 hours'where id='${correction}';update book_practice_sessions set started_at=${dayStart}-interval '3 days'+interval '10 hours'where id='${session}';insert into study_preferences(student_id,minutes_per_day,preferred_days,timezone)values('${student}',30,array[1,2,3,4,5,6,7],'UTC')on conflict(student_id)do update set timezone='UTC';`,
    );
    const activity = await rpc("progress_activity", {
      p_days: 7,
      p_section: "Math",
    });
    assert.equal(activity.questions, 4);
    assert.equal(activity.known, 4);
    assert.equal(activity.correct, 3);
    assert.equal(activity.accuracy, 75);
    assert.equal(activity.corrected, 1);
    assert.deepEqual(
      activity.days.filter((day) => day.known).map((day) => day.accuracy),
      [50, 100, 100],
    );
    const before = await app.json(
      `select jsonb_agg(to_jsonb(a)order by a.id)from question_check_attempts a join book_practice_items i on i.id=a.item_id where i.session_id='${session}'`,
    );
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      reducedMotion: "no-preference",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${app.appUrl}/login`);
    await page
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    const weekly = page.getByRole("group", {
      name: "Recorded study activity for the last seven days",
      exact: true,
    });
    await weekly.scrollIntoViewIfNeeded();
    await expect(weekly).toHaveAttribute("data-motion", "complete");
    const study = await rpc("dashboard_study_activity");
    assert.deepEqual(
      await weekly.locator("li > strong").allTextContents(),
      study.days.map((day) => String(day.questions)),
    );
    const heights = await weekly
      .locator("[data-chart-rise]")
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            (node.getBoundingClientRect().height /
              node.parentElement.getBoundingClientRect().height) *
            100,
        ),
      );
    const maximum = Math.max(1, ...study.days.map((day) => day.questions));
    for (const [index, height] of heights.entries())
      assert.ok(
        Math.abs(height - (study.days[index].questions / maximum) * 100) < 0.1,
      );
    await mkdir("test-results", { recursive: true });
    await page.screenshot({
      path: "test-results/analytics-dashboard-laptop.png",
      fullPage: true,
    });
    await page.goto(`${app.appUrl}/progress`);
    const panel = page.getByRole("region", { name: "First-attempt activity" });
    await panel.getByLabel("Activity period").selectOption("7");
    await panel.getByLabel("Activity subject").selectOption("Math");
    await panel.getByLabel("Activity metric").selectOption("accuracy-trend");
    const chart = panel.locator(".progress-trend-chart");
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toHaveAttribute("data-motion", "complete");
    await expect(panel.getByRole("status")).toContainText(
      "75% first-attempt accuracy",
    );
    assert.deepEqual(
      await chart
        .locator("circle")
        .evaluateAll((nodes) =>
          nodes.map((node) => Number(node.getAttribute("data-accuracy"))),
        ),
      [50, 100, 100],
    );
    assert.deepEqual(
      await chart
        .locator("circle")
        .evaluateAll((nodes) =>
          nodes.map((node) => Number(node.getAttribute("cy"))),
        ),
      [90, 12, 12],
    );
    await expect(chart.locator("path")).toHaveCount(1);
    await expect(chart.locator("path")).toHaveCSS("clip-path", "none");
    await expect(chart.locator("path")).toHaveCSS("stroke-dasharray", "none");
    await panel
      .getByText("Daily values and sample sizes", { exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(panel.locator("tbody tr")).toHaveCount(7);
    await page.screenshot({
      path: "test-results/analytics-progress-laptop.png",
      fullPage: true,
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(panel.getByLabel("Activity metric")).toHaveValue(
      "accuracy-trend",
    );
    await chart.scrollIntoViewIfNeeded();
    await expect(chart).toHaveAttribute("data-motion", "complete");
    assert.equal(
      await chart.evaluate(
        (node) => node.getAnimations({ subtree: true }).length,
      ),
      0,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: "test-results/analytics-progress-mobile.png",
      fullPage: true,
    });
    const homeworkItems = await app.json(
      `select jsonb_agg(to_jsonb(i)order by position)from book_practice_items i where session_id='${app.session}'`,
    );
    await rpc("save_practice_changes", {
      p_session: app.session,
      p_changes: homeworkItems
        .slice(0, 2)
        .map((item, index) => ({
          id: item.id,
          expected_revision: item.answer_revision,
          selected_answer: index === 0 ? 1 : 0,
        })),
    });
    await rpc("finish_book_practice", { p_session_id: app.session });
    await assert.rejects(
      () => rpc("homework_question_performance", { p_homework: app.homework }),
      /Admin required/,
    );
    const teacher = createClient(
      app.apiUrl,
      app.tokenFor(student, { role: "anon" }),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    t.after(() => {
      teacher.realtime.disconnect();
      teacher.auth.stopAutoRefresh();
    });
    assert.ifError(
      (
        await teacher.auth.signInWithPassword({
          email: "admin@fixture.invalid",
          password: "disposable-test-only",
        })
      ).error,
    );
    const performance = await teacher.rpc("homework_question_performance", {
      p_homework: app.homework,
    });
    assert.ifError(performance.error);
    assert.deepEqual(
      performance.data.rows.slice(0, 2).map((row) => row.accuracy),
      [100, 0],
    );
    const adminPage = await browser.newPage({
      viewport: { width: 1366, height: 768 },
      reducedMotion: "no-preference",
    });
    adminPage.on("pageerror", (error) => errors.push(error.message));
    await adminPage.goto(`${app.appUrl}/login`);
    await adminPage
      .getByLabel("Email", { exact: true })
      .fill("admin@fixture.invalid");
    await adminPage
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await adminPage
      .getByRole("button", { name: "Sign In", exact: true })
      .click();
    await adminPage.waitForURL(/\/admin/);
    await adminPage.goto(`${app.appUrl}/admin/homework/${app.homework}`);
    const heatmap = adminPage.getByRole("region", {
      name: "Question performance",
      exact: true,
    });
    const animatedCells = heatmap.getByRole("group", {
      name: "Submitted question performance heatmap",
      exact: true,
    });
    await animatedCells.scrollIntoViewIfNeeded();
    await expect(animatedCells).toHaveAttribute("data-motion", "complete");
    await expect(animatedCells.locator("button")).toHaveCount(8);
    await expect(animatedCells.locator("button").first()).toContainText("100%");
    await animatedCells.locator("button").first().focus();
    await adminPage.keyboard.press("Enter");
    await expect(
      heatmap.getByRole("region", { name: "Question 1 details", exact: true }),
    ).toContainText("1 first correct / 1 known initial grades");
    await expect(animatedCells).toHaveAttribute("data-motion", "complete");
    assert.equal(
      await animatedCells.evaluate(
        (node) => node.getAnimations({ subtree: true }).length,
      ),
      0,
    );
    await adminPage.screenshot({
      path: "test-results/analytics-admin-laptop.png",
      fullPage: true,
    });
    await adminPage.emulateMedia({ reducedMotion: "reduce" });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await heatmap.getByLabel("Heatmap view").selectOption("time");
    await expect(animatedCells).toHaveAttribute("data-motion", "complete");
    await expect(animatedCells.locator("button").first()).toContainText(
      "No time",
    );
    assert.ok(
      await adminPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await adminPage.screenshot({
      path: "test-results/analytics-admin-mobile.png",
      fullPage: true,
    });
    await adminPage.close();
    const after = await app.json(
      `select jsonb_agg(to_jsonb(a)order by a.id)from question_check_attempts a join book_practice_items i on i.id=a.item_id where i.session_id='${session}'`,
    );
    assert.deepEqual(after, before);
    assert.deepEqual(errors, []);
  },
);
