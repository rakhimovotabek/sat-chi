// Isolated diagnostic only. Native helper never reads project credentials.
import test from "node:test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  nativeAppEnvironment,
  student,
  studentB,
} from "./helpers/native-app-environment.js";
const enabled = Boolean(
  process.env.SATCHI_TEST_POSTGRES_BIN && process.env.SATCHI_TEST_POSTGREST,
);
test(
  "Book progress aggregates historical student data once while preserving legacy counts and ownership",
  { skip: !enabled, timeout: 120000 },
  async (t) => {
    const app = await nativeAppEnvironment();

    try {
      await app.upgrade();
      const legacy = await readFile(
        "supabase/migrations/20261005000800_book_resume_and_bank_difficulties.sql",
        "utf8",
      );
      await app.sql(
        legacy
          .slice(
            legacy.indexOf("create function public.book_practice_progress"),
            legacy.indexOf("-- Keep the existing visibility"),
          )
          .replace(
            "create function public.book_practice_progress",
            "create or replace function public.book_practice_progress",
          ),
      );
      await app.sql(`insert into public.questions(topic_id,question_text,options,position)select '${app.topic}','Historical progress '||n,'["1","2","3","4"]',n from generate_series(1,500)n;
    insert into public.question_answers(question_id,correct_answer)select id,1 from public.questions where question_text like 'Historical progress %';
    update public.content_review_items set status='approved' where item_type='question' and entity_id in(select id from public.questions where question_text like 'Historical progress %');
    insert into public.book_practice_sessions(student_id,title,kind,source_id,started_at,submitted_at)select '${student}','Historical practice '||n,'book','${app.topic}',now()-interval '400 days',now()-interval '399 days' from generate_series(1,2000)n;
    insert into public.book_practice_items(session_id,position,question,selected_answer,correct,solved_at)
    select s.id,n,jsonb_build_object('id',(array['${app.ids[2]}','${app.ids[3]}','${app.ids[4]}'])[n+1],'question_type','mcq'),1,true,s.submitted_at from public.book_practice_sessions s cross join generate_series(0,2)n where title like 'Historical practice %';
    insert into public.book_practice_keys(item_id,correct_answer,explanation)select i.id,1,'Historical fixture key' from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.title like 'Historical practice %';
    analyze public.questions;analyze public.book_practice_sessions;analyze public.book_practice_items;`);
      const begin = performance.now();
      {
        const result = await app.json(
          app.as(
            student,
            `set statement_timeout='8s';select public.book_practice_progress('${app.book}');`,
          ),
        );
        console.log(
          JSON.stringify({
            stage: "legacy",
            seconds: (performance.now() - begin) / 1000,
            rows: result,
          }),
        );
        await app.sql(
          await readFile(
            "supabase/migrations/20261009000400_book_progress_history.sql",
            "utf8",
          ),
        );
        const after = performance.now();
        const optimized = await app.json(
          app.as(
            student,
            `set statement_timeout='8s';select public.book_practice_progress('${app.book}');`,
          ),
        );
        assert.deepEqual(optimized, result);
        assert.equal(optimized.find((r) => r.topic_id === app.topic).solved, 3);
        await app.sql(
          `insert into auth.users(id,email)values('${studentB}','studentB@fixture.invalid');`,
        );
        const other = await app.json(
          app.as(
            studentB,
            `select public.book_practice_progress('${app.book}');`,
          ),
        );
        assert.ok(other.every((r) => r.solved === 0 && r.checked === 0));
        console.log(
          JSON.stringify({
            stage: "optimized",
            seconds: (performance.now() - after) / 1000,
            rows: optimized,
            countsUnchanged: true,
          }),
        );
      }
    } finally {
      await app.close();
    }
  },
);
