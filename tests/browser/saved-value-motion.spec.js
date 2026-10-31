import { test, expect } from "@playwright/test";
import { contentFixture } from "./helpers/content.js";

for (const reducedMotion of ["reduce", "no-preference"]) {
  test(`saved accuracy ring and counters settle once with ${reducedMotion} motion`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await contentFixture(page);
    await page.route("**/rest/v1/rpc/**", (route) =>
      route.fulfill({
        json: route.request().url().endsWith("/learning_metrics")
          ? {
              attempted: 240,
              first_correct: 120,
              first_known: 160,
              first_incorrect: 40,
              first_unknown: 80,
              eventually_correct: 140,
              study_seconds: 125,
              homework_completed: 3,
              homework_total: 8,
              vocabulary_known: 4,
              streak: 3,
              longest_streak: 7,
              attention: [],
              activity: [],
              breakdowns: [],
            }
          : null,
      }),
    );
    await page.goto("/progress");
    const ring = page.getByRole("img", {
      name: "All-time first-attempt accuracy: 75%",
      exact: true,
    });
    await expect(ring).toBeVisible();
    if (reducedMotion === "no-preference") {
      await expect(ring).toHaveAttribute("data-motion", "running");
      const start = await ring.locator(".ring-value").evaluate(async (node) => {
        const animation = node.getAnimations()[0];
        animation.pause();
        await animation.ready;
        animation.currentTime = 0;
        await new Promise(requestAnimationFrame);
        const offset = parseFloat(getComputedStyle(node).strokeDashoffset);
        animation.finish();
        return offset;
      });
      expect(start).toBe(100);
    }
    await expect(ring).toHaveAttribute("data-motion", "complete");
    await expect(ring.locator(".ring-value")).toHaveCSS(
      "stroke-dashoffset",
      "25px",
    );
    const card = page
      .locator(".metric-card")
      .filter({ has: page.getByText("Total study time", { exact: true }) });
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator("[data-motion]")).toHaveAttribute(
      "data-motion",
      "complete",
    );
    await expect(card.locator("strong")).toHaveText("2:05");
    const counter = page
      .locator(".metric-card")
      .filter({ has: page.getByText("Questions attempted", { exact: true }) });
    await counter.scrollIntoViewIfNeeded();
    await expect(counter.locator("[data-motion]")).toHaveAttribute(
      "data-motion",
      "complete",
    );
    await expect(counter.locator("strong")).toHaveText("240");
    await page.getByLabel("Color theme", { exact: true }).selectOption("dark");
    await expect(counter.locator("strong")).toHaveText("240");
    await expect(counter.locator("[data-motion]")).toHaveAttribute(
      "data-motion",
      "complete",
    );
    expect(
      await ring.evaluate(
        (node) => node.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0);
    await page.reload();
    await expect(page.getByLabel("Color theme", { exact: true })).toHaveValue(
      "dark",
    );
    await expect(ring).toHaveAttribute(
      "data-motion",
      reducedMotion === "reduce" ? "complete" : /running|complete/,
    );
  });
}
