import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
test("bank Check shows only attempted choices, retries and preserves overview/resume state", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Start Practice Session" }).click();
  await expect(
    page.getByRole("button", { name: "Submit practice" }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "A 2", exact: true }).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".incorrect-choice")).toHaveCount(1);
  await expect(page.locator(".correct-choice")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Question 1 of 3", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Question Overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Question 1,.*incorrect/ }),
  ).toHaveClass(/is-marked/);
  await page.getByRole("button", { name: /Question 3,/ }).click();
  await expect(
    page.getByRole("button", { name: "Question 3 of 3", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Question 3 of 3", exact: true })
    .click();
  await page.getByRole("button", { name: /Question 1,/ }).click();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".correct-choice")).toHaveCount(1);
  await expect(page.locator(".incorrect-choice")).toHaveCount(1);
  expect(store.checks).toHaveLength(2);
  await page.reload();
  await expect(page.locator(".correct-choice")).toHaveCount(1);
  await expect(page.getByText(/Attempt 1: A/)).toBeVisible();
});
