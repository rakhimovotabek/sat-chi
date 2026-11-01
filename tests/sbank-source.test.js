import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { learningDatabase, admin, student } from "./helpers/database.js";
test("SBank is isolated, filterable and graded with persistent canonical history", async (t) => {
  const { db, role, call, book } = await learningDatabase();
  t.after(() => db.close());
  const original = await call(
    "question_bank",
    [JSON.stringify({ section: "Math" })],
    ["jsonb"],
  );
  await role(admin);
  const extra = await call(
    "import_book_content",
    [
      JSON.stringify({
        schemaVersion: 1,
        kind: "book",
        book: { title: "SBank fixture", category: "Math", published: true },
        topics: [
          {
            title: "Algebra",
            questions: [
              {
                type: "mcq",
                question: "Original SBank fixture",
                options: ["1", "2", "3", "4"],
                correctAnswer: 1,
                domain: "Algebra",
                skill: "Equations",
                difficulty: "easy",
              },
            ],
          },
        ],
      }),
    ],
    ["jsonb"],
  );
  await db.exec("reset role");
  await db.query("update books set bank_source='sbank' where id=$1", [
    extra.book_id,
  ]);
  await role(student);
  assert.deepEqual(
    await call(
      "question_bank",
      [JSON.stringify({ section: "Math" })],
      ["jsonb"],
    ),
    original,
  );
  const bank = await call(
    "question_bank",
    [
      JSON.stringify({
        source: "sbank",
        section: "Math",
        domains: ["Algebra"],
      }),
    ],
    ["jsonb"],
  );
  assert.equal(bank.count, 1);
  assert.equal(
    (
      await call(
        "question_bank",
        [JSON.stringify({ source: "sbank", difficulty: "hard" })],
        ["jsonb"],
      )
    ).count,
    0,
  );
  const sid = await call(
    "start_bank_practice",
    [JSON.stringify({ source: "sbank" }), 1, false],
    ["jsonb", "integer", "boolean"],
  );
  const item = (
    await db.query("select * from book_practice_items where session_id=$1", [
      sid,
    ])
  ).rows[0];
  assert.equal(item.question.id, bank.rows[0].id);
  await call(
    "save_practice_changes",
    [
      sid,
      JSON.stringify([
        {
          id: item.id,
          expected_revision: item.answer_revision,
          selected_answer: 1,
        },
      ]),
    ],
    ["uuid", "jsonb"],
  );
  const checked = await call(
    "check_bank_answer",
    [sid, item.id, 1, "fa000000-0000-0000-0000-000000000001"],
    ["uuid", "uuid", "integer", "uuid"],
  );
  assert(checked);
  const metrics = await call("learning_metrics");
  assert.equal(metrics.attempted, 1);
  await role(admin);
  assert.equal(
    (
      await call(
        "question_bank",
        [JSON.stringify({ source: "sbank" })],
        ["jsonb"],
      )
    ).count,
    1,
  );
  await assert.rejects(
    call("question_bank", [JSON.stringify({ source: "unknown" })], ["jsonb"]),
    /Invalid question source/,
  );
  await db.exec("reset role");
  const manifest = {
    book: { id: "source-test", title: "Source draft", section: "Math" },
    topics: [{ id: "one", title: "Algebra" }],
    questionCount: 1,
    bankSource: "sbank",
    rights: {
      authorized: true,
      owner: "Fixture",
      license: "Original synthetic fixture",
    },
  };
  const draft = (
    await db.query("select universal_begin($1,$2,$3) id", [
      "a".repeat(64),
      JSON.stringify(manifest),
      admin,
    ])
  ).rows[0].id;
  assert.equal(
    (
      await db.query(
        "select b.bank_source from books b join universal_book_jobs j on j.book_id=b.id where j.id=$1",
        [draft],
      )
    ).rows[0].bank_source,
    "sbank",
  );
  await call(
    "universal_append",
    [
      draft,
      0,
      JSON.stringify([
        {
          id: "metadata-fixture",
          topic: "one",
          type: "mcq",
          text: "Original metadata fixture",
          options: [{ text: "1" }, { text: "2" }, { text: "3" }, { text: "4" }],
          answer: 1,
          explanation: "Original fixture",
          domain: "Algebra",
          skill: "Equations",
          difficulty: "easy",
          reviewStatus: "approved",
          sourceOrder: 33,
          source: {
            reference: "Original fixture",
            original: { source_page: 7, source_question_number: "source-7" },
          },
        },
      ]),
    ],
    ["uuid", "integer", "jsonb"],
  );
  const sourceFields = (
    await db.query(
      "select q.source_page,q.position,q.import_metadata->>'questionNumber' number from questions q join universal_book_ids u on u.question_id=q.id where u.job_id=$1",
      [draft],
    )
  ).rows[0];
  assert.deepEqual(sourceFields, {
    source_page: 7,
    position: 33,
    number: "source-7",
  });
  // Compare full public results with the applied pre-optimization behavior.
  const optimized = (
    await db.query(
      "select pg_get_functiondef('public.bank_candidate_ids(jsonb)'::regprocedure) d",
    )
  ).rows[0].d;
  const migration = await readFile(
    "supabase/migrations/20261031001500_sbank_source_isolation.sql",
    "utf8",
  );
  const start = migration.indexOf("create function public.bank_candidate_ids(");
  const previous = migration
    .slice(start, migration.indexOf("$$;", start) + 3)
    .replace("create function", "create or replace function");
  const cases = [
    {},
    { source: "sbank" },
    { source: "sbank", section: "Reading & Writing" },
    { domains: ["Algebra"] },
    { source: "sbank", skills: [{ domain: "Algebra", skill: "Equations" }] },
    { book },
    { topic: book },
    { assignment: true },
    { difficulties: ["easy", "hard"] },
    ...[
      "unanswered",
      "attempted",
      "correct",
      "incorrect",
      "corrected",
      "marked",
    ].flatMap((status) => [{ status }, { source: "sbank", status }]),
    { marked: "yes" },
    { source: "sbank", marked: "no" },
  ];
  await db.exec(previous);
  await role(student);
  const before = [];
  for (const filters of cases)
    before.push(
      await call("question_bank", [JSON.stringify(filters)], ["jsonb"]),
    );
  await db.exec("reset role");
  await db.exec(optimized);
  await role(student);
  for (let i = 0; i < cases.length; i++)
    assert.deepEqual(
      await call("question_bank", [JSON.stringify(cases[i])], ["jsonb"]),
      before[i],
      JSON.stringify(cases[i]),
    );
  assert(book);
});
