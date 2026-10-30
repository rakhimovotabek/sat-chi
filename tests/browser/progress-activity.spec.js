import { test, expect } from "@playwright/test";
import { contentFixture } from "./helpers/content.js";

for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`Progress settles on exact fixture values with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await contentFixture(page);
    await page.route("**/rest/v1/rpc/**", async (route) => {
      const endpoint = new URL(route.request().url()).pathname
        .split("/")
        .at(-1);
      if (endpoint === "learning_metrics")
        return route.fulfill({
          json: {
            attempted: 10,
            first_correct: 7,
            first_known: 10,
            first_incorrect: 3,
            eventually_correct: 10,
            now_correct: 10,
            first_unknown: 0,
            study_seconds: 0,
            homework_completed: 0,
            homework_total: 0,
            vocabulary_known: 0,
            breakdowns: [],
            attention: [],
          },
        });
      if (endpoint !== "progress_activity")
        return route.fulfill({ json: null });
      const { p_days, p_section } = route.request().postDataJSON();
      const empty = p_section === "Reading & Writing";
      return route.fulfill({
        json: {
          timezone: "Asia/Tashkent",
          questions: empty ? 0 : 10,
          known: empty ? 0 : 10,
          correct: empty ? 0 : 7,
          corrected: empty ? 0 : 3,
          accuracy: empty ? null : 70,
          days: Array.from({ length: p_days }, (_, i) => ({
            day: `2026-10-${String(i + 1).padStart(2, "0")}`,
            questions: !empty && i === 0 ? 10 : 0,
            known: !empty && i === 0 ? 10 : 0,
            correct: !empty && i === 0 ? 7 : 0,
            corrected: !empty && i === 0 ? 3 : 0,
            accuracy: !empty && i === 0 ? 70 : null,
          })),
        },
      });
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/progress");
    const panel = page.getByRole("region", { name: "First-attempt activity" });
    await expect(panel.getByRole("status")).toContainText(
      "70% first-attempt accuracy",
    );
    await expect(panel.locator(".progress-column")).toHaveCount(30);
    await expect
      .poll(() =>
        panel
          .locator(".progress-column > span")
          .first()
          .evaluate((el) => getComputedStyle(el).transform),
      )
      .toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    await panel.getByLabel("Activity metric").selectOption("accuracy");
    await expect(
      panel.locator(".progress-column > span").first(),
    ).toHaveAttribute("style", "height: 70%;");
    if (reducedMotion === "reduce")
      await expect(panel.locator(".progress-column > span").first()).toHaveCSS(
        "animation-name",
        "none",
      );
    await panel
      .getByText("Daily values and sample sizes", { exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("table")).toBeVisible();
    await panel.getByLabel("Activity period").selectOption("7");
    await expect(panel.locator("tbody tr")).toHaveCount(7);
    await panel.getByLabel("Activity subject").selectOption("Math");
    await expect(panel.getByRole("status")).toContainText("Math · Last 7 days");
    await page.screenshot({
      path: `test-results/progress-${reducedMotion}-laptop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/progress-${reducedMotion}-mobile.png`,
      fullPage: true,
    });
    await page.reload();
    await expect(panel.getByLabel("Activity period")).toHaveValue("7");
    await expect(panel.getByLabel("Activity subject")).toHaveValue("Math");
    await expect(panel.getByLabel("Activity metric")).toHaveValue("accuracy");
    await panel
      .getByLabel("Activity subject")
      .selectOption("Reading & Writing");
    await expect(
      panel.getByText("No graded questions in this period.", { exact: false }),
    ).toBeVisible();
    await expect(panel.getByRole("img")).toHaveCount(0);
  });
}
