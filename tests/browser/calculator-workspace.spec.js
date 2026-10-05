import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
async function openCalculator(
  page,
  { sdk = false, width = 1440, height = 1000 } = {},
) {
  await page.setViewportSize({ width, height });
  const store = await learningFixture(page);
  if (sdk)
    await page.addInitScript(() => {
      window.sdkMounts = 0;
      window.sdkResizes = 0;
      window.Desmos = {
        GraphingCalculator: (element) => {
          window.sdkMounts++;
          element.innerHTML =
            '<label>Expression<input aria-label="Expression"></label>';
          const input = element.querySelector("input");
          return {
            getState: () => ({ text: input.value }),
            setState: (s) => {
              input.value = s.text;
            },
            resize: () => window.sdkResizes++,
            destroy: () => {},
          };
        },
      };
    });
  else
    await page.route(
      "https://www.desmos.com/testing/collegeboard/graphing",
      (r) =>
        r.fulfill({
          contentType: "text/html",
          body: '<style>html,body{margin:0;height:100%;background:#f5f7fb}label{display:block;padding:20px}input{padding:10px}</style><label>Expression<input aria-label="Expression"></label><p>Graphing canvas</p>',
        }),
    );
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Start Practice Session" }).click();
  await expect(
    page.getByRole("button", { name: "Question 1 of 3", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Calculator", exact: true });
  await expect(panel).toBeVisible();
  return {
    store,
    panel,
    expression: sdk
      ? page.getByLabel("Expression")
      : page
          .frameLocator('iframe[title="Desmos graphing calculator"]')
          .getByLabel("Expression"),
  };
}
async function drag(page, locator, dx, dy) {
  const b = await locator.boundingBox();
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}
const bounds = (locator) => locator.boundingBox();
test("desktop docks into layout, divider resizes, toggles without iframe reload, and close restores question width", async ({
  page,
}) => {
  const { panel, expression, store } = await openCalculator(page);
  await expect(panel).toHaveAttribute("data-mode", "docked");
  await expression.fill("y=x^2");
  const question = page.locator(".question-player"),
    calculator = await bounds(panel),
    q = await bounds(question);
  expect(q.x).toBeGreaterThanOrEqual(calculator.x + calculator.width);
  expect(
    (await bounds(page.locator(".answer-choices"))).x,
  ).toBeGreaterThanOrEqual(calculator.x + calculator.width);
  const separator = page.getByRole("separator", { name: "Calculator width" });
  await drag(page, separator, 60, 0);
  expect((await bounds(panel)).width).toBeGreaterThan(calculator.width + 30);
  await separator.focus();
  await page.keyboard.press("ArrowLeft");
  expect((await bounds(panel)).width).toBeLessThan(calculator.width + 60);
  await page
    .getByRole("button", { name: "Float calculator", exact: true })
    .click();
  await expect(panel).toHaveAttribute("data-mode", "floating");
  await expect(expression).toHaveValue("y=x^2");
  await page
    .getByRole("button", { name: "Dock calculator", exact: true })
    .click();
  await expect(panel).toHaveAttribute("data-mode", "docked");
  await expect(expression).toHaveValue("y=x^2");
  await page
    .getByRole("button", { name: "Close Calculator", exact: true })
    .click();
  expect((await bounds(question)).width).toBeGreaterThan(q.width + 300);
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  expect(store.items[0].selected_answer).toBe(1);
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(expression).toHaveValue("y=x^2");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "local-imports/calculator-docked-desktop.png",
    fullPage: true,
  });
});
test("floating header drags and every corner resizes with bounded geometry remembered on reopen and reload", async ({
  page,
}) => {
  const { panel, expression } = await openCalculator(page);
  await expression.fill("y=3x");
  await page.getByRole("button", { name: "Float calculator" }).click();
  const start = await bounds(panel);
  await drag(page, panel.locator("h2"), 80, 50);
  let current = await bounds(panel);
  expect(current.x).toBeCloseTo(start.x + 80, 0);
  expect(current.y).toBeCloseTo(start.y + 50, 0);
  for (const corner of [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ]) {
    const before = await bounds(panel);
    await drag(
      page,
      page.getByRole("button", {
        name: `Resize calculator ${corner}`,
        exact: true,
      }),
      corner.endsWith("left") ? -18 : 18,
      corner.startsWith("top") ? -18 : 18,
    );
    current = await bounds(panel);
    expect(current.width).toBeGreaterThan(before.width + 10);
    expect(current.height).toBeGreaterThan(before.height + 10);
  }
  await expect(expression).toHaveValue("y=3x");
  await page.getByRole("button", { name: "Close Calculator" }).click();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  expect((await bounds(panel)).width).toBeCloseTo(current.width, 0);
  await expect(expression).toHaveValue("y=3x");
  await page.reload();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(panel).toHaveAttribute("data-mode", "floating");
  const restored = await bounds(panel);
  expect(restored.width).toBeCloseTo(current.width, 0);
  expect(restored.x).toBeCloseTo(current.x, 0);
  await drag(page, panel.locator("h2"), -2000, -2000);
  const limited = await bounds(panel);
  expect(limited.x).toBeGreaterThanOrEqual(8);
  expect(limited.y).toBeGreaterThanOrEqual(8);
  await page.setViewportSize({ width: 1000, height: 600 });
  await expect
    .poll(async () => {
      const fit = await bounds(panel);
      return fit.x + fit.width <= 992 && fit.y + fit.height <= 592;
    })
    .toBe(true);
});
test("SDK instance and expression survive docking, floating, resizing, closing and question navigation", async ({
  page,
}) => {
  const { panel, expression } = await openCalculator(page, { sdk: true });
  await expression.fill("y=sin(x)");
  await page.getByRole("button", { name: "Float calculator" }).click();
  await drag(
    page,
    page.getByRole("button", {
      name: "Resize calculator bottom-right",
      exact: true,
    }),
    40,
    30,
  );
  await page.getByRole("button", { name: "Dock calculator" }).click();
  await expect(expression).toHaveValue("y=sin(x)");
  await page.getByRole("button", { name: "Close Calculator" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(panel).toBeVisible();
  await expect(expression).toHaveValue("y=sin(x)");
  expect(await page.evaluate(() => window.sdkMounts)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.sdkResizes))
    .toBeGreaterThan(1);
});
test("narrow tablet and mobile stay in the panel, and desktop restores docking without losing answers", async ({
  page,
}) => {
  const { panel, expression } = await openCalculator(page, {
    width: 1000,
    height: 800,
  });
  await expect(panel).toHaveAttribute("data-mode", "stacked");
  await expression.fill("y=2x");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveAttribute("data-mode", "stacked");
  const mobile = await bounds(panel);
  expect(mobile.width).toBeLessThanOrEqual(390);
  expect(mobile.height).toBeLessThanOrEqual(600);
  const question = await page.locator(".question-player").boundingBox();
  expect(question.y).toBeGreaterThanOrEqual(mobile.y + mobile.height);
  await expect(expression).toHaveValue("y=2x");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "local-imports/calculator-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close Calculator" }).click();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(panel).toHaveAttribute("data-mode", "docked");
  await expect(expression).toHaveValue("y=2x");
});
