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
  const row = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "Daily Grammar", exact: true }),
  });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Homework title").fill("Daily Grammar Updated");
  await page.getByLabel("Questions per day").fill("3");
  await page.getByRole("button", { name: "Save recurring homework" }).click();
  const updated = page.getByRole("row").filter({
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
function dailyRow(overrides = {}) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return {
    template_id: "daily-one",
    student_id: student,
    study_date: today,
    timezone: "Asia/Tashkent",
    is_today: true,
    title: "Daily Grammar Practice",
    instructions: "Finish all assigned questions.",
    question_count: 3,
    answered: 0,
    correct: 0,
    active_seconds: 0,
    allow_late: true,
    status: "Not started",
    completed_at: null,
    ...overrides,
  };
}
test("student starts today, saves answers and review marks, resumes and completes homework without bank retries", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.dailyRows = [dailyRow()];
  await page.goto("/homework");
  await expect(page.getByText(/Due by midnight/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "local-imports/design-daily-student-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "local-imports/design-daily-student-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "A 2", exact: true }).check();
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Back to practice", exact: true })
    .click();
  await expect(page.getByText("2 / 3 questions · In progress")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Submit homework", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Practice results" }),
  ).toBeVisible();
  await page.goto("/homework");
  await expect(page.getByText("3 / 3 questions · Completed")).toBeVisible();
  expect(store.items[0].marked).toBe(true);
  expect(store.checks || []).toHaveLength(0);
});
test("student missed day allows completed late and disabled late policy prevents opening", async ({
  page,
}) => {
  const store = await learningFixture(page);
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - 1);
  store.dailyRows = [
    dailyRow({
      study_date: day.toISOString().slice(0, 10),
      is_today: false,
      status: "Missed",
    }),
    dailyRow({
      template_id: "locked",
      title: "Locked Daily Math",
      study_date: day.toISOString().slice(0, 10),
      is_today: false,
      status: "Missed",
      allow_late: false,
    }),
  ];
  await page.goto("/homework");
  const overdue = page
    .getByRole("heading", { name: "Overdue / Missed", exact: true })
    .locator("..");
  await expect(overdue.getByText(/Missed/).first()).toBeVisible();
  await expect(
    overdue.getByRole("button", { name: "Start", exact: true }).last(),
  ).toBeDisabled();
  await overdue
    .getByRole("button", { name: "Start", exact: true })
    .first()
    .click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("radio", { name: "B 4", exact: true }).check();
    await expect(page.getByRole("status")).toHaveText("All changes saved");
    if (i < 2)
      await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Submit homework", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Practice results" }),
  ).toBeVisible();
  await page.goto("/homework");
  await page.getByText("Daily homework history", { exact: true }).click();
  await expect(
    page.getByText("3 / 3 questions · Completed late"),
  ).toBeVisible();
});
test("dashboard uses daily counts and shows completion from saved activity", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.dailyReport = {
    today: [{ template_id: "one", assigned: 2, completed: 1 }],
    history: [],
    students: [],
    student_total: 0,
  };
  await page.goto("/dashboard");
  await expect(
    page.getByText("2 assignments today · 1 completed · 1 remaining"),
  ).toBeVisible();
  store.dailyReport.today[0].completed = 2;
  await page.reload();
  await expect(
    page.getByText("Today's homework complete", { exact: true }),
  ).toBeVisible();
});
test("admin student daily analytics shows server metrics and historical missed work", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  store.dailyStats = {
    assigned: 10,
    completed: 8,
    completion_rate: 80,
    accuracy: 90,
    average_seconds: 840,
    current_streak: 2,
    longest_streak: 5,
    missed_days: 2,
  };
  store.dailyRows = [
    dailyRow({
      is_today: false,
      study_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      status: "Missed",
    }),
  ];
  await page.goto(`/admin/students/${student}`);
  const panel = page
    .getByRole("heading", { name: "Daily Homework performance" })
    .locator("..");
  await expect(panel.getByText("80%", { exact: true })).toBeVisible();
  await expect(panel.getByText("90%", { exact: true })).toBeVisible();
  await expect(panel.getByText("5 days", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("cell", { name: "Missed", exact: true }),
  ).toBeVisible();
});
test("daily deadline refresh derives missed state while Homework stays open", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.dailyRows = [dailyRow()];
  await page.clock.install();
  await page.goto("/homework");
  await expect(page.getByText(/3 questions · Not started/)).toBeVisible();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  store.dailyRows = [
    dailyRow({ is_today: false, study_date: yesterday, status: "Missed" }),
  ];
  await page.clock.runFor(61000);
  await expect(page.getByText("No daily homework today.")).toBeVisible();
  await expect(page.getByText("3 questions · Missed")).toBeVisible();
});
test("daily homework desktop and mobile remain usable without document overflow", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  const day = dailyRow().study_date;
  store.dailyTemplates = [
    {
      id: "daily-one",
      timezone: "Asia/Tashkent",
      state: "active",
      all_students: true,
      students: [],
      groups: [],
      pool_count: 50,
      revision: 1,
      valid_from: day,
      data: {
        title: "Daily Grammar Practice",
        instructions: "Build a consistent grammar routine.",
        startDate: day,
        count: 10,
        timezone: "Asia/Tashkent",
        filters: {
          section: "Reading & Writing",
          domain: "Standard English Conventions",
        },
        allowRepeat: false,
      },
    },
  ];
  store.dailyRows = [
    dailyRow({
      display_name: "Fixture Learner",
      answered: 2,
      status: "In progress",
    }),
  ];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/homework");
  await page.getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "In progress", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "local-imports/design-daily-admin-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "local-imports/design-daily-admin-mobile.png",
    fullPage: true,
  });
});
test("timed incomplete results remain readable after midnight when late work is disabled", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.dailyRows = [dailyRow()];
  await page.goto("/homework");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Question 1 of 3", exact: true }),
  ).toBeVisible();
  store.session.submitted_at = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  store.dailyRows = [
    dailyRow({
      is_today: false,
      study_date: yesterday,
      status: "Missed",
      session_id: store.session.id,
      session_submitted_at: store.session.submitted_at,
      allow_late: false,
    }),
  ];
  await page.goto("/homework");
  await expect(
    page.getByRole("button", { name: "View results", exact: true }),
  ).toBeEnabled();
  const before = store.requests.filter((r) =>
    r.path.endsWith("start_daily_homework"),
  ).length;
  await page.getByRole("button", { name: "View results", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Practice results" }),
  ).toBeVisible();
  expect(
    store.requests.filter((r) => r.path.endsWith("start_daily_homework"))
      .length,
  ).toBe(before);
});
