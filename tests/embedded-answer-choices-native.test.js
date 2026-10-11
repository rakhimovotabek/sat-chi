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
  "embedded image choices keep elimination, grading, images and acknowledged answers",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const sid = await app.json(
      app.as(student, `select public.start_book_practice('${app.topic}');`),
    );
    const row = await app.json(
      `select to_jsonb(i) from public.book_practice_items i where session_id='${sid}' order by position limit 1;`,
    );
    assert.ok(row.question.image_url);
    // Only this isolated disposable snapshot is changed; source/imports stay intact.
    await app.sql(
      `update public.book_practice_items set question=jsonb_set(question,'{options}','["","","",""]') || jsonb_build_object('import_metadata',coalesce(question->'import_metadata','{}') || '{"questionImageIncludesOptions":true}'::jsonb) where id='${row.id}';`,
    );
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
    t.after(() => browser.close());
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
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
    await page.goto(app.appUrl + "/practice/" + sid);
    await expect(
      page.getByText("Select the answer shown in the image.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".embedded-answer-choices")).toHaveCount(1);
    await expect(page.getByRole("radio")).toHaveCount(4);
    for (const letter of ["A", "B", "C", "D"])
      await expect(
        page.getByRole("radio", { name: letter, exact: true }),
      ).toBeVisible();
    await expect(
      page.getByText("Choice in the question image", { exact: true }),
    ).toHaveCount(0);
    const image = page.locator(".stimulus-panel img").first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((i) => i.complete && i.naturalWidth > 0))
      .toBe(true);
    await page.evaluate(() => {
      window.__embeddedImage = document.querySelector(".stimulus-panel img");
    });
    await page
      .getByRole("button", { name: "Eliminate choice D", exact: true })
      .click();
    await expect(
      page.getByRole("radio", { name: "D", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Restore choice D", exact: true })
      .click();
    await expect(
      page.getByRole("radio", { name: "D", exact: true }),
    ).toBeEnabled();
    await page.getByRole("radio", { name: "A", exact: true }).check();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.locator(".attempt-feedback strong")).toHaveText(
      "Incorrect",
    );
    await expect(
      page.getByRole("button", { name: "Checking…", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("radio", { name: "B", exact: true }).check();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.locator(".attempt-feedback strong")).toHaveText(
      "Correct",
    );
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    assert.ok(
      await page.evaluate(
        () =>
          window.__embeddedImage ===
          document.querySelector(".stimulus-panel img"),
      ),
    );
    const saved = await app.json(
      `select jsonb_build_object('answer',selected_answer,'correct',correct,'attempts',(select count(*) from public.question_check_attempts where item_id=i.id)) from public.book_practice_items i where id='${row.id}';`,
    );
    assert.deepEqual(saved, { answer: 1, correct: true, attempts: 2 });
    await page.reload();
    await expect(
      page.getByRole("radio", { name: "B", exact: true }),
    ).toBeChecked();
    // Mixed text must not collapse even if the embedded-source metadata remains.
    await app.sql(
      `update public.book_practice_items set question=jsonb_set(question,'{options}','["","Real answer text","",""]') where id='${row.id}';`,
    );
    await page.reload();
    await expect(
      page.getByText("Real answer text", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".embedded-answer-choices")).toHaveCount(0);
    // Actual separate image choices must also retain their existing rendering.
    const separate = await app.json(
      `select to_jsonb(i) from public.book_practice_items i where session_id='${sid}' and question->'option_image_urls'->>0 is not null limit 1;`,
    );
    assert.ok(separate?.question.option_image_urls[0]);
    // Keep the actual choice assets associated with their original question.
    await app.sql(
      `update public.book_practice_items set question=jsonb_set(question,'{options}','["Real answer text","","",""]') where id='${separate.id}';
       `,
    );
    await page.reload();
    await page.getByRole("button", { name: /^Question \d+ of \d+$/ }).click();
    await page
      .getByRole("button", {
        name: new RegExp(`^Question ${separate.position + 1},`),
      })
      .click();
    await expect(
      page.getByRole("img", { name: "Choice A", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Real answer text", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".embedded-answer-choices")).toHaveCount(0);
  },
);
