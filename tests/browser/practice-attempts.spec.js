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
  await expect(page.locator(".answer-choice.incorrect-choice")).toHaveCount(1);
  await expect(page.locator(".answer-choice.incorrect-choice")).toHaveCSS(
    "background-color",
    "rgb(255, 245, 245)",
  );
  await expect(page.locator(".answer-choice.correct-choice")).toHaveCount(0);
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
  await expect(page.locator(".answer-choice.correct-choice")).toHaveCount(1);
  await expect(page.locator(".answer-choice.incorrect-choice")).toHaveCount(1);
  expect(store.checks).toHaveLength(2);
  await page.reload();
  await expect(page.locator(".answer-choice.correct-choice")).toHaveCount(1);
  await expect(page.getByText(/Attempt 1: A/)).toBeVisible();
  await expect(page.locator(".answer-choice.correct-choice")).toHaveCSS(
    "background-color",
    "rgb(240, 253, 244)",
  );
  await page
    .getByRole("button", { name: "Question 1 of 3", exact: true })
    .click();
  await expect(page.locator(".question-number.is-mixed")).toHaveCount(1);
  await expect(
    page.getByText("Solved after mistake", { exact: true }),
  ).toBeVisible();
});
test("Progress and admin student detail render server summaries and bounded question lists", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  store.analytics = {
    practiced: 12,
    solved: 9,
    unresolved: 3,
    first_accuracy: 50,
    eventual_accuracy: 75,
    average_attempts: 2.3,
    average_seconds: 42,
    median_seconds: 33,
    areas: [
      {
        level: "domain",
        label: "Algebra",
        samples: 12,
        first_accuracy: 50,
        eventual_accuracy: 75,
        attempts: 2.3,
        seconds: 42,
        review_marks: 4,
      },
    ],
    activity: [],
  };
  store.analytics.areas.push(
    {
      level: "domain",
      label: "Geometry and Trigonometry",
      samples: 15,
      first_accuracy: 90,
      eventual_accuracy: 100,
      attempts: 1.1,
      seconds: 30,
      review_marks: 0,
    },
    {
      level: "skill",
      label: "Linear equations",
      samples: 12,
      first_accuracy: 50,
      eventual_accuracy: 75,
      attempts: 2.3,
      seconds: 42,
      review_marks: 4,
    },
    {
      level: "skill",
      label: "Circle properties",
      samples: 15,
      first_accuracy: 90,
      eventual_accuracy: 100,
      attempts: 1.1,
      seconds: 30,
      review_marks: 0,
    },
  );
  store.questionAnalytics = {
    total: 26,
    rows: [
      {
        id: "item-one",
        session_id: "session",
        question: "A difficult question",
        source: "SAT Book",
        domain: "Algebra",
        skill: "Equations",
        active_seconds: 120,
        attempts: 3,
        solved_at: null,
      },
    ],
  };
  await page.goto("/admin/students/d0000000-0000-0000-0000-000000000010");
  await expect(
    page.getByRole("heading", { name: "Practice learning analytics" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Hardest areas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "A difficult question" }),
  ).toHaveAttribute("href", "/admin/sessions/session#item-one");
  const hardest = page
    .getByRole("heading", { name: "Hardest areas", exact: true })
    .locator("..");
  const strongest = page
    .getByRole("heading", { name: "Strongest areas", exact: true })
    .locator("..");
  await expect(hardest.getByText("Algebra", { exact: true })).toBeVisible();
  await expect(
    strongest.getByText("Geometry and Trigonometry", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Break down practice by").selectOption("skill");
  await expect(
    hardest.getByText("Linear equations", { exact: true }),
  ).toBeVisible();
  await expect(
    strongest.getByText("Circle properties", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Show questions").selectOption("retried");
  await expect
    .poll(
      () =>
        store.requests
          .filter((r) => r.path.endsWith("practice_question_analytics"))
          .at(-1)?.body.p_sort,
    )
    .toBe("retried");
  await page
    .getByRole("button", { name: "Next questions", exact: true })
    .click();
  await expect
    .poll(
      () =>
        store.requests
          .filter((r) => r.path.endsWith("practice_question_analytics"))
          .at(-1)?.body.p_page,
    )
    .toBe(1);
});
test("bank timing, eliminated choices and marks persist through resume and checks", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await page.clock.install();
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Start Practice Session" }).click();
  await expect(
    page.getByRole("button", { name: "Question 1 of 3", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.focus();
    document.hasFocus = () => true;
  });
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Eliminate choice C", exact: true })
    .click();
  await page.clock.runFor(18000);
  await expect.poll(() => store.session.elapsed_seconds).toBeGreaterThan(0);
  await page.getByRole("radio", { name: "A 2", exact: true }).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".answer-choice.incorrect-choice")).toHaveCount(1);
  expect(store.checks).toHaveLength(1);
  expect(store.items[0].active_seconds).toBeGreaterThan(0);
  const seconds = store.items[0].active_seconds;
  await page.reload();
  await expect(page.locator(".answer-choice.incorrect-choice")).toHaveCount(1);
  expect(store.items[0].eliminated).toContain(2);
  expect(store.items[0].marked).toBe(true);
  expect(store.items[0].active_seconds).toBeGreaterThanOrEqual(seconds);
  await page
    .getByRole("button", { name: "Question 1 of 3", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Question 1,.*marked/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Difficulty", exact: true }),
  ).toHaveCount(0);
});

test("difficulty buttons select a union, toggle off and persist after reload", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.questions.forEach((q, i) => {
    q.difficulty = ["easy", "medium", "hard"][i];
  });
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "2 questions match", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Easy", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Medium", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "2 questions match", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "1 questions match", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "3 questions match", exact: true }),
  ).toBeVisible();
});
