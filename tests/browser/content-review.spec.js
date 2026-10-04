import { test, expect } from "@playwright/test";
import { reviewFixture } from "./helpers/review.js";
test("admin sees source outcomes, real catalog counts and import checkpoint history", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.goto("/admin/content-review");
  await expect(
    page.getByRole("heading", { name: "Content Review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Partially imported", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect source" }).click();
  await expect(
    page.getByText("layout1 · Last checkpoint", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Catalog", exact: true }).click();
  await expect(page.getByText("In catalog", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inspect item" })).toHaveCount(
    1,
  );
  await page
    .getByRole("button", { name: "Import history", exact: true })
    .click();
  await expect(
    page.getByText("1 catalog items at checkpoint", { exact: false }),
  ).toBeVisible();
});
test("admin filters review queue, edits a persistent question and approves only that item", async ({
  page,
}) => {
  const store = await reviewFixture(page);
  await page.goto("/admin/content-review");
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await page.getByLabel("Warning contains").fill("OCR");
  await expect(page.getByRole("button", { name: "Inspect item" })).toHaveCount(
    1,
  );
  await page.getByLabel("Warning contains").fill("");
  await expect(page.getByRole("button", { name: "Inspect item" })).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Inspect item" }).first().click();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page
    .getByLabel("Question text", { exact: true })
    .fill("Which value satisfies the equation?");
  await page.getByLabel("Physical source page").fill("9");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Review item" })
      .getByRole("heading", { name: "Which value satisfies the equation?" }),
  ).toBeVisible();
  expect(store.items[0].payload.source_page).toBe(9);
  await page.getByRole("button", { name: "Approve item" }).click();
  await expect(
    page.getByText("Synthetic.pdf · question · approved"),
  ).toBeVisible();
  expect(store.items[1].status).toBe("pending");
  await page.reload();
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await page.getByLabel("Review status").selectOption("approved");
  await expect(
    page.getByText("Which value satisfies the equation?", { exact: true }),
  ).toBeVisible();
});
test("admin rejection and duplicate decisions remain visible in audit history", async ({
  page,
}) => {
  const store = await reviewFixture(page);
  await page.goto("/admin/content-review");
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await page.getByRole("button", { name: "Inspect item" }).first().click();
  await page
    .getByLabel("Review note")
    .fill("Confirmed duplicate from the original source.");
  await page.getByRole("button", { name: "Mark duplicate" }).click();
  await expect(
    page.getByText("Synthetic.pdf · question · duplicate"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reject item" }).click();
  await expect(
    page.getByText("Synthetic.pdf · question · rejected"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Audit history", exact: true })
    .click();
  await expect(
    page.getByText("Administrator admin-fixture", { exact: false }),
  ).toHaveCount(2);
  expect(store.audit.map((r) => r.action)).toEqual(["duplicate", "reject"]);
});
test("students are redirected from admin review without requesting private review data", async ({
  page,
}) => {
  const store = await reviewFixture(page, "student");
  await page.goto("/admin/content-review");
  await expect(page).toHaveURL("/dashboard");
  expect(
    store.base.requests.some((r) => r.path.includes("content_review")),
  ).toBe(false);
});
test("mobile source and review lists remain within the viewport", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/content-review");
  await expect(
    page.getByRole("heading", { name: "Content Review", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Inspect item" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("manual source transcription creates a pending item with a required explicit answer and page", async ({
  page,
}) => {
  const store = await reviewFixture(page);
  await page.goto("/admin/content-review");
  await page.getByRole("button", { name: "Inspect source" }).click();
  await page
    .getByRole("button", { name: "Transcribe a source question" })
    .click();
  await page.getByLabel("Manual source page").fill("12");
  await page
    .getByLabel("Question text", { exact: true })
    .fill("Which number is the largest value?");
  for (const [i, v] of ["2", "4", "6", "8"].entries())
    await page
      .getByLabel("Option " + String.fromCharCode(65 + i), { exact: true })
      .fill(v);
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page.getByText("Question: correctAnswer must be 0, 1, 2, or 3."),
  ).toBeVisible();
  await page.getByLabel("Correct answer", { exact: true }).selectOption("3");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Which number is the largest value?" }),
  ).toBeVisible();
  const item = store.items.find((r) => r.extraction_method === "manual");
  expect(item.status).toBe("pending");
  expect(item.source_page).toBe(12);
  expect(item.entity_id).toBeNull();
});

test("vocabulary exercise correction preserves supplied type and physical source page", async ({
  page,
}) => {
  const store = await reviewFixture(page);
  store.items.push({
    id: "exercise-1",
    source_id: store.source.id,
    item_type: "exercise",
    entity_id: "vocab-question-1",
    source_page: 13,
    extraction_method: "embedded_bbox",
    warnings: [],
    status: "pending",
    updated_at: "2026-10-04T10:00:00Z",
    payload: {
      question: "Which word completes the supplied sentence?",
      options: ["bright", "slow", "faint", "narrow"],
      correctAnswer: 0,
      questionType: "sentence_completion",
      sourcePage: 13,
    },
  });
  await page.goto("/admin/content-review");
  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await page.getByLabel("Item type").selectOption("exercise");
  await page.getByRole("button", { name: "Inspect item" }).click();
  await page.getByRole("button", { name: "Edit item", exact: true }).click();
  await page
    .getByLabel("Question text", { exact: true })
    .fill("Which word completes this sentence correctly?");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Review item" })
      .getByRole("heading", {
        name: "Which word completes this sentence correctly?",
      }),
  ).toBeVisible();
  const item = store.items.find((r) => r.id === "exercise-1");
  expect(item.payload.questionType).toBe("sentence_completion");
  expect(item.payload.sourcePage).toBe(13);
});
