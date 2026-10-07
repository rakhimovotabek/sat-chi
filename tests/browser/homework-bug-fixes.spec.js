import { test, expect } from "@playwright/test";
import {
  contentFixture,
  bookId,
  topicId,
  sessionId,
} from "./helpers/content.js";
import { learningFixture } from "./helpers/learning.js";

const json = (route, value, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(value),
  });
const openPractice = async (page) => {
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
};

for (const kind of ["book", "bank"]) {
  for (const images of [false, true]) {
    test(`${kind} ${images ? "image" : "text"} choices show bright outlines and preserve wrong/correct history`, async ({
      page,
    }) => {
      const store = await contentFixture(page);
      if (images)
        store.questions[0].option_image_urls = Array.from(
          { length: 4 },
          (_, i) => `https://example.test/choice-${i}.svg`,
        );
      await page.route("https://example.test/**", (route) =>
        route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><text x="1" y="15">x</text></svg>',
        }),
      );
      await openPractice(page);
      store.session.kind = kind;
      await page.reload();
      await page.getByRole("radio").nth(0).check();
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await expect(page.locator(".answer-choice.incorrect-choice")).toHaveCSS(
        "border-top-color",
        "rgb(239, 68, 68)",
      );
      await expect(page.locator(".answer-choice.incorrect-choice")).toHaveCSS(
        "background-color",
        "rgb(255, 245, 245)",
      );
      await page.getByRole("radio").nth(1).check();
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await expect(page.locator(".answer-choice.correct-choice")).toHaveCSS(
        "border-top-color",
        "rgb(22, 163, 74)",
      );
      await expect(page.locator(".answer-choice.correct-choice")).toHaveCSS(
        "color",
        "rgb(23, 43, 77)",
      );
      await page.reload();
      await expect(page.locator(".answer-choice.correct-choice")).toBeVisible();
      await expect(
        page.locator(".answer-choice.incorrect-choice"),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Question 1 of 3", exact: true })
        .click();
      await expect(page.locator(".question-number.is-mixed")).toHaveCount(1);
    });
  }
}

test("embedded HardBook source choices render A–D controls without inventing content", async ({
  page,
}) => {
  const store = await contentFixture(page);
  Object.assign(store.questions[0], {
    id: "217091aa-2150-544e-adb7-ff2defee53c9",
    question_type: "mcq",
    options: ["", "", "", ""],
    image_url: "https://example.test/source.svg",
    import_metadata: {
      questionImageIncludesOptions: true,
      package_question_id: "hardbook-2-by-satashkent_q_0001",
    },
  });
  await page.route("https://example.test/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="10" y="20">A B C D</text></svg>',
    }),
  );
  await openPractice(page);
  await expect(
    page.getByText("Select the matching choice from the question image."),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".answer-choice.correct-choice")).toBeVisible();
});

test("open homework response retries the failed save and survives reload", async ({
  page,
}) => {
  const store = await contentFixture(page);
  Object.assign(store.questions[0], {
    id: "fc29e510-2391-522d-abfa-178fbe9c36a2",
    question_type: "open",
    options: [],
  });
  await openPractice(page);
  store.session.kind = "homework";
  await page.reload();
  let failed = true;
  await page.route("**/rpc/save_book_practice", (route) => {
    if (failed)
      return json(route, { message: "Simulated transport failure" }, 500);
    for (const answer of route.request().postDataJSON().p_answers)
      Object.assign(
        store.items.find((i) => i.id === answer.id),
        answer,
      );
    return json(route, null);
  });
  await page.getByLabel("Your answer").fill("25");
  await expect(page.getByRole("status")).toHaveText("Save failed");
  expect(store.items[0].selected_response).toBeUndefined();
  failed = false;
  await page.getByRole("button", { name: "Retry saving" }).click();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  expect(store.items[0].selected_response).toBe("25");
  await page.reload();
  await expect(page.getByLabel("Your answer")).toHaveValue("25");
});

test("open response checks show outline feedback and retain the explanation", async ({
  page,
}) => {
  const store = await contentFixture(page);
  Object.assign(store.questions[0], { question_type: "open", options: [] });
  await page.route("**/rpc/check_book_practice_response", (route) => {
    const body = route.request().postDataJSON(),
      item = store.items.find((i) => i.id === body.p_item);
    const result = {
      id: body.p_event,
      item_id: item.id,
      selected_answer: 0,
      selected_response: body.p_response,
      correct: body.p_response === "25",
      attempt_order: (store.checks?.length || 0) + 1,
      created_at: new Date().toISOString(),
    };
    store.checks = [...(store.checks || []), result];
    Object.assign(item, {
      selected_response: body.p_response,
      selected_answer: 0,
      correct: result.correct,
      solved_at: result.correct ? result.created_at : null,
    });
    return json(route, result);
  });
  await openPractice(page);
  await page.getByLabel("Your answer").fill("1");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".attempt-feedback")).toHaveCSS(
    "border-top-color",
    "rgb(239, 68, 68)",
  );
  await page.getByLabel("Your answer").fill("25");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".attempt-feedback")).toHaveCSS(
    "border-top-color",
    "rgb(22, 163, 74)",
  );
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toBeVisible();
});

test("a later successful question save also persists the earlier dirty answer", async ({
  page,
}) => {
  const store = await contentFixture(page);
  await openPractice(page);
  let fail = true;
  await page.route("**/rpc/save_book_practice", (route) => {
    if (fail) return json(route, { message: "Transport failure" }, 500);
    for (const a of route.request().postDataJSON().p_answers)
      Object.assign(
        store.items.find((i) => i.id === a.id),
        a,
      );
    return json(route, null);
  });
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByRole("status")).toHaveText("Save failed");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  fail = false;
  await page.getByRole("radio").nth(2).check();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  expect(store.items[0].selected_answer).toBe(1);
  expect(store.items[1].selected_answer).toBe(2);
});

test("one-time Edit opens prefilled form, updates recipients and survives reload", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  const row = {
    id: "hw-1",
    assignment_id: "assignment-1",
    student_id: "d0000000-0000-0000-0000-000000000010",
    title: "Original homework",
    display_name: "Fixture Learner",
    due_at: "2026-12-01T10:00:00Z",
    sections: [{ title: "Algebra", count: 2 }],
    timed: false,
  };
  store.homework = [row];
  let definition = {
    id: row.id,
    data: {
      title: row.title,
      instructions: "Read carefully",
      dueAt: row.due_at,
      students: [row.student_id],
      groups: [],
      sections: [
        {
          id: "section-1",
          title: "Algebra",
          count: 2,
          questionIds: store.questions.slice(0, 2).map((q) => q.id),
          filters: {},
        },
      ],
    },
  };
  await page.route("**/rpc/homework_edit_data", (route) =>
    json(route, definition),
  );
  await page.route("**/rpc/update_homework", (route) => {
    definition = { id: row.id, data: route.request().postDataJSON().p_data };
    Object.assign(row, {
      title: definition.data.title,
      due_at: definition.data.dueAt,
    });
    return json(route, row.id);
  });
  await page.goto("/admin/homework");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit one-time homework" });
  await expect(dialog.getByLabel("Homework title")).toHaveValue(row.title);
  await expect(dialog.getByLabel("Instructions")).toHaveValue("Read carefully");
  await expect(
    dialog.getByLabel("Fixture Learner", { exact: true }),
  ).toBeChecked();
  await dialog.getByLabel("Homework title").fill("Updated homework");
  await dialog.getByLabel("All active students").check();
  await dialog
    .getByRole("button", { name: "Save homework", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  expect(definition.data.allStudents).toBe(true);
  await page.reload();
  await expect(
    page.getByRole("cell", { name: "Updated homework", exact: true }),
  ).toBeVisible();
});

test("student deletion confirms deactivation and removes only that student from the active list", async ({
  page,
}) => {
  await contentFixture(page, "admin");
  const target = {
    id: "f9000000-0000-0000-0000-000000000001",
    display_name: "Disposable test student",
    role: "student",
    active: true,
  };
  const untouched = {
    id: "f9000000-0000-0000-0000-000000000002",
    display_name: "Other test student",
    role: "student",
    active: true,
  };
  await page.route("**/rest/v1/profiles*", (route) => {
    const u = new URL(route.request().url());
    if (u.searchParams.get("role") !== "eq.student") return route.fallback();
    if (route.request().method() === "PATCH") {
      expect(u.searchParams.get("id")).toBe(`eq.${target.id}`);
      Object.assign(target, route.request().postDataJSON());
      return json(route, { id: target.id, active: target.active });
    }
    expect(u.searchParams.get("active")).toBe("eq.true");
    const rows = [target, untouched].filter((s) => s.active);
    return route.fulfill({
      contentType: "application/json",
      headers: { "Content-Range": `0-${rows.length - 1}/${rows.length}` },
      body: JSON.stringify(rows),
    });
  });
  await page.goto("/admin/students");
  const targetRow = page
    .getByRole("row")
    .filter({ hasText: target.display_name });
  await targetRow.getByRole("button").click();
  await expect(
    page.getByText("This deactivates the student account", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(targetRow).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: untouched.display_name }),
  ).toBeVisible();
  expect(untouched.active).toBe(true);
});

test("Question Bank loads both sections, source labels and domain counts without repeated requests", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.questions[0].difficulty = "easy";
  store.questions[1].difficulty = "medium";
  store.questions[2].difficulty = "hard";
  store.questions.push({
    ...store.questions[0],
    id: "reading-fixture",
    section: "Reading & Writing",
    domain: "Information and Ideas",
  });
  await page.goto("/question-bank");
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await expect(page.getByLabel("Book / source", { exact: true })).toContainText(
    "SAT Book",
  );
  await expect(
    page
      .locator(".bank-domain-row")
      .filter({ hasText: "Algebra" })
      .locator(".bank-count"),
  ).toHaveText("3");
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "2 questions match" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Easy", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Medium", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Book / source", { exact: true }).selectOption(bookId);
  await expect(
    page.getByRole("heading", { name: "2 questions match" }),
  ).toBeVisible();
  const labelRequests = store.requests.filter(
    (r) => r.path.endsWith("/books") && r.method === "GET",
  );
  expect(labelRequests.length).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Reading & Writing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "1 questions match" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".bank-domain-row")
      .filter({ hasText: "Information and Ideas" })
      .locator(".bank-count"),
  ).toHaveText("1");
  await page.getByRole("button", { name: "Math", exact: true }).click();
  await page
    .getByRole("button", { name: "Any difficulty", exact: true })
    .click();
  await expect(page.getByLabel("Entire Math", { exact: true })).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  const requests = () =>
    store.requests.filter(
      (r) =>
        r.path.endsWith("/question_bank") ||
        r.path.endsWith("/question_bank_facets"),
    ).length;
  const settled = requests();
  await page.getByRole("button", { name: "Expand Algebra skills" }).click();
  await page.getByRole("button", { name: "Collapse Algebra skills" }).click();
  expect(requests()).toBe(settled);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Question Bank reports the actual RPC error and retry reloads real results", async ({
  page,
}) => {
  await learningFixture(page);
  let fail = true;
  await page.route("**/rpc/question_bank", (route) =>
    fail
      ? json(
          route,
          { message: "canceling statement due to statement timeout" },
          500,
        )
      : route.fallback(),
  );
  await page.goto("/question-bank");
  await expect(page.getByRole("alert")).toContainText(
    "canceling statement due to statement timeout",
  );
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
