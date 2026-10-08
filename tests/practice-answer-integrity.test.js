import test from "node:test";
import assert from "node:assert/strict";
import { homeworkDatabase } from "./helpers/homework-database.js";
import { admin, student, other } from "./helpers/database.js";

test("real SQL versioned saves reject stale writers, preserve independent answers, retry lost acknowledgements and enforce withdrawal", async (t) => {
  const { db, role, call } = await homeworkDatabase();
  try {
    await role(admin);
    const hid = await call(
      "create_homework",
      [
        JSON.stringify({
          title: "Integrity fixture",
          dueAt: "2026-12-01T12:00:00Z",
          students: [student],
          sections: [{ title: "Math", count: 10, filters: {} }],
        }),
      ],
      ["jsonb"],
    );
    await role(student);
    const dir = await call("homework_directory");
    const sid = await call("start_homework", [dir[0].assignment_id], ["uuid"]);
    const rows = async () =>
      (
        await db.query(
          "select * from public.book_practice_items where session_id=$1 order by position",
          [sid],
        )
      ).rows;
    const items = await rows();
    const change = (i, answer, revision = 0) => ({
      id: i.id,
      selected_answer: answer,
      marked: false,
      eliminated: [],
      expected_revision: revision,
    });
    const save = (entries) =>
      call(
        "save_practice_changes",
        [sid, JSON.stringify(entries)],
        ["uuid", "jsonb"],
      );
    await t.test(
      "simultaneously queued saves on different questions both persist",
      async () => {
        const result = await Promise.all([
          save([change(items[0], 1)]),
          save([change(items[1], 2)]),
        ]);
        assert.equal(result.length, 2);
        const after = await rows();
        assert.equal(after[0].selected_answer, 1);
        assert.equal(after[1].selected_answer, 2);
      },
    );
    await t.test(
      "simultaneously queued conflicting saves have exactly one winner",
      async () => {
        const result = await Promise.allSettled([
          save([change(items[2], 1)]),
          save([change(items[2], 2)]),
        ]);
        assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
        const failed = result.find((r) => r.status === "rejected");
        assert.equal(failed.reason.code, "PT409");
        assert.equal((await rows())[2].selected_answer, 1);
      },
    );
    await t.test("lost acknowledgement retries are idempotent", async () => {
      const answer = change(items[0], 1);
      const before = (await rows())[0].answer_revision;
      const ack = await save([answer]);
      assert.equal(ack[0].answer_revision, before);
      assert.equal((await rows())[0].answer_revision, before);
    });
    await t.test("atomic batch conflict rolls back other changes", async () => {
      await assert.rejects(
        save([change(items[3], 1), change(items[0], 2)]),
        (e) => e.code === "PT409",
      );
      assert.equal((await rows())[3].selected_answer, null);
    });
    await t.test(
      "partial mark updates preserve an acknowledged answer",
      async () => {
        const ack = await save([change(items[5], 1)]);
        await save([
          {
            id: items[5].id,
            marked: true,
            expected_revision: ack[0].answer_revision,
          },
        ]);
        const after = (await rows())[5];
        assert.equal(after.selected_answer, 1);
        assert.equal(after.marked, true);
      },
    );
    await t.test(
      "legacy versionless RPC cannot bypass concurrency protection",
      async () => {
        await assert.rejects(
          db.query("select public.save_book_practice($1,$2::jsonb)", [
            sid,
            JSON.stringify([{ id: items[0].id, selected_answer: 2 }]),
          ]),
          /Answer version required/,
        );
        assert.equal((await rows())[0].selected_answer, 1);
      },
    );
    await t.test(
      "other accounts and private helper calls are rejected",
      async () => {
        await role(other);
        await assert.rejects(save([change(items[0], 2, 1)]), /unavailable/);
        await assert.rejects(
          call("persist_practice_changes", [sid, "[]"], ["uuid", "jsonb"]),
          /permission denied/,
        );
        await role(student);
      },
    );
    await t.test(
      "stale Check cannot overwrite an acknowledged bank answer",
      async () => {
        const bankSid = await call(
          "start_bank_practice",
          ["{}", 2, false],
          ["jsonb", "integer", "boolean"],
        );
        const item = (
          await db.query(
            "select * from public.book_practice_items where session_id=$1 order by position limit 1",
            [bankSid],
          )
        ).rows[0];
        await call(
          "save_practice_changes",
          [bankSid, JSON.stringify([change(item, 1)])],
          ["uuid", "jsonb"],
        );
        await assert.rejects(
          db.query("select public.check_bank_answer($1,$2,0,$3)", [
            bankSid,
            item.id,
            "f9000000-0000-0000-0000-000000000001",
          ]),
          (e) => e.code === "PT409",
        );
        assert.equal(
          (
            await db.query(
              "select selected_answer from public.book_practice_items where id=$1",
              [item.id],
            )
          ).rows[0].selected_answer,
          1,
        );
        await db.query("select public.check_bank_answer($1,$2,1,$3)", [
          bankSid,
          item.id,
          "f9000000-0000-0000-0000-000000000002",
        ]);
      },
    );
    await t.test(
      "missing source keys are excluded from assignment picker eligibility while frozen homework keys survive",
      async () => {
        await role(admin);
        const sourceId = items[0].question.id;
        const beforeCount = (
          await call(
            "question_bank",
            ['{"assignment":true}', 0],
            ["jsonb", "integer"],
          )
        ).count;
        await db.query(
          "delete from public.question_answers where question_id=$1",
          [sourceId],
        );
        await assert.rejects(
          db.query(
            "select student_ready from public.question_bank_eligibility where question_id=$1",
            [sourceId],
          ),
          /permission denied/,
        );
        assert.equal(
          (
            await call(
              "question_bank",
              ['{"assignment":true}', 0],
              ["jsonb", "integer"],
            )
          ).count,
          beforeCount - 1,
        );
        await role(student);
        const reviewKeys = await db.query(
          "select * from public.book_practice_items where id=$1",
          [items[0].id],
        );
        assert.equal(reviewKeys.rows[0].selected_answer, 1);
      },
    );
    await t.test(
      "withdrawal denies session/items reads, saves, heartbeat and submission while admin history remains",
      async () => {
        await role(admin);
        const config = (await call("homework_edit_data", [hid], ["uuid"])).data;
        await call(
          "update_homework",
          [hid, JSON.stringify({ ...config, students: [other] })],
          ["uuid", "jsonb"],
        );
        await role(student);
        assert.equal((await rows()).length, 0);
        assert.equal(
          (
            await db.query(
              "select * from public.book_practice_sessions where id=$1",
              [sid],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(save([change(items[4], 1)]), /unavailable/);
        await assert.rejects(
          call(
            "practice_heartbeat",
            [sid, 0, 1],
            ["uuid", "integer", "integer"],
          ),
          /unavailable/,
        );
        await assert.rejects(
          call("finish_book_practice", [sid], ["uuid"]),
          /unavailable/,
        );
        await role(admin);
        assert.equal((await rows())[0].selected_answer, 1);
        assert.equal((await rows()).length, 10);
      },
    );
  } finally {
    await db.close();
  }
});

test("real SQL daily frozen revisions survive edits; expired non-late occurrences cannot be modified through saved URLs", async () => {
  const { db, role, call } = await homeworkDatabase();
  try {
    const today = (
      await db.query("select (now()at time zone 'Asia/Tashkent')::date::text d")
    ).rows[0].d;
    await role(admin);
    const config = {
      title: "Daily integrity",
      timezone: "Asia/Tashkent",
      startDate: today,
      count: 2,
      selection: "new",
      filters: { section: "Math" },
      students: [student],
      allowLate: false,
      allowRepeat: false,
    };
    const tid = await call(
      "save_daily_homework",
      [JSON.stringify(config)],
      ["jsonb"],
    );
    await role(student);
    const sid = await call(
      "start_daily_homework",
      [tid, today],
      ["uuid", "date"],
    );
    const before = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    await call(
      "save_practice_changes",
      [
        sid,
        JSON.stringify([
          {
            id: before[0].id,
            selected_answer: 1,
            marked: false,
            eliminated: [],
            expected_revision: 0,
          },
        ]),
      ],
      ["uuid", "jsonb"],
    );
    await role(admin);
    await call(
      "save_daily_homework",
      [JSON.stringify({ ...config, title: "Future version", count: 3 }), tid],
      ["jsonb", "uuid"],
    );
    const current = (
      await db.query(
        "select * from public.book_practice_items where session_id=$1 order by position",
        [sid],
      )
    ).rows;
    assert.equal(current.length, 2);
    assert.equal(current[0].selected_answer, 1);
    assert.deepEqual(
      current.map((i) => i.question),
      before.map((i) => i.question),
    );
    await db.exec("reset role");
    await db.query(
      "update public.daily_homework_instances set opens_at=now()-interval '2 days',due_at=now()-interval '1 day' where session_id=$1",
      [sid],
    );
    await role(student);
    await assert.rejects(
      call(
        "save_practice_changes",
        [
          sid,
          JSON.stringify([
            { id: before[1].id, selected_answer: 1, expected_revision: 0 },
          ]),
        ],
        ["uuid", "jsonb"],
      ),
      /unavailable/,
    );
    await assert.rejects(
      call("practice_heartbeat", [sid, 0, 0], ["uuid", "integer", "integer"]),
      /unavailable/,
    );
    await role(admin);
    assert.equal(
      (
        await db.query(
          "select selected_answer from public.book_practice_items where id=$1",
          [before[1].id],
        )
      ).rows[0].selected_answer,
      null,
    );
  } finally {
    await db.close();
  }
});
