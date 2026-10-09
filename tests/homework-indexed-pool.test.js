import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { learningDatabase, admin, student } from "./helpers/database.js";

test("indexed daily snapshots preserve legacy history, atomic validation and unseen-first reuse in both storage formats", async (t) => {
  const { db, role, call, book } = await learningDatabase();
  t.after(() => db.close());
  const today = (
    await db.query("select (now() at time zone 'Asia/Tashkent')::date::text d")
  ).rows[0].d;
  const config = {
    title: "Pool regression",
    timezone: "Asia/Tashkent",
    startDate: today,
    count: 2,
    selection: "new",
    filters: { book },
    students: [student],
    allowLate: true,
    allowRepeat: true,
  };
  for (const legacy of [false, true])
    await t.test(
      legacy ? "existing JSON version" : "new indexed version",
      async () => {
        await db.exec("reset role");
        if (legacy)
          await db.exec(
            await readFile(
              "supabase/migrations/20261007000500_homework_save_pool.sql",
              "utf8",
            ),
          );
        await role(admin);
        const tid = await call(
          "save_daily_homework",
          [JSON.stringify(config)],
          ["jsonb"],
        );
        await db.exec("reset role");
        const version = (
          await db.query(
            "select * from public.daily_homework_versions where template_id=$1",
            [tid],
          )
        ).rows[0];
        const pool = legacy
          ? version.pool
          : (
              await db.query(
                "select snapshot from public.daily_homework_pool_questions where version_id=$1",
                [version.id],
              )
            ).rows.map((r) => r.snapshot);
        assert.equal(pool.length, 12);
        assert.equal(version.pool_count, legacy ? null : 12);
        // Force the previous assignment to be the hash-preferred candidate; it is
        // unanswered, so answered-only priority would incorrectly reuse it.
        const preferred = (
          await db.query(
            "select id from (select unnest($1::uuid[]) id)q order by md5(id::text||$2::text||$3::text) limit 1",
            [pool.map((q) => q.id), today, student],
          )
        ).rows[0].id;
        await db.query(
          "insert into public.daily_homework_instances(template_id,student_id,study_date,version_id,opens_at,due_at,question_ids) values($1,$2,$3::date-1,$4,now()-interval '2 days',now()-interval '1 day',array[$5::uuid])",
          [tid, student, today, version.id, preferred],
        );
        await role(student);
        const sid = await call(
          "start_daily_homework",
          [tid, today],
          ["uuid", "date"],
        );
        const items = (
          await db.query(
            "select question from public.book_practice_items where session_id=$1",
            [sid],
          )
        ).rows;
        assert.equal(items.length, 2);
        assert.ok(items.every((i) => i.question.id !== preferred));
        assert.equal(
          await call("start_daily_homework", [tid, today], ["uuid", "date"]),
          sid,
        );
        await role(admin);
        const before = await call("daily_homework_templates");
        assert.equal(before.find((t) => t.id === tid).pool_count, 12);
        // A failed edit must roll back the new version, recipient update and pool.
        await assert.rejects(
          call(
            "save_daily_homework",
            [JSON.stringify({ ...config, count: 20, students: [] }), tid],
            ["jsonb", "uuid"],
          ),
          /Not enough/,
        );
        assert.deepEqual(await call("daily_homework_templates"), before);
        await role(student);
        assert.equal(
          (await db.query("select * from public.daily_homework_pool_questions"))
            .rows.length,
          0,
        );
      },
    );
});

test("ordinary MCQ eligibility tracks key deletion/replacement without changing frozen attempt keys", async (t) => {
  const { db, role, call, book } = await learningDatabase();
  t.after(() => db.close());
  const session = await call(
    "start_bank_practice",
    [JSON.stringify({ book }), 12, false],
    ["jsonb", "integer", "boolean"],
  );
  await db.exec("reset role");
  const row = (await db.query("select * from public.question_answers limit 1"))
    .rows[0];
  await db.query("delete from public.question_answers where question_id=$1", [
    row.question_id,
  ]);
  assert.equal(
    (
      await db.query(
        "select student_ready from public.question_bank_eligibility where question_id=$1",
        [row.question_id],
      )
    ).rows[0].student_ready,
    false,
  );
  await role(student);
  const bank = await call(
    "question_bank",
    [JSON.stringify({ book }), 0],
    ["jsonb", "integer"],
  );
  assert.equal(bank.count, 11);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select k.correct_answer from public.book_practice_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=$1 and i.question->>'id'=$2",
        [session, row.question_id],
      )
    ).rows[0].correct_answer,
    row.correct_answer,
  );
  await db.query(
    "insert into public.question_answers(question_id,correct_answer,explanation)values($1,$2,$3)",
    [row.question_id, row.correct_answer, row.explanation],
  );
  assert.equal(
    (
      await db.query(
        "select student_ready from public.question_bank_eligibility where question_id=$1",
        [row.question_id],
      )
    ).rows[0].student_ready,
    true,
  );
});
