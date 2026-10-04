import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
test("bank domain/skill union filters update immediately, preserve choices, and send timed volume payload", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.questions[0].domain = "Algebra";
  store.questions[0].skill = "Linear equations";
  store.questions[1].domain = "Algebra";
  store.questions[1].skill = "Systems";
  store.questions[2].domain = "Advanced Math";
  store.questions[2].skill = "Quadratics";
  for (const q of store.questions) q.difficulty = "hard";
  await page.goto("/question-bank");
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Math", exact: true }).click();
  await page.getByRole("button", { name: "Expand Algebra skills" }).click();
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Linear equations" }).check();
  await expect(
    page.getByRole("heading", { name: "1 questions match" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /^Advanced Math/ }).check();
  await expect(
    page.getByRole("heading", { name: "2 questions match" }),
  ).toBeVisible();
  await page.getByLabel("Difficulty", { exact: true }).selectOption("easy");
  await expect(
    page.getByRole("button", { name: "Start practice" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "No matching questions" }),
  ).toBeVisible();
  await page.getByLabel("Difficulty", { exact: true }).selectOption("hard");
  await page.getByLabel("Question count", { exact: true }).selectOption("all");
  await page.getByLabel("Mode", { exact: true }).selectOption("true");
  await page.reload();
  await expect(page.getByLabel("Question count", { exact: true })).toHaveValue(
    "all",
  );
  await expect(page.getByLabel("Mode", { exact: true })).toHaveValue("true");
  await expect(
    page.getByRole("heading", { name: "2 questions match" }),
  ).toBeVisible();
  const request = page.waitForRequest((r) =>
    r.url().endsWith("/rpc/start_bank_practice"),
  );
  await page.getByRole("button", { name: "Start practice" }).click();
  const payload = (await request).postDataJSON();
  expect(payload.p_count).toBe(2);
  expect(payload.p_timed).toBe(true);
  expect(payload.p_filters.domains).toEqual(["Advanced Math"]);
  expect(payload.p_filters.skills).toEqual([
    { domain: "Algebra", skill: "Linear equations" },
  ]);
});
test("vocabulary book publishing is explicit, review-blocked, reversible and set rows have local names", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  store.vocabBooks[0].published = false;
  store.vocabBooks[0].pending = 1;
  store.sets[0].title = "Vocabulary Source · Set 1";
  await page.goto("/admin/vocabulary/vbook");
  await expect(
    page.getByRole("heading", { name: "Vocabulary Source", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Set 1", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open set" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Publish Book", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
  store.vocabBooks[0].pending = 0;
  await page.reload();
  await page.getByRole("button", { name: "Publish Book", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Unpublish", exact: true }),
  ).toBeVisible();
  expect(store.vocabBooks[0].published).toBe(true);
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();
  expect(store.vocabBooks[0].published).toBe(false);
  await page.getByRole("link", { name: "Set 1", exact: true }).click();
  await expect(page).toHaveURL(/\/sets\/vset$/);
});
test("student vocabulary catalog hides drafts and question bank fits laptop and mobile with reduced motion", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.vocabBooks[0].published = false;
  await page.goto("/vocabulary");
  await expect(
    page.getByRole("link", { name: "Vocabulary Source" }),
  ).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/question-bank");
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await page.screenshot({
    path: "local-imports/design-bank-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Expand Algebra skills" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Collapse Algebra skills" }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "local-imports/design-bank-mobile.png",
    fullPage: true,
  });
});
