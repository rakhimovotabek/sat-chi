import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, student } from "./helpers/database.js";
import { repairSql } from "../scripts/imports/apply-reading-format-repairs.js";

test("verified passage repair updates only matching snapshots, preserves keys/progress and refuses stale edits", async () => {
  const { db, role, call, book } = await learningDatabase();
  try {
    const q = (
      await db.query(
        "select q.* from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=$1 order by q.id limit 1",
        [book],
      )
    ).rows[0];
    await db.exec("reset role");
    await db.query(
      "update public.questions set section='Reading & Writing',passage='The source word belongs here.' where id=$1",
      [q.id],
    );
    await role(student);
    const sid = await call("start_book_practice", [q.topic_id], ["uuid"]);
    const before = (
      await db.query(
        "select id,selected_answer,marked,solved_at from public.book_practice_items where session_id=$1 order by id",
        [sid],
      )
    ).rows;
    await db.exec("reset role");
    const keys = (
      await db.query("select * from public.book_practice_keys order by item_id")
    ).rows;
    const repair = {
      id: q.id,
      book_id: book,
      before: "The source word belongs here.",
      after: "The source <u>word</u> belongs _____ here.",
      evidence: [{ kind: "underline", text: "word" }],
    };
    const sql = repairSql([repair], [], { [book]: "a".repeat(64) });
    await db.exec(sql);
    await db.exec(sql);
    assert.equal(
      (
        await db.query("select passage from public.questions where id=$1", [
          q.id,
        ])
      ).rows[0].passage,
      "The source word belongs _____ here.",
    );
    assert.equal(
      (
        await db.query(
          "select passage_markup as passage from public.questions where id=$1",
          [q.id],
        )
      ).rows[0].passage,
      repair.after,
    );
    assert.equal(
      (
        await db.query(
          "select question->>'passage_markup' passage from public.book_practice_items where session_id=$1 and question->>'id'=$2",
          [sid, q.id],
        )
      ).rows[0].passage,
      repair.after,
    );
    assert.deepEqual(
      (
        await db.query(
          "select id,selected_answer,marked,solved_at from public.book_practice_items where session_id=$1 order by id",
          [sid],
        )
      ).rows,
      before,
    );
    assert.deepEqual(
      (
        await db.query(
          "select * from public.book_practice_keys order by item_id",
        )
      ).rows,
      keys,
    );
    await db.query(
      "update public.questions set passage='A later manual edit' where id=$1",
      [q.id],
    );
    await assert.rejects(db.exec(sql), /changed since source audit/);
    await db.exec("rollback");
  } finally {
    await db.close();
  }
});
