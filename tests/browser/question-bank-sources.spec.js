import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
import {
  COLLEGE_BOARD_TAXONOMY,
  COLLEGE_BOARD_URL,
} from "../../src/features/learning/college-board-taxonomy.js";

const source = (page, name) =>
  page
    .getByRole("group", { name: "Question bank source", exact: true })
    .getByRole("button", { name, exact: true });

test("SAT'chi remains default; independent filters, volume and mode survive switches and reload", async ({
  page,
}) => {
  await learningFixture(page);
  await page.goto("/question-bank");
  await page.evaluate(() => {
    window.bankSwitchMarker = "same-document";
  });
  await expect(source(page, "SAT'chi Bank")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await page.getByRole("button", { name: "30 questions", exact: true }).click();
  await page.getByRole("button", { name: "Timed", exact: true }).click();
  await page
    .getByRole("button", { name: "Expand Algebra skills", exact: true })
    .click();
  await source(page, "College Board").click();
  expect(await page.evaluate(() => window.bankSwitchMarker)).toBe(
    "same-document",
  );
  await expect(
    page.getByRole("button", { name: "Hard", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Reading & Writing", exact: true })
    .click();
  await page.getByRole("button", { name: "Medium", exact: true }).click();
  await source(page, "SAT'chi Bank").click();
  await expect(
    page.getByRole("button", { name: "Hard", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Math", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "30 questions", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Timed", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Collapse Algebra skills", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await source(page, "College Board").click();
  await page.reload();
  await expect(source(page, "College Board")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Reading & Writing", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Medium", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await source(page, "SAT'chi Bank").click();
  await expect(
    page.getByRole("button", { name: "Hard", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("College Board has accurate domains and skills, unavailable counts and no SAT'chi data requests", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await page.goto("/question-bank");
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await source(page, "College Board").click();
  const requests = store.requests.length;
  for (const [section, domains] of Object.entries(COLLEGE_BOARD_TAXONOMY)) {
    await page.getByRole("button", { name: section, exact: true }).click();
    for (const [domain, skills] of Object.entries(domains)) {
      await page
        .getByRole("button", { name: `Expand ${domain} skills`, exact: true })
        .click();
      const group = page
        .locator(".bank-domain:visible")
        .filter({ has: page.getByText(domain, { exact: true }) });
      for (const skill of skills)
        await expect(group.getByText(skill, { exact: true })).toBeVisible();
      await expect(group.locator(".bank-count").first()).toHaveText("—");
    }
  }
  await expect(
    page.getByRole("button", { name: "Start Practice Session" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Previous practice" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("combobox", { name: "Marked for review" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("link", { name: "Open official Question Bank" }),
  ).toHaveAttribute("href", COLLEGE_BOARD_URL);
  await expect(
    page.getByRole("heading", { name: "Matching questions" }),
  ).toHaveCount(0);
  expect(
    store.requests
      .slice(requests)
      .filter((r) => /question_bank|start_bank_practice/.test(r.path)),
  ).toHaveLength(0);
  await page.reload();
  const afterReload = store.requests.length;
  await page.getByRole("button", { name: "Easy", exact: true }).click();
  expect(
    store.requests
      .slice(afterReload)
      .filter((r) => /question_bank|start_bank_practice/.test(r.path)),
  ).toHaveLength(0);
});

test("source switching leaves saved answers and marks intact and SAT'chi starts its existing engine", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await page.goto("/question-bank");
  await page.getByRole("button", { name: "Start Practice Session" }).click();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await page
    .getByRole("button", { name: "Mark for review", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Answer save status" }),
  ).toHaveText("All changes saved");
  // The study timer may flush active_seconds while leaving the player. Compare
  // answer/progress fields independently of that legitimate elapsed-time write.
  const progress = () => store.items.map(({ active_seconds, ...item }) => item);
  const practiceUrl = page.url(),
    snapshot = structuredClone(progress());
  await page
    .getByRole("link", { name: "Question Bank", exact: true })
    .first()
    .click();
  await source(page, "College Board").click();
  await source(page, "SAT'chi Bank").click();
  expect(progress()).toEqual(snapshot);
  await page.goto(practiceUrl);
  await page.reload();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Marked for review", exact: true }),
  ).toBeVisible();
});

for (const width of [1440, 390, 320])
  test(`source selector and College Board layout fit ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await learningFixture(page);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/question-bank");
    await source(page, "College Board").click();
    await expect(
      page.getByRole("heading", { name: "Local practice unavailable" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const selected = source(page, "College Board");
    await selected.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(selected).toBeFocused();
    expect(
      await selected.evaluate((el) => getComputedStyle(el).outlineStyle),
    ).not.toBe("none");
    const bounds = await selected.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(48);
    await page.screenshot({
      path: `local-imports/college-board-${width}.png`,
      fullPage: true,
    });
    await testInfo.attach("College Board layout", {
      path: `local-imports/college-board-${width}.png`,
      contentType: "image/png",
    });
    expect(errors).toEqual([]);
  });
