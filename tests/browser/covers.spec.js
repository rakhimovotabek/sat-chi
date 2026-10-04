import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
async function signedCovers(page, failure = false) {
  const requests = [];
  await page.route("**/storage/v1/object/sign/book-covers", async (route) => {
    const { paths } = route.request().postDataJSON();
    requests.push(paths);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        paths.map((path) => ({
          path,
          signedURL: "/object/sign/book-covers/" + path + "?token=fixture",
        })),
      ),
    });
  });
  await page.route("**/storage/v1/object/sign/book-covers/**", (route) =>
    route.fulfill(
      failure
        ? { status: 403, body: "expired" }
        : {
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#dce8ff"/><text x="30" y="80">Synthetic cover</text></svg>',
          },
    ),
  );
  return () => requests;
}
test("book covers sign in one batch, main cards navigate and broken covers fall back", async ({
  page,
}) => {
  const store = await learningFixture(page),
    calls = await signedCovers(page, true);
  store.books[0].cover_path = "books/id/fixture.webp";
  store.books.push({
    ...store.books[0],
    id: "another-book",
    title: "Another book",
    cover_path: "books/another/fixture.webp",
  });
  await page.goto("/books");
  await expect(page.locator(".book-cover").first()).toContainText("Math");
  expect(calls().length).toBeGreaterThan(0);
  expect(calls().length).toBeLessThanOrEqual(2); // StrictMode may repeat the page load.
  expect(calls().every((paths) => paths.length === 2)).toBe(true);
  await expect(page.getByText("Open book", { exact: true })).toHaveCount(0);
  await page.locator(".book-card").first().click();
  await expect(page).toHaveURL(/\/books\/d0000000/);
  await expect(
    page.getByRole("heading", { name: "SAT Book", exact: true }),
  ).toBeVisible();
});
test("vocabulary library has a lazy private cover, real catalog counts and mobile row navigation", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await signedCovers(page);
  store.vocabBooks[0].cover_path = "vocabulary/vbook/fixture.webp";
  await page.goto("/vocabulary");
  await expect(page.locator(".vocabulary-cover img")).toHaveAttribute(
    "src",
    /storage\/v1\/object\/sign/,
  );
  await expect(page.locator(".vocabulary-cover img")).toHaveAttribute(
    "loading",
    "lazy",
  );
  await expect(
    page.getByText("1 set · 4 words", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "local-imports/design-vocabulary-covers-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Vocabulary Source", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Set 1", exact: true }),
  ).toBeVisible();
});
test("admin can replace and remove a vocabulary cover without changing words or publication", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  store.vocabBooks[0].cover_url = "https://example.test/old.webp";
  await page.goto("/admin/vocabulary/vbook");
  await page
    .getByRole("button", { name: "Edit vocabulary book", exact: true })
    .click();
  await page
    .getByLabel("Cover image URL", { exact: true })
    .fill("https://example.test/new.webp");
  await page
    .getByRole("button", { name: "Save vocabulary book", exact: true })
    .click();
  await expect
    .poll(() => store.vocabBooks[0].cover_url)
    .toBe("https://example.test/new.webp");
  await page
    .getByRole("button", { name: "Edit vocabulary book", exact: true })
    .click();
  await page.getByLabel("Remove current cover and use fallback").check();
  await page
    .getByRole("button", { name: "Save vocabulary book", exact: true })
    .click();
  await expect.poll(() => store.vocabBooks[0].cover_url).toBeNull();
  expect(store.vocabBooks[0].published).toBe(true);
  expect(store.words).toHaveLength(4);
});
