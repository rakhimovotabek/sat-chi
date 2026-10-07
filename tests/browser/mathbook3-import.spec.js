import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { preparePackage } from "../../scripts/imports/book-package.js";
import { contentFixture, bookId, topicId } from "./helpers/content.js";

test("MathBook 3 original JPEGs, embedded choices and numeric responses work in practice", async ({
  page,
}) => {
  const folder = process.env.SATCHI_MATHBOOK3_PACKAGE_DIR;
  test.skip(
    !folder,
    "Set SATCHI_MATHBOOK3_PACKAGE_DIR to the inspected source package.",
  );
  const [book, manifest, review, assets] = await Promise.all(
    ["book.json", "manifest.json", "review.json", "asset-index.json"].map(
      async (name) => JSON.parse(await readFile(join(folder, name), "utf8")),
    ),
  );
  const prepared = preparePackage(
    book,
    manifest,
    review,
    assets,
    "a".repeat(64),
  );
  const samples = [
    prepared.imported.find((q) => q.type === "mcq"),
    prepared.imported.find((q) => q.type === "open"),
  ];
  const store = await contentFixture(page);
  store.books[0].title = book.book.title;
  store.questions = samples.map((q) => ({
    id: q.id,
    topic_id: topicId,
    question_text: q.text,
    question_type: q.type,
    passage: q.passage,
    image_url: q.image,
    options: q.options,
    option_image_urls: q.optionImages,
    import_metadata: q.metadata,
    section: "Math",
    domain: "Algebra",
    difficulty: q.difficulty,
    question_answers: {
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
    },
  }));
  await page.route(
    "**/storage/v1/object/sign/book-package-assets/**",
    async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.split("book-package-assets/")[1];
      if (!url.searchParams.has("token"))
        return route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            signedURL:
              "/object/sign/book-package-assets/" + path + "?token=fixture",
          }),
        });
      const asset = assets.find((a) =>
        path.endsWith(a.storageHash + a.extension),
      );
      expect(asset).toBeTruthy();
      return route.fulfill({
        contentType: asset.contentType,
        body: await readFile(join(folder, asset.source)),
      });
    },
  );
  await page.goto("/books");
  await expect(page.getByText(book.book.title, { exact: true })).toBeVisible();
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  const image = page.locator(".stimulus-panel img").first();
  await expect
    .poll(() => image.evaluate((i) => i.complete && i.naturalWidth > 0))
    .toBe(true);
  await page
    .getByRole("button", { name: "Enlarge image", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "Close Source image", exact: true })
    .click();
  await expect(page.getByRole("radio")).toHaveCount(4);
  await page.getByRole("radio").nth(samples[0].correctAnswer).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".answer-choice.correct-choice")).toBeVisible();
  await page.getByRole("button", { name: "Explanation", exact: true }).click();
  await expect(
    page.getByText("Explanation is not available for this question.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect
    .poll(() => image.evaluate((i) => i.complete && i.naturalWidth > 0))
    .toBe(true);
  await page.getByLabel("Your answer").fill(samples[1].correctAnswer);
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  expect(store.items[1].selected_response).toBe(samples[1].correctAnswer);
  await page.reload();
  await expect(page.getByLabel("Your answer")).toHaveValue(
    samples[1].correctAnswer,
  );
});
