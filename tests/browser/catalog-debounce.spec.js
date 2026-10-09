import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
import {
  holdSearchDebounces,
  runSearchDebounces,
} from "./helpers/search-debounce.js";
for (const feature of ["books", "vocabulary", "selector", "study"]) {
  test(`${feature}: an unchanged initial search cannot reset a fast page change`, async ({
    page,
  }) => {
    const store = await learningFixture(page);
    store.books = Array.from({ length: 55 }, (_, i) => ({
      id: `catalog-${i}`,
      title: `Library ${String(i).padStart(3, "0")}`,
      category: "Math",
      published: true,
    }));
    store.vocabBooks = Array.from({ length: 55 }, (_, i) => ({
      id: `vcat-${i}`,
      title: `Vocabulary ${String(i).padStart(3, "0")}`,
      published: true,
    }));
    store.words = Array.from({ length: 105 }, (_, i) => ({
      id: `word-${i}`,
      set_id: "vset",
      word: `word-${i}`,
      definition: "Supplied definition",
      example: "Supplied example",
      position: i,
    }));
    await holdSearchDebounces(page);
    const config = {
      books: {
        url: "/books",
        next: "Next books",
        rows: () => page.locator(".book-card"),
        initial: 50,
        after: 5,
      },
      vocabulary: {
        url: "/vocabulary",
        next: "Next vocabulary books",
        rows: () => page.locator(".card-grid > article"),
        initial: 50,
        after: 5,
      },
      selector: {
        url: "/question-bank",
        next: "More books",
        rows: () =>
          page.getByLabel("Book / source", { exact: true }).locator("option"),
        initial: 51,
        after: 6,
      },
      study: {
        url: "/vocabulary/study?sets=vset&mode=words",
        next: "Next 100 words",
        rows: () => page.locator(".vocab-word"),
        initial: 100,
        after: 5,
      },
    }[feature];
    await page.goto(config.url);
    await expect(config.rows()).toHaveCount(config.initial);
    await page.getByRole("button", { name: config.next, exact: true }).click();
    await expect(config.rows()).toHaveCount(config.after);
    await runSearchDebounces(page);
    await expect(config.rows()).toHaveCount(config.after);
    if (feature === "books" || feature === "vocabulary") {
      const search = page.getByLabel(
        feature === "books" ? "Search books" : "Search vocabulary books",
        { exact: true },
      );
      await search.fill(feature === "books" ? "Library 054" : "Vocabulary 054");
      await runSearchDebounces(page);
      await expect(config.rows()).toHaveCount(1);
    }
  });
}
