import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

test(
  "redesigned student and admin screens retain saved answers across themes, viewports, reload and login",
  {
    skip: !process.env.SATCHI_TEST_AUTH_BIN,
    timeout: 300000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
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
    async function rpc(name, args = {}) {
      const response = await client.rpc(name, args);
      assert.ifError(response.error);
      return response.data;
    }
    const session = await rpc("start_book_practice", { p_topic_id: app.topic });
    const items = await app.json(
      `select jsonb_agg(to_jsonb(i)order by position)from book_practice_items i where session_id='${session}'and question->>'question_type'='mcq'and question->'options'->>0<>''`,
    );
    async function check(item, choice) {
      const revision = await app.json(
        `select answer_revision from book_practice_items where id='${item.id}'`,
      );
      await rpc("save_practice_changes", {
        p_session: session,
        p_changes: [
          { id: item.id, expected_revision: revision, selected_answer: choice },
        ],
      });
      await rpc("check_book_practice_answer", {
        p_session: session,
        p_item: item.id,
        p_choice: choice,
        p_event: randomUUID(),
      });
    }
    await check(items[0], 1);
    await check(items[1], 0);
    await check(items[1], 1);
    const metrics = await rpc("learning_metrics");
    assert.equal(metrics.first_known, 2);
    assert.equal(metrics.first_correct, 1);
    assert.equal(metrics.eventually_correct, 2);
    const answers = () =>
      app.json(
        `select jsonb_agg(jsonb_build_object('id',i.id,'answer',i.selected_answer,'correct',i.correct,'solved',i.solved_at,'checks',(select jsonb_agg(to_jsonb(a) order by a.id)from question_check_attempts a where a.item_id=i.id))order by i.id)from book_practice_items i where session_id='${session}'`,
      );
    const before = await answers();
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const errors = [],
      screenshots = [],
      checks = [];
    await mkdir(".impeccable/review/redesign", { recursive: true });
    for (const who of ["student", "admin"].filter(
      (who) =>
        !process.env.SATCHI_REDESIGN_ROLE ||
        who === process.env.SATCHI_REDESIGN_ROLE,
    )) {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 844 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on("pageerror", (e) => errors.push(e.message));
      async function login() {
        await page.goto(app.appUrl + "/login");
        await page
          .getByLabel("Email", { exact: true })
          .fill(who + "@fixture.invalid");
        await page
          .getByLabel("Password", { exact: true })
          .fill("disposable-test-only");
        await page.evaluate(() => document.fonts.ready);
        try {
          await page
            .getByRole("button", { name: "Sign In", exact: true })
            .click();
        } catch (error) {
          await page.screenshot({
            path: `.impeccable/review/redesign/${who}-login-failure.png`,
            timeout: 10000,
          });
          throw error;
        }
        await page.waitForURL(
          who === "admin" ? /\/admin\/dashboard/ : /\/dashboard/,
        );
      }
      async function ready() {
        await expect(
          page.locator("main h1, main .question-player").first(),
        ).toBeVisible({
          timeout: 15000,
        });
        await expect(
          page.getByText("Loading learning materials…", { exact: true }),
        ).toHaveCount(0, { timeout: 15000 });
        await expect(page.getByRole("alert")).toHaveCount(0);
        await page.evaluate(() => document.fonts.ready);
      }
      async function capture(name) {
        const path = `.impeccable/review/redesign/${name}.png`;
        await page.screenshot({ path });
        screenshots.push(path);
      }
      await login();
      const routes =
        who === "student"
          ? [
              "/dashboard",
              "/progress",
              "/books",
              `/books/${app.book}`,
              "/question-bank",
              "/homework",
              "/study-plan",
              "/vocabulary",
              "/battles",
              "/standings",
              "/profile",
              "/settings",
              `/practice/${session}`,
            ]
          : [
              "/admin/dashboard",
              "/admin/students",
              `/admin/students/${student}`,
              "/admin/books",
              `/admin/books/${app.book}`,
              "/admin/homework",
              "/admin/groups",
              "/admin/results",
              "/admin/imports",
              "/admin/settings",
            ];
      for (const path of routes.filter(
        (path) =>
          !process.env.SATCHI_REDESIGN_PATH ||
          path === process.env.SATCHI_REDESIGN_PATH,
      )) {
        await page.goto(app.appUrl + path);
        await ready();
        for (const theme of ["light", "dark"]) {
          await page
            .getByLabel("Color theme", { exact: true })
            .selectOption(theme);
          await expect(page.locator("html")).toHaveAttribute(
            "data-theme",
            theme,
          );
          for (const width of [1366, 768, 390]) {
            await page.setViewportSize({ width, height: 844 });
            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            );
            if (overflow) {
              await capture(
                `overflow-${who}-${path.split("/").at(-1)}-${theme}-${width}`,
              );
              const geometry = await page.evaluate(() => ({
                root: document.documentElement.scrollWidth,
                body: document.body.scrollWidth,
                viewport: innerWidth,
                elements: [...document.querySelectorAll("body *")]
                  .filter((el) => {
                    const rect = el.getBoundingClientRect();
                    if (rect.right <= innerWidth + 0.5 || rect.width === 0)
                      return false;
                    let parent = el.parentElement;
                    while (parent && parent !== document.body) {
                      if (
                        ["auto", "scroll", "hidden", "clip"].includes(
                          getComputedStyle(parent).overflowX,
                        )
                      )
                        return false;
                      parent = parent.parentElement;
                    }
                    return true;
                  })
                  .slice(0, 20)
                  .map((el) => ({
                    tag: el.tagName,
                    class: el.className,
                    right: el.getBoundingClientRect().right,
                    width: el.getBoundingClientRect().width,
                    scroll: el.scrollWidth,
                  })),
              }));
              assert.fail(
                `${path} ${theme} ${width}px overflow: ${JSON.stringify(geometry)}`,
              );
            }
            if (
              [
                "/dashboard",
                "/progress",
                "/books",
                "/question-bank",
                "/battles",
                "/admin/dashboard",
                "/admin/homework",
                `/practice/${session}`,
              ].includes(path)
            ) {
              await capture(
                `${who}-${path.startsWith("/practice/") ? "practice" : path.split("/").at(-1)}-${theme}-${width}`,
              );
            }
            checks.push({ path, theme, width });
          }
        }
        await page.setViewportSize({ width: 1366, height: 844 });
      }
      if (who === "student") {
        await page.goto(app.appUrl + "/progress");
        await ready();
        const overview = page.getByRole("region", {
          name: "All-time learning overview",
        });
        await expect(
          overview.getByRole("img", {
            name: "All-time first-attempt accuracy: 50%",
            exact: true,
          }),
        ).toBeVisible();
        const counter = page.locator(".metric-card").filter({
          has: page.getByText("Questions attempted", { exact: true }),
        });
        await expect(counter.locator("strong")).toHaveText("2");
        await page
          .getByLabel("Color theme", { exact: true })
          .selectOption("light");
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.reload();
        await ready();
        const ring = overview.locator(".progress-ring");
        await expect(ring).toHaveAttribute("data-motion", "complete");
        await expect(ring.locator(".ring-value")).toHaveAttribute(
          "stroke-dashoffset",
          "50",
        );
        await counter.scrollIntoViewIfNeeded();
        await expect(counter.locator("[data-motion]")).toHaveAttribute(
          "data-motion",
          "complete",
        );
        await expect(counter.locator("strong")).toHaveText("2");
        await page.getByLabel("Activity period").selectOption("7");
        const calendar = page.getByRole("group", {
          name: /Daily question heatmap/,
        });
        await calendar.scrollIntoViewIfNeeded();
        await expect(calendar).toHaveAttribute("data-motion", "complete");
        await expect(calendar.locator("[data-chart-cell]")).toHaveCount(7);
        assert.equal(await calendar.locator('[data-level="4"]').count(), 1);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page
          .getByLabel("Color theme", { exact: true })
          .selectOption("dark");
        await page.reload();
        await ready();
        await expect(
          page.getByLabel("Color theme", { exact: true }),
        ).toHaveValue("dark");
        await expect(ring).toHaveAttribute("data-motion", "complete");
        assert.equal(
          await ring.evaluate(
            (node) => node.getAnimations({ subtree: true }).length,
          ),
          0,
        );
        await page.goto(app.appUrl + "/battles");
        await ready();
        await page
          .getByRole("button", { name: "Create Battle", exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: "Ready for the challenge?" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Mark ready", exact: true })
          .click();
        await expect(page.locator(".battle-player.is-ready")).toHaveCount(1);
        await expect(page.locator(".battle-player strong")).toHaveText("0");
        for (const theme of ["light", "dark"]) {
          await page
            .getByLabel("Color theme", { exact: true })
            .selectOption(theme);
          for (const width of [1366, 768, 390]) {
            await page.setViewportSize({ width, height: 844 });
            assert.ok(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth,
              ),
              `Battle lobby ${width}`,
            );
            await capture(`battle-lobby-${theme}-${width}`);
          }
        }
        await page
          .getByRole("button", { name: "Cancel lobby", exact: true })
          .click();
      }
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      await page.waitForURL(/\/login/);
      await login();
      await ready();
      await expect(page.getByLabel("Color theme", { exact: true })).toHaveValue(
        "dark",
      );
      await context.close();
    }
    assert.deepEqual(
      await answers(),
      before,
      "Visual browsing must retain all saved answer/check records",
    );
    assert.deepEqual(errors, []);
    await writeFile(
      ".impeccable/review/redesign/manifest.json",
      JSON.stringify(
        {
          checks,
          screenshots,
          realRecords: {
            distinctQuestions: 2,
            firstAccuracy: 50,
            eventuallyCorrect: 2,
          },
          savedAnswersUnchanged: true,
        },
        null,
        2,
      ),
    );
  },
);
