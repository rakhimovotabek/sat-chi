import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  nativeAppEnvironment,
  admin,
  student,
} from "./helpers/native-app-environment.js";

test(
  "daily query bounds preserve schedules and exact pages with real PostgreSQL execution plans",
  { skip: !process.env.SATCHI_TEST_POSTGRES_BIN, timeout: 180000 },
  async (t) => {
    const app = await nativeAppEnvironment({ extraUsers: true });
    t.after(() => app.close());
    await app.upgrade("20261031001200");
    await app.sql(`insert into daily_homework_templates(id,timezone,state,all_students,students,groups)
 select ('a1000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'UTC','active',false,'{}','{}'from generate_series(1,40)n;
 insert into daily_homework_versions(template_id,revision,valid_from,data,pool)
 select id,1,current_date-40,jsonb_build_object('title','Original performance fixture '||id,'startDate',current_date-40,'count',7,'allowLate',true),'[]'from daily_homework_templates where id::text like 'a1000000%';
 insert into daily_homework_windows(template_id,from_date)select id,current_date-40 from daily_homework_templates where id::text like 'a1000000%';
 insert into daily_homework_enrollments(template_id,student_id,from_date)select t.id,p.id,current_date-40 from daily_homework_templates t cross join profiles p where t.id::text like 'a1000000%'and p.role='student';
 create table fixture_daily_sessions as select gen_random_uuid()session_id,d.* from daily_scheduled(null,null,current_date-9,current_date)d where template_id::text like 'a1000000%';
 insert into book_practice_sessions(id,student_id,title,kind,source_id)select session_id,student_id,'Original performance session','homework',template_id from fixture_daily_sessions;
 insert into daily_homework_instances(template_id,version_id,student_id,study_date,opens_at,due_at,session_id,started_at)select template_id,version_id,student_id,study_date,opens_at,due_at,session_id,now()from fixture_daily_sessions;
 insert into book_practice_items(session_id,position,question)select session_id,0,'{"question_text":"Original fixture","options":["1","2","3","4"]}'from fixture_daily_sessions;
 analyze;`);
    const directory = async (uid) =>
      app.json(
        app.as(
          uid,
          `select public.daily_homework_directory(p_from:=current_date-30,p_until:=current_date);`,
        ),
      );
    const scheduled = async () =>
      app.json(
        `select jsonb_agg(to_jsonb(d)order by template_id,student_id,study_date)from daily_scheduled(null,null,current_date-30,current_date)d`,
      );
    const report = async () =>
      app.json(
        app.as(
          admin,
          `select daily_homework_report(p_from:=current_date-30,p_until:=current_date)`,
        ),
      );
    const before = {
      admin: await directory(admin),
      student: await directory(student),
      schedule: await scheduled(),
      report: await report(),
    };
    const plan = async () => {
      let source = await app.json(
        `select to_jsonb(prosrc)from pg_proc where oid='public.daily_scheduled(uuid,uuid,date,date)'::regprocedure`,
      );
      source = source
        .replace(/\bp_student\b/g, "null::uuid")
        .replace(/\bp_template\b/g, "null::uuid")
        .replace(/\bp_from\b/g, "(current_date-30)")
        .replace(/\bp_until\b/g, "current_date");
      const raw = await app.sql(
        `explain(analyze,buffers,format json) ${source}`,
      );
      return JSON.parse(raw);
    };
    const directoryPlan = async () => {
      let body = await app.json(
        `select to_jsonb(prosrc)from pg_proc where oid='daily_homework_directory(uuid,uuid,date,date,integer)'::regprocedure`,
      );
      body = body
        .slice(body.indexOf("with scheduled"), body.indexOf("return result;"))
        .replace("into result", "");
      for (const [name, value] of [
        ["uid", "null::uuid"],
        ["p_template", "null::uuid"],
        ["first_day", "(current_date-30)"],
        ["last_day", "current_date"],
        ["p_page", "0"],
      ])
        body = body.replace(new RegExp("\\b" + name + "\\b", "g"), value);
      return JSON.parse(
        await app.sql(`explain(analyze,buffers,format json) ${body}`),
      );
    };
    const originalDirectory = await directoryPlan();
    const original = await plan();
    await app.sql(
      await readFile(
        "supabase/migrations/20261031001200_daily_homework_query_bounds.sql",
        "utf8",
      ),
    );
    assert.deepEqual(await directory(admin), before.admin);
    assert.deepEqual(await directory(student), before.student);
    assert.deepEqual(await scheduled(), before.schedule);
    assert.deepEqual(await report(), before.report);
    const optimized = await plan();
    const optimizedDirectory = await directoryPlan();
    assert.ok(before.admin.total > 5000);
    assert.equal(before.admin.rows.length, 50);
    await mkdir("docs/verification", { recursive: true });
    await writeFile(
      "docs/verification/daily-query-plans.json",
      JSON.stringify(
        {
          fixture: { templates: 40, students: 5, days: 31, originalData: true },
          original,
          optimized,
          originalDirectory,
          optimizedDirectory,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        rows: before.admin.total,
        beforeMs: original[0]["Execution Time"],
        afterMs: optimized[0]["Execution Time"],
      }),
    );
  },
);
