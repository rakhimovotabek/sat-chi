import test from "node:test";
import assert from "node:assert/strict";
import { learningDatabase, admin, student, other } from "./helpers/database.js";

test(
  "Homework Delete removes only unused records and preserves owned learning history",
  { timeout: 180000 },
  async (t) => {
    const f = await learningDatabase();
    t.after(() => f.db.close());
    const { db, role, call, book } = f;
    const ids = (
      await db.query(
        "select id from questions where topic_id in(select id from book_topics where book_id=$1)order by position",
        [book],
      )
    ).rows.map((r) => r.id);
    const create = async (title, extra = {}) => {
      await role(admin);
      return call(
        "create_homework",
        [
          JSON.stringify({
            title,
            dueAt: "2026-12-01T12:00:00Z",
            students: [student],
            sections: [
              {
                title: "Original fixture",
                count: 2,
                questionIds: ids.slice(0, 2),
              },
            ],
            ...extra,
          }),
        ],
        ["jsonb"],
      );
    };
    const remove = (kind, id, confirm = true) =>
      call("delete_homework", [kind, id, confirm], ["text", "uuid", "boolean"]);
    const preview = (kind, id) =>
      call("homework_delete_preview", [kind, id], ["text", "uuid"]);
    const scalar = async (sql, args = []) =>
      Object.values((await db.query(sql, args)).rows[0])[0];
    const pending = async () => call("homework_directory");
    const submission = async (hid) => {
      const assignment = await scalar(
        "select id from homework_assignments where homework_id=$1",
        [hid],
      );
      await role(student);
      const sid = await call("start_homework", [assignment], ["uuid"]);
      const items = (
        await db.query(
          "select id,answer_revision from book_practice_items where session_id=$1 order by position",
          [sid],
        )
      ).rows;
      await call(
        "save_practice_changes",
        [
          sid,
          JSON.stringify(
            items.map((item, n) => ({
              id: item.id,
              expected_revision: item.answer_revision,
              selected_answer: n === 0 ? 1 : 0,
            })),
          ),
        ],
        ["uuid", "jsonb"],
      );
      await call("finish_book_practice", [sid], ["uuid"]);
      return sid;
    };
    await t.test(
      "draft with no recipients is permanently removed with its empty definition",
      async () => {
        await db.exec("reset role");
        const hid = await scalar(
          `insert into homeworks(title,due_at)values('Original unused draft','2026-12-01')returning id`,
        );
        await role(admin);
        assert.equal((await preview("one-time", hid)).retains_history, false);
        assert.equal((await remove("one-time", hid)).mode, "permanent");
        assert.equal(
          await scalar("select count(*)from homeworks where id=$1", [hid]),
          0,
        );
        assert.equal((await remove("one-time", hid)).already_deleted, true);
      },
    );
    await t.test(
      "published individual and group assignments leave pending lists without deleting shared questions",
      async () => {
        const group = await scalar(
          `insert into groups(name)values('Original deletion group')returning id`,
        );
        await db.query(
          "insert into group_members(group_id,student_id)values($1,$2)",
          [group, student],
        );
        for (const config of [
          { students: [student] },
          { students: [], groups: [group] },
        ]) {
          const hid = await create("Original unattempted assignment", config);
          await role(student);
          assert.ok((await pending()).some((row) => row.id === hid));
          await role(admin);
          assert.equal((await remove("one-time", hid)).mode, "permanent");
          await role(student);
          assert.equal(
            (await pending()).some((row) => row.id === hid),
            false,
          );
        }
        await role(admin);
        assert.equal(
          await scalar(
            "select count(*)from questions where id=any($1::uuid[])",
            [ids],
          ),
          12,
        );
      },
    );
    await t.test(
      "paused and archived Homework can be deleted, and safe state transitions are reversible",
      async () => {
        for (const state of ["paused", "archived"]) {
          const hid = await create("Original " + state);
          await call("set_homework_state", [hid, state], ["uuid", "text"]);
          if (state === "archived") {
            await call("set_homework_state", [hid, "paused"], ["uuid", "text"]);
            await call(
              "set_homework_state",
              [hid, "archived"],
              ["uuid", "text"],
            );
          }
          assert.equal((await remove("one-time", hid)).mode, "permanent");
        }
      },
    );
    await t.test(
      "submitted work is tombstoned without changing grades, canonical metrics or stored answers",
      async () => {
        const hid = await create("Original submitted assignment");
        const sid = await submission(hid);
        const before = await call("learning_metrics");
        const rows = await db.query(
          "select *from book_practice_items where session_id=$1 order by position",
          [sid],
        );
        await role(admin);
        const details = await preview("one-time", hid);
        assert.equal(details.submissions, 1);
        assert.equal(details.retains_history, true);
        await assert.rejects(
          remove("one-time", hid, false),
          /Explicit confirmation/,
        );
        assert.equal((await remove("one-time", hid)).mode, "retained");
        await assert.rejects(
          call("set_homework_state", [hid, "active"], ["uuid", "text"]),
          /unavailable/,
        );
        await assert.rejects(
          call(
            "purge_deleted_homework",
            ["one-time", hid, true],
            ["text", "uuid", "boolean"],
          ),
          /history prevent/,
        );
        assert.deepEqual(
          (
            await db.query(
              "select *from book_practice_items where session_id=$1 order by position",
              [sid],
            )
          ).rows,
          rows.rows,
        );
        const report = await call(
          "admin_homework_results",
          [hid, null],
          ["uuid", "date"],
        );
        assert.equal(report.rows.filter((row) => row.completed_at).length, 1);
        await role(student);
        const after = await call("learning_metrics");
        for (const key of [
          "attempted",
          "first_correct",
          "first_incorrect",
          "first_known",
          "eventually_correct",
          "now_correct",
          "study_seconds",
        ])
          assert.deepEqual(after[key], before[key], key);
        assert.equal(
          (await pending()).some((row) => row.id === hid),
          false,
        );
        assert.equal(
          await scalar(
            "select count(*)from book_practice_sessions where id=$1",
            [sid],
          ),
          1,
        );
      },
    );
    await t.test(
      "started pending work retains its data but saved URLs and further answer writes are blocked",
      async () => {
        const hid = await create("Original pending assignment");
        const aid = await scalar(
          "select id from homework_assignments where homework_id=$1",
          [hid],
        );
        await role(student);
        const sid = await call("start_homework", [aid], ["uuid"]);
        await role(admin);
        assert.equal((await remove("one-time", hid)).mode, "retained");
        await role(student);
        assert.equal(
          await call("can_access_homework_session", [sid], ["uuid"]),
          false,
        );
        await assert.rejects(
          call("start_homework", [aid], ["uuid"]),
          /unavailable/,
        );
        await assert.rejects(
          call("save_practice_changes", [sid, "[]"], ["uuid", "jsonb"]),
          /unavailable/,
        );
      },
    );
    await t.test(
      "students, inactive administrators and anonymous requests cannot delete",
      async () => {
        const hid = await create("Original authorization assignment");
        await role(student);
        await assert.rejects(remove("one-time", hid), /Admin required/);
        await assert.rejects(preview("one-time", hid), /Admin required/);
        await role(admin);
        await db.exec(
          `reset role;update profiles set active=false where id='${admin}';`,
        );
        await role(admin);
        await assert.rejects(remove("one-time", hid), /Admin required/);
        await db.exec(
          `reset role;update profiles set active=true where id='${admin}';set role anon;`,
        );
        await assert.rejects(remove("one-time", hid), /permission denied/);
      },
    );
    await t.test(
      "recurring unused and archived definitions delete permanently and cannot regenerate",
      async () => {
        await role(admin);
        const daily = await call(
          "save_daily_homework",
          [
            JSON.stringify({
              title: "Original daily deletion",
              timezone: "UTC",
              startDate: "2026-10-01",
              count: 2,
              selection: "fixed",
              questionIds: ids.slice(0, 2),
              students: [student],
              allowLate: true,
              allowRepeat: true,
            }),
          ],
          ["jsonb"],
        );
        await call(
          "set_daily_homework_state",
          [daily, "archived"],
          ["uuid", "text"],
        );
        await call(
          "set_daily_homework_state",
          [daily, "paused"],
          ["uuid", "text"],
        );
        assert.equal((await remove("recurring", daily)).mode, "permanent");
        assert.equal((await remove("recurring", daily)).already_deleted, true);
        await db.exec(
          `reset role;update profiles set active=active where id='${other}';`,
        );
        assert.equal(
          await scalar(
            "select count(*)from daily_homework_enrollments where template_id=$1",
            [daily],
          ),
          0,
        );
      },
    );
    await t.test(
      "recurring submitted results survive deletion while pending instances and future schedules vanish",
      async () => {
        await role(admin);
        const daily = await call(
          "save_daily_homework",
          [
            JSON.stringify({
              title: "Original completed daily deletion",
              timezone: "UTC",
              startDate: "2026-10-01",
              count: 2,
              selection: "fixed",
              questionIds: ids.slice(0, 2),
              students: [student],
              allowLate: true,
              allowRepeat: true,
            }),
          ],
          ["jsonb"],
        );
        await role(student);
        const sid = await call(
          "start_daily_homework",
          [daily, "2026-10-31"],
          ["uuid", "date"],
        );
        const items = (
          await db.query(
            "select id,answer_revision from book_practice_items where session_id=$1",
            [sid],
          )
        ).rows;
        await call(
          "save_practice_changes",
          [
            sid,
            JSON.stringify(
              items.map((item) => ({
                id: item.id,
                expected_revision: item.answer_revision,
                selected_answer: 1,
              })),
            ),
          ],
          ["uuid", "jsonb"],
        );
        await call("finish_book_practice", [sid], ["uuid"]);
        const before = await call("daily_homework_statistics");
        await role(admin);
        assert.equal((await remove("recurring", daily)).mode, "retained");
        assert.equal((await preview("recurring", daily)).submissions, 1);
        await db.exec("reset role");
        assert.equal(
          await scalar(
            "select count(*)from daily_scheduled(null,$1,'2026-11-01','2026-11-30')",
            [daily],
          ),
          0,
        );
        await role(admin);
        assert.equal(
          (await call("daily_homework_templates")).some(
            (row) => row.id === daily,
          ),
          false,
        );
        await role(student);
        assert.equal(
          await call("can_access_homework_session", [sid], ["uuid"]),
          true,
        );
        const directory = await call(
          "daily_homework_directory",
          [null, daily, "2026-10-01", "2026-10-31", 0],
          ["uuid", "uuid", "date", "date", "integer"],
        );
        assert.equal(directory.total, 0);
        assert.deepEqual(directory.rows, []);
        const after = await call("daily_homework_statistics");
        assert.equal(after.completed, before.completed);
        assert.equal(after.accuracy, before.accuracy);
        assert.equal(after.longest_streak, before.longest_streak);
      },
    );
    await t.test(
      "deleted group work cannot be recreated by membership changes",
      async () => {
        await role(admin);
        const group = await scalar(
          `insert into groups(name)values('Original retained group')returning id`,
        );
        await db.query(
          "insert into group_members(group_id,student_id)values($1,$2)",
          [group, student],
        );
        const hid = await create("Original retained group work", {
          students: [],
          groups: [group],
        });
        await submission(hid);
        await role(admin);
        assert.equal((await remove("one-time", hid)).mode, "retained");
        await db.query(
          "insert into group_members(group_id,student_id)values($1,$2)",
          [group, other],
        );
        assert.equal(
          await scalar(
            "select count(*)from homework_assignments where homework_id=$1",
            [hid],
          ),
          1,
        );
        assert.equal(
          await scalar(
            "select count(*)from homework_assignments where homework_id=$1 and active",
            [hid],
          ),
          0,
        );
        await assert.rejects(
          remove("one-time", "f1000000-0000-0000-0000-000000000099"),
          /unavailable/,
        );
        await assert.rejects(
          db.query("delete from homeworks where id=$1", [hid]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "deleted pending recurring sessions reject raw reads and stale writes",
      async () => {
        await role(admin);
        const today = new Date().toISOString().slice(0, 10);
        const daily = await call(
          "save_daily_homework",
          [
            JSON.stringify({
              title: "Original pending daily deletion",
              timezone: "UTC",
              startDate: today,
              count: 2,
              selection: "fixed",
              questionIds: ids.slice(0, 2),
              students: [student],
              allowLate: true,
              allowRepeat: true,
            }),
          ],
          ["jsonb"],
        );
        await role(student);
        const sid = await call(
          "start_daily_homework",
          [daily, today],
          ["uuid", "date"],
        );
        await role(admin);
        assert.equal((await remove("recurring", daily)).mode, "retained");
        await role(student);
        assert.equal(
          await scalar(
            "select count(*)from daily_homework_instances where template_id=$1",
            [daily],
          ),
          0,
        );
        assert.equal(
          await scalar(
            "select count(*)from book_practice_sessions where id=$1",
            [sid],
          ),
          0,
        );
        await assert.rejects(
          call("start_daily_homework", [daily, today], ["uuid", "date"]),
          /unavailable/,
        );
        await assert.rejects(
          call("save_practice_changes", [sid, "[]"], ["uuid", "jsonb"]),
          /unavailable/,
        );
        await role(admin);
        assert.equal(
          await scalar(
            "select count(*)from book_practice_sessions where id=$1",
            [sid],
          ),
          1,
        );
      },
    );
    await t.test(
      "deletion cancels generated pending study tasks without erasing task history",
      async () => {
        const hid = await create("Original planned deletion");
        const aid = await scalar(
          "select id from homework_assignments where homework_id=$1",
          [hid],
        );
        await db.exec("reset role");
        const task = await scalar(
          `insert into study_plan_tasks(student_id,study_date,slot,kind,title,minutes,target_count,assignment_id)values('${student}',current_date,0,'homework','Original planned deletion',10,2,'${aid}')returning id`,
        );
        await db.query(
          `insert into study_preferences(student_id,minutes_per_day,preferred_days,timezone)values($1,45,array[0,1,2,3,4,5,6],'UTC')on conflict(student_id)do nothing`,
          [student],
        );
        await role(admin);
        assert.equal((await remove("one-time", hid)).mode, "permanent");
        await role(student);
        assert.equal(
          await scalar("select count(*)from study_plan_tasks where id=$1", [
            task,
          ]),
          0,
        );
        await assert.rejects(
          call("start_study_task", [task], ["uuid"]),
          /Task unavailable/,
        );
        const plan = await call("refresh_study_plan");
        assert.equal(
          plan.tasks.some((row) => row.id === task),
          false,
        );
        assert.equal(
          plan.tasks.some((row) => row.title === "Original planned deletion"),
          false,
        );
        await db.exec("reset role");
        assert.equal(
          await scalar(
            "select count(*)from study_plan_tasks where id=$1 and canceled_at is not null",
            [task],
          ),
          1,
        );
      },
    );
  },
);
