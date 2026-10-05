import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { contentFixture, bookId, topicId } from "./helpers/content.js";
import { preparePackage } from "../../scripts/imports/book-package.js";
const folder = process.env.SATCHI_PACKAGE_DIR;
for (const width of [1280, 390]) {
  test(`actual Algebra source crops and explanations display at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      !folder,
      "Set SATCHI_PACKAGE_DIR to the inspected package checkpoint to check original source pixels.",
    );
    const load = async (name) =>
      JSON.parse(await readFile(join(folder, name), "utf8"));
    const [book, manifest, review, assets] = await Promise.all(
      ["book.json", "manifest.json", "review.json", "asset-index.json"].map(
        load,
      ),
    );
    const prepared = preparePackage(
      book,
      manifest,
      review,
      assets,
      "a".repeat(64),
    );
    const samples = ["0003", "0170", "0008"].map((n) =>
      prepared.imported.find((q) => q.sourceId.endsWith(n)),
    );
    await page.setViewportSize({ width, height: 900 });
    const store = await contentFixture(page);
    store.questions = samples.map((q) => ({
      id: q.id,
      topic_id: topicId,
      question_text: q.text,
      image_url: q.image,
      question_type: q.type,
      options: q.options,
      option_image_urls: q.optionImages,
      import_metadata: q.metadata,
      difficulty: q.difficulty,
      section: "Math",
      domain: "Algebra",
      passage: "",
      question_answers: {
        correct_answer: q.correctAnswer,
        explanation: q.explanation,
      },
    }));
    await page.route("**/rpc/book_practice_explanation", (route) => {
      const item = store.items.find(
        (i) => i.id === route.request().postDataJSON().p_item,
      );
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          explanation: samples[item.position].explanation,
        }),
      });
    });
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
        const asset = assets.find((a) => path.endsWith(a.storageHash + ".png"));
        return route.fulfill({
          contentType: "image/png",
          body: await readFile(join(folder, asset.source)),
        });
      },
    );
    await page.goto(`/books/${bookId}/topics/${topicId}`);
    await page.getByRole("button", { name: "Start topic practice" }).click();
    await expect(
      page.getByRole("button", { name: "Explanation", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("radio").first().check();
    await page
      .getByRole("button", { name: "Explanation", exact: true })
      .click();
    await expect(page.locator(".book-explanation-control img")).toHaveCount(1);
    await expect
      .poll(() =>
        page
          .locator(".question-player img")
          .evaluateAll(
            (images) =>
              images.length === 6 &&
              images.every((i) => i.complete && i.naturalWidth > 0),
          ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("heading", { name: "Algebra", exact: true }).click();
    await page.screenshot({
      path: `/tmp/satchi-algebra-source-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Enlarge image", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "Source image", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Image size", exact: true })
      .selectOption("600");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "Close Source image", exact: true })
      .click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Explanation", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("radio").first().check();
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
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Your answer", { exact: true }).fill("43/5");
    await page
      .getByRole("button", { name: "Explanation", exact: true })
      .click();
    await expect(page.locator(".book-explanation-control img")).toHaveCount(1);
  });
}
