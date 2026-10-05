import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
import { query } from "./backup.js";

const slug = process.argv.find((a) => a.startsWith("--slug="))?.slice(7);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
  throw new Error("Use --slug=structured-package-slug [--apply]");
const packages = await query(
  `select book_id from public.book_import_packages where slug='${slug}'`,
);
if (packages.length !== 1) throw new Error("Existing package book not found");
const bid = packages[0].book_id;
const snapshotSql = `with question_ids as(select q.id from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id='${bid}'),
 items as(select i.* from public.book_practice_items i where i.question->>'id' in(select id::text from question_ids)),
 sessions as(select s.* from public.book_practice_sessions s where s.id in(select session_id from items))
select jsonb_build_object(
 'book',(select to_jsonb(b) from public.books b where id='${bid}'),
 'topics',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.book_topics t where book_id='${bid}'),
 'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') from public.questions q where id in(select id from question_ids)),
 'answers',(select coalesce(jsonb_agg(to_jsonb(a) order by a.question_id),'[]') from public.question_answers a where question_id in(select id from question_ids)),
 'open_answers',(select coalesce(jsonb_agg(to_jsonb(a) order by a.question_id),'[]') from public.book_open_answers a where question_id in(select id from question_ids)),
 'assets',(select coalesce(jsonb_agg(to_jsonb(a) order by a.path),'[]') from public.book_package_assets a where book_id='${bid}'),
 'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]') from sessions s),
 'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from items i),
 'keys',(select coalesce(jsonb_agg(to_jsonb(k) order by k.item_id),'[]') from public.book_practice_keys k where item_id in(select id from items)),
 'open_keys',(select coalesce(jsonb_agg(to_jsonb(k) order by k.item_id),'[]') from public.book_practice_open_keys k where item_id in(select id from items)),
 'attempts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.question_check_attempts a where item_id in(select id from items)),
 'activity',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from public.student_activity a where session_id in(select id from sessions))
) snapshot`;
const before = (await query(snapshotSql))[0].snapshot;
const directory = `local-imports/hierarchy-fix/${slug}-${Date.now()}`;
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(`${directory}/before.json`, JSON.stringify(before), {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    book: before.book.title,
    published: before.book.published,
    topicsBefore: before.topics.length,
    questionsBefore: before.questions.length,
    practiceSessionsBefore: before.sessions.length,
    backup: directory,
  }),
);
if (process.argv.includes("--apply")) {
  const outcome = (
    await query(`select public.collapse_book_package_topics('${bid}') result`)
  )[0].result;
  const after = (await query(snapshotSql))[0].snapshot;
  await writeFile(`${directory}/after.json`, JSON.stringify(after), {
    mode: 0o600,
  });
  for (const key of [
    "book",
    "questions",
    "answers",
    "open_answers",
    "assets",
    "sessions",
    "items",
    "keys",
    "open_keys",
    "attempts",
    "activity",
  ])
    assert.deepEqual(
      after[key],
      before[key],
      `${key} changed during hierarchy repair`,
    );
  const report = {
    ...outcome,
    topicsBefore: before.topics.length,
    topicsAfter: after.topics.length,
    preservedQuestionIds: after.questions.length,
    assetsReuploaded: 0,
    questionRecordsChanged: 0,
    preservedPracticeSessions: after.sessions.length,
    preservedPracticeItems: after.items.length,
  };
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
