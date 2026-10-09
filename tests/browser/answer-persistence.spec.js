import { test, expect } from "@playwright/test";
import { contentFixture, bookId, topicId } from "./helpers/content.js";
import { homeworkDatabase } from "../helpers/homework-database.js";
import { admin, student } from "../helpers/database.js";
import { databaseQueue, loginDatabase } from "./helpers/homework-database.js";

for (const type of ["text MCQ", "image MCQ", "open response"])
  test(`${type}: failed save survives sidebar navigation and refresh before retry`, async ({
    page,
  }) => {
    const store = await contentFixture(page);
    if (type === "open response")
      Object.assign(store.questions[0], { question_type: "open", options: [] });
    if (type === "image MCQ") {
      store.questions[0].option_image_urls = [0, 1, 2, 3].map(
        (i) => `https://example.test/choice-${i}.svg`,
      );
      await page.route("https://example.test/**", (r) =>
        r.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="20"><text y="15">x</text></svg>',
        }),
      );
    }
    await page.goto(`/books/${bookId}/topics/${topicId}`);
    await page.getByRole("button", { name: "Start topic practice" }).click();
    await expect(
      page.getByRole("button", { name: "Question 1 of 3", exact: true }),
    ).toBeVisible();
    const url = page.url();
    let offline = true;
    await page.route("**/rpc/save_practice_changes", (r) =>
      offline
        ? r.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Temporary connection failure" }),
          })
        : r.fallback(),
    );
    if (type === "open response")
      await page.getByLabel("Your answer").fill("43/5");
    else await page.getByRole("radio").nth(1).check();
    await expect(
      page.getByRole("status", { name: "Answer save status" }),
    ).toHaveText("Save failed");
    expect(store.items[0].selected_answer).toBeNull();
    await page
      .getByRole("link", { name: "Books", exact: true })
      .first()
      .click();
    await expect(page).not.toHaveURL(url);
    await page.goto(url);
    await expect(
      page.getByRole("status", { name: "Answer save status" }),
    ).toHaveText("Save failed");
    if (type === "open response")
      await expect(page.getByLabel("Your answer")).toHaveValue("43/5");
    else await expect(page.getByRole("radio").nth(1)).toBeChecked();
    await page.reload();
    await expect(
      page.getByRole("status", { name: "Answer save status" }),
    ).toHaveText("Save failed");
    offline = false;
    await page.getByRole("button", { name: "Retry saving" }).click();
    await expect(
      page.getByRole("status", { name: "Answer save status" }),
    ).toHaveText("All changes saved");
    await page.reload();
    if (type === "open response")
      await expect(page.getByLabel("Your answer")).toHaveValue("43/5");
    else await expect(page.getByRole("radio").nth(1)).toBeChecked();
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).filter((k) =>
          k.startsWith("satchi.practice-pending."),
        ),
      ),
    ).toHaveLength(0);
  });

test("save status waits for acknowledgement and older acknowledgement cannot clear a newer answer", async ({
  page,
}) => {
  const store = await contentFixture(page);
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(page.getByRole("radio").first()).toBeVisible();
  let release;
  const wait = new Promise((r) => (release = r));
  let first = true;
  await page.route("**/rpc/save_practice_changes", async (r) => {
    if (first) {
      first = false;
      await wait;
    }
    await r.fallback();
  });
  await page.getByRole("radio").nth(1).check();
  await expect(
    page.getByRole("status", { name: "Answer save status" }),
  ).toHaveText("Saving answers…");
  await page.getByRole("radio").nth(2).check();
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("status", { name: "Answer save status" }),
  ).toHaveText("All changes saved");
  expect(store.items[0].selected_answer).toBe(2);
  await page.reload();
  await expect(page.getByRole("radio").nth(2)).toBeChecked();
});

test("SQL-backed two-tab saves reject stale answers; offline reload recovers and explicit review preserves the newer server answer", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await homeworkDatabase(),
    { db, call } = fixture,
    run = databaseQueue(fixture);
  const context = await browser.newContext(),
    a = await context.newPage(),
    b = await context.newPage();
  try {
    const hid = await run(admin, () =>
      call(
        "create_homework",
        [
          JSON.stringify({
            title: "Browser integrity",
            dueAt: "2026-12-01T12:00:00Z",
            students: [student],
            sections: [{ title: "Math", count: 10, filters: {} }],
          }),
        ],
        ["jsonb"],
      ),
    );
    await run(admin, () =>
      db.exec(
        "reset role;update public.profiles set display_name='Disposable Learner',onboarding_completed=true",
      ),
    );
    await loginDatabase(a, student, "student", db, run);
    await loginDatabase(b, student, "student", db, run, true);
    await a.goto("/homework");
    await a
      .getByRole("button", { name: "Start homework", exact: true })
      .click();
    await expect(a.getByRole("radio").first()).toBeVisible();
    const url = a.url();
    await b.goto(url);
    await expect(b.getByRole("radio").first()).toBeVisible();
    await a.getByRole("radio").nth(1).check();
    await expect(a.getByRole("status")).toHaveText("All changes saved");
    await b.getByRole("radio").nth(2).check();
    await expect(b.getByRole("status")).toHaveText("Save failed");
    await expect(
      b.getByRole("region", { name: "Answer recovery" }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Reload saved answers", exact: true })
      .click();
    await expect(b.getByRole("radio").nth(1)).toBeChecked();
    await expect(
      b.getByRole("button", { name: "Use recovered answers" }),
    ).toBeEnabled();
    await b.getByRole("button", { name: "Keep saved answers" }).click();
    await expect(b.getByRole("status")).toHaveText("All changes saved");
    let offline = true;
    await b.route("**/rpc/save_practice_changes", (r) =>
      offline
        ? r.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Offline fixture" }),
          })
        : r.fallback(),
    );
    await b.getByRole("button", { name: "Next", exact: true }).click();
    await b.getByRole("radio").nth(2).check();
    await expect(b.getByRole("status")).toHaveText("Save failed");
    await b.reload();
    await expect(b.getByRole("status")).toHaveText("Save failed");
    await expect(b.getByRole("radio").nth(2)).toBeChecked();
    offline = false;
    await b.getByRole("button", { name: "Retry saving" }).click();
    await expect(b.getByRole("status")).toHaveText("All changes saved");
    await b.reload();
    await expect(b.getByRole("radio").nth(2)).toBeChecked();
    const saved = await run(student, async () => {
      const row = (await call("homework_directory")).find((r) => r.id === hid);
      return (
        await db.query(
          "select selected_answer from public.book_practice_items where session_id=$1 order by position",
          [row.session_id],
        )
      ).rows;
    });
    expect(saved[0].selected_answer).toBe(1);
    expect(saved[1].selected_answer).toBe(2);
  } finally {
    await context.close();
    await db.close();
  }
});
