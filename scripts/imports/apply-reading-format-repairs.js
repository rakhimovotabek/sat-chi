import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const sqlJson = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

export function repairSql(repairs, uncertain) {
  repairs = repairs.map((r) => ({
    ...r,
    plain_after: r.after.replace(/<\/?u>/g, ""),
  }));
  return `begin;
set local statement_timeout='60s';
create temp table format_repairs on commit drop as select value->>'id' id,value->>'before' before_text,value->>'after' after_text,value->>'plain_after' plain_text,value->>'book_id' book_id,value->'evidence' evidence from jsonb_array_elements(${sqlJson(repairs)});
-- Refuse stale source comparisons instead of overwriting edits made after the audit.
do $$begin if exists(select 1 from format_repairs r left join public.questions q on q.id::text=r.id where q.id is null or q.section<>'Reading & Writing' or not exists(select 1 from public.book_topics t where t.id=q.topic_id and t.book_id::text=r.book_id) or q.passage is distinct from r.before_text and q.passage is distinct from r.after_text and q.passage is distinct from r.plain_text)then raise exception 'Question changed since source audit';end if;end;$$;
update public.questions q set passage=r.plain_text,passage_markup=case when r.after_text<>r.plain_text then r.after_text else '' end from format_repairs r where q.id::text=r.id and (q.passage in(r.before_text,r.after_text,r.plain_text));
-- Repair only matching presentation snapshots; answers, keys and progress are untouched.
update public.book_practice_items i set question=jsonb_set(i.question,'{passage}',to_jsonb(r.plain_text))||jsonb_build_object('passage_markup',case when r.after_text<>r.plain_text then r.after_text else '' end) from format_repairs r where i.question->>'id'=r.id and i.question->>'passage' in(r.before_text,r.after_text,r.plain_text);
update public.homework_questions i set question=jsonb_set(i.question,'{passage}',to_jsonb(r.plain_text))||jsonb_build_object('passage_markup',case when r.after_text<>r.plain_text then r.after_text else '' end) from format_repairs r where i.question->>'id'=r.id and i.question->>'passage' in(r.before_text,r.after_text,r.plain_text);
update public.daily_homework_versions v set pool=(select jsonb_agg(case when r.id is not null and element->'question'->>'passage' in(r.before_text,r.after_text,r.plain_text) then jsonb_set(element,'{question}',jsonb_set(element->'question','{passage}',to_jsonb(r.plain_text))||jsonb_build_object('passage_markup',case when r.after_text<>r.plain_text then r.after_text else '' end)) else element end order by ord) from jsonb_array_elements(v.pool) with ordinality x(element,ord) left join format_repairs r on r.id=element->>'id') where exists(select 1 from jsonb_array_elements(v.pool) x join format_repairs r on r.id=x->>'id' where x->'question'->>'passage' in(r.before_text,r.after_text,r.plain_text));
update public.content_review_items i set candidate=case when i.candidate ? 'passage' then jsonb_set(i.candidate,'{passage}',to_jsonb(r.after_text)) else i.candidate end from format_repairs r where i.item_type='question' and i.entity_id::text=r.id and i.candidate->>'passage'=r.before_text;
create temp table format_uncertain on commit drop as select value->>'id' id,value->>'reason' reason from jsonb_array_elements(${sqlJson(uncertain)});
update public.content_review_items i set status='pending',warnings=case when i.warnings @> '["Source gap/underline requires verification"]' then i.warnings else i.warnings||'["Source gap/underline requires verification"]'::jsonb end,note='Formatting audit: '||u.reason||'. No formatting was guessed.',reviewed_at=null from format_uncertain u where i.item_type='question' and i.entity_id::text=u.id and i.status not in ('rejected','duplicate');
select (select count(*) from format_repairs r join public.questions q on q.id::text=r.id where q.passage=r.plain_text and coalesce(nullif(q.passage_markup,''),q.passage)=r.after_text) repaired,(select count(*) from format_uncertain u join public.content_review_items i on i.entity_id::text=u.id and i.item_type='question' where i.status in ('pending','rejected','duplicate')) flagged;
commit;`;
}

async function main() {
  const path = process.argv[2];
  if (!path)
    throw Error(
      "Supply source-audit JSON; generates verified SQL without database writes",
    );
  const report = JSON.parse(await readFile(path, "utf8"));
  await mkdir("local-imports/formatting-audit/sql", { recursive: true });
  for (
    let i = 0;
    i < Math.max(report.repairs.length, report.uncertain.length);
    i += 40
  ) {
    const file = `local-imports/formatting-audit/sql/batch-${i}.sql`;
    await writeFile(
      file,
      repairSql(
        report.repairs.slice(i, i + 40),
        report.uncertain.slice(i, i + 40),
        report.source_hashes,
      ),
    );
  }
  console.log(
    "Generated guarded SQL batches in local-imports/formatting-audit/sql; apply with the linked Supabase CLI.",
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
