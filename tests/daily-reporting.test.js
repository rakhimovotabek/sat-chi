import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, admin, student, other } from "./helpers/database.js";
test("daily reporting counts scheduled unopened days and keeps aggregate access private", async () => {
  const { db, role, call } = await learningDatabase();
  try {
    await role(admin);
    const day = (
      await db.query(
        "select (now() at time zone 'Asia/Tashkent')::date::text d",
      )
    ).rows[0].d;
    const tid = await call(
      "save_daily_homework",
      [
        JSON.stringify({
          title: "Daily report",
          timezone: "Asia/Tashkent",
          startDate: day,
          count: 2,
          selection: "new",
          allStudents: true,
        }),
      ],
      ["jsonb"],
    );
    const report = await call("daily_homework_report");
    assert.equal(report.today[0].assigned, 2);
    assert.equal(report.today[0].completed, 0);
    assert.equal(report.students.length, 2);
    assert.equal(
      report.students[0].completion_rate,
      null,
      "unfinished today is not counted as a failure",
    );
    await db.exec("reset role");
    for (const table of [
      "daily_homework_windows",
      "daily_homework_enrollments",
    ])
      await db.query(
        `update public.${table} set from_date=$1::date-2 where template_id=$2`,
        [day, tid],
      );
    await db.query(
      "update public.daily_homework_versions set valid_from=$1::date-2,data=jsonb_set(data,'{startDate}',to_jsonb(($1::date-2)::text)) where template_id=$2",
      [day, tid],
    );
    await role(student);
    const own = await call("daily_homework_report");
    assert.equal(own.students.length, 1);
    assert.equal(own.students[0].student_id, student);
    assert.equal(own.students[0].missed, 2);
    assert.equal(own.students[0].completion_rate, 0);
    assert.equal(own.history.length, 3);
    await assert.rejects(
      call("daily_homework_report", [other], ["uuid"]),
      /Account unavailable/,
    );
    await assert.rejects(
      call(
        "daily_homework_rows",
        [null, null, day, day],
        ["uuid", "uuid", "date", "date"],
      ),
      /permission denied/,
    );
    const sid = await call(
      "start_daily_homework",
      [tid, day],
      ["uuid", "date"],
    );
    const items = (
      await db.query(
        "select id from public.book_practice_items where session_id=$1",
        [sid],
      )
    ).rows;
    await call(
      "save_book_practice",
      [
        sid,
        JSON.stringify(items.map((i) => ({ id: i.id, selected_answer: 1 }))),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [sid], ["uuid"]);
    const completed = await call("daily_homework_report");
    assert.equal(completed.today[0].completed, 1);
    assert.equal(completed.students[0].accuracy, 100);
    assert.equal(completed.students[0].completion_rate, 33.3);
    const stats = await call("daily_homework_statistics");
    assert.equal(stats.completion_rate, 33.3);
    assert.equal(stats.accuracy, 100);
    assert.equal(stats.current_streak, 1);
    assert.equal(stats.longest_streak, 1);
    assert.equal(stats.missed_days, 2);
    await assert.rejects(
      call("daily_homework_statistics", [other], ["uuid"]),
      /Account unavailable/,
    );
    const yesterday = (await db.query("select ($1::date-1)::text d", [day]))
      .rows[0].d;
    const lateSid = await call(
      "start_daily_homework",
      [tid, yesterday],
      ["uuid", "date"],
    );
    const lateItems = (
      await db.query(
        "select id from public.book_practice_items where session_id=$1",
        [lateSid],
      )
    ).rows;
    await call(
      "save_book_practice",
      [
        lateSid,
        JSON.stringify(
          lateItems.map((i) => ({ id: i.id, selected_answer: 1 })),
        ),
      ],
      ["uuid", "jsonb"],
    );
    await call("finish_book_practice", [lateSid], ["uuid"]);
    const lateStats = await call("daily_homework_statistics");
    assert.equal(lateStats.completion_rate, 66.7);
    assert.equal(
      lateStats.current_streak,
      1,
      "late completion does not extend on-time streak",
    );
    assert.equal(lateStats.missed_days, 1);
    await db.exec("reset role");
    await db.query(
      "update public.daily_homework_versions set data=jsonb_set(data,'{allowRepeat}','true') where template_id=$1",
      [tid],
    );
    await role(student);
    const before = (await db.query("select ($1::date-2)::text d", [day]))
      .rows[0].d;
    await call("start_daily_homework", [tid, before], ["uuid", "date"]);
    const selected = (
      await db.query(
        "select question_ids from public.daily_homework_instances where template_id=$1",
        [tid],
      )
    ).rows.flatMap((r) => r.question_ids);
    assert.equal(
      new Set(selected).size,
      6,
      "reuse enabled still avoids duplicates before exhaustion",
    );
    await role(admin);
    await assert.rejects(
      call(
        "daily_homework_report",
        [null, null, "2025-01-01", "2026-01-01", 0],
        ["uuid", "uuid", "date", "date", "integer"],
      ),
      /31 days/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(call("daily_homework_report"), /permission denied/);
    await assert.rejects(
      call("daily_homework_statistics"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
