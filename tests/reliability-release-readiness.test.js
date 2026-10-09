// Rehearse only the three new migrations over the deployed schema and existing
// history. No production connection, credential or user record is involved.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  nativeAppEnvironment,
  admin,
  student,
} from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
const pending = [
  "20261009000300_daily_homework_indexed_pool.sql",
  "20261009000400_book_progress_history.sql",
  "20261009000500_admin_homework_overview.sql",
];
test(
  "release rehearsal preserves existing data and deployed RPC contracts across all three migrations",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade("20261009000300");
    const rpc = async (uid, name, args = {}, status = 200, marker = true) => {
      const r = await fetch(app.apiUrl + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: {
          authorization: "Bearer " + app.tokenFor(uid),
          "Content-Type": "application/json",
          ...(marker ? { "x-satchi-client-version": "20261008" } : {}),
        },
        body: JSON.stringify(args),
      });
      const text = await r.text();
      assert.equal(r.status, status, text);
      return text ? JSON.parse(text) : null;
    };
    const today = await app.json(
      "select to_jsonb((now() at time zone 'Asia/Tashkent')::date::text)",
    );
    const legacySid = await rpc(student, "start_daily_homework", {
      p_template: app.daily,
      p_day: today,
    });
    const items = await app.json(
      `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id='${legacySid}'`,
    );
    await rpc(student, "save_practice_changes", {
      p_session: legacySid,
      p_changes: items.map((i) => ({
        id: i.id,
        expected_revision: i.answer_revision,
        selected_answer: 1,
      })),
    });
    await rpc(
      student,
      "finish_book_practice",
      { p_session_id: legacySid },
      204,
    );
    const reviewedHomework = await rpc(admin, "create_homework", {
      p_data: {
        title: "Existing reviewed history",
        dueAt: "2027-12-01T12:00:00Z",
        students: [student],
        sections: [
          {
            title: "Mixed answers",
            count: 2,
            questionIds: app.ids.slice(14, 16),
          },
        ],
      },
    });
    const reviewedAssignment = await app.json(
      `select to_jsonb(id) from public.homework_assignments where homework_id='${reviewedHomework}'`,
    );
    const reviewedSession = await rpc(student, "start_homework", {
      p_assignment: reviewedAssignment,
    });
    const mixedItems = await app.json(
      `select jsonb_agg(to_jsonb(i) order by position) from public.book_practice_items i where session_id='${reviewedSession}'`,
    );
    await rpc(student, "save_practice_changes", {
      p_session: reviewedSession,
      p_changes: mixedItems.map((i) => ({
        id: i.id,
        expected_revision: i.answer_revision,
        ...(i.question.question_type === "open"
          ? { selected_response: "8.6" }
          : { selected_answer: 1 }),
      })),
    });
    await rpc(
      student,
      "finish_book_practice",
      { p_session_id: reviewedSession },
      204,
    );
    await rpc(admin, "review_open_response", {
      p_session: reviewedSession,
      p_item: mixedItems.find((i) => i.question.question_type === "open").id,
      p_correct: false,
      p_expected_revision: 0,
    });
    await app.sql(
      await readFile("scripts/release/install-write-gate.sql", "utf8"),
    );
    await app.sql(
      `select satchi_release.set_mode('maintenance',array['${admin}','${student}']::uuid[])`,
    );
    await rpc(
      student,
      "save_practice_changes",
      { p_session: app.session, p_changes: [] },
      426,
      false,
    );
    const protectedTables = [
      "profiles",
      "books",
      "book_topics",
      "questions",
      "question_answers",
      "book_open_answers",
      "book_package_assets",
      "book_import_packages",
      "book_practice_sessions",
      "book_practice_items",
      "book_practice_keys",
      "book_practice_open_keys",
      "question_check_attempts",
      "practice_open_reviews",
      "homeworks",
      "homework_sections",
      "homework_questions",
      "homework_assignments",
      "homework_attempts",
      "homework_item_history",
      "daily_homework_templates",
      "daily_homework_windows",
      "daily_homework_versions",
      "daily_homework_enrollments",
      "daily_homework_instances",
      "student_activity",
    ];
    // Validate all existing rows, including full JSON pools; pool_count is the only
    // new field and is null on historical versions.
    const digest = async (table) =>
      app.json(
        `select jsonb_build_object('count',count(*),'hash',md5(coalesce(string_agg((to_jsonb(r)-'pool_count')::text,'' order by (to_jsonb(r)-'pool_count')::text),''))) from public.${table} r`,
      );
    const before = Object.fromEntries(
      await Promise.all(
        protectedTables.map(async (table) => [table, await digest(table)]),
      ),
    );
    const functions = [
      "save_daily_homework(jsonb,uuid)",
      "start_daily_homework(uuid,date)",
      "daily_homework_templates()",
      "book_practice_progress(uuid)",
      "admin_overview()",
    ];
    const acl = () =>
      app.json(
        `select jsonb_agg(jsonb_build_object('id',p.oid::regprocedure::text,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'acl',p.proacl) order by p.oid::regprocedure::text)from pg_proc p where p.oid in(${functions.map((f) => `'public.${f}'::regprocedure`).join(",")})`,
      );
    const oldAcl = await acl();
    const oldProgress = await rpc(student, "book_practice_progress", {
      p_book: app.book,
    });
    // The deployed artifact's argument names and revision/client contract are
    // inspected, rather than inferred from current source.
    const oldDaily = execFileSync(
      "git",
      ["show", "f44a7f7:src/features/learning/daily-homework-api.js"],
      { encoding: "utf8" },
    );
    assert.match(oldDaily, /p_data: data/);
    assert.match(oldDaily, /p_template: template/);
    assert.match(oldDaily, /p_day: row.study_date/);
    for (const migration of pending) {
      await app.sql(await readFile("supabase/migrations/" + migration, "utf8"));
      for (const table of protectedTables)
        assert.deepEqual(
          await digest(table),
          before[table],
          migration + ": " + table,
        );
    }
    assert.deepEqual(
      await acl(),
      oldAcl,
      "existing RPC argument/default/return/ACL contracts preserved",
    );
    assert.deepEqual(
      await rpc(student, "book_practice_progress", { p_book: app.book }),
      oldProgress,
    );
    await app.sql("notify pgrst,'reload schema'");
    // Function replacement keeps the schema signature; private table exposure can
    // take a moment to appear after the notification.
    const tid = await rpc(admin, "save_daily_homework", {
      p_data: {
        title: "Compatibility fixture",
        timezone: "Asia/Tashkent",
        startDate: today,
        count: 8,
        selection: "random",
        students: [student],
        filters: { book: app.book },
        allowLate: true,
        allowRepeat: true,
      },
      p_template: null,
    });
    const templates = await rpc(admin, "daily_homework_templates");
    assert.equal(templates.find((x) => x.id === tid).pool_count, 31);
    const sid = await rpc(student, "start_daily_homework", {
      p_template: tid,
      p_day: today,
    });
    assert.equal(
      await app.json(
        `select to_jsonb(count(*)) from public.book_practice_items where session_id='${sid}'`,
      ),
      8,
    );
    assert.equal(
      await rpc(student, "start_daily_homework", {
        p_template: app.daily,
        p_day: today,
      }),
      legacySid,
    );
    await rpc(student, "admin_overview", {}, 403);
    await rpc(student, "save_daily_homework", { p_data: {} }, 403);
    assert.equal(
      await app.json(
        app.as(
          student,
          "select to_jsonb(count(*)) from public.daily_homework_pool_questions",
        ),
      ),
      0,
    );
    await assert.rejects(
      app.sql(
        app.as(
          student,
          "insert into public.daily_homework_pool_questions(version_id,question_id,snapshot) select id,gen_random_uuid(),'{}' from public.daily_homework_versions limit 1",
        ),
      ),
      /permission denied/,
    );
    await app.sql("select satchi_release.set_mode('compatible')");
    const first = await app.json(
      `select to_jsonb(i) from public.book_practice_items i where session_id='${app.session}' order by position limit 1`,
    );
    await rpc(student, "save_practice_changes", {
      p_session: app.session,
      p_changes: [
        {
          id: first.id,
          expected_revision: first.answer_revision,
          selected_answer: 2,
        },
      ],
    });
    await rpc(
      student,
      "save_practice_changes",
      {
        p_session: app.session,
        p_changes: [
          {
            id: first.id,
            expected_revision: first.answer_revision,
            selected_answer: 3,
          },
        ],
      },
      409,
    );
    await rpc(
      student,
      "save_practice_changes",
      { p_session: app.session, p_changes: [] },
      426,
      false,
    );
  },
);
