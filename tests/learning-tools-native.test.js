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
  "Learning toolbar, real Desmos, warmth and Overview preserve question nodes and persisted answers",
  { skip: !enabled, timeout: 240000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    });
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(app.appUrl + "/login");
    await page
      .getByLabel("Email", { exact: true })
      .fill("student@fixture.invalid");
    await page
      .getByLabel("Password", { exact: true })
      .fill("disposable-test-only");
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Log out", exact: true }),
    ).toBeVisible();
    const sid = await app.json(
      app.as(student, `select public.start_book_practice('${app.topic}');`),
    );
    await page.goto(app.appUrl + "/practice/" + sid);
    const all = await app.json(
      `select jsonb_agg(to_jsonb(i)order by position)from public.book_practice_items i where session_id='${sid}';`,
    );
    await expect(page.locator(".stimulus-panel img").first()).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".stimulus-panel img")
          .first()
          .evaluate((i) => i.complete && i.naturalWidth > 0),
      )
      .toBe(true);
    await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      window.__question = document.querySelector(".answer-panel");
      window.__image = document.querySelector(".stimulus-panel img");
      window.__canvas = document.querySelector(".answer-panel canvas");
    });
    const requests = [];
    page.on("request", (r) =>
      requests.push({ url: r.url(), type: r.resourceType() }),
    );
    const stable = async () =>
      assert.ok(
        await page.evaluate(
          () =>
            window.__question === document.querySelector(".answer-panel") &&
            window.__image === document.querySelector(".stimulus-panel img") &&
            window.__canvas === document.querySelector(".answer-panel canvas"),
        ),
      );
    const header = page.locator(".topbar");
    await expect(
      header.getByRole("button", { name: "Calculator", exact: true }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Pen", exact: true }),
    ).toBeVisible();
    const split = async () =>
      assert.ok(
        await page.evaluate(
          () =>
            document.querySelector(".stimulus-panel").getBoundingClientRect()
              .right <=
            document.querySelector(".answer-panel").getBoundingClientRect()
              .left,
        ),
      );
    await split();
    await expect(
      page.getByRole("button", { name: "Eliminate", exact: true }),
    ).toHaveCount(0);
    const eliminate = page.locator(".eliminate-choice").first();
    await expect(eliminate).toBeVisible();
    await eliminate.click();
    await expect(eliminate).toHaveAttribute("aria-pressed", "true");
    await eliminate.click();
    await expect(eliminate).toHaveAttribute("aria-pressed", "false");
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    const before = requests.length;
    await header
      .getByRole("button", { name: "Calculator", exact: true })
      .click();
    const panel = page.getByRole("dialog", { name: "Calculator", exact: true });
    await expect(panel).toBeVisible();
    assert.ok(
      await page.evaluate(
        () =>
          document
            .querySelector(".calculator-workspace-window")
            .getBoundingClientRect().right <=
          document.querySelector(".question-player").getBoundingClientRect()
            .left,
      ),
    );
    await stable();
    const frame = page.frameLocator(
      'iframe[title="Desmos graphing calculator"]',
    );
    // Use the existing official embed unchanged, with no calculator network mocks.
    await expect(
      frame.locator('[class*="dcg-calculator-api-container"]').first(),
    ).toBeVisible({ timeout: 45000 });
    await frame.locator(".dcg-mq-editable-field").first().click();
    await page.keyboard.type("y=x");
    const expression = frame
      .locator(".dcg-mq-editable-field .dcg-mq-root-block")
      .first();
    const formula = async () =>
      (await expression.innerText()).replace(/[\s\u200b]/g, "");
    const resize = panel.getByRole("button", {
      name: "Resize calculator bottom-right",
    });
    const original = await panel.boundingBox();
    const handle = await resize.boundingBox();
    await page.mouse.move(
      handle.x + handle.width / 2,
      handle.y + handle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handle.x + handle.width / 2 + 40,
      handle.y + handle.height / 2 + 50,
      { steps: 5 },
    );
    await page.mouse.up();
    const resized = await panel.boundingBox();
    assert.ok(resized.width > original.width + 20);
    assert.ok(resized.height > original.height + 30);
    await stable();
    const reference = page.getByRole("dialog", {
      name: "Reference sheet",
      exact: true,
    });
    await header
      .getByRole("button", { name: "Reference sheet", exact: true })
      .click();
    await expect(reference).toBeVisible();
    await expect(panel).toBeVisible();
    await page
      .getByRole("button", { name: "Close Reference sheet", exact: true })
      .click();
    await expect(reference).toBeHidden();
    await expect(panel).toBeVisible();
    await stable();
    const expressionBefore = await formula();
    assert.equal(expressionBefore, "y=x");
    await page.evaluate(
      () =>
        (window.__calculatorFrame = document.querySelector(
          'iframe[title="Desmos graphing calculator"]',
        )),
    );
    await page
      .getByRole("button", { name: "Close Calculator", exact: true })
      .click();
    await expect(panel).toBeHidden();
    await stable();
    await header
      .getByRole("button", { name: "Calculator", exact: true })
      .click();
    await expect(panel).toBeVisible();
    assert.equal(await formula(), expressionBefore);
    assert.ok(
      await page.evaluate(
        () =>
          window.__calculatorFrame ===
          document.querySelector('iframe[title="Desmos graphing calculator"]'),
      ),
    );
    await page
      .getByRole("button", { name: "Close Calculator", exact: true })
      .click();
    assert.equal(
      requests
        .slice(before)
        .filter(
          (r) =>
            r.url.includes("/rest/v1/") &&
            !r.url.includes("practice_heartbeat"),
        ).length,
      0,
    );
    assert.equal(
      requests
        .slice(before)
        .filter((r) => r.type === "image" && r.url.includes(app.apiUrl)).length,
      0,
    );
    await split();
    // Reverse sequence: Reference first, then Calculator, closing independently.
    await header
      .getByRole("button", { name: "Reference sheet", exact: true })
      .click();
    await header
      .getByRole("button", { name: "Calculator", exact: true })
      .click();
    await expect(reference).toBeVisible();
    await expect(panel).toBeVisible();
    assert.equal(await formula(), expressionBefore);
    await page
      .getByRole("button", { name: "Close Calculator", exact: true })
      .click();
    await expect(reference).toBeVisible();
    await page
      .getByRole("button", { name: "Close Reference sheet", exact: true })
      .click();
    await stable();
    const night = header.getByRole("button", {
      name: "Night Light",
      exact: true,
    });
    await night.click();
    await expect(night).toHaveAttribute("data-level", "warm");
    await stable();
    await night.click();
    await expect(night).toHaveAttribute("data-level", "extra-warm");
    await stable();
    assert.match(
      await page.evaluate(
        () =>
          getComputedStyle(document.documentElement, "::after").backgroundColor,
      ),
      /0\.32/,
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Night Light", exact: true }),
    ).toHaveAttribute("data-level", "extra-warm");
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Night Light", exact: true })
      .click();
    await expect(page.locator("html")).not.toHaveClass(/night-light/);
    await page.evaluate(
      () =>
        (window.__overviewQuestion = document.querySelector(".answer-panel")),
    );
    const open = async () => {
      await page.getByRole("button", { name: /Question \d+ of/ }).click();
      await expect(
        page.getByRole("dialog", { name: "Question Overview" }),
      ).toBeVisible();
    };
    const closed = async () => {
      await expect(
        page.getByRole("dialog", { name: "Question Overview" }),
      ).toHaveCount(0);
      assert.ok(
        await page.evaluate(
          () =>
            window.__overviewQuestion ===
            document.querySelector(".answer-panel"),
        ),
      );
    };
    await open();
    const dialog = page.getByRole("dialog", { name: "Question Overview" });
    await dialog.getByRole("heading").click();
    await expect(dialog).toBeVisible();
    const rect = await dialog.boundingBox();
    await page.mouse.click(rect.x + 4, rect.y + 4);
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    await closed();
    await open();
    await page.keyboard.press("Escape");
    await closed();
    await expect(
      page.getByRole("button", { name: /Question \d+ of/ }),
    ).toBeFocused();
    await open();
    await page
      .getByRole("button", { name: "Close Question Overview", exact: true })
      .click();
    await closed();
    await open();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Question 12,/ })
      .click();
    await expect(
      page.getByRole("button", { name: /Question 12 of/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog", { name: "Question Overview" }),
    ).toHaveCount(0);
    await open();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /^Question 1,/ })
      .click();
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    // Draw, exit and retain actual local annotations while opening/closing tools.
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    const canvas = page.locator(".answer-panel canvas");
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + 30, bounds.y + 120);
    await page.mouse.down();
    await page.mouse.move(bounds.x + 100, bounds.y + 160, { steps: 4 });
    await page.mouse.up();
    await page
      .getByRole("button", { name: "Exit drawing mode", exact: true })
      .click();
    assert.ok(
      await page.evaluate(() =>
        Object.keys(localStorage).some(
          (k) =>
            k.startsWith("satchi:drawings:v1:") &&
            JSON.parse(localStorage.getItem(k)).strokes.length > 0,
        ),
      ),
    );
    await expect
      .poll(() =>
        page
          .locator(".stimulus-panel img")
          .first()
          .evaluate((i) => i.complete && i.naturalWidth > 0),
      )
      .toBe(true);
    await page.evaluate(() => {
      window.__question = document.querySelector(".answer-panel");
      window.__image = document.querySelector(".stimulus-panel img");
      window.__canvas = document.querySelector(".answer-panel canvas");
    });
    const check = page.waitForResponse(
      (r) =>
        r.url().includes("/rpc/check_book_practice_answer") &&
        r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Check", exact: true }).click();
    assert.equal((await check).status(), 200);
    await stable();
    await expect(
      page.locator(".attempt-feedback").getByText("Correct", { exact: true }),
    ).toBeVisible();
    const saved = await app.json(
      `select row_to_json(i)from(select selected_answer,answer_revision,correct from public.book_practice_items where id='${all[0].id}')i;`,
    );
    assert.equal(saved.selected_answer, 1);
    assert.ok(saved.answer_revision > 0);
    assert.equal(saved.correct, true);
    await page.reload();
    await expect(page.getByRole("radio").nth(1)).toBeChecked();
    // The same Navigator and toolbar operate on real Bank/Homework sessions too.
    const bank = await app.json(
      app.as(
        student,
        `select public.start_bank_practice('{"section":"Math"}',15,false);`,
      ),
    );
    for (const id of [bank, app.session]) {
      await page.goto(app.appUrl + "/practice/" + id);
      await expect(
        page.getByRole("button", { name: /Question \d+ of/ }),
      ).toBeVisible();
      await expect(
        page
          .locator(".topbar")
          .getByRole("button", { name: "Pen", exact: true }),
      ).toBeVisible();
      await open();
      await page.mouse.click(5, 5);
      await expect(
        page.getByRole("dialog", { name: "Question Overview" }),
      ).toHaveCount(0);
      const shown = (
        await page.locator(".question-text").innerText()
      ).replaceAll("'", "''");
      const written = await page
        .getByLabel("Your answer", { exact: true })
        .count();
      if (written)
        await page.getByLabel("Your answer", { exact: true }).fill("8.6");
      else await page.getByRole("radio").nth(1).check();
      await expect(
        page.getByText("All changes saved", { exact: true }),
      ).toBeVisible();
      const row = await app.json(
        `select row_to_json(i)from(select selected_answer,selected_response,answer_revision from public.book_practice_items where session_id='${id}' and question->>'question_text'='${shown}')i;`,
      );
      assert.ok(row.answer_revision > 0);
      if (written) assert.equal(row.selected_response, "8.6");
      else assert.equal(row.selected_answer, 1);
      await page.reload();
      await expect(
        page.getByText("All changes saved", { exact: true }),
      ).toBeVisible();
      if (written)
        await expect(
          page.getByLabel("Your answer", { exact: true }),
        ).toHaveValue("8.6");
      else await expect(page.getByRole("radio").nth(1)).toBeChecked();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Calculator", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Calculator", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page
        .locator(".calculator-workspace-window")
        .getAttribute("data-mode"),
      "stacked",
    );
    await page
      .getByRole("button", { name: "Close Calculator", exact: true })
      .click();
    assert.deepEqual(errors, []);
  },
);
