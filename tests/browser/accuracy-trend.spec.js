import { test, expect } from "@playwright/test";
import { contentFixture } from "./helpers/content.js";

for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`accuracy line uses exact daily samples and genuine gaps with ${reducedMotion} motion`, async ({
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
            attempted: 20,
            first_correct: 14,
            first_known: 20,
            first_incorrect: 6,
            eventually_correct: 20,
            now_correct: 20,
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
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const days = Array.from({ length: p_days }, (_, index) => {
        const day = new Date(today.getTime() - (p_days - index - 1) * 86400000)
          .toISOString()
          .slice(0, 10);
        const known = empty
          ? 0
          : index === 0
            ? 10
            : [2, 3].includes(index)
              ? 5
              : 0;
        const correct = index === 0 ? 7 : index === 2 ? 2 : 5;
        return {
          day,
          questions: known,
          known,
          correct: known ? correct : 0,
          corrected: known ? known - correct : 0,
          accuracy: known ? (100 * correct) / known : null,
        };
      });
      return route.fulfill({
        json: {
          timezone: "UTC",
          questions: empty ? 0 : 20,
          known: empty ? 0 : 20,
          correct: empty ? 0 : 14,
          corrected: empty ? 0 : 6,
          accuracy: empty ? null : 70,
          days,
        },
      });
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/progress");
    const panel = page.getByRole("region", { name: "First-attempt activity" });
    await panel.getByLabel("Activity period").selectOption("7");
    await panel.getByLabel("Activity metric").selectOption("accuracy-trend");
    const chart = panel.locator(".progress-trend-chart");
    await chart.scrollIntoViewIfNeeded();
    await expect(chart.locator("circle")).toHaveCount(3);
    await expect(chart.locator("path")).toHaveCount(1);
    await expect(chart.locator("path")).toHaveAttribute(
      "d",
      "M204 105.6 L300 12",
    );
    if (reducedMotion === "no-preference") {
      await expect(chart).toHaveAttribute("data-motion", "running");
      const baselineError = await chart.evaluate(async (node) => {
        const animations = node.getAnimations({ subtree: true });
        animations.forEach((animation) => {
          animation.pause();
          animation.currentTime = 0;
        });
        await new Promise(requestAnimationFrame);
        const svg = node.querySelector("svg").getBoundingClientRect();
        const marker = node.querySelector("circle").getBoundingClientRect();
        const difference = Math.abs(
          marker.top + marker.height / 2 - (svg.top + (svg.height * 168) / 180),
        );
        animations.forEach((animation) => animation.play());
        return difference;
      });
      expect(baselineError).toBeLessThan(1);
    }
    await expect(chart).toHaveAttribute("data-motion", "complete");
    expect(
      await chart
        .locator("circle")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-accuracy")),
        ),
    ).toEqual(["70", "40", "100"]);
    await expect(chart.locator("circle").first()).toHaveAttribute(
      "cy",
      "58.80000000000001",
    );
    expect(
      await chart.evaluate(
        (node) => node.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await panel
      .getByText("Daily values and sample sizes", { exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(panel.locator("tbody tr")).toHaveCount(7);
    await expect(panel.getByRole("status")).toContainText(
      "70% first-attempt accuracy",
    );
    await expect(chart).toHaveAttribute("data-motion", "complete");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(panel.locator(".accuracy-y-axis")).toHaveCSS(
      "font-size",
      "14px",
    );
    await page.reload();
    await expect(panel.getByLabel("Activity metric")).toHaveValue(
      "accuracy-trend",
    );
    await panel
      .getByLabel("Activity subject")
      .selectOption("Reading & Writing");
    await expect(
      panel.getByText("No graded questions in this period.", { exact: false }),
    ).toBeVisible();
    await expect(panel.getByRole("img")).toHaveCount(0);
  });
}
