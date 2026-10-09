import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "native authentication: default Chromium flags preserve storage through immediate and tab lifecycle shutdown",
  { skip: !enabled, timeout: 300000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const sid = await app.json(
      app.as(student, `select public.start_book_practice('${app.topic}');`),
    );
    for (const graceful of [false, true]) {
      let missing = 0;
      for (let iteration = 0; iteration < 8; iteration++) {
        const dir = await mkdtemp(join(tmpdir(), "satchi-auth-shutdown-"));
        const launch = () =>
          chromium.launchPersistentContext(dir, {
            headless: true,
            channel: "chromium",
            args: ["--enable-automation"],
          });
        let context = await launch();
        try {
          const cdp = await context.browser().newBrowserCDPSession();
          const command = await cdp.send("Browser.getBrowserCommandLine");
          const flags = command.arguments.filter((arg) =>
            arg.startsWith("--disable-features="),
          );
          assert.equal(
            flags.length,
            1,
            "Never override Playwright's default feature list",
          );
          assert.ok(flags[0].includes("DestroyProfileOnBrowserClose"));
          assert.ok(command.arguments.includes("--disable-back-forward-cache"));
          await cdp.detach();
          let page = await context.newPage();
          await page.goto(app.appUrl + "/login");
          await page
            .getByLabel("Email", { exact: true })
            .fill("student@fixture.invalid");
          await page
            .getByLabel("Password", { exact: true })
            .fill("disposable-test-only");
          await page
            .getByRole("button", { name: "Sign In", exact: true })
            .click();
          await expect(
            page.getByRole("heading", {
              name: "Your SAT journey starts here.",
              exact: true,
            }),
          ).toBeVisible();
          assert.equal(
            await page.evaluate(() =>
              Boolean(localStorage.getItem("sb-127-auth-token")),
            ),
            true,
          );
          if (graceful) {
            for (const tab of context.pages()) {
              const closed = tab.waitForEvent("close");
              await tab.close({ runBeforeUnload: true });
              await closed;
            }
          }
          await context.close();
          context = await launch();
          await context.addInitScript(() => {
            window.sessionBeforeApp = Boolean(
              localStorage.getItem("sb-127-auth-token"),
            );
          });
          page = await context.newPage();
          await page.goto(app.appUrl + "/practice/" + sid);
          const stored = await page.evaluate(() => window.sessionBeforeApp);
          if (!stored) missing++;
          console.log("Immediate Auth restart", {
            graceful,
            iteration,
            stored,
          });
          assert.equal(
            stored,
            true,
            "Both normal process close and tab close must retain authentication",
          );
          await expect(
            page.getByRole("button", { name: /Question \d+ of/ }),
          ).toBeVisible();
        } finally {
          await context.close();
          await rm(dir, { recursive: true, force: true });
        }
      }
      console.log("Auth shutdown mode result", {
        graceful,
        missing,
        iterations: 8,
      });
    }
  },
);
