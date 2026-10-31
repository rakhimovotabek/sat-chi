import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, admin, student } from "./helpers/database.js";

test("an admin freezes only the admitted approved pool even when their Bank can inspect unapproved questions", async (t) => {
  const { db, role, call, book } = await learningDatabase();
  t.after(() => db.close());
  await db.exec("reset role");
  const blocked = (
    await db.query(
      "select q.id from questions q join book_topics bt on bt.id=q.topic_id where bt.book_id=$1 order by q.position limit 1",
      [book],
    )
  ).rows[0].id;
  await db.query(
    "insert into book_import_packages values($1,'fixture-package','fixture-fingerprint','{}','{}','{}','{}')",
    [book],
  );
  await db.query("update questions set import_metadata=$1::jsonb where id=$2", [
    JSON.stringify({ package_question_id: "requires-review" }),
    blocked,
  ]);
  assert.equal(
    (
      await db.query(
        "select public.question_approved_for_students($1)approved",
        [blocked],
      )
    ).rows[0].approved,
    false,
  );
  const action = (action, data) =>
    call("battle_action", [action, JSON.stringify(data)], ["text", "jsonb"]);
  await role(admin);
  let room = await action("create", {
    category: "Math",
    capacity: 2,
    questionCount: 11,
    seconds: 60,
    filters: { book },
  });
  const id = room.id;
  await action("ready", { id });
  await role(student);
  await action("join", { code: room.code });
  await action("ready", { id });
  await role(admin);
  room = await action("start", { id });
  assert.equal(room.state, "COUNTDOWN");
  await db.exec("reset role");
  const frozen = (
    await db.query(
      "select question->>'id' id from battle_rounds where battle_id=$1",
      [id],
    )
  ).rows;
  assert.equal(frozen.length, 11);
  assert.equal(
    frozen.some((question) => question.id === blocked),
    false,
  );
});
