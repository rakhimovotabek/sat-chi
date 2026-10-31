import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student, other } from "./helpers/database.js";
test("indexed package images remain public-to-students while explanations require their own checked answer", async (t) => {
  const { db, role, call, book } = await learningDatabase();
  t.after(() => db.close());
  await db.exec("reset role");
  const q = (
    await db.query(
      "select q.id from questions q join book_topics t on t.id=q.topic_id where t.book_id=$1 order by q.position limit 1",
      [book],
    )
  ).rows[0].id;
  for (const [name, kind] of [
    ["1", "question"],
    ["2", "option"],
    ["3", "explanation"],
  ]) {
    const path = "a".repeat(64) + "/" + name.repeat(64) + ".png";
    await db.query(
      "insert into book_package_assets(path,book_id,question_id,kind,source_path,sha256)values($1,$2,$3,$4,$1,$5)",
      [path, book, q, kind, name.repeat(64)],
    );
    await db.query("insert into universal_asset_usage values($1,$2,$3)", [
      path,
      q,
      kind,
    ]);
  }
  const image = (n) => "a".repeat(64) + "/" + String(n).repeat(64) + ".png";
  await role(student);
  assert.equal(
    await call("can_read_book_package_asset", [image(1)], ["text"]),
    true,
  );
  assert.equal(
    await call("can_read_book_package_asset", [image(2)], ["text"]),
    true,
  );
  assert.equal(
    await call("can_read_book_package_asset", [image(3)], ["text"]),
    false,
  );
  await assert.rejects(
    db.query("select * from universal_asset_usage"),
    /permission denied/,
  );
  const sid = await call(
    "start_bank_practice",
    [JSON.stringify({ book }), 20, false],
    ["jsonb", "integer", "boolean"],
  );
  const item = (
    await db.query(
      "select id,answer_revision from book_practice_items where session_id=$1 and question->>'id'=$2",
      [sid, q],
    )
  ).rows[0];
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
  assert.equal(
    await call("can_read_book_package_asset", [image(3)], ["text"]),
    false,
  );
  await call(
    "check_bank_answer",
    [sid, item.id, 1, "fb000000-0000-0000-0000-000000000001"],
    ["uuid", "uuid", "integer", "uuid"],
  );
  assert.equal(
    await call("can_read_book_package_asset", [image(3)], ["text"]),
    true,
  );
  await role(other);
  assert.equal(
    await call("can_read_book_package_asset", [image(3)], ["text"]),
    false,
  );
});
