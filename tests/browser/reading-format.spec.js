import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { contentFixture, bookId, topicId } from "./helpers/content.js";

// Real repaired source passages from two imported books, retained as audit examples.
for (const example of JSON.parse(
  await readFile("tests/fixtures/reading-format.json", "utf8"),
)) {
  test(`source ${example.source_id} formatting survives session reload`, async ({
    page,
  }) => {
    const store = await contentFixture(page);
    Object.assign(store.questions[0], {
      id: example.id,
      passage: example.passage.replace(/<\/?u>/g, ""),
      passage_markup: example.passage,
      question_text: example.prompt,
      options: example.options,
      section: "Reading & Writing",
    });
    await page.goto(`/books/${bookId}/topics/${topicId}`);
    await page.getByRole("button", { name: "Start topic practice" }).click();
    const passage = page.locator(".stimulus-panel .reading-text").first();
    await expect(passage).toBeVisible();
    if (example.passage.includes("_____"))
      await expect(passage).toContainText("_____");
    if (example.underlined) {
      await expect(passage.locator("u").first()).toHaveText(example.underlined);
      await expect(passage.locator("u").first()).toHaveCSS(
        "text-decoration-line",
        "underline",
      );
    }
    await expect(page.getByRole("radio")).toHaveCount(4);
    await expect(passage).not.toContainText("<u>");
    await page.reload();
    if (example.underlined)
      await expect(passage.locator("u").first()).toHaveText(example.underlined);
    if (example.passage.includes("_____"))
      await expect(passage).toContainText("_____");
    if (example.underlined) {
      store.items[0].question.passage = "A later verified passage edit.";
      await page.reload();
      await expect(passage).toHaveText("A later verified passage edit.");
      await expect(passage.locator("u")).toHaveCount(0);
    }
  });
}

test("formatting renderer blocks executable markup and keeps Math readable", async ({
  page,
}) => {
  const store = await contentFixture(page);
  store.questions[0].passage =
    'Math: 2 < 5; _____ <u onclick="window.injection=true">x + 1</u><br><em>Note</em><script>window.injection=true</script><img src=x onerror="window.injection=true">';
  store.questions[0].options[0] = '<u onclick="window.injection=true">term</u>';
  await page.goto(`/books/${bookId}/topics/${topicId}`);
  await page.getByRole("button", { name: "Start topic practice" }).click();
  const passage = page.locator(".stimulus-panel .reading-text").first();
  await expect(page.locator(".answer-choice u")).toHaveText("term");
  await expect(page.locator(".answer-choice [onclick]")).toHaveCount(0);
  await expect(passage).toContainText("Math: 2 < 5; _____ x + 1");
  await expect(passage.locator("script,img,[onclick]")).toHaveCount(0);
  expect(await page.evaluate(() => window.injection)).toBeUndefined();
  await page.getByRole("radio").nth(1).check();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await expect(page.locator(".answer-choice.correct-choice")).toBeVisible();
});
