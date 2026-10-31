import { test, expect } from "@playwright/test";
import { contentFixture } from "./helpers/content.js";
test("missing Battle RPC stops automatic retries, retains seat and offers an explicit retry", async ({
  page,
}) => {
  await contentFixture(page);
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "satchi-battle",
      "f1000000-0000-0000-0000-000000000099",
    ),
  );
  let calls = 0;
  await page.route("**/rest/v1/rpc/battle_action", (route) => {
    calls++;
    return route.fulfill({
      status: 404,
      json: {
        code: "PGRST202",
        message:
          "Could not find the function public.battle_action(p_action,p_data) in the schema cache",
      },
    });
  });
  await page.goto("/battles");
  await expect(page.getByRole("alert")).toContainText(
    "database update (PGRST202)",
  );
  await expect(page.getByText(/Connection interrupted/)).toHaveCount(0);
  const initialCalls = calls;
  await page.waitForTimeout(2300);
  expect(calls).toBe(initialCalls);
  await page
    .getByRole("button", { name: "Retry Battles", exact: true })
    .click();
  await expect.poll(() => calls).toBe(initialCalls + 1);
  expect(
    await page.evaluate(() => sessionStorage.getItem("satchi-battle")),
  ).toContain("000000000099");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("PGRST202");
});
test("Progress identifies missing RPC and Books identifies a progress query timeout", async ({
  page,
}) => {
  await contentFixture(page);
  await page.route("**/rest/v1/rpc/progress_activity", (route) =>
    route.fulfill({
      status: 404,
      json: { code: "PGRST202", message: "missing function" },
    }),
  );
  await page.route("**/rest/v1/rpc/learning_metrics", (route) =>
    route.fulfill({
      json: {
        attempted: 0,
        first_correct: 0,
        first_known: 0,
        first_incorrect: 0,
        study_seconds: 0,
        homework_completed: 0,
        homework_total: 0,
        vocabulary_known: 0,
        breakdowns: [],
        attention: [],
        groups: [],
      },
    }),
  );
  await page.goto("/progress");
  await expect(
    page
      .getByRole("region", { name: "First-attempt activity" })
      .getByRole("alert"),
  ).toContainText("progress_activity requires a database update");
  await page.route("**/rest/v1/books?*", (route) =>
    route.fulfill({
      json: [
        {
          id: "f1000000-0000-0000-0000-000000000090",
          title: "Original book",
          book_topics: [],
        },
      ],
      headers: { "content-range": "0-0/1" },
    }),
  );
  await page.route("**/rest/v1/rpc/learning_book_progress", (route) =>
    route.fulfill({
      status: 500,
      json: {
        code: "57014",
        message: "canceling statement due to statement timeout",
      },
    }),
  );
  await page.goto("/books");
  await expect(page.getByRole("alert")).toContainText(
    "Book progress exceeded the server query limit (57014)",
  );
});
