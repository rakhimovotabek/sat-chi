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
