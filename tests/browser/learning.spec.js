import { test, expect } from "@playwright/test";
import { learningFixture } from "./helpers/learning.js";
test("admin creates and renames a group, assigns and removes a student", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  await page.goto("/admin/groups");
  await page.getByLabel("Group name", { exact: true }).fill("SAT Morning");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await page.getByRole("button", { name: "SAT Morning", exact: true }).click();
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove student" }),
  ).toBeVisible();
  expect(store.members.length).toBe(1);
  await page.getByLabel("Group name", { exact: true }).fill("SAT Evening");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.getByRole("button", { name: "SAT Evening", exact: true }).click();
  await page.getByRole("button", { name: "Remove student" }).click();
  await expect(
    page.getByRole("button", { name: "Remove student" }),
  ).toHaveCount(0);
  expect(store.members.length).toBe(0);
});
test("admin creates multi-section homework with random and specific questions", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  await page.goto("/admin/homework");
  await page.getByRole("button", { name: "New homework" }).click();
  await page.getByLabel("Homework title").fill("Daily SAT");
  await page.getByLabel("Due date and time").fill("2026-12-01T18:00");
  await page.getByLabel("All active students").check();
  await page.getByLabel("Section title").fill("Algebra");
  await page.getByLabel("Question count", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByLabel("Section title").last().fill("Exact selection");
  await page.getByLabel("Question selection").last().selectOption("specific");
  await page.locator(".question-picker input[type=checkbox]").first().check();
  await page
    .getByRole("button", { name: "Create and assign homework" })
    .click();
  await expect(
    page.getByRole("cell", { name: "Daily SAT", exact: true }),
  ).toBeVisible();
  const payload = store.requests.find((r) =>
    r.path.endsWith("/create_homework"),
  ).body.p_data;
  expect(payload.sections).toHaveLength(2);
  expect(payload.sections[1].questionIds).toHaveLength(1);
});
test("student starts, resumes and submits homework with section results and saved position", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.assign();
  await page.goto("/homework");
  await page.getByRole("button", { name: "Start homework" }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await expect(page.getByRole("status")).toHaveText("All changes saved");
  await expect.poll(() => store.session.current_position).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Question 2 of 3", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Back to books", exact: true })
    .click();
  await expect(page).toHaveURL(/\/homework$/);
  await page.getByRole("button", { name: "Resume homework" }).click();
  await expect(
    page.getByText("Question 2 of 3", { exact: true }),
  ).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Submit practice" }).click();
  await expect(
    page.getByRole("region", { name: "Practice results" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Section results" }),
  ).toBeVisible();
  await page.goto("/homework");
  await expect(
    page.getByRole("button", { name: "View results" }),
  ).toBeVisible();
});
test("question bank filters server results and creates a stable session with math tools", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await page.goto("/question-bank");
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await page
    .getByLabel("Section", { exact: true })
    .selectOption("Reading & Writing");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(
    page.getByRole("heading", { name: "0 questions match" }),
  ).toBeVisible();
  await page.getByLabel("Section", { exact: true }).selectOption("Math");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
  const ids = store.items.map((i) => i.id);
  await page.getByRole("radio", { name: "B 4", exact: true }).check();
  await page
    .getByRole("button", { name: "Reference sheet", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reference sheet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Reference sheet" }).click();
  await page.getByRole("button", { name: "Calculator", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open official Desmos calculator" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Calculator" }).click();
  await expect(
    page.getByRole("radio", { name: "B 4", exact: true }),
  ).toBeChecked();
  expect(store.items.map((i) => i.id)).toEqual(ids);
});
test("vocabulary flashcards persist known/review, highlight supplied passage, and start tests", async ({
  page,
}) => {
  const store = await learningFixture(page);
  await page.goto("/vocabulary");
  await page.getByRole("link", { name: "Open book" }).click();
  await page.getByRole("link", { name: "Open set" }).click();
  await page.getByRole("button", { name: "Flashcards", exact: true }).click();
  await page.getByRole("button", { name: "Flip flashcard" }).click();
  await expect(
    page.getByRole("heading", { name: "become less intense", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Know", exact: true }).click();
  await expect.poll(() => store.progress.length).toBe(1);
  await page.getByRole("button", { name: "Need Review", exact: true }).click();
  await expect.poll(() => store.progress.length).toBe(2);
  await page.getByRole("button", { name: "Read in Context" }).click();
  await page.getByRole("button", { name: "candid", exact: true }).click();
  await expect(page.locator(".word-definition")).toContainText("honest");
  await page.reload();
  await page.getByRole("button", { name: "Word list", exact: true }).click();
  await expect(page.locator(".vocab-word").first()).toContainText("known");
  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(
    page.getByText("Question 1 of 3", { exact: true }),
  ).toBeVisible();
});

test("admin authors vocabulary books, sets, words, passages and validated test questions", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  await page.goto("/admin/vocabulary");
  await page
    .getByRole("button", { name: "Create vocabulary book", exact: true })
    .click();
  await page.getByLabel("Vocabulary book title").fill("Admin vocabulary");
  await page.getByRole("button", { name: "Save vocabulary book" }).click();
  const book = page.locator("article").filter({
    has: page.getByRole("heading", { name: "Admin vocabulary", exact: true }),
  });
  await book.getByRole("link", { name: "Open book" }).click();
  await page.getByRole("button", { name: "Create set", exact: true }).click();
  await page.getByLabel("Set title").fill("First set");
  await page.getByRole("button", { name: "Save vocabulary set" }).click();
  await page.getByRole("link", { name: "Open set" }).click();
  await page.getByLabel("New word").fill("lucid");
  await page.getByLabel("New definition").fill("clear and easy to understand");
  await page.getByRole("button", { name: "Add word", exact: true }).click();
  await expect(page.getByLabel("Definition for lucid")).toBeVisible();
  await page
    .getByLabel("Definition for lucid")
    .fill("clear and understandable");
  await page.getByRole("button", { name: "Save word", exact: true }).click();
  await expect
    .poll(() => store.words.find((w) => w.word === "lucid").definition)
    .toBe("clear and understandable");
  await page
    .getByLabel("Passage title", { exact: true })
    .fill("Provided passage");
  await page
    .getByLabel("Source passage")
    .fill("The lucid explanation was useful.");
  await page.getByRole("button", { name: "Add supplied passage" }).click();
  await expect(page.getByLabel("Edit supplied passage")).toHaveValue(
    "The lucid explanation was useful.",
  );
  await page.getByLabel("Test question JSON").fill(
    JSON.stringify({
      question: "What does lucid mean?",
      options: ["clear", "uncertain", "slow", "loud"],
      correctAnswer: 0,
    }),
  );
  await page.getByRole("button", { name: "Add test question" }).click();
  await expect(
    page.getByText("What does lucid mean?", { exact: true }),
  ).toBeVisible();
  expect(store.tests).toHaveLength(1);
});
test("real reporting pages handle empty records and remain responsive", async ({
  page,
}) => {
  await learningFixture(page);
  await page.goto("/dashboard");
  await expect(
    page.getByText("No unfinished homework due today."),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/satchi-dashboard-sprint.png",
    fullPage: true,
  });
  for (const path of [
    "/question-bank",
    "/homework",
    "/vocabulary",
    "/progress",
    "/standings",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
      "Something went wrong",
    );
  }
  await page.getByRole("button", { name: "Everyone", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Fixture Learner", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/question-bank");
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/satchi-question-bank-mobile-sprint.png",
    fullPage: true,
  });
});

test("expired timed practice auto-submits saved answers and shows results", async ({
  page,
}) => {
  const store = await learningFixture(page);
  store.forceExpired = true;
  await page.goto("/question-bank");
  await expect(
    page.getByRole("heading", { name: "3 questions match" }),
  ).toBeVisible();
  await page.getByLabel("Mode").selectOption("true");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(
    page.getByRole("region", { name: "Practice results" }),
  ).toBeVisible();
  expect(store.session.submitted_at).toBeTruthy();
  await expect(page.getByText("3", { exact: true }).first()).toBeVisible();
});
test("admin practice keeps the admin layout and student attempts open read-only", async ({
  page,
}) => {
  const store = await learningFixture(page, "admin");
  await page.goto("/admin/question-bank");
  await page.getByRole("button", { name: "Start practice" }).click();
  await expect(page).toHaveURL(/\/admin\/practice\//);
  await expect(page.locator(".sidebar")).toContainText("Admin Control Panel");
  store.session.student_id = "another-student";
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/sessions\//);
  await expect(page.getByText(/Awaiting submission/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit practice" }),
  ).toHaveCount(0);
});

test('admin import status exposes review evidence and refreshes without source downloads', async ({page})=>{
 await learningFixture(page,'admin');
 let requests=0;
 await page.route('**/rest/v1/import_jobs**',route=>{
  requests++;
  return route.fulfill({contentType:'application/json',body:JSON.stringify([{
   id:'import-status',title:'Supplied book',source_file:'Source.pdf',source_path:'nested/Source.pdf',status:'imported',source_type:'book',category:'Reading & Writing',
   detected_topics:2,detected_questions:12,detected_vocabulary_sets:0,imported_count:10,skipped_count:2,needs_review_count:2,warnings:['Visual preservation required.'],errors:[],
   source_metadata:{review_items:[{number:7,page:3,reasons:['Essential diagram missing.']}]}
  }])});
 });
 await page.goto('/admin/imports');
 await expect(page.getByRole('heading',{name:'Import status',exact:true})).toBeVisible();
 await expect(page.getByText('nested/Source.pdf',{exact:true})).toBeVisible();
 await expect(page.getByText('10 imported · 2 skipped')).toBeVisible();
 await expect(page.getByText('2 questions need review')).toBeVisible();
 await page.getByText('Question review evidence').click();
 await expect(page.getByText('Question 7 · PDF page 3: Essential diagram missing.')).toBeVisible();
 const initialRequests=requests;
 await page.getByRole('button',{name:'Refresh import reports'}).click();
 await expect.poll(()=>requests).toBeGreaterThan(initialRequests);
 await expect(page.locator('a[href$=".pdf"]')).toHaveCount(0);
});
