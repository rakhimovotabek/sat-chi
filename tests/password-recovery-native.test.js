import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { nativeAppEnvironment } from "./helpers/native-app-environment.js";

test(
  "real isolated Supabase Auth emails recover a disposable account through PKCE",
  {
    skip: !(
      process.env.SATCHI_TEST_AUTH_BIN &&
      process.env.SATCHI_TEST_POSTGRES_BIN &&
      process.env.SATCHI_TEST_POSTGREST
    ),
    timeout: 180000,
  },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
    });
    t.after(() => app.close());
    await app.upgrade();
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const context = await browser.newContext(),
      page = await context.newPage();
    await page.goto(app.appUrl + "/login");
    await page
      .getByRole("link", { name: "Forgot password?", exact: true })
      .click();
    await page
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await page
      .getByRole("button", { name: "Send recovery email", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "If an account exists",
    );
    await expect.poll(() => app.authEmails.length).toBe(1);
    const email = app.authEmails[0]
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9a-f]{2})/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replaceAll("&amp;", "&");
    const link = email.match(/href="(http[^"\s]+\/verify\?[^"\s]+)"/)?.[1];
    assert.ok(
      link,
      "real SMTP message contains a Supabase recovery verification link",
    );
    try {
      await page.goto(link);
    } catch {
      throw new Error("Isolated recovery navigation failed");
    }
    await expect(
      page.getByLabel("New password", { exact: true }),
    ).toBeVisible();
    assert.equal(
      new URL(page.url()).search,
      "",
      "one-use code removed from URL",
    );
    await page.reload(); // verified session supports refresh without retaining a code
    await page
      .getByLabel("New password", { exact: true })
      .fill("new-disposable-password-2026");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("different-password-2026");
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("do not match");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("new-disposable-password-2026");
    await page
      .getByRole("button", { name: "Update password", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Password updated").catch(async () => {
      throw new Error("Controlled recovery update failed: " + await page.locator('[role=alert]').innerText());
    });
    await page
      .getByRole("link", {
        name: "Sign in with your new password",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("new-disposable-password-2026");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL(/\/dashboard$/);
    const old = await fetch(app.apiUrl + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "student@fixture.invalid",
        password: "disposable-test-only",
      }),
    });
    assert.equal(old.ok, false, "old password no longer authenticates");
    await page.goto(
      app.appUrl + "/reset-password?error=access_denied&error_code=otp_expired",
    );
    await expect(page.getByRole("alert")).toContainText("invalid, expired");
    await expect(
      page.getByRole("button", { name: "Update password", exact: true }),
    ).toHaveCount(0);
    // An unrelated authenticated session must not make an invalid code valid.
    await page.goto(
      app.appUrl + "/reset-password?code=invalid-disposable-code",
    );
    await expect(page.getByRole("alert")).toContainText("invalid, expired");
    await page.goto(app.appUrl + "/forgot-password");
    await page
      .getByLabel("Email", { exact: true })
      .fill("unknown@fixture.invalid");
    await page
      .getByRole("button", { name: "Send recovery email", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "If an account exists",
    );
    assert.equal(
      app.authEmails.length,
      1,
      "unknown accounts do not generate mail",
    );
  },
);
