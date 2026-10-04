import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
test("practice tools preserve answers, elimination, review marks and a working in-app calculator panel", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await page.route(
    "https://www.desmos.com/testing/collegeboard/graphing",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<label>Expression<input aria-label="Expression"></label><div>Graphing calculator</div>',
      }),
  );
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Start Practice Session" }).click();
  const answer = page.getByRole("radio").nth(1);
  await answer.check();
  await page.getByRole("button", { name: "Eliminate choice B" }).click();
  await expect(answer).toBeChecked();
  await expect(answer).toBeDisabled();
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Calculator", exact: true }),
  ).toBeVisible();
  await page
    .frameLocator('iframe[title="Desmos graphing calculator"]')
    .getByLabel("Expression")
    .fill("y=x^2");
  await page.getByRole("button", { name: "Close Calculator" }).click();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Desmos graphing calculator"]')
      .getByLabel("Expression"),
  ).toHaveValue("y=x^2");
  await page
    .getByRole("button", { name: "Reference sheet", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reference sheet", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("V = ⁴⁄₃πr³", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close Reference sheet" }).click();
  await expect(answer).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Marked for review", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restore choice B" }).click();
  await page.screenshot({
    path: "local-imports/correction-player-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "local-imports/correction-player-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect.poll(() => store.items[0].selected_answer).toBe(1);
  await page.reload();
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
});
test("placeholder choices in old snapshots are withheld instead of shown as interactive answers", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.questions[0].options = [
    "Choice A in the source image",
    "Choice B in the source image",
    "Choice C in the source image",
    "Choice D in the source image",
  ];
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Start Practice Session" }).click();
  await expect(
    page.getByText("This question’s answer choices need recovery.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(
    page.getByText("Choice A in the source image", { exact: true }),
  ).toHaveCount(0);
});
test("configured Desmos SDK mounts with graphing controls and falls back to the official calculator on SDK failure", async ({
  page,
}) => {
  await learningFixture(page);
  await page.addInitScript(() => {
    window.Desmos = {
      GraphingCalculator: (element, options) => {
        window.sdkOptions = options;
        element.innerHTML =
          '<label>Graph expression<input aria-label="Graph expression"></label>';
        return {
          getState: () => ({ expressions: [] }),
          setState: () => {},
          destroy: () => {},
        };
      },
    };
  });
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Start Practice Session" }).click();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(page.getByLabel("Graph expression")).toBeVisible();
  expect(await page.evaluate(() => window.sdkOptions.zoomButtons)).toBe(true);
  await page.reload();
  await page.evaluate(() => {
    window.Desmos.GraphingCalculator = () => {
      throw new Error("SDK unavailable");
    };
  });
  await page.route(
    "https://www.desmos.com/testing/collegeboard/graphing",
    (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Calculator fallback</p>",
      }),
  );
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(
    page.locator('iframe[title="Desmos graphing calculator"]'),
  ).toBeVisible();
  await expect(
    page.getByText(/Using the official testing calculator/),
  ).toBeVisible();
});
