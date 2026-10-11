import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";

const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);

test(
  "Check responds before a slow answer save while grading the durable selection",
  { skip: !enabled, timeout: 180000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const browser = await chromium.launch({
      channel: "chromium",
      headless: true,
    });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    });
    page.setDefaultTimeout(15000);
    await page.goto(app.appUrl + "/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
    const durations = [];
    for (const mode of ["book", "bank"]) {
      for (const latency of [mode === "book" ? 1500 : 500]) {
        const id = await app.json(
          app.as(
            student,
            mode === "book"
              ? `select public.start_book_practice('${app.topic}');`
              : `select public.start_bank_practice('{"section":"Math"}',15,false);`,
          ),
        );
        await page.route("**/rest/v1/**", async (route) => {
          if (route.request().method() === "GET")
            await new Promise((resolve) => setTimeout(resolve, 200));
          await route.continue();
        });
        const content = [];
        const started = (r) => {
          if (r.method() === "GET" && r.url().includes("/rest/v1/"))
            content.push({ request: r, start: performance.now() });
        };
        const finished = (r) => {
          const entry = content.find((e) => e.request === r);
          if (entry) entry.end = performance.now();
        };
        page.on("request", started);
        page.on("requestfinished", finished);
        const startup = performance.now();
        await page.goto(app.appUrl + "/practice/" + id);
        await expect(page.locator(".question-text")).toBeVisible();
        const startupMs = Math.round(performance.now() - startup);
        page.off("request", started);
        page.off("requestfinished", finished);
        const dataMs = Math.round(
          Math.max(...content.map((e) => e.end || performance.now())) -
            Math.min(...content.map((e) => e.start)),
        );
        const image = page.locator(".stimulus-panel img").first();
        let imageMs = null;
        if (await image.count()) {
          const imageStart = performance.now();
          await expect
            .poll(() => image.evaluate((i) => i.complete && i.naturalWidth > 0))
            .toBe(true);
          imageMs = Math.round(performance.now() - imageStart);
        }
        console.log(
          "Startup",
          mode,
          JSON.stringify({
            startupMs,
            dataMs,
            contentRequests: content.length,
            imageReadyAfterRenderMs: imageMs,
          }),
        );
        await page.unroute("**/rest/v1/**");
        await page.unroute("**/rest/v1/rpc/save_practice_changes");
        for (let n = 0; n < 15 && !(await page.getByRole("radio").count()); n++)
          await page.getByRole("button", { name: "Next", exact: true }).click();
        const radio = page.getByRole("radio").first();
        await expect(radio).toBeVisible();
        await page.route(
          "**/rest/v1/rpc/save_practice_changes",
          async (route) => {
            await page.evaluate(() => {
              window.__selectionSaveStarted = true;
            });
            await new Promise((resolve) => setTimeout(resolve, latency));
            await route.continue();
          },
        );
        const check = page.getByRole("button", { name: "Check", exact: true });
        await page.evaluate(() => {
          window.__questionBeforeCheck =
            document.querySelector(".answer-panel");
          window.__imageBeforeCheck = document.querySelector(
            ".stimulus-panel img",
          );
        });
        const timings = await radio.evaluate(async (input) => {
          window.__selectionSaveStarted = false;
          const start = performance.now();
          let selectedMs;
          input.click();
          const check = [...document.querySelectorAll("button")].find(
            (button) => button.textContent.trim() === "Check",
          );
          return await new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(new Error("No animation frame while measuring Check")),
              4500,
            );
            const poll = () => {
              if (
                selectedMs == null &&
                input.closest(".answer-choice").classList.contains("selected")
              )
                selectedMs = performance.now() - start;
              if (window.__selectionSaveStarted && !check.disabled) {
                clearTimeout(timeout);
                resolve({ enabledMs: performance.now() - start, selectedMs });
              } else if (performance.now() - start > 4000)
                reject(
                  new Error(
                    JSON.stringify({
                      message: "Check stayed disabled",
                      inputChecked: input.checked,
                      inputDisabled: input.disabled,
                      checkDisabled: check.disabled,
                      saveStarted: window.__selectionSaveStarted,
                      visibleText:
                        document.querySelector(".practice-player")
                          ?.textContent ||
                        document.querySelector("main")?.textContent,
                    }),
                  ),
                );
              else requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
          });
        });
        const elapsed = timings.enabledMs;
        durations.push({
          mode,
          latency,
          selectionToCheckMs: Math.round(elapsed),
          selectedMs: Math.round(timings.selectedMs),
          startupMs,
          dataMs,
        });
        console.log("Sample", JSON.stringify(durations.at(-1)));
        if (process.env.SATCHI_PERF_BASELINE)
          assert.ok(elapsed >= latency * 0.8);
        else
          assert.ok(elapsed < 100, `${mode}: Check enabled in ${elapsed} ms`);
        const itemId = await radio.evaluate(
          (input) =>
            input.closest(".answer-panel")?.querySelector("input[type=radio]")
              ?.name,
        );
        assert.ok(itemId);
        {
          const response = page.waitForResponse((r) =>
            /\/rpc\/check_(book_practice|bank)_answer$/.test(r.url()),
          );
          const reconciled = page.waitForResponse((r) =>
            r.url().includes("/rest/v1/question_check_attempts"),
          );
          const feedbackStart = performance.now();
          await check.evaluate((button) => {
            button.click();
            button.click();
          });
          assert.equal((await response).status(), 200);
          await expect(page.locator(".attempt-feedback")).toBeVisible();
          console.log(
            "Check to feedback",
            mode,
            Math.round(performance.now() - feedbackStart),
          );
          assert.ok(
            await page.evaluate(
              () =>
                window.__questionBeforeCheck ===
                  document.querySelector(".answer-panel") &&
                window.__imageBeforeCheck ===
                  document.querySelector(".stimulus-panel img"),
            ),
          );
          await expect(
            page.getByText("All changes saved", { exact: true }),
          ).toBeVisible();
          const row = await app.json(
            `select row_to_json(i) from (select selected_answer,answer_revision from public.book_practice_items where id='${itemId.replace("answer-", "")}') i;`,
          );
          assert.equal(row.selected_answer, 0);
          assert.ok(row.answer_revision > 0);
          await reconciled;
          assert.equal(
            await app.json(
              `select count(*)::int from public.question_check_attempts where item_id='${itemId.replace("answer-", "")}';`,
            ),
            1,
          );
          await expect(
            page.getByRole("button", { name: "Checking…", exact: true }),
          ).toHaveCount(0);
          const navigationRequests = [];
          const track = (r) => {
            if (r.url().includes("/rest/v1/") && r.method() === "GET")
              navigationRequests.push(r.url());
          };
          page.on("request", track);
          const position = Number(
            await page
              .locator(".question-action-toolbar .question-index")
              .textContent(),
          );
          const nextStart = performance.now();
          await page.getByRole("button", { name: "Next", exact: true }).click();
          await expect(
            page.locator(".question-action-toolbar .question-index"),
          ).toHaveText(String(position + 1));
          const nextMs = Math.round(performance.now() - nextStart);
          const backStart = performance.now();
          await page
            .getByRole("button", { name: "Previous", exact: true })
            .click();
          await expect(radio).toBeChecked();
          console.log(
            "Navigation",
            JSON.stringify({
              mode,
              nextMs,
              backMs: Math.round(performance.now() - backStart),
              contentRequests: navigationRequests.length,
            }),
          );
          page.off("request", track);
          assert.equal(navigationRequests.length, 0);
          await page.reload();
          await expect(page.getByRole("radio").first()).toBeChecked();
        }
        await page.unroute("**/rest/v1/**");
        await page.unroute("**/rest/v1/rpc/save_practice_changes");
        // Finish each disposable sample, exercising completed-history preservation.
        await app.json(
          app.as(student, `select public.finish_book_practice('${id}');`),
        );
      }
    }
    console.log("Selection to Check:", JSON.stringify(durations));
    await page.route("**/rest/v1/**", async (route) => {
      if (route.request().method() === "GET")
        await new Promise((resolve) => setTimeout(resolve, 200));
      await route.continue();
    });
    const homeworkStart = performance.now();
    await page.goto(app.appUrl + "/practice/" + app.session);
    await expect(page.locator(".question-text")).toBeVisible();
    console.log(
      "Homework startup",
      Math.round(performance.now() - homeworkStart),
    );
    await page.unroute("**/rest/v1/**");
    await page.unroute("**/rest/v1/rpc/save_practice_changes");
    await expect(
      page.getByRole("button", { name: "Check", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    const homeworkItem = (
      await page.getByRole("radio").first().getAttribute("name")
    ).replace("answer-", "");
    assert.equal(
      await app.json(
        `select selected_answer from public.book_practice_items where id='${homeworkItem}';`,
      ),
      1,
    );
    await page.reload();
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    if (!process.env.SATCHI_PERF_BASELINE) {
      // A failed dependent save must never reach grading; the draft survives.
      const sid = await app.json(
        app.as(
          student,
          `select public.start_bank_practice('{"section":"Math"}',15,false);`,
        ),
      );
      await page.goto(app.appUrl + "/practice/" + sid);
      await expect(page.locator(".question-text")).toBeVisible();
      for (let n = 0; n < 15 && !(await page.getByRole("radio").count()); n++)
        await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByRole("radio").first()).toBeVisible();
      const item = await page.getByRole("radio").first().getAttribute("name");
      const itemId = item.replace("answer-", "");
      await page.route("**/rest/v1/rpc/save_practice_changes", (route) =>
        route.abort("failed"),
      );
      await page.getByRole("radio").nth(2).check();
      await expect(
        page.getByText("Save failed", { exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Checking…", exact: true }),
      ).toHaveCount(0);
      assert.equal(
        await app.json(
          `select count(*)::int from public.question_check_attempts where item_id='${itemId}';`,
        ),
        0,
      );
      await page.unroute("**/rest/v1/**");
      await page.unroute("**/rest/v1/rpc/save_practice_changes");
      await page
        .getByRole("button", { name: "Retry saving", exact: true })
        .click();
      await expect(
        page.getByText("All changes saved", { exact: true }),
      ).toBeVisible();
      // Rapid edits are serialized; Check must grade the latest choice once.
      await page.route(
        "**/rest/v1/rpc/save_practice_changes",
        async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          await route.continue();
        },
      );
      await page.getByRole("radio").nth(0).check();
      await page.getByRole("radio").nth(1).check();
      await page.getByRole("radio").nth(3).check();
      // Commit grading, then lose its HTTP acknowledgement. Retrying must
      // reuse the event ID rather than create a second attempt.
      await page.route("**/rest/v1/rpc/check_bank_answer", async (route) => {
        await route.fetch();
        await route.abort("failed");
      });
      await page
        .getByRole("button", { name: "Check", exact: true })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      await expect(page.getByRole("alert")).toContainText(
        "Could not check your answer. Retry to save this attempt.",
      );
      await expect(
        page.getByRole("button", { name: "Checking…", exact: true }),
      ).toHaveCount(0);
      await page.unroute("**/rest/v1/rpc/check_bank_answer");
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await expect(page.locator(".attempt-feedback")).toBeVisible();
      const stored = await app.json(
        `select row_to_json(x) from (select selected_answer,(select count(*)::int from public.question_check_attempts where item_id=i.id) attempts,(select selected_answer from public.question_check_attempts where item_id=i.id limit 1) checked_answer from public.book_practice_items i where id='${itemId}') x;`,
      );
      assert.deepEqual(stored, {
        selected_answer: 3,
        attempts: 1,
        checked_answer: 3,
      });
      await page.unroute("**/rest/v1/**");
      await page.unroute("**/rest/v1/rpc/save_practice_changes");
      await page.reload();
      await expect(page.getByRole("radio").nth(3)).toBeChecked();
    }
  },
);
