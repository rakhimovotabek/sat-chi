import test from "node:test";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import {
  nativeAppEnvironment,
  admin,
  student,
} from "./helpers/native-app-environment.js";
test(
  "real PostgreSQL SBank source boundary and browser source selection",
  { skip: !process.env.SATCHI_TEST_POSTGRES_BIN, timeout: 180000 },
  async (t) => {
    const app = await nativeAppEnvironment({
      realAuth: process.env.SATCHI_TEST_AUTH_BIN,
    });
    t.after(() => app.close());
    await app.upgrade();
    const before = await app.json(
      app.as(student, "select question_bank('{}')->'count'"),
    );
    await app.sql(
      `update books set bank_source='sbank' where id='${app.book}'`,
    );
    assert.equal(
      await app.json(app.as(student, "select question_bank('{}')->'count'")),
      0,
    );
    assert.equal(
      await app.json(
        app.as(student, `select question_bank('{"source":"sbank"}')->'count'`),
      ),
      before,
    );
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(app.appUrl + "/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await page.goto(app.appUrl + "/question-bank");
    await page.getByRole("button", { name: "SBank", exact: true }).click();
    const work = page.locator("#bank-source-college-board");
    await expect(
      work.getByRole("button", { name: "Start Practice Session", exact: true }),
    ).toBeEnabled({ timeout: 15000 });
    await expect(work.getByLabel("Matching question count")).toHaveText(
      String(before),
    );
    await work
      .getByRole("button", { name: "Start Practice Session", exact: true })
      .click();
    await page.waitForURL(/\/practice\//);
    await expect(page.getByRole("alert")).toHaveCount(0);
    assert(admin);
  },
);
