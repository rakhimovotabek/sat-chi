import test from "node:test";
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
  assert(book);
});
