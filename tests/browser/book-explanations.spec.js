import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { contentFixture, bookId, topicId } from "./helpers/content.js";

test("book explanations require a recorded Check, survive answer changes and navigation, and never add checks", async ({
  page,
}) => {
  const store = await contentFixture(page);
  await page.route("**/rpc/book_practice_explanation", (route) => {
    const { p_item } = route.request().postDataJSON();
    const item = store.items.find((i) => i.id === p_item);
    expect(item.selected_answer).not.toBeNull();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        explanation: item.position === 0 ? "The book's explanation." : null,
      }),
    });
  });
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  const button = page.getByRole("button", { name: "Explanation", exact: true });
  await expect(button).toHaveCount(0);
  await page.getByRole("radio", { name: "A 2", exact: true }).check();
  await expect(button).toHaveCount(0);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(button).toBeVisible();
  await button.click();
  await expect(
    page.getByText("The book's explanation.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "C 6", exact: true }).check();
  await expect(button).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(button).toHaveCount(0);
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await button.click();
  await expect(
    page.getByText("Explanation is not available for this question.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(button).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "C 6", exact: true }),
  ).toBeChecked();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.reload();
  await expect(button).toBeVisible();
  expect(
    store.requests.some((r) =>
      /check_bank_answer|finish_book_practice/.test(r.path),
    ),
  ).toBe(false);
  expect(store.checks).toHaveLength(2);
});

test("Book Practice checks text answers, marks wrong and correct choices, and restores progress after reload", async ({
  page,
}) => {
  const store = await contentFixture(page);
  await page.route("**/rpc/check_book_practice_answer", (route) => {
    const body = route.request().postDataJSON();
    const item = store.items.find((i) => i.id === body.p_item);
    const attempt = {
      id: body.p_event,
      item_id: item.id,
      attempt_order:
        (store.checks || []).filter((a) => a.item_id === item.id).length + 1,
      selected_answer: body.p_choice,
      correct: body.p_choice === 1,
      created_at: new Date().toISOString(),
      active_seconds: 0,
    };
    store.checks ||= [];
    store.checks.push(attempt);
    Object.assign(item, {
      selected_answer: body.p_choice,
      correct: attempt.correct,
      has_answered: true,
      solved_at: attempt.correct ? attempt.created_at : null,
    });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(attempt),
    });
  });
  await page.setViewportSize({ width: 768, height: 844 });
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await page.getByLabel("Color theme", { exact: true }).selectOption("dark");
  const check = page.getByRole("button", { name: "Check", exact: true });
  const explanation = page.getByRole("button", {
    name: "Explanation",
    exact: true,
  });
  await expect(check).toBeDisabled();
  await expect(explanation).toHaveCount(0);
  await page.getByRole("radio").nth(0).check();
  await expect(check).toBeEnabled();
  await expect(explanation).toHaveCount(0);
  await check.click();
  await expect(explanation).toBeVisible();
  await expect(page.locator(".answer-choice").nth(0)).toHaveClass(
    /incorrect-choice/,
  );
  await expect(page.locator(".answer-choice.correct-choice")).toHaveCount(0);
  const wrong = page.locator(".answer-choice").nth(0);
  await expect(wrong).toHaveCSS("background-color", "rgb(66, 38, 54)");
  await expect(wrong.locator("label")).toHaveCSS("color", "rgb(230, 237, 252)");
  await mkdir(".impeccable/review/practice", { recursive: true });
  await page.screenshot({
    path: ".impeccable/review/practice/incorrect-dark-768.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: ".impeccable/review/practice/incorrect-dark-390.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 768, height: 844 });
  await page.getByRole("radio").nth(1).check();
  await check.click();
  await expect(page.locator(".answer-choice").nth(1)).toHaveClass(
    /correct-choice/,
  );
  await expect(
    page.getByText("Solved. Continue to the next question."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await expect(page.locator(".answer-choice").nth(1)).toHaveClass(
    /correct-choice/,
  );
  await expect(explanation).toBeVisible();
  expect(store.checks).toHaveLength(2);
});

for (const width of [1280, 390]) {
  test(`package stem, image options, and multi-page explanation render at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const store = await contentFixture(page);
    const prefix =
      "https://ileffhbbaomfimwulvpw.supabase.co/storage/v1/object/authenticated/book-package-assets/" +
      "a".repeat(64) +
      "/";
    const image = (n) => prefix + String(n).repeat(64) + ".png";
    Object.assign(store.questions[0], {
      question_text: "",
      image_url: image(0),
      options: ["", "", "", ""],
      option_image_urls: [1, 2, 3, 4].map(image),
      import_metadata: { option_labels_in_images: true },
    });
    await page.route("**/rpc/check_book_practice_answer", (route) => {
      const body = route.request().postDataJSON();
      const item = store.items.find((i) => i.id === body.p_item);
      const attempt = {
        id: body.p_event,
        item_id: item.id,
        attempt_order: 1,
        selected_answer: body.p_choice,
        correct: false,
        created_at: new Date().toISOString(),
        active_seconds: 0,
      };
      store.checks = [attempt];
      item.selected_answer = body.p_choice;
      item.has_answered = true;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(attempt),
      });
    });
    await page.route("**/rpc/book_practice_explanation", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          explanation: `![Official explanation](${image(5)})\n![Official explanation continued](${image(6)})`,
        }),
      }),
    );
    await page.route(
      "**/storage/v1/object/sign/book-package-assets/**",
      (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has("token"))
          return route.fulfill({
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="1450" height="450"><rect width="1450" height="450" fill="white"/><text x="20" y="80" font-size="50">Original book content</text></svg>',
          });
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            signedURL:
              "/object/sign/book-package-assets/" +
              url.pathname.split("book-package-assets/")[1] +
              "?token=fixture",
          }),
        });
      },
    );
    await page.goto(`/books/${bookId}/topics/${topicId}`);
    await page.getByRole("button", { name: "Start topic practice" }).click();
    await expect(page.locator(".answer-choices img")).toHaveCount(4);
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(page.locator(".answer-choice").first()).toHaveClass(
      /incorrect-choice/,
    );
    await expect(page.locator(".answer-choice.correct-choice")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Explanation", exact: true })
      .click();
    await expect(page.locator(".book-explanation-control img")).toHaveCount(2);
    await expect
      .poll(() =>
        page
          .locator(".question-player img")
          .evaluateAll((images) =>
            images.every((i) => i.complete && i.naturalWidth > 0),
          ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/satchi-book-package-${width}.png`,
      fullPage: true,
    });
  });
}

test("unkeyed book open responses save and resume without inventing checks or unlocking explanation", async ({
  page,
}) => {
  const store = await contentFixture(page);
  Object.assign(store.questions[0], {
    question_type: "open",
    options: [],
    question_text: "Enter the value supplied by the source question.",
  });
  await page.route("**/rpc/book_practice_explanation", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ explanation: null }),
    }),
  );
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(/^Your answer/).fill("43/5");
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.reload();
  await expect(page.getByLabel(/^Your answer/)).toHaveValue("43/5");
  await page.getByLabel(/^Your answer/).fill("");
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  expect(store.checks || []).toHaveLength(0);
});

test("Bank open responses use response checks, retry and lock solved input without losing Explanation", async ({
  page,
}) => {
  const store = await contentFixture(page);
  Object.assign(store.questions[0], {
    question_type: "open",
    options: [],
    question_text: "Enter the source answer.",
  });
  await page.route("**/rpc/check_bank_response", (route) => {
    const body = route.request().postDataJSON();
    const item = store.items.find((i) => i.id === body.p_item);
    const attempt = {
      id: body.p_event,
      item_id: item.id,
      attempt_order: (store.checks || []).length + 1,
      selected_answer: 0,
      selected_response: body.p_response,
      correct: body.p_response === "43/5",
      created_at: new Date().toISOString(),
      active_seconds: 0,
    };
    store.checks ||= [];
    store.checks.push(attempt);
    Object.assign(item, {
      correct: attempt.correct,
      solved_at: attempt.correct ? attempt.created_at : null,
    });
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(attempt),
    });
  });
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(page.getByLabel(/^Your answer/)).toBeVisible();
  store.session.kind = "bank";
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel(/^Your answer/).fill("wrong");
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toHaveCount(0);
  expect(store.checks || []).toHaveLength(0);
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(
    page.getByText("That answer is incorrect. Try another choice."),
  ).toBeVisible();
  await page.getByLabel(/^Your answer/).fill("43/5");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(
    page.getByText("Solved. Continue to the next question."),
  ).toBeVisible();
  await expect(page.getByLabel(/^Your answer/)).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel(/^Your answer/)).toHaveValue("43/5");
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toBeVisible();
  expect(store.checks).toHaveLength(2);
});
