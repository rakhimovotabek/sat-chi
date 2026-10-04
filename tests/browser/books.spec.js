import { test, expect } from "@playwright/test";
import {
  contentFixture,
  bookId,
  topicId,
  sampleQuestion,
} from "./helpers/content.js";
test("admin creates, edits and deletes books, subtopics and questions with validated topic imports", async ({
  page,
}) => {
  test.setTimeout(90000);
  const store = await contentFixture(page, "admin", { empty: true });
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/admin/books");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page.getByLabel("Book title").fill("Admin SAT Book");
  await page.getByLabel("Publish this book after saving").check();
  await page.getByRole("button", { name: "Save book", exact: true }).click();
  await page.getByRole("link", { name: /Admin SAT Book/ }).click();
  await expect(
    page.getByRole("heading", { name: "Admin SAT Book", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit book", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("Updated description");
  await page.getByRole("button", { name: "Save book" }).click();
  await expect(
    page.getByText("Updated description", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create topic" }).click();
  await page.getByLabel("Topic title").fill("Algebra");
  await page.getByRole("button", { name: "Save topic" }).click();
  await expect(page.getByText("Algebra", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Create topic" }).click();
  await page.getByLabel("Topic title").fill("Linear equations");
  await page.getByLabel("Parent topic").selectOption(store.topics[0].id);
  await page.getByRole("button", { name: "Save topic" }).click();
  await expect(
    page.getByText("Linear equations", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit topic", exact: true })
    .last()
    .click();
  await page.getByLabel("Topic title").fill("Equations");
  await page.getByRole("button", { name: "Save topic" }).click();
  await expect(page.getByText("Equations", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Questions", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Create question" }).click();
  await page
    .getByLabel("Question text", { exact: true })
    .fill(sampleQuestion.question);
  for (let i = 0; i < 4; i++)
    await page
      .getByLabel(`Option ${String.fromCharCode(65 + i)}`, { exact: true })
      .fill(sampleQuestion.options[i]);
  await page.getByLabel("Correct answer", { exact: true }).selectOption("1");
  await page
    .getByLabel("Explanation", { exact: true })
    .fill(sampleQuestion.explanation);
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(
    page.getByRole("cell", { name: sampleQuestion.question, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit question 1", exact: true })
    .click();
  await page
    .getByLabel("Question text", { exact: true })
    .fill("Edited equation question.");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(
    page.getByRole("cell", { name: "Edited equation question.", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import questions", exact: true })
    .click();
  await page.getByLabel("JSON content").fill(
    JSON.stringify({
      questions: [{ ...sampleQuestion, options: ["invalid"] }],
    }),
  );
  await page.getByRole("button", { name: "Preview and validate" }).click();
  await expect(page.getByRole("alert")).toContainText("four options");
  await expect(
    page.getByRole("button", { name: "Import validated content" }),
  ).toHaveCount(0);
  await page
    .getByLabel("JSON content")
    .fill(JSON.stringify({ questions: [sampleQuestion] }));
  await page.getByRole("button", { name: "Preview and validate" }).click();
  await page.getByRole("button", { name: "Import validated content" }).click();
  await expect(
    page.getByRole("button", { name: "Delete question 2" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete question 2" }).click();
  await expect(
    page.getByRole("button", { name: "Delete question 2" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete topic", exact: true })
    .last()
    .click();
  await expect(page.getByText("Equations", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Delete book", exact: true }).click();
  await expect(page).toHaveURL(/admin\/books$/);
  await expect(page.getByText("Your library is getting ready")).toBeVisible();
});
test("admin previews and imports a complete book from a JSON file", async ({
  page,
}) => {
  const store = await contentFixture(page, "admin", { empty: true });
  await page.goto("/admin/books");
  await page.getByRole("button", { name: "JSON import" }).click();
  const payload = {
    schemaVersion: 1,
    kind: "book",
    book: { title: "Imported SAT book", category: "Math" },
    topics: [
      {
        title: "Algebra",
        questions: [sampleQuestion],
        children: [{ title: "Equations", questions: [sampleQuestion] }],
      },
    ],
  };
  await page.getByLabel("Upload JSON").setInputFiles({
    name: "book.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await page.getByRole("button", { name: "Preview and validate" }).click();
  await expect(page.getByText(/2 topics · 2 questions/)).toBeVisible();
  await page.getByRole("button", { name: "Import validated content" }).click();
  await expect(
    page.getByRole("link", { name: /Imported SAT book/ }),
  ).toBeVisible();
  expect(store.questions.length).toBe(2);
  expect(store.books[0].published).toBe(false);
});
test("student topic practice saves choices and marks, resumes, grades and reviews without early answer exposure", async ({
  page,
}) => {
  const store = await contentFixture(page);
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/books");
  await page.getByRole("link", { name: /SAT Book/ }).click();
  await page.getByRole("link", { name: "Algebra →" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/books/${bookId}/topics/${topicId}$`),
  );
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(sampleQuestion.explanation, { exact: true }),
  ).toHaveCount(0);
  expect(
    store.requests.some((r) => r.path.endsWith("review_book_practice")),
  ).toBe(false);
  await page.getByRole("button", { name: "Eliminate choice A" }).click();
  await expect(
    page.getByRole("radio", { name: "A 2", exact: true }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "A 2", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.reload();
  await expect(
    page.getByText("Question 2 of 3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Marked for review" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Question [0-9]+ of 3/ })
    .click();
  await page.getByRole("button", { name: /Question 2, / }).click();
  await expect(
    page.getByRole("radio", { name: "A 2", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Submit practice" }).click();
  await expect(
    page.getByRole("region", { name: "Practice results" }),
  ).toBeVisible();
  await expect(
    page.getByText(sampleQuestion.explanation, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeDisabled();
  expect(store.items.map((i) => i.correct)).toEqual([true, false, false]);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Practice results" }),
  ).toBeVisible();
});
test("a failed practice save offers retry and does not claim saved answers", async ({
  page,
}) => {
  await contentFixture(page);
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  await page.route("**/rpc/save_book_practice", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ message: "internal fixture failure" }),
    }),
  );
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await expect(page.getByRole("alert")).toContainText("Could not save");
  await expect(page.getByRole("status")).toHaveText("Save failed");
  await expect(
    page.getByRole("button", { name: "Retry saving" }),
  ).toBeVisible();
});
test("question pagination and import content previews show the actual material", async ({
  page,
}) => {
  const store = await contentFixture(page, "admin");
  const base = store.questions[0];
  store.questions = Array.from({ length: 55 }, (_, i) => ({
    ...base,
    id: `e0000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`,
    question_text: `Question ${i + 1}`,
    position: i,
  }));
  await page.goto("/admin/questions");
  await page
    .getByRole("combobox", { name: "Book", exact: true })
    .selectOption(bookId);
  await page
    .getByRole("combobox", { name: "Topic", exact: true })
    .selectOption(topicId);
  await expect(page.getByText("1–50 of 55 questions")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(
    page.getByRole("cell", { name: "Question 55", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Import questions", exact: true })
    .click();
  await page
    .getByLabel("JSON content")
    .fill(JSON.stringify({ questions: [sampleQuestion] }));
  await page.getByRole("button", { name: "Preview and validate" }).click();
  await page.getByText("Preview question 1", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: sampleQuestion.question, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(sampleQuestion.explanation, { exact: true }),
  ).toBeVisible();
});
test("reference image failures recover on the next question and tables render in the stimulus panel", async ({
  page,
}) => {
  const store = await contentFixture(page);
  store.questions[0].image_url = "https://assets.example.test/missing.svg";
  store.questions[1].image_url = "https://assets.example.test/diagram.svg";
  store.questions[1].stimulus_table = { columns: ["x", "y"], rows: [[1, 2]] };
  await page.route("https://assets.example.test/missing.svg", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route("https://assets.example.test/diagram.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0L100 100" stroke="blue"/></svg>',
    }),
  );
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(page.getByText(/Reference image could not load/)).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "Question reference diagram" }),
  ).toBeVisible();
  await expect(page.getByText(/Reference image could not load/)).toHaveCount(0);
  await expect(page.locator(".stimulus-table")).toContainText("x");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/satchi-question-player-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/satchi-question-player-mobile.png",
    fullPage: true,
  });
});

test("private Math question assets are signed for practice and never loaded from authenticated object URLs", async ({
  page,
}) => {
  const store = await contentFixture(page);
  const path = "a".repeat(64) + "/" + "b".repeat(64) + ".webp";
  store.questions[0].image_url =
    "https://ileffhbbaomfimwulvpw.supabase.co/storage/v1/object/authenticated/question-assets/" +
    path;
  await page.route("**/storage/v1/object/sign/question-assets/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        signedURL: "/object/sign/question-assets/" + path + "?token=fixture",
      }),
    }),
  );
  await page.route(
    "**/storage/v1/object/sign/question-assets/**?token=fixture",
    (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="350"><text x="30" y="50">Preserved original mathematical notation</text></svg>',
      }),
  );
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page
    .getByRole("button", { name: "Start topic practice", exact: true })
    .click();
  const image = page.getByRole("img", {
    name: "Original source question and mathematical notation",
  });
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", /object\/sign\/question-assets/);
});

test("book publication failure shows the review blocker and preserves draft metadata; approved publication and published editing succeed without a cover", async ({
  page,
}) => {
  const store = await contentFixture(page, "admin");
  store.books[0].published = false;
  let approved = false;
  await page.route("**/rest/v1/books*", async (route) => {
    if (
      route.request().method() === "PATCH" &&
      route.request().postDataJSON()?.published &&
      !approved
    )
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          code: "P0001",
          message: "Review imported catalog items before publishing",
        }),
      });
    return route.fallback();
  });
  await page.goto(`/admin/books/${bookId}`);
  await page.getByRole("button", { name: "Edit book", exact: true }).click();
  await page.getByLabel("Publish this book after saving").check();
  await page.getByRole("button", { name: "Save book", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Content Review before publishing",
  );
  await expect(
    page.getByText("Currently draft — visible to administrators", {
      exact: true,
    }),
  ).toBeVisible();
  expect(store.books[0].published).toBe(false);
  await page.getByLabel("Publish this book after saving").uncheck();
  await page
    .getByLabel("Book title", { exact: true })
    .fill("Edited draft with fallback cover");
  await page.getByRole("button", { name: "Save book", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Edited draft with fallback cover",
      exact: true,
    }),
  ).toBeVisible();
  approved = true;
  await page.getByRole("button", { name: "Edit book", exact: true }).click();
  await page.getByLabel("Publish this book after saving").check();
  await page.getByRole("button", { name: "Save book", exact: true }).click();
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit book", exact: true }).click();
  await expect(
    page.getByText("Currently published — visible to students", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Book title", { exact: true })
    .fill("Edited published book");
  await page.getByRole("button", { name: "Save book", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edited published book", exact: true }),
  ).toBeVisible();
  expect(store.books[0].published).toBe(true);
});

test("admin approves only the validated subset before publishing a partially recovered book", async ({
  page,
}) => {
  const store = await contentFixture(page, "admin");
  store.books[0].published = false;
  let approved = false;
  const safe = [
    { id: "safe-one", version: "2026-10-04" },
    { id: "safe-two", version: "2026-10-04" },
  ];
  await page.route(
    /\/rest\/v1\/rpc\/(book_review_summary|content_review_bulk|publish_approved_book)/,
    async (route) => {
      const action = route.request().url().split("/").pop(),
        payload = route.request().postDataJSON();
      let data;
      if (action === "book_review_summary")
        data = {
          validated: approved ? 0 : 2,
          human: 1,
          excluded: 408,
          duplicates: 0,
          approved: approved ? 2 : 0,
          published: store.books[0].published,
        };
      if (action === "content_review_bulk") {
        expect(payload.p_book).toBe(bookId);
        if (payload.p_confirm) {
          expect(payload.p_confirm).toEqual(safe);
          approved = true;
          data = { approved: 2 };
        } else data = { count: 2, safe };
      }
      if (action === "publish_approved_book") {
        expect(approved).toBe(true);
        store.books[0].published = true;
        data = null;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    },
  );
  await page.goto("/admin/books/" + bookId);
  const workflow = page.getByRole("region", { name: "Book approval workflow" });
  await expect(workflow.getByText("408", { exact: true })).toBeVisible();
  await expect(
    workflow.getByRole("button", { name: "Publish approved content" }),
  ).toBeDisabled();
  await workflow
    .getByRole("button", { name: "Approve all validated questions (2)" })
    .click();
  await workflow.getByRole("button", { name: "Confirm approval" }).click();
  await expect.poll(() => approved).toBe(true);
  expect(store.books[0].published).toBe(false);
  await workflow
    .getByRole("button", { name: "Publish approved content" })
    .click();
  await expect(
    workflow.getByRole("button", { name: "Approved content is published" }),
  ).toBeDisabled();
  await expect(workflow.getByText("408", { exact: true })).toBeVisible();
});
