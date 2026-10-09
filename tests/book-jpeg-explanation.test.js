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
  "approved JPEG explanation reference resolves through authenticated Storage after an answer",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const topic = await app.json(
      `with t as(insert into public.book_topics(book_id,title)values('${app.book}','JPEG explanation fixture')returning id)select to_jsonb(id)from t`,
    );
    const question = await app.json(
      `with q as(insert into public.questions(topic_id,question_text,options,import_metadata)values('${topic}','JPEG explanation question','["1","2","3","4"]','{"package_question_id":"jpeg-fixture"}')returning id)select to_jsonb(id)from q`,
    );
    const path = "d".repeat(64) + "/" + "e".repeat(64) + ".jpg";
    await app.sql(`insert into public.question_answers(question_id,correct_answer,explanation)values('${question}',1,'![Official explanation](https://fixture.invalid/storage/v1/object/authenticated/book-package-assets/${path})');
    update public.content_review_items set status='approved' where item_type='question' and entity_id='${question}';
    insert into public.book_package_assets(path,book_id,question_id,kind,source_path,sha256)values('${path}','${app.book}','${question}','explanation','fixture.jpg','${"e".repeat(64)}');insert into storage.objects(bucket_id,name)values('book-package-assets','${path}');`);
    const browser = await chromium.launch({
      headless: true,
      channel: "chromium",
    });
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
    await expect(
      page.getByRole("heading", {
        name: "Your SAT journey starts here.",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(app.appUrl + `/books/${app.book}/topics/${topic}`);
    await page
      .getByRole("button", { name: "Start topic practice", exact: true })
      .click();
    await page.waitForURL(/\/practice\//);
    const session = page.url().split("/").at(-1);
    await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    assert.equal(
      await app.json(
        `select to_jsonb(selected_answer) from public.book_practice_items where session_id='${session}'`,
      ),
      1,
    );
    await page
      .getByRole("button", { name: "Explanation", exact: true })
      .click();
    const panel = page.getByRole("region", { name: "Book explanation" });
    try {
      await expect(panel.locator("img")).toBeVisible();
    } catch (error) {
      throw Error(error.message + "\n" + (await panel.innerText()));
    }
    await expect
      .poll(() =>
        panel
          .locator("img")
          .evaluate((img) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);
    assert.equal(
      await app.json(
        app.as(
          student,
          `select count(*)::int from storage.objects where name='${path}'`,
        ),
      ),
      1,
    );
    // Pixel bytes come from the fixture Storage transport; this verifies JPEG URL
    // parsing and real DB authorization, not managed Storage MIME handling.
  },
);
