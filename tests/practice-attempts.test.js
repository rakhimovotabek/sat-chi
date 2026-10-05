import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, admin, student, other } from "./helpers/database.js";
import { questionState } from "../src/features/player/model.js";
test("bank checks keep every attempt, private keys, accurate question time and ownership", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    const sid = await call(
      "start_bank_practice",
      ["{}", 2, false],
      ["jsonb", "integer", "boolean"],
    );
    const items = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    await db.exec("reset role");
    await db.query(
      "update public.book_practice_sessions set last_heartbeat=clock_timestamp()-interval '60 seconds' where id=$1",
      [sid],
    );
    await role(student);
    await call(
      "practice_heartbeat",
      [sid, 0, 18],
      ["uuid", "integer", "integer"],
    );
    const event = "f2000000-0000-0000-0000-000000000001";
    const wrong = await call(
      "check_bank_answer",
      [sid, items[0].id, 0, event],
      ["uuid", "uuid", "integer", "uuid"],
    );
    assert.equal(wrong.correct, false);
    assert.equal(wrong.active_seconds, 18);
    assert.equal(wrong.between_seconds, 18);
    assert.ok(!("correct_answer" in wrong));
    assert.ok(!("explanation" in wrong));
    assert.deepEqual(
      await call(
        "check_bank_answer",
        [sid, items[0].id, 0, event],
        ["uuid", "uuid", "integer", "uuid"],
      ),
      wrong,
    );
    await assert.rejects(call("review_book_practice", [sid], ["uuid"]));
    await db.exec("reset role");
    await db.query(
      "update public.book_practice_sessions set last_heartbeat=clock_timestamp()-interval '30 seconds' where id=$1",
      [sid],
    );
    await role(student);
    await call(
      "practice_heartbeat",
      [sid, 0, 13],
      ["uuid", "integer", "integer"],
    );
    await call(
      "practice_heartbeat",
      [sid, 1, 0],
      ["uuid", "integer", "integer"],
    );
    const correct = await call(
      "check_bank_answer",
      [sid, items[0].id, 1, "f2000000-0000-0000-0000-000000000002"],
      ["uuid", "uuid", "integer", "uuid"],
    );
    assert.equal(correct.active_seconds, 31);
    assert.equal(correct.between_seconds, 13);
    assert.equal(correct.attempt_order, 2);
    const resumed = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    assert.ok(resumed[0].solved_at);
    assert.equal(resumed[1].active_seconds, 0);
    assert.equal(
      (await db.query("select * from public.question_check_attempts")).rows
        .length,
      2,
    );
    assert.ok(
      questionState(
        { ...resumed[0], attempts: [wrong, correct] },
        true,
        false,
        true,
      ).includes("correct"),
    );
    const metrics = await call("practice_analytics");
    assert.equal(metrics.practiced, 1);
    assert.equal(metrics.first_accuracy, 0);
    assert.equal(metrics.eventual_accuracy, 100);
    assert.equal(metrics.average_attempts, 2);
    assert.equal(metrics.average_seconds, 31);
    assert.equal(metrics.median_seconds, 31);
    assert.deepEqual(metrics.areas, []);
    const detail = await call(
      "practice_question_analytics",
      [null, "retried", 0],
      ["uuid", "text", "integer"],
    );
    assert.equal(detail.total, 1);
    assert.equal(detail.rows[0].attempts, 2);
    assert.equal(detail.rows[0].source, "Analytics fixture");
    await role(other);
    await assert.rejects(call("practice_analytics", [student], ["uuid"]));
    assert.equal(
      (await db.query("select * from public.question_check_attempts")).rows
        .length,
      0,
    );
    await assert.rejects(
      call(
        "check_bank_answer",
        [sid, items[1].id, 1, "f2000000-0000-0000-0000-000000000003"],
        ["uuid", "uuid", "integer", "uuid"],
      ),
    );
    await role(admin);
    assert.equal(
      (await db.query("select * from public.question_check_attempts")).rows
        .length,
      2,
    );
    await assert.rejects(
      db.query("update public.question_check_attempts set correct=true"),
    );
  } finally {
    await db.close();
  }
});

test("book practice checks save wrong and correct answers without revealing the key", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    const topic = (
      await db.query(
        "select id from public.book_topics where book_id=$1 limit 1",
        [book],
      )
    ).rows[0].id;
    const sid = await call("start_book_practice", [topic], ["uuid"]);
    const item = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position limit 1",
        [sid],
      )
    ).rows[0];
    await role(student);
    const wrong = await call(
      "check_book_practice_answer",
      [sid, item.id, 0, "f2000000-0000-0000-0000-000000000011"],
      ["uuid", "uuid", "integer", "uuid"],
    );
    assert.equal(wrong.correct, false);
    assert.ok(!("correct_answer" in wrong));
    assert.ok(!("explanation" in wrong));
    assert.equal(
      (
        await db.query(
          "select submitted_at from public.book_practice_sessions where id=$1",
          [sid],
        )
      ).rows[0].submitted_at,
      null,
    );
    const saved = (
      await db.query(
        "select selected_answer,correct,solved_at,has_answered from public.book_practice_items where id=$1",
        [item.id],
      )
    ).rows[0];
    assert.equal(saved.selected_answer, 0);
    assert.equal(saved.correct, false);
    assert.equal(saved.solved_at, null);
    assert.equal(saved.has_answered, true);
    const correct = await call(
      "check_book_practice_answer",
      [sid, item.id, 1, "f2000000-0000-0000-0000-000000000012"],
      ["uuid", "uuid", "integer", "uuid"],
    );
    assert.equal(correct.correct, true);
    const persisted = (
      await db.query(
        "select selected_answer,correct,solved_at from public.book_practice_items where id=$1",
        [item.id],
      )
    ).rows[0];
    assert.equal(persisted.selected_answer, 1);
    assert.equal(persisted.correct, true);
    assert.ok(persisted.solved_at);
    assert.equal(
      (
        await db.query(
          "select count(*)::int count from public.question_check_attempts where item_id=$1",
          [item.id],
        )
      ).rows[0].count,
      2,
    );
  } finally {
    await db.close();
  }
});
