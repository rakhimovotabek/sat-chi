import { test, expect } from "@playwright/test";
import { openReviewDatabase } from "../helpers/open-review-database.js";
import { admin, student } from "../helpers/database.js";
import { databaseQueue, loginDatabase } from "./helpers/homework-database.js";

test("SQL-backed open review saves all three decisions, rejects stale reviews and updates student results after reload", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await openReviewDatabase(),
    { db, session, item } = fixture;
  const run = databaseQueue(fixture);
  const adminContext = await browser.newContext(),
    studentContext = await browser.newContext();
  const a = await adminContext.newPage(),
    b = await adminContext.newPage(),
    s = await studentContext.newPage();
  try {
    await loginDatabase(a, admin, "admin", db, run);
    await loginDatabase(b, admin, "admin", db, run, true);
    await a.goto(`/admin/sessions/${session}`);
    await b.goto(`/admin/sessions/${session}`);
    // Both tabs must load revision zero before the first administrator decides.
    await expect(
      b.getByText("Review status: Automatic grading", { exact: true }),
    ).toBeVisible();
    const review = a.getByRole("region", { name: "Open response review" });
    await expect(
      a.getByText("Student answer: 9", { exact: true }),
    ).toBeVisible();
    await expect(
      review.getByText("Official answer: 8.6 or 43/5", { exact: true }),
    ).toBeVisible();
    await expect(
      review.getByText("Review status: Automatic grading", { exact: true }),
    ).toBeVisible();
    let fail = true;
    await a.route("**/rpc/review_open_response", (route) =>
      fail
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "Review connection unavailable" }),
          })
        : route.fallback(),
    );
    await review
      .getByRole("button", { name: "Mark correct", exact: true })
      .click();
    await expect(review.getByRole("alert")).toContainText(
      "Review connection unavailable",
    );
    expect(
      await run(
        admin,
        async () =>
          (
            await db.query(
              "select correct from public.book_practice_items where id=$1",
              [item],
            )
          ).rows[0].correct,
      ),
    ).toBe(false);
    fail = false;
    await review
      .getByRole("button", { name: "Mark correct", exact: true })
      .click();
    await expect(
      review.getByText("Review status: Reviewed: Correct", { exact: true }),
    ).toBeVisible();
    await a.reload();
    await expect(
      review.getByText("Review status: Reviewed: Correct", { exact: true }),
    ).toBeVisible();
    await expect(
      a.getByText(/1 correct · 0 incorrect · 1 unanswered/),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Mark incorrect", exact: true })
      .click();
    await expect(b.getByRole("alert")).toContainText(
      "Review changed in another tab",
    );
    await b.getByRole("button", { name: "Reload saved review" }).click();
    await expect(
      b.getByText("Review status: Reviewed: Correct", { exact: true }),
    ).toBeVisible();
    await expect(b.getByRole("alert")).toHaveCount(0);
    await loginDatabase(s, student, "student", db, run);
    await s.goto(`/practice/${session}`);
    await expect(
      s.getByRole("region", { name: "Practice results" }),
    ).toContainText("1 / 2");
    await review
      .getByRole("button", { name: "Mark incorrect", exact: true })
      .click();
    await expect(
      review.getByText("Review status: Reviewed: Incorrect", { exact: true }),
    ).toBeVisible();
    await a.reload();
    await expect(
      review.getByText("Review status: Reviewed: Incorrect", { exact: true }),
    ).toBeVisible();
    await s.reload();
    await expect(
      s.getByRole("region", { name: "Practice results" }),
    ).toContainText("0 / 2");
    await review
      .getByRole("button", { name: "Restore automatic grading", exact: true })
      .click();
    await expect(
      review.getByText("Review status: Automatic grading", { exact: true }),
    ).toBeVisible();
    await a.reload();
    await expect(
      review.getByText("Review status: Automatic grading", { exact: true }),
    ).toBeVisible();
    await expect(
      review.getByRole("button", { name: "Restore automatic grading" }),
    ).toBeDisabled();
    await expect(
      a.getByText("Student answer: 9", { exact: true }),
    ).toBeVisible();
  } finally {
    await adminContext.close();
    await studentContext.close();
    await db.close();
  }
});

for (const inclusive of [false, true])
  test(`official numeric ranges display ${inclusive ? "inclusive" : "exclusive"} boundaries`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const fixture = await openReviewDatabase("homework", true, {
      min: 8,
      max: 9,
      inclusive,
    });
    const { db, session } = fixture,
      run = databaseQueue(fixture);
    try {
      await loginDatabase(page, admin, "admin", db, run);
      await page.goto(`/admin/sessions/${session}`);
      await expect(
        page.getByText(
          `Official answer: 8 to 9 (${inclusive ? "inclusive" : "exclusive"})`,
          { exact: true },
        ),
      ).toBeVisible();
    } finally {
      await db.close();
    }
  });
