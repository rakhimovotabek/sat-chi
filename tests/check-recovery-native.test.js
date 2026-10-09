import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "Check keeps loaded images mounted; saved practice survives repeated genuine browser restarts",
  { skip: !enabled, timeout: 300000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const sid = await app.json(
      app.as(student, `select public.start_book_practice('${app.topic}');`),
    );
    const profile = await mkdtemp(join(tmpdir(), "satchi-check-recovery-"));
    t.after(() => rm(profile, { recursive: true, force: true }));
    const launch = () =>
      chromium.launchPersistentContext(profile, {
        headless: true,
        channel: "chromium",
      });
    let context = await launch();
    t.after(() => context.close());
    let page = await context.newPage();
    page.setDefaultTimeout(15000);
    const login = async () => {
      await page.goto(app.appUrl + "/login");
      await page
        .getByLabel("Email", { exact: true })
        .fill("student@fixture.invalid");
      await page
        .getByLabel("Password", { exact: true })
        .fill("disposable-test-only");
      await page.getByRole("button", { name: "Sign In", exact: true }).click();
      await expect(
        page.getByRole("heading", {
          name: "Your SAT journey starts here.",
          exact: true,
        }),
      ).toBeVisible();
    };
    const open = async () => {
      await page.goto(app.appUrl + "/practice/" + sid);
      await expect(
        page.getByRole("button", { name: /Question \d+ of/ }),
      ).toBeVisible();
    };
    const rows = () =>
      app.json(
        `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id='${sid}';`,
      );
    const go = async (position) => {
      await page.getByRole("button", { name: /Question \d+ of/ }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: new RegExp("^Question " + (position + 1) + ","),
        })
        .click();
    };
    await login();
    await open();
    const list = await rows();
    await t.test(
      "real Check does not replace reference/option images, navigate the document, or lose its selection",
      async () => {
        const candidates = list.filter(
          (i) =>
            i.question.image_url ||
            i.question.option_image_urls?.some(Boolean) ||
            i.question.question_type === "open",
        );
        const requests = [];
        page.on("request", (r) =>
          requests.push({
            path: new URL(r.url()).pathname,
            type: r.resourceType(),
          }),
        );
        for (const row of candidates) {
          await go(row.position);
          if (row.question.question_type === "open")
            await page.getByLabel("Your answer", { exact: true }).fill("8.6");
          else await page.getByRole("radio").nth(0).check();
          await expect(
            page.getByText("All changes saved", { exact: true }),
          ).toBeVisible();
          await expect
            .poll(() =>
              page
                .locator(".stimulus-panel img,.answer-choice img")
                .evaluateAll((images) =>
                  images.every((i) => i.complete && i.naturalWidth > 0),
                ),
            )
            .toBe(true);
          await page.evaluate(() => {
            window.checkedImages = [
              ...document.querySelectorAll(
                ".stimulus-panel img,.answer-choice img",
              ),
            ];
            window.checkedImagesRemoved = false;
            window.checkObserver?.disconnect();
            window.checkObserver = new MutationObserver(() => {
              if (window.checkedImages.some((i) => !i.isConnected))
                window.checkedImagesRemoved = true;
            });
            window.checkObserver.observe(document.body, {
              childList: true,
              subtree: true,
            });
          });
          const before = requests.length;
          const attempt = page.waitForResponse((r) =>
            /\/rpc\/check_book_practice_(answer|response)$/.test(r.url()),
          );
          const start = performance.now();
          await page
            .getByRole("button", { name: "Check", exact: true })
            .click();
          const response = await attempt;
          assert.equal(response.status(), 200);
          await expect(page.locator(".attempt-feedback")).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Explanation", exact: true }),
          ).toBeEnabled();
          // Wait for all authoritative post-Check reads to settle, not a timed sleep.
          await page.waitForLoadState("networkidle");
          const after = requests.slice(before);
          const removed = await page.evaluate(
            () => window.checkedImagesRemoved,
          );
          console.log(
            "Check measurement",
            JSON.stringify({
              type: row.question.question_type,
              images:
                row.question.option_image_urls?.filter(Boolean).length ||
                Number(Boolean(row.question.image_url)),
              ms: Math.round(performance.now() - start),
              removed,
              documents: after.filter((r) => r.type === "document").length,
              signing: after.filter((r) => r.path.includes("/object/sign/"))
                .length,
              imagesRequested: after.filter((r) => r.type === "image").length,
            }),
          );
          assert.equal(after.filter((r) => r.type === "document").length, 0);
          assert.equal(removed, false, "Check detached loaded question images");
          assert.equal(
            after.filter((r) => r.path.includes("/object/sign/")).length,
            0,
          );
          assert.ok(
            (await rows()).find((r) => r.id === row.id).answer_revision > 0,
          );
          assert.ok(
            await app.json(
              `select to_jsonb(count(*)) from public.question_check_attempts where item_id='${row.id}';`,
            ),
          );
        }
      },
    );
    await t.test(
      "slow/double Check, failed authoritative refresh and genuine reload/fresh login keep saved progress",
      async () => {
        const row = list.find((i) => i.question.image_url);
        await go(row.position);
        await expect(page.locator(".stimulus-panel img")).toBeVisible();
        const before = await app.json(
          `select to_jsonb(count(*)) from public.question_check_attempts where item_id='${row.id}';`,
        );
        let release;
        const waiting = new Promise((done) => {
          release = done;
        });
        await page.route("**/rpc/check_book_practice_answer", async (route) => {
          await waiting;
          await route.continue();
        });
        await page.route("**/rest/v1/book_practice_items?**", (route) =>
          route.fulfill({
            status: 400,
            contentType: "application/json",
            body: JSON.stringify({
              message: "Controlled post-Check read failure",
            }),
          }),
        );
        await page.evaluate(() => {
          window.slowCheckImage = document.querySelector(".stimulus-panel img");
          const button = [...document.querySelectorAll("button")].find(
            (b) => b.textContent.trim() === "Check",
          );
          button.click();
          button.click();
        });
        try {
          await expect(
            page.getByRole("button", { name: "Checking…", exact: true }),
          ).toBeDisabled();
          assert.equal(
            await page.evaluate(() => window.slowCheckImage.isConnected),
            true,
          );
        } catch (error) {
          console.error(
            "Slow Check failure",
            error.message,
            await page.locator("body").innerText(),
          );
          throw error;
        } finally {
          release();
        }
        await expect(
          page.getByText(/Could not refresh checked answers/),
        ).toBeVisible();
        assert.equal(
          await page.evaluate(() => window.slowCheckImage.isConnected),
          true,
        );
        assert.equal(
          await app.json(
            `select to_jsonb(count(*)) from public.question_check_attempts where item_id='${row.id}';`,
          ),
          before + 1,
        );
        await page.unroute("**/rest/v1/book_practice_items?**");
        await page.unroute("**/rpc/check_book_practice_answer");
        await page.getByRole("button", { name: "Next", exact: true }).click();
        await page
          .getByRole("button", {
            name: "Retry loading saved answers",
            exact: true,
          })
          .click();
        await page.waitForLoadState("networkidle");
        await expect(
          page.getByRole("button", { name: /Question \d+ of/ }),
        ).toHaveText(`Question ${row.position + 2} of ${list.length}`);
        await page.reload();
        await expect(
          page.getByRole("button", { name: /Question \d+ of/ }),
        ).toBeVisible();
        await go(row.position);
        await expect(page.getByRole("radio").nth(0)).toBeChecked();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Incorrect",
        );
        await page
          .getByRole("button", { name: "Log out", exact: true })
          .click();
        await page.waitForURL(/\/login$/);
        await login();
        await open();
        await go(row.position);
        await expect(page.getByRole("radio").nth(0)).toBeChecked();
        await expect(page.locator(".attempt-feedback")).toContainText(
          "Incorrect",
        );
      },
    );
    await t.test(
      "late post-Check snapshot cannot erase a newer acknowledged answer",
      async () => {
        const row = list.find((i) => i.question.image_url);
        await go(row.position);
        let release, captured;
        const waiting = new Promise((done) => {
          release = done;
        });
        const entered = new Promise((done) => {
          captured = done;
        });
        await page.route("**/rest/v1/book_practice_items?**", async (route) => {
          const response = await route.fetch();
          captured();
          await waiting;
          await route.fulfill({ response });
        });
        try {
          await page
            .getByRole("button", { name: "Check", exact: true })
            .click();
          await entered;
          await page.getByRole("button", { name: "Next", exact: true }).click();
          await page.getByRole("radio").nth(2).check();
          await expect(
            page.getByRole("status", { name: "Answer save status" }),
          ).toHaveText("All changes saved");
          const next = (await rows()).find(
            (i) => i.position === row.position + 1,
          );
          assert.equal(next.selected_answer, 2);
          const refreshed = page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === "/rest/v1/question_check_attempts",
          );
          release();
          await (await refreshed).finished();
          await page.evaluate(
            () =>
              new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done)),
              ),
          );
          await expect(page.getByRole("radio").nth(2)).toBeChecked();
          assert.equal(
            (await rows()).find((i) => i.id === next.id).selected_answer,
            2,
          );
        } finally {
          release();
          await page.unroute("**/rest/v1/book_practice_items?**");
        }
      },
    );
    await t.test(
      "twenty browser-process restarts restore existing authentication and authoritative answers",
      async () => {
        for (let iteration = 0; iteration < 20; iteration++) {
          const before = await page.evaluate(() => {
            const raw = localStorage.getItem("sb-127-auth-token");
            const session = raw ? JSON.parse(raw) : null;
            return {
              stored: Boolean(session),
              user: Boolean(session?.user),
              unexpired: session?.expires_at > Date.now() / 1000,
            };
          });
          await context.close();
          context = await launch();
          page = await context.newPage();
          try {
            await open();
          } catch (e) {
            console.error("Restart failure", {
              iteration,
              before,
              after: await page.evaluate(() => {
                const raw = localStorage.getItem("sb-127-auth-token");
                const session = raw ? JSON.parse(raw) : null;
                return {
                  path: location.pathname,
                  stored: Boolean(session),
                  user: Boolean(session?.user),
                  unexpired: session?.expires_at > Date.now() / 1000,
                };
              }),
            });
            throw e;
          }
          const current = await rows();
          for (const row of current.filter((r) => r.selected_answer !== null)) {
            await go(row.position);
            if (row.question.question_type === "open")
              await expect(
                page.getByLabel("Your answer", { exact: true }),
              ).toHaveValue(row.selected_response);
            else
              await expect(
                page.getByRole("radio").nth(row.selected_answer),
              ).toBeChecked();
          }
        }
      },
    );
  },
);
