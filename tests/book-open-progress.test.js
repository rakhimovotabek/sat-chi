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
  "Book checked totals include open-response attempts before and after correction",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade();
    const topic = await app.json(
      `with t as(insert into public.book_topics(book_id,title)values('${app.book}','Open progress fixture')returning id)select to_jsonb(id)from t`,
    );
    const question = await app.json(
      `with q as(insert into public.questions(topic_id,question_text,options,question_type,import_metadata)values('${topic}','What is 4.3 times two?','[]','open','{"package_question_id":"open-progress-fixture"}')returning id)select to_jsonb(id)from q`,
    );
    await app.sql(`insert into public.question_answers(question_id,correct_answer,explanation)values('${question}',null,'Multiply by two.');
    insert into public.book_open_answers(question_id,accepted_answers)values('${question}','["8.6"]');
    update public.content_review_items set status='approved' where item_type='question' and entity_id='${question}';`);
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
    const sid = page.url().split("/").at(-1);
    const counts = () =>
      app.json(
        app.as(student, `select public.book_practice_progress('${app.book}')`),
      );
    await page.getByLabel("Your answer", { exact: true }).fill("9");
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    // Selection alone does not count as Check; the persisted failed Check does.
    assert.equal((await counts()).find((r) => r.topic_id === topic).checked, 0);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.locator(".attempt-feedback")).toContainText("incorrect");
    assert.equal(
      await app.json(
        `select to_jsonb(correct)from public.book_practice_items where session_id='${sid}'`,
      ),
      false,
    );
    const wrong = (await counts()).find((r) => r.topic_id === topic);
    assert.equal(wrong.checked, 1);
    assert.equal(wrong.solved, 0);
    await page.reload();
    await page.getByLabel("Your answer", { exact: true }).fill("8.6");
    await expect(
      page.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.locator(".attempt-feedback")).toContainText("Correct");
    const correct = (await counts()).find((r) => r.topic_id === topic);
    assert.equal(correct.checked, 1);
    assert.equal(correct.solved, 1);
    await page.goto(app.appUrl + "/books/" + app.book);
    await expect(page.getByText("1 checked", { exact: false })).toBeVisible();
  },
);
