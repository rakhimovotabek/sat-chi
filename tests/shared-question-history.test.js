import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { learningDatabase, student, other } from "./helpers/database.js";

test("parent and bank show canonical history without copying answers or losing initial errors", async () => {
  const { db, call, role, book } = await learningDatabase();
  try {
    const child = (
      await db.query("select id from book_topics where book_id=$1", [book])
    ).rows[0].id;
    await db.exec("reset role");
    const parent = (
      await db.query(
        "insert into book_topics(book_id,title,position)values($1,'Parent',0)returning id",
        [book],
      )
    ).rows[0].id;
    await db.query("update book_topics set parent_id=$1 where id=$2", [
      parent,
      child,
    ]);
    await role(student);
    const sid = await call("start_book_practice", [child], ["uuid"]);
    const item = (
      await db.query(
        "select * from book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows[0];
    for (const choice of [0, 2, 1])
      await call(
        "check_book_practice_answer",
        [sid, item.id, choice, randomUUID()],
        ["uuid", "uuid", "integer", "uuid"],
      );
    const parentSession = await call("start_book_practice", [parent], ["uuid"]);
    assert.notEqual(parentSession, sid);
    const prior = await call(
      "practice_prior_progress",
      [parentSession],
      ["uuid"],
    );
    assert.equal(prior.length, 1);
    assert.equal(prior[0].first_correct, false);
    assert.equal(prior[0].selected_answer, 1);
    assert.equal(prior[0].eventually_correct, true);
    const fresh = (
      await db.query("select * from book_practice_items where id=$1", [
        prior[0].item_id,
      ])
    ).rows[0];
    assert.equal(fresh.selected_answer, null);
    assert.equal(fresh.correct, null);
    const events = await call(
      "practice_history_events",
      [parentSession, fresh.id],
      ["uuid", "uuid"],
    );
    assert.equal(events.total, 3);
    assert.deepEqual(
      events.rows.map((r) => r.correct),
      [false, false, true],
    );
    const filtered = await call(
      "question_bank",
      [JSON.stringify({ book, status: "corrected" }), 0],
      ["jsonb", "integer"],
    );
    assert.equal(filtered.count, 1);
    const bank = await call(
      "start_bank_practice",
      [JSON.stringify({ book, status: "correct" }), 1, false],
      ["jsonb", "integer", "boolean"],
    );
    assert.equal(
      (await call("practice_prior_progress", [bank], ["uuid"]))[0]
        .first_correct,
      false,
    );
    const counts = await call("book_practice_progress", [book], ["uuid"]);
    assert.equal(counts.find((r) => r.topic_id === parent).solved, 1);
    assert.equal(counts.find((r) => r.topic_id === child).first_incorrect, 1);
    await role(other);
    await assert.rejects(
      call("practice_prior_progress", [parentSession], ["uuid"]),
      /unavailable/i,
    );
    await assert.rejects(
      call(
        "practice_history_events",
        [parentSession, fresh.id],
        ["uuid", "uuid"],
      ),
      /unavailable/i,
    );
  } finally {
    await db.close();
  }
});
