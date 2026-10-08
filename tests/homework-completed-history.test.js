import test from "node:test";
import assert from "node:assert/strict";
import { homeworkDatabase } from "./helpers/homework-database.js";
import { admin, student, other } from "./helpers/database.js";

test("withdrawn completed homework keeps immutable student history while current recipients receive edited definitions", async () => {
  const { db, role, call } = await homeworkDatabase();
  try {
    await role(admin);
    const config = {
      title: "Disposable completed history",
      dueAt: "2026-12-01T12:00:00Z",
      students: [student],
      sections: [{ title: "Math", count: 2, filters: {} }],
    };
    const hid = await call(
      "create_homework",
      [JSON.stringify(config)],
      ["jsonb"],
    );
    await role(student);
    const assignment = (await call("homework_directory"))[0].assignment_id;
    const sid = await call("start_homework", [assignment], ["uuid"]);
    const items = async () =>
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1 order by position",
          [sid],
        )
      ).rows;
    await call(
      "save_practice_changes",
      [
        sid,
        JSON.stringify(
          (await items()).map((i) => ({
            id: i.id,
            selected_answer: 1,
            expected_revision: i.answer_revision,
          })),
        ),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [sid], ["uuid"]);
    const history = await items();
    assert.ok(history.every((i) => i.correct));
    await role(admin);
    await call(
      "update_homework",
      [
        hid,
        JSON.stringify({
          ...config,
          students: [other],
          sections: [{ title: "Current", count: 1, filters: {} }],
        }),
      ],
      ["uuid", "jsonb"],
    );
    assert.equal(
      (
        await db.query(
          "select active from public.homework_assignments where id=$1",
          [assignment],
        )
      ).rows[0].active,
      false,
    );
    await role(student);
    assert.deepEqual(await call("homework_directory"), []);
    assert.deepEqual(await items(), history);
    assert.ok(
      (
        await db.query(
          "select submitted_at from public.book_practice_sessions where id=$1",
          [sid],
        )
      ).rows[0].submitted_at,
    );
    assert.equal(
      (await db.query("select * from public.review_book_practice($1)", [sid]))
        .rows.length,
      2,
    );
    await assert.rejects(
      call("start_homework", [assignment], ["uuid"]),
      /unavailable/i,
    );
    await assert.rejects(
      call(
        "save_practice_changes",
        [
          sid,
          JSON.stringify([
            {
              id: history[0].id,
              selected_answer: 2,
              expected_revision: history[0].answer_revision,
            },
          ]),
        ],
        ["uuid", "jsonb"],
      ),
      /Submitted answers cannot change/,
    );
    assert.deepEqual(await items(), history);
    await role(other);
    const current = (await call("homework_directory"))[0];
    const currentSid = await call(
      "start_homework",
      [current.assignment_id],
      ["uuid"],
    );
    const fresh = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1",
        [currentSid],
      )
    ).rows;
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].selected_answer, null);
  } finally {
    await db.close();
  }
});
