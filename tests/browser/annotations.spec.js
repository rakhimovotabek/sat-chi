import { test, expect } from "@playwright/test";
import { contentFixture, bookId, topicId } from "./helpers/content.js";

async function open(page, kind = "book", setup = () => {}) {
  const store = await contentFixture(page);
  setup(store);
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  if (kind !== "book") {
    store.session.kind = kind;
    await page.reload();
  }
  await expect(
    page.getByRole("button", { name: "Pen", exact: true }),
  ).toBeVisible();
  return store;
}
async function ink(layer) {
  return layer.evaluate((canvas) => {
    const data = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
    return count;
  });
}
async function draw(page, layer, x = 55, y = 80, expectInk = true) {
  await layer.scrollIntoViewIfNeeded();
  const b = await layer.boundingBox();
  await page.mouse.move(b.x + x, b.y + y);
  await page.mouse.down();
  await page.mouse.move(b.x + x + 100, b.y + y, { steps: 15 });
  await page.mouse.up();
  if (expectInk) await expect.poll(() => ink(layer)).toBeGreaterThan(0);
}
for (const kind of ["book", "bank", "homework"]) {
  test(`${kind} drawing isolates questions, restores ink, erases, clears and leaves answers usable`, async ({
    page,
  }) => {
    const store = await open(page, kind),
      layer = page.getByLabel("Drawing layer over passage");
    await expect(layer).toHaveCSS("pointer-events", "none");
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    await expect(layer).toHaveCSS("pointer-events", "auto");
    await draw(page, layer);
    const painted = await ink(layer);
    await page.getByRole("button", { name: "Eraser", exact: true }).click();
    await draw(page, layer, 55, 80, false);
    await expect.poll(() => ink(layer)).toBeLessThan(painted);
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    await draw(page, layer, 55, 110);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect.poll(() => ink(layer)).toBe(0);
    await page.getByRole("button", { name: "Previous", exact: true }).click();
    await expect.poll(() => ink(layer)).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Exit drawing mode", exact: true })
      .click();
    await expect(layer).toHaveCSS("pointer-events", "none");
    await page.reload();
    await expect.poll(() => ink(layer)).toBeGreaterThan(0);
    await page.getByRole("radio").nth(1).check();
    if (kind !== "homework") {
      await page.getByRole("button", { name: "Check", exact: true }).click();
      await expect(page.locator(".answer-choice.correct-choice")).toBeVisible();
      await page
        .getByRole("button", { name: "Explanation", exact: true })
        .click();
      await expect(
        page.getByText("Divide both sides by 2 to obtain x = 4.", {
          exact: true,
        }),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("status")).toHaveText("All changes saved");
      expect(store.items[0].selected_answer).toBe(1);
    }
    await page.getByRole("button", { name: "Pen", exact: true }).click();
    await page
      .getByRole("button", { name: "Clear annotations", exact: true })
      .click();
    await expect.poll(() => ink(layer)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(layer).toHaveCSS("pointer-events", "none");
  });
}

test("passage underline formatting and source images remain visible under transparent drawing layers", async ({
  page,
}) => {
  await page.route("https://example.test/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="180"><path d="M20 150 L300 30" stroke="black"/></svg>',
    }),
  );
  await open(page, "book", (store) =>
    Object.assign(store.questions[0], {
      section: "Reading & Writing",
      passage: "The researcher found _____ results.",
      passage_markup: "The <u>researcher</u> found _____ results.",
      image_url: "https://example.test/graph.svg",
    }),
  );
  await expect(page.locator(".stimulus-panel u")).toHaveText("researcher");
  const image = page.locator(".stimulus-panel img").first();
  await expect(image).toBeVisible();
  expect(await image.evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const layer = page.getByLabel("Drawing layer over passage");
  await expect(layer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await draw(page, layer);
  await page.screenshot({
    path: "test-results/annotations-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Exit drawing mode", exact: true })
    .click();
  await expect(page.locator(".stimulus-panel u")).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
  await page.getByRole("radio").nth(1).check();
});

test("drawing on answer cards intentionally captures input; exiting restores open-response typing", async ({
  page,
}) => {
  const store = await open(page, "book", (store) =>
    Object.assign(store.questions[0], { question_type: "open", options: [] }),
  );
  const layer = page.getByLabel("Drawing layer over answers");
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await draw(page, layer);
  expect(store.items[0].selected_response).toBeUndefined();
  await page
    .getByRole("button", { name: "Exit drawing mode", exact: true })
    .click();
  await page.getByLabel("Your answer").fill("25");
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page.reload();
  await expect(page.getByLabel("Your answer")).toHaveValue("25");
  await expect.poll(() => ink(layer)).toBeGreaterThan(0);
});

test("mobile finger drawing captures touch only while active and survives a viewport resize", async ({
  page,
}) => {
  await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const layer = page.getByLabel("Drawing layer over passage");
  await expect(layer).toHaveCSS("touch-action", "auto");
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  await layer.scrollIntoViewIfNeeded();
  await expect(layer).toHaveCSS("touch-action", "none");
  const b = await layer.boundingBox(),
    cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: b.x + 50, y: b.y + Math.min(25, b.height / 3) }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: b.x + 150, y: b.y + Math.min(40, (b.height * 2) / 3) }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(() => ink(layer)).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Exit drawing mode", exact: true })
    .click();
  await expect(layer).toHaveCSS("touch-action", "auto");
  await expect(layer).toHaveCSS("pointer-events", "none");
  await page.setViewportSize({ width: 430, height: 900 });
  await expect.poll(() => ink(layer)).toBeGreaterThan(0);
  await page.getByRole("radio").nth(1).check();
  await page.screenshot({
    path: "test-results/annotations-mobile.png",
    fullPage: true,
  });
});

test("stylus pointer events draw and storage errors stay separate from answer saves", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Pen", exact: true }).click();
  const layer = page.getByLabel("Drawing layer over passage");
  await layer.scrollIntoViewIfNeeded();
  const b = await layer.boundingBox(),
    cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: b.x + 45,
    y: b.y + 45,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "pen",
    force: 0.5,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: b.x + 135,
    y: b.y + 65,
    button: "none",
    buttons: 1,
    pointerType: "pen",
    force: 0.6,
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: b.x + 135,
    y: b.y + 65,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "pen",
  });
  await expect.poll(() => ink(layer)).toBeGreaterThan(0);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("satchi:drawings:"))
        throw new DOMException("Quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await draw(page, layer, 60, 110);
  await expect(page.getByRole("alert")).toContainText(
    "could not be saved on this device",
  );
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await page
    .getByRole("button", { name: "Exit drawing mode", exact: true })
    .click();
  await page.getByRole("radio").nth(1).check();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
});
