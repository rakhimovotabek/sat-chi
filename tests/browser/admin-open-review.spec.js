import { test, expect } from "@playwright/test";
import { homeworkDatabase } from "../helpers/homework-database.js";
import { admin, student } from "../helpers/database.js";
import { databaseQueue, loginDatabase } from "./helpers/homework-database.js";

test("SQL-backed administrator loads completed open homework and sees the saved typed answer", async ({
  page,
}) => {
  test.setTimeout(120000);
  const fixture = await homeworkDatabase(),
    { db, call } = fixture;
  const run = databaseQueue(fixture);
  try {
    const homework = await run(admin, () =>
      call(
        "create_homework",
        [
          JSON.stringify({
            title: "Disposable open review",
            dueAt: "2026-12-01T12:00:00Z",
            students: [student],
            sections: [{ title: "Math", count: 2, filters: {} }],
          }),
        ],
        ["jsonb"],
      ),
    );
    const session = await run(student, async () => {
      const row = (await call("homework_directory")).find(
        (r) => r.id === homework,
      );
      return call("start_homework", [row.assignment_id], ["uuid"]);
    });
    // Seed the explicit synthetic open question/key only inside this disposable
    // database. Mixed-question assignment creation is covered by lifecycle SQL.
    const item = await run(admin, async () => {
      await db.exec(
        "reset role;update public.profiles set onboarding_completed=true,display_name='Disposable Reviewer'",
      );
      const id = (
        await db.query(
          "select id from public.book_practice_items where session_id=$1 order by position limit 1",
          [session],
        )
      ).rows[0].id;
      await db.query(
        'update public.book_practice_items set question=question||\'{"question_type":"open","options":[],"question_text":"Enter 8.6"}\'::jsonb where id=$1',
        [id],
      );
      await db.query(
        "update public.book_practice_keys set correct_answer=null where item_id=$1",
        [id],
      );
      await db.query(
        "insert into public.book_practice_open_keys(item_id,accepted_answers,correct_answer,answer_format) values($1,'[\"8.6\"]','8.6','numeric')",
        [id],
      );
      return id;
    });
    await run(student, async () => {
      await call(
        "save_practice_changes",
        [
          session,
          JSON.stringify([
            {
              id: item,
              selected_answer: 0,
              selected_response: "8.6",
              expected_revision: 0,
            },
          ]),
        ],
        ["uuid", "jsonb"],
      );
      await call("finish_book_practice", [session], ["uuid"]);
    });
    await loginDatabase(page, admin, "admin", db, run);
    await page.goto(`/admin/sessions/${session}`);
    await expect(
      page.getByRole("heading", { name: "Completed", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Student answer: 8.6", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Submit practice" }),
    ).toHaveCount(0);
  } finally {
    await db.close();
  }
});
