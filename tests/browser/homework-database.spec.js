import { test, expect } from "@playwright/test";
import { homeworkDatabase } from "../helpers/homework-database.js";
import { admin, student, other } from "../helpers/database.js";
import { databaseQueue, loginDatabase } from "./helpers/homework-database.js";

test("local PostgreSQL browser workflow creates, delivers, edits 10→20, changes recipients and preserves progress", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await homeworkDatabase(),
    { db, call } = fixture,
    run = databaseQueue(fixture);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const [a, s, b] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await run(admin, () =>
      db.exec(
        "reset role;update public.profiles set onboarding_completed=true,display_name=case when role='admin' then 'Disposable Admin' else case when id='f1000000-0000-0000-0000-000000000002' then 'Student A' else 'Student B' end end",
      ),
    );
    await loginDatabase(a, admin, "admin", db, run);
    await loginDatabase(s, student, "student", db, run);
    await loginDatabase(b, other, "student", db, run);
    await a.goto("/admin/homework");
    await a.getByRole("button", { name: "New homework", exact: true }).click();
    await a.getByLabel("Homework title").fill("Database browser disposable");
    await a.getByLabel("Due date and time").fill("2026-12-01T18:00");
    await a.getByLabel("Student A", { exact: true }).check();
    await a.getByLabel("Section title").fill("Math");
    await a.getByLabel("Question count", { exact: true }).fill("10");
    await a
      .getByRole("button", { name: "Create and assign homework", exact: true })
      .click();
    await expect(
      a.getByRole("cell", { name: "Database browser disposable", exact: true }),
    ).toBeVisible();
    await s.goto("/homework");
    await expect(
      s.getByRole("heading", { name: "Database browser disposable" }),
    ).toBeVisible();
    await s
      .getByRole("button", { name: "Start homework", exact: true })
      .click();
    await expect(
      s.getByRole("button", { name: "Question 1 of 10", exact: true }),
    ).toBeVisible();
    await s.getByRole("radio").nth(1).check();
    await expect(
      s.getByText("All changes saved", { exact: true }),
    ).toBeVisible();
    await s.reload();
    await expect(s.getByRole("radio").nth(1)).toBeChecked();
    await a.getByRole("button", { name: "Edit", exact: true }).click();
    const dialog = a.getByRole("dialog", { name: "Edit one-time homework" });
    // Retain all ten chosen questions and add ten from the real database picker.
    await expect(dialog.locator(".question-picker .item-list")).toBeVisible();
    for (let i = 0; i < 10; i++)
      await dialog
        .locator(".question-picker input:not(:checked)")
        .first()
        .check();
    await dialog
      .getByRole("button", { name: "Save homework", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    expect(
      await run(
        admin,
        async () =>
          (
            await call(
              "homework_edit_data",
              [(await call("homework_directory"))[0].id],
              ["uuid"],
            )
          ).data.sections[0].count,
      ),
    ).toBe(20);
    await s.reload();
    await expect(
      s.getByRole("button", { name: /Question \d+ of 20/ }),
    ).toBeVisible();
    await expect(s.getByRole("radio").nth(1)).toBeChecked();
    await a.getByRole("button", { name: "Edit", exact: true }).click();
    await dialog.getByLabel("Student B", { exact: true }).check();
    await dialog
      .getByRole("button", { name: "Save homework", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await b.goto("/homework");
    await expect(
      b.getByRole("heading", { name: "Database browser disposable" }),
    ).toBeVisible();
    await b
      .getByRole("button", { name: "Start homework", exact: true })
      .click();
    await expect(b).toHaveURL(/\/practice\//);
    const withdrawn = b.url();
    await a.getByRole("button", { name: "Edit", exact: true }).first().click();
    await dialog.getByLabel("Student B", { exact: true }).uncheck();
    await dialog
      .getByRole("button", { name: "Save homework", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await b.goto("/homework");
    await expect(
      b.getByRole("heading", { name: "Database browser disposable" }),
    ).toHaveCount(0);
    await b.goto(withdrawn);
    await expect(b.getByRole("alert")).toContainText(
      "Practice is unavailable.",
    );
    await a.reload();
    await expect(
      a.getByRole("cell", { name: "In Progress", exact: true }),
    ).toBeVisible();
    await expect(
      a.getByRole("cell", { name: "1 / 20", exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await db.close();
  }
});

test("local PostgreSQL browser recurring occurrence appears, saves, completes and reports to admin", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const fixture = await homeworkDatabase(),
    { db } = fixture,
    run = databaseQueue(fixture);
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const [a, s] = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    await run(admin, () =>
      db.exec(
        "reset role;update public.profiles set onboarding_completed=true,display_name=case when role='admin' then 'Disposable Admin' else 'Student A' end",
      ),
    );
    await loginDatabase(a, admin, "admin", db, run);
    await loginDatabase(s, student, "student", db, run);
    await a.goto("/admin/homework");
    await a.getByRole("button", { name: "New homework", exact: true }).click();
    await a.getByLabel("Homework type").selectOption("daily");
    await a.getByLabel("Homework title").fill("Database recurring disposable");
    await a.getByLabel("Search students").fill("Student A");
    await a.getByLabel("Student A", { exact: true }).first().check();
    await a.getByLabel("Questions per day").fill("2");
    await a
      .getByRole("button", { name: "Create and assign homework", exact: true })
      .click();
    await expect(
      a.getByRole("cell", {
        name: "Database recurring disposable",
        exact: true,
      }),
    ).toBeVisible();
    await s.goto("/homework");
    await expect(
      s.getByRole("heading", { name: "Database recurring disposable" }),
    ).toBeVisible();
    await s.getByRole("button", { name: "Start", exact: true }).click();
    await expect(
      s.getByRole("button", { name: "Question 1 of 2", exact: true }),
    ).toBeVisible();
    await s.getByRole("radio").nth(1).check();
    await expect(s.getByRole("status")).toHaveText("All changes saved");
    await s.reload();
    await expect(s.getByRole("radio").nth(1)).toBeChecked();
    await s.getByRole("button", { name: "Next", exact: true }).click();
    await s.getByRole("radio").nth(1).check();
    await expect(s.getByRole("status")).toHaveText("All changes saved");
    s.on("dialog", (dialog) => dialog.accept());
    await s
      .getByRole("button", { name: "Submit homework", exact: true })
      .click();
    await expect(
      s.getByRole("region", { name: "Practice results" }),
    ).toBeVisible();
    await s.goto("/homework");
    await expect(
      s.getByText("2 / 2 questions · Completed", { exact: true }),
    ).toBeVisible();
    await a.reload();
    await a.getByRole("button", { name: "View", exact: true }).click();
    await a.getByRole("tab", { name: "Today", exact: true }).click();
    await expect(
      a.getByRole("cell", { name: "Completed", exact: true }),
    ).toBeVisible();
    await expect(
      a.getByRole("cell", { name: "2 / 2", exact: true }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
    await db.close();
  }
});
