import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { learningDatabase, student, other } from "./helpers/database.js";
import { openReviewDatabase } from "./helpers/open-review-database.js";
import { admin } from "./helpers/database.js";

test("ten canonical questions remain 70% after all mistakes are corrected across sessions", async () => {
  const { db, call, role, book } = await learningDatabase();
  try {
    const topic = (
      await db.query("select id from book_topics where book_id=$1", [book])
    ).rows[0].id;
    const sid = await call("start_book_practice", [topic], ["uuid"]);
    const items = (
      await db.query(
        "select * from book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    const check = (item, choice, event = randomUUID()) =>
      call(
        "check_book_practice_answer",
        [sid, item.id, choice, event],
        ["uuid", "uuid", "integer", "uuid"],
      );
    for (let n = 0; n < 10; n++) await check(items[n], n < 7 ? 1 : 0);
    let result = await call("learning_metrics");
    assert.equal(result.attempted, 10);
    assert.equal(result.first_correct, 7);
    assert.equal(result.first_incorrect, 3);
    assert.equal(result.first_accuracy, 70);
    for (const item of items.slice(7, 10)) {
      const event = randomUUID();
      await check(item, 2, event);
      await check(item, 2, event); // acknowledged retry is not another attempt
      await check(item, 1);
    }
    result = await call("learning_metrics");
    assert.equal(result.first_accuracy, 70);
    assert.equal(result.eventually_correct, 10);
    assert.equal(result.now_correct, 10);
    assert.equal(result.checked, 10);
    assert.equal(result.first_unknown, 0);
    assert.equal(
      (await db.query("select count(*)::int n from question_check_attempts"))
        .rows[0].n,
      16,
    );
    const leaderboard = await call("learning_standings", [false], ["boolean"]);
    const row = leaderboard.find((r) => r.id === student);
    assert.equal(row.questions, 10);
    assert.equal(row.correct, 7);
    assert.equal(row.first_known, 10);
    assert.equal(row.eventually_correct, 10);
    // Repeating the same canonical question in Bank does not inflate global counts.
    const bank = await call(
      "start_bank_practice",
      [JSON.stringify({ book }), 12, false],
      ["jsonb", "integer", "boolean"],
    );
    const repeated = (
      await db.query(
        "select id from book_practice_items where session_id=$1 and question->>'id'=$2",
        [bank, items[0].question.id],
      )
    ).rows[0];
    await call(
      "check_bank_answer",
      [bank, repeated.id, 0, randomUUID()],
      ["uuid", "uuid", "integer", "uuid"],
    );
    result = await call("learning_metrics");
    assert.equal(result.attempted, 10);
    assert.equal(result.first_accuracy, 70);
    assert.equal(result.eventually_correct, 10);
    assert.equal(result.now_correct, 9);
    await role(other);
    await assert.rejects(
      call("learning_metrics", [student], ["uuid"]),
      /unavailable/i,
    );
    await assert.rejects(
      db.query("select * from practice_grade_events"),
      /permission denied/i,
    );
    await assert.rejects(
      db.query("select * from learning_question_facts($1)", [student]),
      /permission denied/i,
    );
  } finally {
    await db.close();
  }
});

test("manual homework adjudication preserves the original result and keeps final grade separate", async () => {
  const { db, call, role, session, item } = await openReviewDatabase();
  try {
    let totals = await call("learning_metrics");
    assert.equal(totals.first_incorrect, 1);
    await role(admin);
    await call(
      "review_open_response",
      [session, item, true, 0],
      ["uuid", "uuid", "boolean", "bigint"],
    );
    totals = await call("learning_metrics", [student], ["uuid"]);
    assert.equal(totals.first_incorrect, 1);
    assert.equal(totals.first_correct, 0);
    assert.equal(totals.first_accuracy, 0);
    assert.equal(totals.now_correct, 1);
    assert.equal(totals.eventually_correct, 1);
    await call(
      "review_open_response",
      [session, item, false, 1],
      ["uuid", "uuid", "boolean", "bigint"],
    );
    totals = await call("learning_metrics", [student], ["uuid"]);
    assert.equal(totals.now_correct, 0);
    assert.equal(totals.eventually_correct, 1);
    assert.equal(totals.first_incorrect, 1);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from practice_grade_events where item_id=$1",
          [item],
        )
      ).rows[0].n,
      3,
    );
  } finally {
    await db.close();
  }
});

test("new submission records initial grade and later grading changes cannot rewrite it", async () => {
  const { db, call, book } = await learningDatabase();
  try {
    const bank = await call(
      "start_bank_practice",
      [JSON.stringify({ book }), 2, false],
      ["jsonb", "integer", "boolean"],
    );
    const items = (
      await db.query(
        "select * from book_practice_items where session_id=$1 order by position",
        [bank],
      )
    ).rows;
    await call(
      "save_book_practice",
      [bank, JSON.stringify([{ id: items[0].id, selected_answer: 0 }])],
      ["uuid", "jsonb"],
    );
    let result = await call("learning_metrics");
    assert.equal(result.attempted, 1);
    assert.equal(result.checked, 0);
    assert.equal(result.first_accuracy, null);
    await call("finish_book_practice", [bank], ["uuid"]);
    result = await call("learning_metrics");
    assert.equal(result.first_incorrect, 1);
    assert.equal(result.first_accuracy, 0);
    assert.equal(result.checked, 1); // unanswered submission is not a wrong attempt
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from practice_grade_events where source='submission'",
        )
      ).rows[0].n,
      1,
    );
  } finally {
    await db.close();
  }
});
