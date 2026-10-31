import { test, expect } from "@playwright/test";
import { contentFixture, bookId, topicId } from "./helpers/content.js";

for (const theme of ["light", "dark"]) {
  test(`native inputs use the ${theme} surface and retain readable text`, async ({
    page,
  }) => {
    await contentFixture(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/books");
    await page.getByLabel("Color theme", { exact: true }).selectOption(theme);
    const input = page.getByPlaceholder("Search by title");
    await expect(input).toHaveCSS("transition-duration", "0s");
    await input.fill("Algebra");
    const styles = await input.evaluate((node) => {
      const css = getComputedStyle(node),
        root = getComputedStyle(document.documentElement);
      return {
        background: css.backgroundColor,
        color: css.color,
        placeholder: getComputedStyle(node, "::placeholder").color,
        surface: root.getPropertyValue("--surface").trim(),
        ink: root.getPropertyValue("--ink").trim(),
        colorScheme: css.colorScheme,
        transition: css.transitionDuration,
      };
    });
    expect(styles.colorScheme).toBe(theme);
    expect(styles.placeholder).toBe(
      theme === "light" ? "rgb(86, 105, 128)" : "rgb(168, 183, 207)",
    );
    await expect(input).toHaveCSS(
      "background-color",
      theme === "light" ? "rgb(255, 255, 255)" : "rgb(18, 31, 51)",
    );
    await expect(input).toHaveCSS(
      "color",
      theme === "light" ? "rgb(23, 43, 77)" : "rgb(230, 237, 252)",
    );
  });
}

test("practice content follows its wrapped header on tablet and mobile", async ({
  page,
}) => {
  await contentFixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page
    .getByRole("button", { name: "Start topic practice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Back to practice", exact: true }),
  ).toBeVisible();
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const geometry = await page.evaluate(() => {
      const header = document.querySelector(".topbar").getBoundingClientRect();
      const player = document
        .querySelector(".practice-page")
        .getBoundingClientRect();
      return {
        gap: player.top - header.bottom,
        rows: getComputedStyle(document.querySelector(".app-shell"))
          .gridTemplateRows,
      };
    });
    expect(geometry.gap, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
    expect(geometry.gap, JSON.stringify(geometry)).toBeLessThanOrEqual(48);
  }
});
