import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, admin, student, other } from "./helpers/database.js";

test("assignment heatmap aggregates immutable first grades, skips, actual time and enforces admin privacy", async (t) => {
  const { db, call, role } = await learningDatabase();
  t.after(() => db.close());
  await role(admin);
  const questions = (
    await db.query("select id from questions order by position limit 3")
  ).rows.map((row) => row.id);
  const homework = await call(
    "create_homework",
    [
      JSON.stringify({
        title: "Original performance cohort",
        dueAt: "2026-12-01T12:00:00Z",
        students: [student, other],
        sections: [
          { title: "Original math", count: 3, questionIds: questions },
        ],
      }),
    ],
    ["jsonb"],
  );
  let firstWrong;
  for (const owner of [student, other]) {
    await role(owner);
    const assignment = (await call("homework_directory")).find(
      (row) => row.id === homework,
    );
    const session = await call(
      "start_homework",
      [assignment.assignment_id],
      ["uuid"],
    );
    const items = (
      await db.query(
        "select * from book_practice_items where session_id=$1 order by position",
        [session],
      )
    ).rows;
    const changes = items
      .slice(0, owner === student ? 2 : 3)
      .map((item, index) => ({
        id: item.id,
        expected_revision: item.answer_revision,
        selected_answer:
          index === 0 || (owner === other && index === 1) ? 1 : 0,
      }));
    await call(
      "save_practice_changes",
      [session, JSON.stringify(changes)],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [session], ["uuid"]);
    if (owner === student) firstWrong = items[1].id;
    await db.exec("reset role");
    await db.query(
      "update book_practice_items set active_seconds=$1 where id=$2",
      [owner === student ? 10 : 30, items[1].id],
    );
  }
  await role(other);
  await assert.rejects(
    () => call("homework_question_performance", [homework], ["uuid"]),
    /Admin required/,
  );
  await role(admin);
  let data = await call("homework_question_performance", [homework], ["uuid"]);
  assert.equal(data.completed_sessions, 2);
  assert.equal(data.total_questions, 3);
  assert.deepEqual(
    data.rows.map((row) => row.accuracy),
    [100, 50, 0],
  );
  assert.deepEqual(
    data.rows.map((row) => row.skipped),
    [0, 0, 1],
  );
  assert.equal(data.rows[2].known, 1);
  assert.equal(data.rows[1].average_seconds, 20);
  assert.equal(data.rows[1].median_seconds, 20);
  assert.equal(data.rows[1].timing_samples, 2);
  assert.equal(data.rows[0].average_seconds, null);
  assert.ok(!JSON.stringify(data).includes(student));
  // A later mutable grading snapshot cannot redefine the recorded initial result.
  await db.exec("reset role");
  await db.query("update book_practice_items set correct=true where id=$1", [
    firstWrong,
  ]);
  await role(admin);
  data = await call("homework_question_performance", [homework], ["uuid"]);
  assert.equal(data.rows[1].accuracy, 50);
  // Original legacy outcomes may be unknown even when a current grade exists.
  await db.exec("reset role");
  await db.query(
    "update practice_grade_events set first_known=false where item_id=$1",
    [firstWrong],
  );
  await role(admin);
  const partial = await call(
    "homework_question_performance",
    [homework],
    ["uuid"],
  );
  assert.equal(partial.rows[1].unknown, 1);
  assert.equal(partial.rows[1].known, 1);
  assert.equal(partial.rows[1].accuracy, 100);
  assert.equal(
    (
      await call(
        "homework_question_performance",
        [homework, null, 1],
        ["uuid", "date", "integer"],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      call(
        "homework_question_performance",
        [homework, null, -1],
        ["uuid", "date", "integer"],
      ),
    /Invalid performance page/,
  );
});
