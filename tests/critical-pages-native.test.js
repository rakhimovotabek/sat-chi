import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { nativeAppEnvironment } from "./helpers/native-app-environment.js";

test(
  "disposable authenticated clients load Battles, Progress, Books and daily Homework after reload and fresh login",
  { skip: !process.env.SATCHI_TEST_AUTH_BIN, timeout: 180000 },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
      officialServices: process.env.SATCHI_TEST_OFFICIAL_SERVICES === "1",
    });
    t.after(() => app.close());
    await app.upgrade();
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const errors = [];
    for (const who of ["student", "admin"]) {
      const context = await browser.newContext({
        viewport: { width: 1366, height: 768 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      page.on("pageerror", (error) => errors.push(error.message));
      const login = async () => {
        await page.goto(app.appUrl + "/login");
        await page
          .getByLabel("Email", { exact: true })
          .fill(who + "@fixture.invalid");
        await page
          .getByLabel("Password", { exact: true })
          .fill("disposable-test-only");
        await page
          .getByRole("button", { name: "Sign In", exact: true })
          .click();
        await page.waitForURL(
          who === "admin" ? /\/admin\/dashboard/ : /\/dashboard/,
        );
      };
      await login();
      for (const [path, title] of who === "admin"
        ? [
            ["/admin/books", "Books"],
            ["/admin/homework", "Homework"],
          ]
        : [
            ["/battles", "Battles"],
            ["/progress", "Progress"],
            ["/books", "Books"],
            ["/homework", "Homework"],
          ]) {
        await page.goto(app.appUrl + path);
        await expect(
          page.getByRole("heading", { name: title, exact: true, level: 1 }),
        ).toBeVisible({ timeout: 15000 });
        await expect(
          page.getByText("Loading learning materials…", { exact: true }),
        ).toHaveCount(0, { timeout: 15000 });
        await expect(page.getByRole("alert")).toHaveCount(0);
        for (const width of [1366, 768, 390]) {
          await page.setViewportSize({ width, height: 844 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${path} ${width}px overflow`,
          );
        }
        await page.reload();
        await expect(
          page.getByRole("heading", { name: title, exact: true, level: 1 }),
        ).toBeVisible({ timeout: 15000 });
        await expect(
          page.getByText("Loading learning materials…", { exact: true }),
        ).toHaveCount(0, { timeout: 15000 });
        await expect(page.getByRole("alert")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      await page.waitForURL(/\/login/);
      await login();
      await page.goto(
        app.appUrl + (who === "admin" ? "/admin/homework" : "/homework"),
      );
      await expect(
        page.getByRole("heading", { name: "Homework", exact: true, level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByText("Loading learning materials…", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByRole("alert")).toHaveCount(0);
      await context.close();
    }
    assert.deepEqual(errors, []);
  },
);
