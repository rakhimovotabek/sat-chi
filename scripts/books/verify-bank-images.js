import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { privateStorageClient } from "../imports/private-storage.js";

const transport = globalThis.fetch;
globalThis.fetch = (url, options = {}) =>
  transport(url, {
    ...options,
    signal: options.signal ?? AbortSignal.timeout(20000),
  });
// Explicit live verification only. No test users, password changes, or emails.
if (!process.argv.includes("--live"))
  throw new Error("Explicit --live required");
const baseURL =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://localhost:5173";
const env = Object.fromEntries(
  (await readFile(".env", "utf8"))
    .split(/\r?\n/)
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => {
      const index = line.indexOf("=");
      return [
        line.slice(0, index),
        line
          .slice(index + 1)
          .trim()
          .replace(/^["']|["']$/g, ""),
      ];
    }),
);
const project = "ileffhbbaomfimwulvpw",
  bid = "6b70f3f6-f00c-5a9c-ac6f-7d253e78503b";
assert.equal(new URL(env.VITE_SUPABASE_URL).hostname, `${project}.supabase.co`);
const directory = "local-imports/four-fixes-live";
await mkdir(directory, { recursive: true, mode: 0o700 });
const admin = await privateStorageClient(project);
const checked = (result) => {
  if (result.error) throw new Error(result.error.message);
  return result.data;
};
const profiles = checked(
  await admin
    .from("profiles")
    .select("id,display_name,onboarding_completed")
    .eq("role", "student")
    .eq("active", true)
    .eq("onboarding_completed", true),
);
const users = checked(
  await admin.auth.admin.listUsers({ perPage: 1000 }),
).users;
const eligible = profiles.filter((p) =>
  users.some((u) => u.id === p.id && u.email_confirmed_at),
);
const profile =
  eligible.find((p) => /test|fixture/i.test(p.display_name)) || eligible[0];
if (!profile)
  throw new Error("No existing confirmed, active, onboarded student available");
const user = users.find((u) => u.id === profile.id);
const link = checked(
  await admin.auth.admin.generateLink({ type: "magiclink", email: user.email }),
);
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { session } = checked(
  await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  }),
);
assert.equal(checked(await client.auth.getUser()).user.id, profile.id);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const sessions = [];
const report = {
  bookQuestions: 589,
  flatTopics: 5,
  questionImagesTested: 0,
  imageOptionQuestionsTested: 0,
  optionImagesTested: 0,
};
const login = async (value) => {
  await page.goto(`${baseURL}/login`);
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: `sb-${project}-auth-token`, value },
  );
};
const loaded = async (selector) =>
  expect
    .poll(
      () =>
        page
          .locator(selector)
          .evaluateAll(
            (images) =>
              images.length > 0 &&
              images.every((i) => i.complete && i.naturalWidth > 0),
          ),
      { timeout: 30000 },
    )
    .toBe(true);
const panel = page.getByRole("dialog", { name: "Calculator", exact: true });
async function calculator() {
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(panel).toBeVisible();
  const desktop = await panel.boundingBox();
  const question = await page.locator(".question-player").boundingBox();
  if ((await panel.getAttribute("data-mode")) === "docked")
    assert.ok(desktop.x + desktop.width <= question.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveAttribute("data-mode", "stacked");
  const mobile = await panel.boundingBox();
  const mq = await page.locator(".question-player").boundingBox();
  assert.ok(mq.y >= mobile.y + mobile.height);
  await page.getByRole("button", { name: "Close Calculator" }).click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  await login(session);
  await page.goto(`${baseURL}/question-bank`);
  await page.getByLabel("Book / source", { exact: true }).selectOption(bid);
  await expect(
    page.getByRole("heading", { name: "589 questions match", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await loaded(".bank-question-preview img");
  report.bankCatalogImagesLoaded = true;
  const sid = checked(
    await client.rpc("start_bank_practice", {
      p_filters: { book: bid, topic: "6eab95ca-edf0-52c7-a3d7-56c8fb4515b5" },
      p_count: 20,
      p_timed: false,
    }),
  );
  sessions.push(sid);
  const items = checked(
    await admin
      .from("book_practice_items")
      .select("*")
      .eq("session_id", sid)
      .order("position"),
  );
  assert.equal(items.length, 20);
  const selected = items
    .filter((i) => i.question.question_type === "mcq")
    .slice(0, 3);
  assert.equal(selected.length, 3);
  const jump = async (index) => {
    await page.getByRole("button", { name: /^Question \d+ of 20$/ }).click();
    await page
      .getByRole("button", { name: new RegExp(`^Question ${index + 1},`) })
      .click();
  };
  await page.goto(`${baseURL}/practice/${sid}`);
  await calculator();
  for (const selectedItem of selected) {
    const index = selectedItem.position;
    await jump(index);
    await expect(
      page.getByRole("button", {
        name: `Question ${index + 1} of 20`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Explanation", exact: true }),
    ).toHaveCount(0);
    await loaded(".stimulus-panel img");
    await loaded(".answer-choices img");
    await expect(page.locator(".answer-choices img")).toHaveCount(4);
    const key = checked(
      await admin
        .from("book_practice_keys")
        .select("correct_answer")
        .eq("item_id", items[index].id)
        .single(),
    );
    await page
      .getByRole("radio")
      .nth((key.correct_answer + 1) % 4)
      .check();
    await page
      .getByRole("button", { name: "Explanation", exact: true })
      .click();
    await loaded(".book-explanation-control img");
    const noAttempt = await admin
      .from("question_check_attempts")
      .select("id", { count: "exact", head: true })
      .eq("item_id", items[index].id);
    checked(noAttempt);
    assert.equal(noAttempt.count, 0);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(
      page.getByText("That answer is incorrect. Try another choice."),
    ).toBeVisible();
    await page.getByRole("radio").nth(key.correct_answer).check();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(
      page.getByText("Solved. Continue to the next question."),
    ).toBeVisible();
    report.questionImagesTested++;
    report.imageOptionQuestionsTested++;
    report.optionImagesTested += 4;
  }
  await page.reload();
  await loaded(".stimulus-panel img");
  await loaded(".answer-choices img");
  report.refresh = true;
  console.log(
    JSON.stringify({
      stage: "three-real-image-option-questions-and-refresh-passed",
    }),
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  let link2;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: user.email,
    });
    if (!result.error) {
      link2 = result.data;
      break;
    }
    if (attempt === 2) checked(result);
  }
  const { session: session2 } = checked(
    await client.auth.verifyOtp({
      token_hash: link2.properties.hashed_token,
      type: "magiclink",
    }),
  );
  await login(session2);
  await page.goto(`${baseURL}/practice/${sid}`);
  await loaded(".stimulus-panel img");
  await loaded(".answer-choices img");
  report.logoutLogin = true;
  await page.setViewportSize({ width: 390, height: 844 });
  await loaded(".stimulus-panel img");
  await loaded(".answer-choices img");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  report.mobile = true;
  await page.screenshot({
    path: `${directory}/bank-mobile.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const openItem = items.find((i) => i.question.question_type === "open");
  if (openItem) {
    await jump(openItem.position);
    await loaded(".stimulus-panel img");
    report.questionImagesTested++;
    await page
      .getByLabel("Your answer", { exact: true })
      .fill("incorrect-verification-answer");
    await page
      .getByRole("button", { name: "Explanation", exact: true })
      .click();
    await loaded(".book-explanation-control img");
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(
      page.getByText("That answer is incorrect. Try another choice."),
    ).toBeVisible();
    const key = checked(
      await admin
        .from("book_practice_open_keys")
        .select("accepted_answers")
        .eq("item_id", openItem.id)
        .single(),
    );
    await page
      .getByLabel("Your answer", { exact: true })
      .fill(key.accepted_answers[0]);
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await expect(
      page.getByText("Solved. Continue to the next question."),
    ).toBeVisible();
    report.bankOpenResponseGrading = true;
  }
  const bookSid = checked(
    await client.rpc("start_book_practice", {
      p_topic_id: "fd88edb7-c1cc-5e0b-a45b-20560d4275c1",
    }),
  );
  sessions.push(bookSid);
  await page.goto(`${baseURL}/practice/${bookSid}`);
  await loaded(".stimulus-panel img");
  report.questionImagesTested++;
  await calculator();
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Your answer", { exact: true })
    .fill("incorrect-verification-answer");
  await page.getByRole("button", { name: "Explanation", exact: true }).click();
  await loaded(".book-explanation-control img");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Explanation", exact: true }),
  ).toBeVisible();
  report.bookExplanationNavigation = true;
  report.calculatorBothFlows = true;
  const raw = await fetch(items[0].question.image_url);
  report.rawPrivateUrlStatus = raw.status;
  assert.ok(!raw.ok);
  const path = items[0].question.image_url.split("/book-package-assets/")[1];
  const signed = checked(
    await client.storage
      .from("book-package-assets")
      .createSignedUrl(path, 3600),
  );
  const asset = await fetch(signed.signedUrl);
  assert.equal(asset.status, 200);
  report.studentSignedUrlStatus = asset.status;
  await writeFile(
    "docs/algebra-four-fixes-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await writeFile(
    `${directory}/latest-checkpoint.json`,
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  await browser.close();
  if (sessions.length) {
    const result = await admin
      .from("book_practice_sessions")
      .delete()
      .in("id", sessions)
      .eq("student_id", profile.id);
    checked(result);
    console.log(JSON.stringify({ temporarySessionsRemoved: sessions.length }));
  }
  await client.auth.signOut();
}
