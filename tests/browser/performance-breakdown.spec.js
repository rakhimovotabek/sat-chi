import { test, expect } from "@playwright/test";
import { contentFixture } from "./helpers/content.js";

for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`performance bars preserve known denominators and section context with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await contentFixture(page);
    await page.route("**/rest/v1/rpc/**", async (route) => {
      if (!route.request().url().endsWith("/learning_metrics"))
        return route.fulfill({ json: null });
      return route.fulfill({
        json: {
          attempted: 24,
          first_correct: 10,
          first_known: 13,
          first_incorrect: 3,
          study_seconds: 0,
          homework_completed: 0,
          homework_total: 0,
          vocabulary_known: 0,
          attention: [],
          breakdowns: [
            {
              section: "Math",
              domain: "Algebra",
              skill: "Shared",
              source: "Original",
              attempted: 20,
              first_known: 10,
              correct: 10,
              incorrect: 0,
            },
            {
              section: "Math",
              domain: "Geometry",
              skill: "Shapes",
              source: "Original",
              attempted: 2,
              first_known: 2,
              correct: 0,
              incorrect: 2,
            },
            {
              section: "Reading & Writing",
              domain: "Information & Ideas",
              skill: "Shared",
              source: "Original",
              attempted: 1,
              first_known: 1,
              correct: 0,
              incorrect: 1,
            },
            {
              section: "Math",
              domain: "Unclassified",
              source: "Original",
              attempted: 1,
              first_known: 0,
              correct: 0,
              incorrect: 0,
            },
          ],
        },
      });
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/progress");
    const panel = page.getByRole("region", {
      name: "Performance breakdown",
      exact: true,
    });
    const chart = panel.getByRole("group", {
      name: "All-time domain first-attempt accuracy",
    });
    await chart.scrollIntoViewIfNeeded();
    if (reducedMotion === "no-preference") {
      await expect(chart).toHaveAttribute("data-motion", "running");
      const width = await chart.evaluate(async (node) => {
        const animations = node.getAnimations({ subtree: true });
        animations.forEach((animation) => animation.pause());
        await Promise.all(animations.map((animation) => animation.ready));
        animations.forEach((animation) => {
          animation.currentTime = 0;
        });
        await new Promise(requestAnimationFrame);
        const result = Math.max(
          ...[...node.querySelectorAll("[data-chart-grow]")].map(
            (bar) => bar.getBoundingClientRect().width,
          ),
        );
        animations.forEach((animation) => animation.play());
        await Promise.all(animations.map((animation) => animation.ready));
        return result;
      });
      expect(width).toBeLessThan(1);
    }
    await expect(chart).toHaveAttribute("data-motion", "complete");
    const widths = await chart
      .locator("[data-chart-grow]")
      .evaluateAll((nodes) =>
        nodes.map(
          (bar) =>
            bar.getBoundingClientRect().width /
            bar.parentElement.getBoundingClientRect().width,
        ),
      );
    expect(widths).toEqual([0, 0, 1]);
    await expect(chart.locator("li").last()).toContainText("Unavailable");
    await expect(chart.locator("li").nth(2)).toContainText(
      "20 attempted · partial history",
    );
    await expect(chart.locator("li").first()).toContainText("small sample");
    await panel.getByText("Exact performance values", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(panel.locator("tbody tr")).toHaveCount(4);
    await expect(chart).toHaveAttribute("data-motion", "complete");
    expect(
      await chart.evaluate(
        (node) => node.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await panel.getByLabel("Break down by").selectOption("skill");
    const skills = panel.getByRole("group", {
      name: "All-time skill first-attempt accuracy",
      exact: true,
    });
    await skills.scrollIntoViewIfNeeded();
    await expect(skills).toHaveAttribute("data-motion", "complete");
    await expect(skills.locator("li strong")).toContainText([
      "Math · Shapes",
      "Reading & Writing · Shared",
      "Math · Shared",
      "Math · Unclassified",
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}
