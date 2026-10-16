import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { learningDatabase, student, admin } from "./helpers/database.js";
import { openReviewDatabase } from "./helpers/open-review-database.js";
import { practiceSummary } from "../src/features/player/model.js";
import { sectionResults } from "../src/features/learning/homework-model.js";

test("Bank channel accuracy keeps an earlier Book mistake, without counting a mere opening", async () => {
  const { db, call, book } = await learningDatabase();
  try {
    const topic = (
      await db.query("select id from book_topics where book_id=$1", [book])
    ).rows[0].id;
    const sid = await call("start_book_practice", [topic], ["uuid"]);
    const item = (
      await db.query(
        "select * from book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows[0];
    await call(
      "check_book_practice_answer",
      [sid, item.id, 0, randomUUID()],
      ["uuid", "uuid", "integer", "uuid"],
    );
    const bank = await call(
      "start_bank_practice",
      [JSON.stringify({ book, status: "incorrect" }), 1, false],
      ["jsonb", "integer", "boolean"],
    );
    assert.equal((await call("practice_analytics")).practiced, 0);
    const fresh = (
      await db.query("select * from book_practice_items where session_id=$1", [
        bank,
      ])
    ).rows[0];
    await call(
      "check_bank_answer",
      [bank, fresh.id, 1, randomUUID()],
      ["uuid", "uuid", "integer", "uuid"],
    );
    const analytics = await call("practice_analytics");
    assert.equal(analytics.first_accuracy, 0);
    assert.equal(analytics.first_incorrect, 1);
    assert.equal(analytics.eventually_correct, 1);
    const stats = await call("practice_session_statistics", [bank], ["uuid"]);
    assert.equal(stats.first_accuracy, 0);
    assert.equal(stats.first_incorrect, 1);
  } finally {
    await db.close();
  }
});

test("homework first history stays incorrect after manual regrading updates the submission", async () => {
  const { db, call, role, session, item } = await openReviewDatabase();
  try {
    await role(admin);
    await call(
      "review_open_response",
      [session, item, true, 0],
      ["uuid", "uuid", "boolean", "bigint"],
    );
    const homework = (
      await db.query(
        "select homework_id from homework_assignments where student_id=$1",
        [student],
      )
    ).rows[0].homework_id;
    const result = await call("admin_homework_results", [homework], ["uuid"]);
    assert.equal(result.rows[0].correct, 1);
    assert.equal(result.rows[0].question_history.first_accuracy, 0);
    assert.equal(result.rows[0].question_history.first_incorrect, 1);
  } finally {
    await db.close();
  }
});

test("open responses pending grading are never counted as incorrect", () => {
  const items = [
    {
      question: { question_type: "open", section: "Math" },
      selected_answer: null,
      selected_response: "reasoning",
      correct: null,
    },
  ];
  assert.equal(practiceSummary(items).pending, 1);
  assert.equal(practiceSummary(items).incorrect, 0);
  assert.equal(practiceSummary(items).accuracy, null);
  assert.equal(sectionResults(items)[0].pending, 1);
  assert.equal(sectionResults(items)[0].incorrect, 0);
});

test("legacy review recovers the frozen automatic result without treating final correction as first correct", async () => {
  const { db, call, role, session, item } = await openReviewDatabase();
  try {
    await role(admin);
    await call(
      "review_open_response",
      [session, item, true, 0],
      ["uuid", "uuid", "boolean", "bigint"],
    );
    await db.exec("reset role");
    await db.query(
      "update practice_grade_events set source='legacy',first_known=false,correct=true where item_id=$1 and source='submission'",
      [item],
    );
    await role(student);
    assert.equal((await call("learning_metrics")).first_accuracy, null);
    await db.exec("reset role");
    const migration = await readFile(
      "supabase/migrations/20261015000700_consistent_context_statistics.sql",
      "utf8",
    );
    await db.exec(
      migration
        .split("-- historical-evidence-start")[1]
        .split("-- historical-evidence-end")[0],
    );
    await role(student);
    const result = await call("learning_metrics");
    assert.equal(result.first_incorrect, 1);
    assert.equal(result.first_accuracy, 0);
    assert.equal(result.now_correct, 1);
    assert.equal(result.eventually_correct, 1);
  } finally {
    await db.close();
  }
});

test("a recorded pending submission receives its first manual grade without rewriting the pending event", async () => {
  const { db, call, role, session, item } = await openReviewDatabase(
    "homework",
    false,
  );
  try {
    await db.exec("reset role");
    await db.query(
      "update book_practice_sessions set submitted_at=now() where id=$1",
      [session],
    );
    await role(student);
    let result = await call("learning_metrics");
    assert.equal(result.first_accuracy, null);
    assert.equal(result.pending, 1);
    assert.equal(result.first_incorrect, 0);
    await role(admin);
    await call(
      "review_open_response",
      [session, item, true, 0],
      ["uuid", "uuid", "boolean", "bigint"],
    );
    result = await call("learning_metrics", [student], ["uuid"]);
    assert.equal(result.first_correct, 1);
    assert.equal(result.first_accuracy, 100);
    assert.equal(result.pending, 0);
    await db.exec("reset role");
    assert.equal(
      (
        await db.query(
          "select correct from practice_grade_events where item_id=$1 and source='submission'",
          [item],
        )
      ).rows[0].correct,
      null,
    );
  } finally {
    await db.close();
  }
});

test("legacy session-start anchors do not become recorded weekly study activity", async () => {
  const { db, call, book } = await learningDatabase();
  try {
    const topic = (
      await db.query("select id from book_topics where book_id=$1", [book])
    ).rows[0].id;
    const sid = await call("start_book_practice", [topic], ["uuid"]);
    const item = (
      await db.query(
        "select id from book_practice_items where session_id=$1 order by position limit 1",
        [sid],
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "insert into practice_grade_events(item_id,source,selected_answer,correct,first_known,created_at)values($1,'legacy',1,true,false,now())",
      [item],
    );
    await db.query(
      "update book_practice_items set selected_answer=1,correct=true where id=$1",
      [item],
    );
    await db.exec(
      "set role authenticated;select set_config('request.jwt.claim.sub','" +
        student +
        "',false)",
    );
    const activity = await call("dashboard_study_activity");
    assert.equal(
      activity.days.reduce((n, d) => n + d.questions, 0),
      0,
    );
    const bank = await call(
      "start_bank_practice",
      [JSON.stringify({ book }), 12, false],
      ["jsonb", "integer", "boolean"],
    );
    const history = await call("practice_prior_progress", [bank], ["uuid"]);
    assert.equal(
      history.find((h) => h.selected_answer === 1).recorded_at,
      null,
    );
    assert.equal((await call("learning_metrics")).first_unknown, 1);
  } finally {
    await db.close();
  }
});
