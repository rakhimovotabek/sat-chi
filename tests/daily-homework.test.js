import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, admin, student, other } from "./helpers/database.js";

test("daily homework backend preserves local deadlines, recurring history, grading and access", async (t) => {
  const { db, role, call } = await learningDatabase();
  const today = (
    await db.query(
      "select (now() at time zone 'Asia/Tashkent')::date::text as local_day",
    )
  ).rows[0].local_day;
  const shifted = async (days) =>
    (
      await db.query("select ($1::date+$2::int)::text as local_day", [
        today,
        days,
      ])
    ).rows[0].local_day;
  const config = {
    title: "Daily Algebra",
    instructions: "Solve each question",
    timezone: "Asia/Tashkent",
    startDate: today,
    count: 2,
    selection: "new",
    filters: { section: "Math" },
    students: [student],
    groups: [],
    allowLate: true,
    allowRepeat: false,
  };
  let template, session;
  const directory = (uid = null, tid = template, from = today, until = today) =>
    call(
      "daily_homework_directory",
      [uid, tid, from, until, 0],
      ["uuid", "uuid", "date", "date", "integer"],
    );
  try {
    await t.test(
      "create validates count, recipients, timezone, published pool and student privilege",
      async () => {
        await assert.rejects(
          call("save_daily_homework", [JSON.stringify(config)], ["jsonb"]),
          /Admin required/,
        );
        await role(admin);
        await assert.rejects(
          call(
            "save_daily_homework",
            [JSON.stringify({ ...config, count: 20 })],
            ["jsonb"],
          ),
          /Not enough usable/,
        );
        await assert.rejects(
          call(
            "save_daily_homework",
            [JSON.stringify({ ...config, timezone: "Invalid/Zone" })],
            ["jsonb"],
          ),
          /IANA timezone/,
        );
        await assert.rejects(
          call(
            "save_daily_homework",
            [JSON.stringify({ ...config, students: [] })],
            ["jsonb"],
          ),
          /at least one active/,
        );
        template = await call(
          "save_daily_homework",
          [JSON.stringify(config)],
          ["jsonb"],
        );
        const definitions = await call("daily_homework_templates");
        assert.equal(definitions.length, 1);
        assert.equal(definitions[0].pool_count, 12);
        await role(student);
        assert.equal(
          (await db.query("select * from public.daily_homework_versions")).rows
            .length,
          0,
          "frozen answer pools stay private",
        );
        await assert.rejects(
          db.query("update public.daily_homework_templates set state='paused'"),
        );
      },
    );
    await t.test(
      "today opens at local 00:00 and is due at the next midnight; range is bounded",
      async () => {
        const rows = await directory();
        assert.equal(rows.total, 1);
        assert.equal(rows.rows[0].status, "Not started");
        assert.equal(rows.rows[0].is_today, true);
        const row = rows.rows[0];
        assert.equal(
          new Date(row.opens_at).getTime(),
          new Date(`${today}T00:00:00+05:00`).getTime(),
        );
        assert.equal(
          new Date(row.due_at).getTime(),
          new Date(`${await shifted(1)}T00:00:00+05:00`).getTime(),
        );
        assert.equal(new Date(row.due_at) - new Date(row.opens_at), 86400000);
        await assert.rejects(
          directory(null, template, await shifted(-40), today),
          /31 days/,
        );
        const dst = (
          await db.query(
            "select extract(epoch from (('2026-11-02'::timestamp at time zone 'America/New_York')-('2026-11-01'::timestamp at time zone 'America/New_York')))::int seconds",
          )
        ).rows[0];
        assert.equal(
          dst.seconds,
          25 * 3600,
          "IANA calendar boundaries preserve a 25-hour DST day",
        );
      },
    );
    await t.test(
      "start is idempotent, preserves assignment mode and does not complete from opening",
      async () => {
        session = await call(
          "start_daily_homework",
          [template, today],
          ["uuid", "date"],
        );
        assert.equal(
          await call(
            "start_daily_homework",
            [template, today],
            ["uuid", "date"],
          ),
          session,
        );
        assert.equal(
          (await db.query("select * from public.daily_homework_instances")).rows
            .length,
          1,
        );
        assert.equal((await directory()).rows[0].status, "In progress");
        await assert.rejects(
          call("finish_book_practice", [session], ["uuid"]),
          /Answer every/,
        );
        const item = (
          await db.query(
            "select id from public.book_practice_items where session_id=$1 order by position",
            [session],
          )
        ).rows[0].id;
        await assert.rejects(
          call(
            "check_bank_answer",
            [session, item, 1, "f3000000-0000-0000-0000-000000000001"],
            ["uuid", "uuid", "integer", "uuid"],
          ),
          /bank session/,
        );
        await role(other);
        assert.equal((await directory()).total, 0);
        assert.equal(
          (await db.query("select * from public.daily_homework_instances")).rows
            .length,
          0,
        );
        await assert.rejects(
          call("daily_homework_directory", [student], ["uuid"]),
        );
        await assert.rejects(
          call("start_daily_homework", [template, today], ["uuid", "date"]),
        );
        await assert.rejects(
          db.query(
            "insert into public.daily_homework_instances(template_id,version_id,student_id,study_date,opens_at,due_at) select template_id,version_id,$1,study_date,opens_at,due_at from public.daily_homework_instances",
            [student],
          ),
        );
        await role(student);
      },
    );
    await t.test(
      "completion uses real final answers and stores accuracy separately",
      async () => {
        const items = (
          await db.query(
            "select id from public.book_practice_items where session_id=$1 order by position",
            [session],
          )
        ).rows;
        await call(
          "save_book_practice",
          [
            session,
            JSON.stringify(
              items.map((i, n) => ({
                id: i.id,
                selected_answer: n === 0 ? 1 : 0,
                marked: false,
                eliminated: [],
              })),
            ),
          ],
          ["uuid", "jsonb"],
        );
        await call("finish_book_practice", [session], ["uuid"]);
        const row = (await directory()).rows[0];
        assert.equal(row.status, "Completed");
        assert.equal(row.correct, 1);
        assert.equal(row.answered, 2);
        assert.equal(row.attempts, 2);
        assert.ok(row.completed_at);
        assert.equal(row.completed_late, false);
        assert.equal(
          (
            await db.query("select * from public.review_book_practice($1)", [
              session,
            ])
          ).rows.length,
          2,
        );
      },
    );
    await t.test(
      "editing freezes today's started/completed version and affects only future days",
      async () => {
        await role(admin);
        await call(
          "save_daily_homework",
          [
            JSON.stringify({ ...config, title: "Future Algebra", count: 3 }),
            template,
          ],
          ["jsonb", "uuid"],
        );
        assert.equal((await directory(student)).rows[0].title, "Daily Algebra");
        const versions = (
          await db.query(
            "select revision,valid_from::text,data from public.daily_homework_versions where template_id=$1 order by revision",
            [template],
          )
        ).rows;
        assert.equal(versions.length, 2);
        assert.equal(versions[1].valid_from, await shifted(1));
        assert.equal(versions[0].data.count, 2);
        assert.equal(versions[1].data.count, 3);
        await assert.rejects(
          call(
            "save_daily_homework",
            [JSON.stringify({ ...config, timezone: "UTC" }), template],
            ["jsonb", "uuid"],
          ),
          /Timezone is fixed/,
        );
        await role(student);
        await assert.rejects(
          call(
            "start_daily_homework",
            [template, await shifted(1)],
            ["uuid", "date"],
          ),
          /unavailable/,
        );
      },
    );
    await t.test(
      "missed days are retained, allow late reopening and freeze their original definition",
      async () => {
        // Advance enrollment/version/window fixtures into the past, simulating earlier real assignment dates.
        await db.exec("reset role");
        await db.query(
          "update public.daily_homework_enrollments set from_date=$2::date where template_id=$1",
          [template, await shifted(-2)],
        );
        await db.query(
          "update public.daily_homework_windows set from_date=$2::date where template_id=$1",
          [template, await shifted(-2)],
        );
        await db.query(
          "update public.daily_homework_versions set valid_from=$2::date,data=jsonb_set(data,'{startDate}',to_jsonb($2::text)) where template_id=$1 and revision=1",
          [template, await shifted(-2)],
        );
        await role(student);
        const yesterday = await shifted(-1);
        const missed = (await directory(null, template, yesterday, yesterday))
          .rows[0];
        assert.equal(missed.status, "Missed");
        const late = await call(
          "start_daily_homework",
          [template, yesterday],
          ["uuid", "date"],
        );
        const items = (
          await db.query(
            "select id from public.book_practice_items where session_id=$1",
            [late],
          )
        ).rows;
        await call(
          "save_book_practice",
          [
            late,
            JSON.stringify(
              items.map((i) => ({
                id: i.id,
                selected_answer: 1,
                marked: false,
                eliminated: [],
              })),
            ),
          ],
          ["uuid", "jsonb"],
        );
        await call("finish_book_practice", [late], ["uuid"]);
        assert.equal(
          (await directory(null, template, yesterday, yesterday)).rows[0]
            .status,
          "Completed late",
        );
        const selected = (
          await db.query(
            "select question_ids from public.daily_homework_instances where template_id=$1",
            [template],
          )
        ).rows;
        assert.equal(
          new Set(selected.flatMap((i) => i.question_ids)).size,
          4,
          "daily selection avoids previously assigned questions",
        );
        const historical = (
          await directory(null, template, await shifted(-2), today)
        ).rows;
        assert.equal(historical.length, 3);
        assert.ok(historical.some((r) => r.status === "Missed"));
      },
    );
    await t.test(
      "group and all-active enrollment work; membership changes affect future days",
      async () => {
        await role(admin);
        const group = (
          await db.query(
            "insert into public.groups(name) values('Daily group')returning id",
          )
        ).rows[0].id;
        await db.query(
          "insert into public.group_members(group_id,student_id)values($1,$2)",
          [group, student],
        );
        const groupTemplate = await call(
          "save_daily_homework",
          [JSON.stringify({ ...config, students: [], groups: [group] })],
          ["jsonb"],
        );
        assert.equal((await directory(student, groupTemplate)).total, 1);
        await db.query(
          "insert into public.group_members(group_id,student_id)values($1,$2)",
          [group, other],
        );
        const enrollment = (
          await db.query(
            "select from_date::text from public.daily_homework_enrollments where template_id=$1 and student_id=$2",
            [groupTemplate, other],
          )
        ).rows[0];
        assert.equal(enrollment.from_date, await shifted(1));
        await db.query(
          "delete from public.group_members where group_id=$1 and student_id=$2",
          [group, student],
        );
        assert.equal(
          (await directory(student, groupTemplate)).total,
          1,
          "today is preserved on group removal",
        );
        assert.equal(
          (
            await db.query(
              "select until_date::text from public.daily_homework_enrollments where template_id=$1 and student_id=$2",
              [groupTemplate, student],
            )
          ).rows[0].until_date,
          await shifted(1),
        );
        const allTemplate = await call(
          "save_daily_homework",
          [
            JSON.stringify({
              ...config,
              students: [],
              allStudents: true,
              selection: "fixed",
            }),
          ],
          ["jsonb"],
        );
        assert.equal((await directory(null, allTemplate)).total, 2);
      },
    );
    await t.test(
      "late policy and finite unseen pools fail explicitly; fixed pools may repeat",
      async () => {
        await role(admin);
        const sourceIds = (
          await db.query("select id from public.questions order by id limit 2")
        ).rows.map((q) => q.id);
        const finite = await call(
          "save_daily_homework",
          [JSON.stringify({ ...config, questionIds: sourceIds })],
          ["jsonb"],
        );
        const locked = await call(
          "save_daily_homework",
          [JSON.stringify({ ...config, allowLate: false })],
          ["jsonb"],
        );
        const fixed = await call(
          "save_daily_homework",
          [
            JSON.stringify({
              ...config,
              questionIds: sourceIds,
              selection: "fixed",
            }),
          ],
          ["jsonb"],
        );
        await db.exec("reset role");
        for (const tid of [finite, locked, fixed]) {
          await db.query(
            "update public.daily_homework_enrollments set from_date=$2::date where template_id=$1",
            [tid, await shifted(-1)],
          );
          await db.query(
            "update public.daily_homework_windows set from_date=$2::date where template_id=$1",
            [tid, await shifted(-1)],
          );
          await db.query(
            "update public.daily_homework_versions set valid_from=$2::date,data=jsonb_set(data,'{startDate}',to_jsonb($2::text)) where template_id=$1",
            [tid, await shifted(-1)],
          );
        }
        await role(student);
        await call("start_daily_homework", [finite, today], ["uuid", "date"]);
        await assert.rejects(
          call(
            "start_daily_homework",
            [finite, await shifted(-1)],
            ["uuid", "date"],
          ),
          /pool exhausted/,
        );
        await assert.rejects(
          call(
            "start_daily_homework",
            [locked, await shifted(-1)],
            ["uuid", "date"],
          ),
          /Late work is disabled/,
        );
        await call("start_daily_homework", [fixed, today], ["uuid", "date"]);
        await call(
          "start_daily_homework",
          [fixed, await shifted(-1)],
          ["uuid", "date"],
        );
        const repeated = (
          await db.query(
            "select question_ids from public.daily_homework_instances where template_id=$1",
            [fixed],
          )
        ).rows;
        assert.deepEqual(repeated[0].question_ids, repeated[1].question_ids);
      },
    );
    await t.test(
      "timed partial submissions retain grading but receive no completion credit",
      async () => {
        await role(admin);
        const timed = await call(
          "save_daily_homework",
          [JSON.stringify({ ...config, timeLimit: 60 })],
          ["jsonb"],
        );
        await role(student);
        const sid = await call(
          "start_daily_homework",
          [timed, today],
          ["uuid", "date"],
        );
        await db.exec("reset role");
        await db.query(
          "update public.book_practice_sessions set started_at=now()-interval '120 seconds' where id=$1",
          [sid],
        );
        await role(student);
        await call("finish_book_practice", [sid], ["uuid"]);
        const row = (await directory(null, timed)).rows[0];
        assert.equal(row.completed_at, null);
        assert.equal(row.status, "Incomplete");
        assert.equal(row.answered, 0);
        assert.ok(
          (
            await db.query(
              "select submitted_at from public.book_practice_sessions where id=$1",
              [sid],
            )
          ).rows[0].submitted_at,
        );
      },
    );
    await t.test(
      "pause/resume/archive retain history and stop future scheduling",
      async () => {
        await role(admin);
        await call(
          "set_daily_homework_state",
          [template, "paused"],
          ["uuid", "text"],
        );
        assert.equal((await directory(student)).rows[0].status, "Completed");
        let windows = (
          await db.query(
            "select until_date::text from public.daily_homework_windows where template_id=$1",
            [template],
          )
        ).rows;
        assert.equal(windows[0].until_date, await shifted(1));
        await call(
          "set_daily_homework_state",
          [template, "active"],
          ["uuid", "text"],
        );
        windows = (
          await db.query(
            "select until_date from public.daily_homework_windows where template_id=$1",
            [template],
          )
        ).rows;
        assert.equal(windows.length, 1);
        assert.equal(windows[0].until_date, null);
        await call(
          "set_daily_homework_state",
          [template, "archived"],
          ["uuid", "text"],
        );
        assert.equal((await directory(student)).rows[0].status, "Completed");
        await assert.rejects(
          call(
            "set_daily_homework_state",
            [template, "active"],
            ["uuid", "text"],
          ),
          /unavailable/,
        );
        await role(student);
        await assert.rejects(
          call(
            "set_daily_homework_state",
            [template, "paused"],
            ["uuid", "text"],
          ),
          /Admin required/,
        );
        await db.exec("reset role;set role anon");
        await assert.rejects(call("daily_homework_directory"));
        await assert.rejects(call("finish_book_practice", [session], ["uuid"]), /permission denied/);
        await assert.rejects(
          db.query("select * from public.daily_homework_instances"),
        );
      },
    );
  } finally {
    await db.close();
  }
});
