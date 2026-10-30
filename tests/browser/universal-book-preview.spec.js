import { test, expect } from "@playwright/test";
import { contentFixture } from "./helpers/content.js";
test.use({ reducedMotion: "reduce" });
test("admin previews an original ZIP with real option images and typeset math at laptop and mobile widths", async ({
  page,
}) => {
  await contentFixture(page, "admin", { empty: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/admin/books");
  await page.getByRole("button", { name: "Import Book", exact: true }).click();
  await page
    .getByLabel("Choose or drop a satchi-book-v1 ZIP")
    .setInputFiles("assets/examples/satchi-book-v1/original-practice.zip");
  await expect(
    page.getByRole("heading", { name: "SAT’chi Original Practice" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Preview question", exact: true })
    .selectOption("1");
  await expect(page.locator(".preview-question img")).toHaveCount(4);
  for (const image of await page.locator(".preview-question img").all())
    await expect(image).toHaveJSProperty("naturalWidth", 32);
  await page
    .getByRole("combobox", { name: "Preview question", exact: true })
    .selectOption("2");
  await expect(page.locator(".preview-question .katex")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/sprint-import-laptop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/sprint-import-mobile.png",
    fullPage: true,
  });
  await page.getByLabel("Choose or drop a satchi-book-v1 ZIP").setInputFiles({
    name: "malformed.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("not an archive"),
  });
  await expect(page.getByRole("alert")).toContainText("ZIP must");
});
test("Battles home renders scoped public empty state and responsive configuration", async ({
  page,
}) => {
  await contentFixture(page);
  await page.route("**/rest/v1/rpc/battle_action", (route) =>
    route.fulfill({ json: { lobbies: [], history: [] } }),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/battles");
  await expect(
    page.getByRole("heading", { name: "Battles", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("No open lobbies yet. Create one and invite a friend."),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption("Vocabulary");
  await expect(
    page.getByRole("combobox", { name: "Vocabulary mode", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/sprint-battles-laptop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/sprint-battles-mobile.png",
    fullPage: true,
  });
});
