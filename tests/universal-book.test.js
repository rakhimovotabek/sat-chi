import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePackage,
  inspectPackage,
} from "../supabase/functions/_shared/universal-package.js";
import { learningDatabase, admin, student } from "./helpers/database.js";
export const manifest = {
  format: "satchi-book-v1",
  book: {
    id: "original-sprint-fixture",
    title: "Original sprint practice",
    author: "SAT’chi",
    section: "Math",
  },
  rights: { authorized: true, owner: "SAT’chi", license: "CC0-1.0" },
  topics: [
    { id: "algebra", title: "Algebra" },
    { id: "equations", title: "Equations", parent: "algebra" },
  ],
  questionCount: 2,
};
export const questions = [
  {
    id: "q1",
    topic: "equations",
    type: "mcq",
    text: "What is 2 + 2?",
    options: ["2", "4", "6", "8"].map((text, i) => ({
      label: "ABCD"[i],
      text,
    })),
    answer: 1,
    explanation: "Add the two pairs.",
    domain: "Algebra",
    skill: "Linear equations",
    difficulty: "easy",
    reviewStatus: "approved",
    source: { reference: "Original author fixture" },
  },
  {
    id: "q2",
    topic: "equations",
    type: "open",
    text: "What is one half?",
    acceptedAnswers: ["0.5", "1/2"],
    domain: "Algebra",
    skill: "Fractions",
    difficulty: "easy",
    reviewStatus: "approved",
    source: { reference: "Original author fixture" },
  },
];
test("universal package rejects missing keys, invalid options, wrong counts and missing rights", () => {
  assert.equal(validatePackage(manifest, questions).questions, 2);
  for (const mutate of [
    (m) => (m.questionCount = 3),
    (m) => (m.rights.authorized = false),
    (m) => (m.topics[1].parent = "missing"),
  ]) {
    const m = structuredClone(manifest);
    mutate(m);
    assert.throws(() => validatePackage(m, questions));
  }
  const invalidTable = structuredClone(questions);
  invalidTable[0].table = { columns: ["x"], rows: [["a", "b"]] };
  assert.throws(() => validatePackage(manifest, invalidTable), /Invalid table/);
  const qs = structuredClone(questions);
  qs[0].options[1].label = "D";
  assert.throws(() => validatePackage(manifest, qs));
});
test("universal import resumes batches, protects drafts, publishes canonical Bank questions and grades persisted practice", async (t) => {
  const { db, role, call } = await learningDatabase();
  t.after(() => db.close());
  await role(admin);
  const begin = () =>
    call(
      "universal_begin",
      ["b".repeat(64), JSON.stringify(manifest), admin],
      ["text", "jsonb", "uuid"],
    );
  await assert.rejects(begin, /permission denied/);
  await db.exec("reset role");
  const job = await begin();
  assert.equal(await begin(), job);
  const append = () =>
    call(
      "universal_append",
      [job, 0, JSON.stringify(questions)],
      ["uuid", "integer", "jsonb"],
    );
  assert.equal(await append(), 2);
  assert.equal(await append(), 2);
  await role(admin);
  await assert.rejects(
    () => call("universal_publish", [job, true], ["uuid", "boolean"]),
    /Finish importing/,
  );
  await db.exec(
    `reset role;update universal_book_jobs set status='draft' where id='${job}'`,
  );
  await role(student);
  assert.equal(
    (
      await db.query(
        `select count(*) from books where title='Original sprint practice'`,
      )
    ).rows[0].count,
    0,
  );
  await assert.rejects(
    () => call("universal_publish", [job, true], ["uuid", "boolean"]),
    /Admin required/,
  );
  await role(admin);
  await call("universal_publish", [job, true], ["uuid", "boolean"]);
  await call(
    "manage_book_lifecycle",
    [
      (
        await db.query("select book_id from universal_book_jobs where id=$1", [
          job,
        ])
      ).rows[0].book_id,
      "archive",
    ],
    ["uuid", "text"],
  );
  await assert.rejects(
    () => call("universal_publish", [job, true], ["uuid", "boolean"]),
    /Restore/,
  );
  await call(
    "manage_book_lifecycle",
    [
      (
        await db.query("select book_id from universal_book_jobs where id=$1", [
          job,
        ])
      ).rows[0].book_id,
      "restore",
    ],
    ["uuid", "text"],
  );
  await db.exec("reset role");
  await call(
    "universal_correct",
    [
      job,
      JSON.stringify({
        ...questions[0],
        text: "Corrected original stem",
        reviewStatus: "pending",
      }),
    ],
    ["uuid", "jsonb"],
  );
  await role(admin);
  await assert.rejects(
    () => call("universal_publish", [job, true], ["uuid", "boolean"]),
    /approve all/,
  );
  await db.exec("reset role");
  await call(
    "universal_correct",
    [job, JSON.stringify(questions[0])],
    ["uuid", "jsonb"],
  );
  await role(admin);
  await call("universal_publish", [job, true], ["uuid", "boolean"]);
  await role(student);
  const rows = (
    await db.query(
      `select q.* from questions q join book_topics t on t.id=q.topic_id join books b on b.id=t.book_id where b.title='Original sprint practice'`,
    )
  ).rows;
  assert.equal(rows.length, 2);
  const bank = await call(
    "question_bank",
    [JSON.stringify({}), 0],
    ["jsonb", "integer"],
  );
  assert.ok(JSON.stringify(bank).includes(rows[0].id));
  const sid = await call("start_book_practice", [rows[0].topic_id], ["uuid"]);
  assert.ok(sid);
  const item = (
    await db.query(
      "select * from book_practice_items where session_id=$1 order by position",
      [sid],
    )
  ).rows[0];
  const result = await call(
    "check_book_practice_answer",
    [sid, item.id, 1, crypto.randomUUID()],
    ["uuid", "uuid", "integer", "uuid"],
  );
  assert.equal(result.correct, true);
  await role(admin);
  await assert.rejects(
    () =>
      db.exec(
        `delete from books where id=(select book_id from universal_book_jobs where id='${job}')`,
      ),
    /history|foreign key/,
  );
});
test("original ZIP validates actual compressed archive, image options, passages and open answers", async () => {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(
    "assets/examples/satchi-book-v1/original-practice.zip",
  );
  const pkg = await inspectPackage(bytes);
  assert.equal(pkg.questions.length, 6);
  assert.equal(pkg.files.size, 10);
  await assert.rejects(() =>
    inspectPackage(bytes.subarray(0, bytes.length - 5)),
  );
});
test("hostile ZIP structures and valid-signature PNGs with invalid pixel data fail safely", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const [name, message] of [
    ["unsafe-path.zip", /Unsafe/],
    ["unsafe-type.zip", /Unsupported file/],
    ["excessive-ratio.zip", /expansion limit/],
    ["duplicate-entry.zip", /duplicate/],
    ["invalid-pixels.zip", /pixel data/],
  ]) {
    await assert.rejects(
      () =>
        readFile(`tests/fixtures/universal-book/${name}`).then((bytes) =>
          inspectPackage(bytes),
        ),
      message,
    );
  }
});
