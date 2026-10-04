import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
const student = "d0000000-0000-0000-0000-000000000010";
async function create(page, audience) {
  await page.getByRole("button", { name: "New homework", exact: true }).click();
  await page.getByLabel("Homework type").selectOption("daily");
  await page.getByLabel("Homework title").fill("Daily Grammar");
  await page.getByLabel("Start date", { exact: true }).fill("2026-10-04");
  await page.getByLabel("Questions per day").fill("2");
  await page.getByLabel(audience, { exact: true }).check();
  await page
    .getByRole("button", { name: "Create and assign homework" })
    .click();
  await expect(
    page.getByRole("cell", { name: "Daily Grammar", exact: true }),
  ).toBeVisible();
}
test("admin creates recurring group homework, edits, pauses, resumes, views and archives", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  store.groups = [{ id: "group-1", name: "Morning group" }];
  await page.goto("/admin/homework");
  await create(page, "Morning group");
  expect(store.dailyTemplates[0].data.groups).toEqual(["group-1"]);
  expect(store.dailyTemplates[0].data.selection).toBe("new");
  const row = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", { name: "Daily Grammar", exact: true }),
    });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Homework title").fill("Daily Grammar Updated");
  await page.getByLabel("Questions per day").fill("3");
  await page.getByRole("button", { name: "Save recurring homework" }).click();
  const updated = page
    .getByRole("row")
    .filter({
      has: page.getByRole("cell", {
        name: "Daily Grammar Updated",
        exact: true,
      }),
    });
  await updated.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    updated.getByRole("cell", { name: "paused", exact: true }),
  ).toBeVisible();
  await updated.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(
    updated.getByRole("cell", { name: "active", exact: true }),
  ).toBeVisible();
  await updated.getByRole("button", { name: "View", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Daily Grammar Updated", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(
    page.getByText("No scheduled work in this period."),
  ).toBeVisible();
  await page.getByRole("tab", { name: "History", exact: true }).click();
  await expect(page.getByLabel("History ending")).toBeVisible();
  await page.getByRole("tab", { name: "Students", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next students", exact: true }),
  ).toBeDisabled();
  await updated.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm archive", exact: true })
    .click();
  await expect(updated).toHaveCount(0);
  await page.getByLabel("Show archived").check();
  await expect(
    updated.getByRole("cell", { name: "archived", exact: true }),
  ).toBeVisible();
});
test("admin assigns recurring homework to an individual student", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  await page.goto("/admin/homework");
  await create(page, "Fixture Learner");
  expect(store.dailyTemplates[0].data.students).toEqual([student]);
  expect(store.dailyTemplates[0].data.groups).toEqual([]);
});
