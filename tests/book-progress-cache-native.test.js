import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  nativeAppEnvironment,
  student,
} from "./helpers/native-app-environment.js";
test(
  "cached Book renderability preserves progress and follows key/review/source changes",
  { skip: !process.env.SATCHI_TEST_POSTGRES_BIN, timeout: 180000 },
  async (t) => {
    const app = await nativeAppEnvironment();
    t.after(() => app.close());
    await app.upgrade("20261031001300");
    await app.sql(`insert into questions(topic_id,position,question_text,options,section,domain,skill,difficulty)
 select '${app.topic}',1000+n,'Original synthetic performance question '||n,'["1","2","3","4"]','Math','Algebra','Equations','easy'from generate_series(1,1500)n;
 insert into question_answers(question_id,correct_answer,explanation)select id,1,'Original supplied explanation'from questions where topic_id='${app.topic}'and position>1000;
 insert into content_review_items(source_id,item_type,entity_id,candidate_key,status)select j.id,'question',q.id,'original-performance:'||q.id,'approved'from questions q cross join import_jobs j where q.topic_id='${app.topic}'and q.position>1000 and j.book_id='${app.book}'on conflict(item_type,entity_id)where entity_id is not null do update set status='approved';analyze;`);
    const progress = () =>
      app.json(
        app.as(
          student,
          `select learning_book_progress(array['${app.book}'::uuid]);`,
        ),
      );
    const chapters = () =>
      app.json(
        app.as(student, `select book_practice_progress('${app.book}');`),
      );
    const before = await progress(),
      topics = await chapters();
    // Explain SQL is sent directly to real PostgreSQL, not a mocked profiler.
    // Function authorization requires an authenticated subject even when role is postgres.
    const explain = async () => {
      const raw = await app.sql(
        `select set_config('request.jwt.claim.sub','${student}',false);explain(analyze,buffers,format json)select learning_book_progress(array['${app.book}'::uuid])`,
      );
      return JSON.parse(raw.slice(raw.indexOf("[")));
    };
    const original = await explain();
    await app.sql(
      await readFile(
        "supabase/migrations/20261031001300_book_progress_readability_cache.sql",
        "utf8",
      ),
    );
    assert.deepEqual(await progress(), before);
    assert.deepEqual(await chapters(), topics);
    const optimized = await explain();
    const mismatch = () =>
      app.json(
        `select count(*)from question_bank_eligibility e where e.book_practice_ready is distinct from coalesce(question_practicable(e.question_id)or book_package_question_ready(e.question_id),false)`,
      );
    assert.equal(await mismatch(), 0);
    const target = await app.json(
      `select to_jsonb(id)from questions where topic_id='${app.topic}'and position=1001`,
    );
    await app.sql(
      `update questions set options='["","","",""]'where id='${target}'`,
    );
    assert.equal(await mismatch(), 0);
    assert.equal((await progress())[0].total, before[0].total - 1);
    await app.sql(
      `update questions set options='["1","2","3","4"]'where id='${target}';update content_review_items set status='approved'where entity_id='${target}'`,
    );
    assert.equal(await mismatch(), 0);
    assert.deepEqual(await progress(), before);
    await app.sql(
      `delete from question_answers where question_id='${target}';insert into question_answers values('${target}',1,'Original explanation');`,
    );
    assert.equal(await mismatch(), 0);
    await app.sql(
      `update content_review_items set status='pending'where entity_id='${target}'`,
    );
    assert.equal((await progress())[0].total, before[0].total - 1);
    await app.sql(
      `update content_review_items set status='approved'where entity_id='${target}'`,
    );
    assert.deepEqual(await progress(), before);
    const access = await app.json(
      `select jsonb_build_object('table',has_table_privilege('authenticated','question_bank_eligibility','select'),'helper',has_function_privilege('authenticated','refresh_book_renderability()','execute'))`,
    );
    assert.deepEqual(access, { table: false, helper: false });
    await mkdir("docs/verification", { recursive: true });
    await writeFile(
      "docs/verification/book-progress-plans.json",
      JSON.stringify(
        { fixture: { originalQuestions: 1500 }, original, optimized },
        null,
        2,
      ) + "\n",
    );
    console.log(
      JSON.stringify({
        beforeMs: original[0]["Execution Time"],
        afterMs: optimized[0]["Execution Time"],
        total: before[0].total,
      }),
    );
  },
);
