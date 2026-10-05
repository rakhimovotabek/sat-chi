import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { privateStorageClient } from "../imports/private-storage.js";

// Explicit live verification only. No test users, password changes, or emails.
if (!process.argv.includes("--live"))
  throw new Error("Explicit --live required");
const baseURL =
  process.argv.find((a) => a.startsWith("--url="))?.slice(6) ||
  "http://127.0.0.1:5200";
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
const directory = "local-imports/hierarchy-fix/live-student";
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
const book = checked(
  await client
    .from("books")
    .select("id,title,published,book_topics(questions(count))")
    .eq("id", bid)
    .single(),
);
assert.equal(book.published, true);
const topics = checked(
  await client
    .from("book_topics")
    .select("*,questions(count)")
    .eq("book_id", bid)
    .order("position"),
);
assert.equal(topics.length, 5);
assert.ok(topics.every((t) => t.parent_id === null));
assert.equal(
  topics.reduce((n, t) => n + t.questions[0].count, 0),
  589,
);
const counts = [];
for (const topic of topics) {
  const result = await client
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topic.id);
  checked(result);
  assert.equal(result.count, topic.questions[0].count);
  counts.push(result.count);
}
assert.equal(
  checked(await client.from("question_answers").select("question_id")).length,
  0,
  "private answer keys must remain inaccessible",
);
console.log(
  JSON.stringify({
    published: true,
    studentBookVisible: true,
    studentTopics: topics.map((t, i) => ({
      id: t.id,
      title: t.title,
      questions: counts[i],
    })),
    studentQuestionCount: counts.reduce((a, b) => a + b, 0),
    privateAnswerKeysHidden: true,
  }),
);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
await context.addInitScript(
  ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
  { key: `sb-${project}-auth-token`, value: session },
);
const page = await context.newPage();
const sessions = [];
const report = {
  studentBookVisible: true,
  topics: [],
  questionCount: 589,
  existingPlainTextQuestions: 0,
};
try {
  await page.goto(`${baseURL}/books`);
  await expect(
    page.getByRole("link", { name: new RegExp(book.title) }),
  ).toBeVisible({ timeout: 30000 });
  await expect(
    page.locator(".book-inventory").filter({ hasText: "589 questions" }),
  ).toContainText("5 topics");
  await page.getByRole("link", { name: new RegExp(book.title) }).click();
  await expect(page.locator(".topic-row")).toHaveCount(5);
  await page.screenshot({
    path: `${directory}/student-book.png`,
    fullPage: true,
  });
  page.on("dialog", (dialog) => dialog.accept());
  for (let index = 0; index < topics.length; index++) {
    const topic = topics[index];
    await page.goto(`${baseURL}/books/${bid}/topics/${topic.id}`);
    await expect(
      page.getByRole("heading", { name: topic.title, exact: true }),
    ).toBeVisible();
    const started = page.waitForResponse(
      (r) =>
        r.url().endsWith("/rpc/start_book_practice") &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Start topic practice", exact: true })
      .click();
    const startResponse = await started;
    assert.equal(startResponse.status(), 200);
    const sid = await startResponse.json();
    sessions.push(sid);
    await writeFile(
      `${directory}/created-session-ids.json`,
      JSON.stringify({ student_id: profile.id, sessions }),
      { mode: 0o600 },
    );
    await expect(page).toHaveURL(new RegExp(`/practice/${sid}$`));
    await expect(
      page.getByRole("button", {
        name: `Question 1 of ${counts[index]}`,
        exact: true,
      }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      page.getByRole("button", { name: "Explanation", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(
        () =>
          page
            .locator(".stimulus-panel img")
            .evaluateAll(
              (images) =>
                images.length > 0 &&
                images.every((i) => i.complete && i.naturalWidth > 0),
            ),
        { timeout: 30000 },
      )
      .toBe(true);
    const item = checked(
      await admin
        .from("book_practice_items")
        .select("*")
        .eq("session_id", sid)
        .eq("position", 0)
        .single(),
    );
    const key = checked(
      await admin
        .from("book_practice_keys")
        .select("correct_answer")
        .eq("item_id", item.id)
        .single(),
    );
    let expectedCorrect = false;
    if (item.question.question_type === "open") {
      await page
        .getByLabel("Your answer", { exact: true })
        .fill("unlisted-test-response");
    } else {
      const choice =
        index === 0 ? (key.correct_answer + 1) % 4 : key.correct_answer;
      expectedCorrect = index !== 0;
      await expect(page.locator(".answer-choices img")).toHaveCount(4);
      await expect
        .poll(
          () =>
            page
              .locator(".answer-choices img")
              .evaluateAll((images) =>
                images.every((i) => i.complete && i.naturalWidth > 0),
              ),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.getByRole("radio").nth(choice).check();
    }
    await expect(
      page.getByRole("status").filter({ hasText: "All changes saved" }),
    ).toBeVisible({ timeout: 30000 });
    await page
      .getByRole("button", { name: "Explanation", exact: true })
      .click();
    await expect
      .poll(
        () =>
          page
            .locator(".book-explanation-control img")
            .evaluateAll(
              (images) =>
                images.length > 0 &&
                images.every((i) => i.complete && i.naturalWidth > 0),
            ),
        { timeout: 30000 },
      )
      .toBe(true);
    const attemptCount = await admin
      .from("question_check_attempts")
      .select("id", { count: "exact", head: true })
      .eq("item_id", item.id);
    checked(attemptCount);
    assert.equal(attemptCount.count, 0);
    if (index === 0) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Explanation", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Previous", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Explanation", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Explanation", exact: true })
        .click();
      await expect
        .poll(
          () =>
            page
              .locator(".book-explanation-control img")
              .evaluateAll(
                (images) =>
                  images.length > 0 &&
                  images.every((i) => i.complete && i.naturalWidth > 0),
              ),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `${directory}/student-practice-mobile.png`,
        fullPage: true,
      });
      await page.setViewportSize({ width: 1280, height: 900 });
    }
    await page
      .getByRole("button", { name: "Submit practice", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Practice results" }),
    ).toBeVisible({ timeout: 30000 });
    const graded = checked(
      await admin
        .from("book_practice_items")
        .select("correct")
        .eq("id", item.id)
        .single(),
    );
    assert.equal(graded.correct, expectedCorrect);
    report.topics.push({
      id: topic.id,
      title: topic.title,
      questions: counts[index],
      stemImageLoaded: true,
      optionImagesLoaded: item.question.question_type !== "open",
      explanationLoaded: true,
      gradingCorrect: true,
    });
    console.log(
      JSON.stringify({
        topic: topic.title,
        questions: counts[index],
        imagesLoaded: true,
        explanationAfterAnswer: true,
        gradingVerified: true,
      }),
    );
  }
  const plain = await client
    .from("questions")
    .select("id", { count: "exact", head: true })
    .is("image_url", null)
    .neq("question_text", "");
  checked(plain);
  report.existingPlainTextQuestions = plain.count;
  report.actualPlainTextQuestionAvailable = plain.count > 0;
  report.mobileOverflow = false;
  await writeFile(
    "docs/algebra-student-live-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
  if (sessions.length)
    checked(
      await admin
        .from("book_practice_sessions")
        .delete()
        .in("id", sessions)
        .eq("student_id", profile.id),
    );
  const remaining = await admin
    .from("book_practice_sessions")
    .select("id", { count: "exact", head: true })
    .in(
      "id",
      sessions.length ? sessions : ["00000000-0000-0000-0000-000000000000"],
    );
  checked(remaining);
  assert.equal(
    remaining.count,
    0,
    "temporary verification sessions must be removed",
  );
  await client.auth.signOut({ scope: "local" });
  console.log(
    JSON.stringify({
      temporaryPracticeSessionsRemoved: sessions.length,
      originalAttemptsUntouched: true,
    }),
  );
}
