import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";

test("recurring Edit saves title, instructions and recipient changes and reloads saved revision", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  const id = "f2000000-0000-0000-0000-000000000001";
  const data = {
    title: "Recurring before",
    instructions: "Original instructions",
    startDate: "2026-10-07",
    timezone: "Asia/Tashkent",
    count: 2,
    selection: "new",
    filters: {},
    students: ["d0000000-0000-0000-0000-000000000010"],
    groups: [],
    allowLate: true,
    allowRepeat: false,
  };
  store.dailyTemplates = [
    {
      id,
      data,
      timezone: data.timezone,
      state: "active",
      students: data.students,
      groups: [],
      all_students: false,
      revision: 1,
      valid_from: data.startDate,
      pool_count: 3,
    },
  ];
  await page.goto("/admin/homework");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Edit recurring homework assignment",
  });
  await expect(dialog.getByLabel("Homework title")).toHaveValue(data.title);
  await dialog.getByLabel("Homework title").fill("Recurring saved");
  await dialog.getByLabel("Instructions").fill("Saved instructions");
  await dialog.getByLabel("All active students").check();
  await dialog
    .getByRole("button", { name: "Save recurring homework", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(store.dailyTemplates[0].data.allStudents).toBe(true);
  expect(store.dailyTemplates[0].data.instructions).toBe("Saved instructions");
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Recurring saved", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog.getByLabel("Homework title")).toHaveValue(
    "Recurring saved",
  );
  await expect(dialog.getByLabel("All active students")).toBeChecked();
});

test("specific recurring pools survive filter browsing and save the entered daily count", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  const questionIds = store.questions.map((q) => q.id);
  const data = {
    title: "Specific pool before",
    startDate: "2026-10-07",
    timezone: "Asia/Tashkent",
    students: ["d0000000-0000-0000-0000-000000000010"],
    groups: [],
    count: 2,
    selection: "new",
    filters: {},
    questionIds,
  };
  store.dailyTemplates = [
    {
      id: "f2000000-0000-0000-0000-000000000002",
      data,
      state: "paused",
      students: data.students,
      groups: [],
      revision: 1,
      pool_count: 3,
    },
  ];
  await page.goto("/admin/homework");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Question selection")).toHaveValue("specific");
  await expect(dialog.getByLabel("Questions per day")).toHaveValue("2");
  await dialog
    .getByRole("combobox", { name: "Difficulty", exact: true })
    .selectOption("hard");
  await expect(dialog.getByText(/3 selected ·/)).toBeVisible();
  const save = dialog.getByRole("button", {
    name: "Save recurring homework",
    exact: true,
  });
  await expect(save).toBeEnabled();
  await dialog.getByLabel("Homework title").fill("Specific pool saved");
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(store.dailyTemplates[0].data.questionIds).toEqual(questionIds);
  expect(store.dailyTemplates[0].data.count).toBe(2);
  expect(store.dailyTemplates[0].data.filters).toEqual({});
  expect(store.dailyTemplates[0].data.students).toEqual(data.students);
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(dialog.getByLabel("Homework title")).toHaveValue(
    "Specific pool saved",
  );
  await expect(dialog.getByLabel("Questions per day")).toHaveValue("2");
  await expect(dialog.getByText(/3 selected ·/)).toBeVisible();
});

test("recurring Save explains an insufficient specific pool and enables after correcting the daily count", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  const data = {
    title: "Small pool",
    startDate: "2026-10-07",
    timezone: "Asia/Tashkent",
    allStudents: true,
    groups: [],
    students: [],
    count: 2,
    selection: "new",
    filters: {},
    questionIds: [store.questions[0].id],
  };
  store.dailyTemplates = [
    {
      id: "f2000000-0000-0000-0000-000000000003",
      data,
      state: "paused",
      students: [],
      groups: [],
      all_students: true,
      revision: 1,
    },
  ];
  await page.goto("/admin/homework");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog"),
    save = dialog.getByRole("button", {
      name: "Save recurring homework",
      exact: true,
    });
  await expect(save).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText(
    "Select at least 2 questions for the daily pool (1 selected)",
  );
  await dialog.getByLabel("Questions per day").fill("1");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog).toHaveCount(0);
  expect(store.dailyTemplates[0].data.count).toBe(1);
});
