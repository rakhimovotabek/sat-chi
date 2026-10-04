import { test, expect } from "@playwright/test";
import { settingsFixture } from "./helpers/settings.js";
test("student account settings persist through reload and update the study-plan budget", async ({
  page,
}) => {
  const store = await settingsFixture(page);
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: false })).toHaveCount(0);
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page.getByLabel("Display name").fill("Focused Learner");
  await page.getByLabel("Daily study goal (minutes)").fill("45");
  await page.getByRole("button", { name: "Save account settings" }).click();
  await expect(page.getByText("Account settings saved.")).toBeVisible();
  expect(store.dailyMinutes).toBe(45);
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Focused Learner");
  await expect(page.getByLabel("Daily study goal (minutes)")).toHaveValue("45");
  await page.goto("/study-plan");
  await expect(
    page.getByText("45 min per study day", { exact: false }),
  ).toBeVisible();
});
test("saved vocabulary preferences survive reload and configure actual learning controls", async ({
  page,
}) => {
  await settingsFixture(page);
  await page.goto("/settings");
  await page.getByLabel("Default vocabulary test size").selectOption("50");
  await page.getByLabel("Default vocabulary test type").selectOption("typed");
  await page.getByLabel("Shuffle vocabulary study words").check();
  await page
    .getByRole("button", { name: "Save vocabulary preferences" })
    .click();
  await expect(page.getByText("Vocabulary preferences saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Default vocabulary test size")).toHaveValue(
    "50",
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.goto("/settings");
  await expect(page.getByLabel("Default vocabulary test size")).toHaveValue(
    "50",
  );
  await page.goto("/vocabulary/vbook/sets/vset");
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await expect(page.getByLabel("Shuffle", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Question count", exact: true }),
  ).toHaveValue("50");
  await expect(page.getByLabel("Question types")).toHaveValue("typed");
});
test("admin settings is real and mobile settings retain one logout action", async ({
  page,
}) => {
  await settingsFixture(page, "admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/settings");
  await expect(
    page.getByRole("heading", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Coming soon", { exact: false })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open Content Review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Log out", exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
