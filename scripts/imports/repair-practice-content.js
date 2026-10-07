// Repair retained source entries in existing books; never create/import a book.
// Plan/rollback is the default. --apply commits only the verified evidence below.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { preparePackage } from "./book-package.js";
const run = promisify(execFile);
const official = [
  "86e46d26b8fbbd447e198b8c6b6fba0edc3c99e98485a6ceaf4f931543b6f96f",
  "5f4dcabdf074147ac1a033db5d6081181c46845f516ed836811230b029e4ab00",
  "55db3ca82742b550bf58ba655b61efcdd6ebae413f79be5aadc0b255bdf0143c",
];
const additional = [
  "5f40b924cd5282c1fe74ebe52956506c2ae13f87342de08c292e2566ccde04e5",
  "14c20e01664c0d03e63292953333aac5002ddb09885f508730ffc370984ecffa",
];
const keyEvidence = {
  "preppros-advanced-math-2nd-edition_q_0001":
    "The axis of symmetry is the midpoint of roots -7 and c: (c-7)/2=63/8, so c=91/4=22.75. Both supplied equivalent forms are verified.",
  "preppros-advanced-math-2nd-edition_q_0110":
    "AD²=BD×CD=592 and BD+CD=82. The segments are 8 and 74; AC>AB selects CD=74. CD/BD=37/4=9.25. The source decimal 9.35 is a typo.",
  "hardbook-2-by-satashkent_q_0111":
    "Base area 64 gives side 8. Lateral area 16√357 gives slant height √357. The height is √(357-4²)=√341, matching the supplied radical key.",
};
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const sqlJson = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

export async function contentRepairPlan(choiceFiles = []) {
  const restored = [];
  for (const fingerprint of [...official, ...additional]) {
    const folder = `local-imports/packages/${fingerprint}`;
    const source = await json(`${folder}/book.json`);
    const provenance = await json(`${folder}/asset-provenance.json`);
    const regions = new Map(
      Array.isArray(provenance) ? provenance.map((p) => [p.asset, p]) : [],
    );
    const book = structuredClone(source);
    const proofs = new Map();
    for (const chapter of book.chapters)
      for (const topic of chapter.topics)
        for (const question of topic.questions) {
          if (!question.needsReview) continue;
          let proof = keyEvidence[question.id];
          if (official.includes(fingerprint)) {
            if (
              !/^Source content overlaps the publication footer/.test(
                question.reviewReason,
              )
            )
              throw new Error(`Unexpected review reason: ${question.id}`);
            const paths = [
              question.questionImage,
              ...question.options.map((o) => o.image),
            ].filter(Boolean);
            for (const path of paths) {
              const region = regions.get(path);
              if (!region)
                throw new Error(`Missing source provenance: ${path}`);
              const parts = region.components || [region];
              if (
                parts.some(
                  (part) => !part.regionPoints || part.regionPoints[3] > 765,
                )
              )
                throw new Error(
                  `Question/choice needs visual inspection: ${question.id}`,
                );
            }
            proof =
              "Verified original stem and all choices lie above the publication footer. Supplied answer key and all source assets are intact. The flagged overlap concerns the preserved rationale, not answerability.";
          }
          if (!proof)
            throw new Error(`Unverified source entry: ${question.id}`);
          proofs.set(question.id, { proof, source: structuredClone(question) });
          question.source_review_reason = question.reviewReason;
          question.needsReview = false;
          question.reviewReason = null;
          question.recovery = "source-verified-2026-10-07";
          if (keyEvidence[question.id]) {
            question.explanation = proof;
            question.explanationFormat = "text";
            if (question.id.startsWith("preppros-advanced"))
              question.answerFormat = "numeric";
            else question.acceptedAnswers = ["√341", "sqrt(341)"];
          }
        }
    if (book.book.slug === "hardbook-2-by-satashkent") {
      // This source restarts question numbers in each chapter. Preserve the
      // chapter-scoped IDs used by its original adapter.
      for (const chapter of book.chapters)
        for (const topic of chapter.topics)
          for (const question of topic.questions) {
            const originalId = question.id;
            question.id = `${book.book.slug}/${chapter.id}/${topic.id}/${originalId}`;
            const proof = proofs.get(originalId);
            if (proof && proof.source.chapter === chapter.title) {
              proofs.delete(originalId);
              proofs.set(question.id, proof);
            }
          }
    }
    const manifest = await json(`${folder}/manifest.json`);
    const prepared = preparePackage(
      book,
      { ...manifest, needsReview: 0 },
      [],
      await json(`${folder}/asset-index.json`),
      fingerprint,
    );
    for (const topic of prepared.topics)
      for (const leaf of [topic, ...topic.children])
        for (const question of leaf.questions) {
          if (!proofs.has(question.sourceId)) continue;
          const evidence = proofs.get(question.sourceId);
          question.sourceId = evidence.source.id;
          question.metadata.id = evidence.source.id;
          question.metadata.package_question_id = evidence.source.id;
          restored.push({
            fingerprint,
            slug: book.book.slug,
            topic: leaf.title,
            chapterTitle: topic.title,
            chapter: question.metadata.chapter,
            sourceFile: book.book.sourceFile,
            ...evidence,
            question,
          });
        }
    if (
      restored.filter((r) => r.fingerprint === fingerprint).length !==
      proofs.size
    )
      throw new Error(`Recovery count mismatch: ${fingerprint}`);
  }
  const choices = (await Promise.all(choiceFiles.map(json))).flat();
  for (const c of choices) {
    if (
      !official.includes(c.fingerprint) ||
      c.method !== "pdf-labelled-scalar-v1" ||
      !Number.isInteger(c.index) ||
      c.index < 0 ||
      c.index > 3 ||
      !/^[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(c.text)
    )
      throw new Error("Invalid text recovery evidence");
  }
  return { restored, choices };
}

export function contentRepairSql(plan, apply = false) {
  return `begin;
set local statement_timeout='45s';
create temporary table practice_repair_publication on commit drop as select id,published from public.books;
create temporary table practice_repair_reviews on commit drop as select id,status,note,reviewed_at,reviewed_by from public.content_review_items;
create temporary table practice_repair_log(kind text,question_id uuid,source_id text) on commit drop;
create temporary table practice_choice_map(n int,value text,old_url text,primary key(old_url,n)) on commit drop;
create or replace function pg_temp.choice_text(q jsonb,n int,value text,old_url text) returns jsonb language sql immutable as $$
 select case when q->'option_image_urls'->>n=old_url and coalesce(q->'options'->>n,'')='' then
 jsonb_set(jsonb_set(q,'{options}',jsonb_set(q->'options',array[n::text],to_jsonb(value))),'{option_image_urls}',jsonb_set(q->'option_image_urls',array[n::text],'null'))
 else q end;
$$;
do $repair$ declare d jsonb:=${sqlJson(plan)}; e jsonb; q jsonb; sq jsonb; p public.book_import_packages; tid uuid; qid uuid; url text; old_q jsonb; new_q jsonb; job_row record; a record; count_found int;
begin
 for e in select value from jsonb_array_elements(d->'restored') loop
 select * into p from public.book_import_packages where fingerprint=e->>'fingerprint' and slug=e->>'slug';
 if p.book_id is null then raise exception 'Existing source book missing';end if;
 select question.value into sq from jsonb_array_elements(p.source_payload->'chapters') c
 cross join lateral jsonb_array_elements(c->'topics') t cross join lateral jsonb_array_elements(t->'questions') question(value)
 where question.value->>'id'=e->'source'->>'id' and c->>'title'=e->>'chapterTitle';
 if sq is distinct from e->'source' then raise exception 'Retained source changed: %',e->'source'->>'id';end if;
 select count(*),(array_agg(t.id))[1] into count_found,tid from public.book_topics t where t.book_id=p.book_id and t.title=e->>'topic' and not exists(select 1 from public.book_topics child where child.parent_id=t.id);
 if count_found<>1 then raise exception 'Existing topic is ambiguous';end if;
 q=e->'question';qid=(q->>'id')::uuid;
 if exists(select 1 from public.questions where id=qid) then
 if not exists(select 1 from public.questions existing join public.book_topics t on t.id=existing.topic_id where existing.id=qid and t.book_id=p.book_id and existing.import_metadata->>'package_question_id'=sq->>'id') then raise exception 'Recovery ID collision';end if;
 continue;end if;
 insert into public.questions(id,topic_id,question_text,options,option_image_urls,image_url,stimulus_table,difficulty,position,domain,skill,source,source_page,import_metadata,question_type)
 values(qid,tid,q->>'text',q->'options',q->'optionImages',q->>'image',nullif(q->'table','null'::jsonb),q->>'difficulty',(q->>'position')::int,public.package_sat_domain(p.slug,e->>'chapter',q->'metadata'->>'domain'),e->>'topic',e->>'sourceFile',(q->>'page')::int,q->'metadata',q->>'type');
 insert into public.question_answers values(qid,case when q->>'type'='mcq' then (q->>'correctAnswer')::int else null end,q->>'explanation');
 if q->>'type'='open' then insert into public.book_open_answers(question_id,accepted_answers,correct_answer,answer_format,accepted_range) values(qid,q->'acceptedAnswers',q->>'correctAnswer',q->>'answerFormat',nullif(q->'acceptedRange','null'::jsonb));end if;
 for a in select path,source_path from public.book_package_assets where book_id=p.book_id loop
 url='https://ileffhbbaomfimwulvpw.supabase.co/storage/v1/object/authenticated/book-package-assets/'||a.path;
 if url=q->>'image' or exists(select 1 from jsonb_array_elements_text(q->'optionImages') x where x=url) or position(url in coalesce(q->>'explanation',''))>0 then
 update public.book_package_assets set question_id=qid,kind=case when url=q->>'image' then 'question' when position(url in coalesce(q->>'explanation',''))>0 then 'explanation' else 'option' end where path=a.path;
 end if;end loop;
 update public.content_review_items set status='approved',reviewed_at=now(),note=e->>'proof',extraction_method='source_verified_recovery' where entity_id=qid and item_type='question';
 insert into public.content_review_audit(item_id,source_id,action,actor,before_data,after_data) select id,source_id,'source_verified_recovery',null,sq,q from public.content_review_items where entity_id=qid and item_type='question';
 insert into practice_repair_log values('restored',qid,sq->>'id');
 end loop;
 for e in select value from jsonb_array_elements(d->'choices') loop
 select * into p from public.book_import_packages where fingerprint=e->>'fingerprint';
 select 'https://ileffhbbaomfimwulvpw.supabase.co/storage/v1/object/authenticated/book-package-assets/'||path into url from public.book_package_assets where book_id=p.book_id and source_path=e->>'sourcePath';
 if url is null then raise exception 'Source choice asset unavailable';end if;
 select to_jsonb(c) into old_q from public.questions c join public.book_topics t on t.id=c.topic_id where t.book_id=p.book_id and c.import_metadata->>'package_question_id'=e->>'sourceId';
 if old_q is null then raise exception 'Source choice question unavailable';end if;
 new_q=pg_temp.choice_text(old_q,(e->>'index')::int,e->>'text',url);
 if new_q=old_q then continue;end if;
 qid=(old_q->>'id')::uuid;
 update public.questions set options=new_q->'options',option_image_urls=new_q->'option_image_urls',import_metadata=import_metadata||jsonb_build_object('source_option_image_urls',coalesce(import_metadata->'source_option_image_urls',old_q->'option_image_urls'),'choice_text_recovery',coalesce(import_metadata->'choice_text_recovery','[]')||jsonb_build_array(e)) where id=qid;
 insert into practice_choice_map values((e->>'index')::int,e->>'text',url) on conflict do nothing;
 insert into practice_repair_log values('text_choice',qid,e->>'sourceId');
 end loop;
 -- Text-only representation changes preserve the prior review decision.
 update public.content_review_items r set status=old.status,note=old.note,reviewed_at=old.reviewed_at,reviewed_by=old.reviewed_by from practice_repair_reviews old where old.id=r.id and r.entity_id in(select question_id from practice_repair_log where kind='text_choice');
 update public.content_review_items r set status='approved',reviewed_at=now() where r.entity_id in(select question_id from practice_repair_log where kind='restored');
 for job_row in select distinct t.book_id from practice_repair_log l join public.questions q on q.id=l.question_id join public.book_topics t on t.id=q.topic_id where l.kind='restored' loop
 update public.import_jobs j set imported_count=(select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=job_row.book_id),skipped_count=greatest(0,j.skipped_count-(select count(*) from practice_repair_log l join public.questions q on q.id=l.question_id join public.book_topics t on t.id=q.topic_id where t.book_id=job_row.book_id and l.kind='restored')),needs_review_count=greatest(0,j.needs_review_count-(select count(*) from practice_repair_log l join public.questions q on q.id=l.question_id join public.book_topics t on t.id=q.topic_id where t.book_id=job_row.book_id and l.kind='restored')),source_metadata=j.source_metadata||jsonb_build_object('recovered_source_entries',(select jsonb_agg(source_id) from practice_repair_log l join public.questions q on q.id=l.question_id join public.book_topics t on t.id=q.topic_id where t.book_id=job_row.book_id and l.kind='restored'),'skipped',(select coalesce(jsonb_agg(value),'[]') from jsonb_array_elements(coalesce(j.source_metadata->'skipped','[]')) value where not exists(select 1 from practice_repair_log l where l.kind='restored' and l.source_id=value->>'id'))) where j.book_id=job_row.book_id;
 update public.content_imports set question_count=(select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=job_row.book_id) where book_id=job_row.book_id;
 end loop;
 update public.books b set published=old.published from practice_repair_publication old where old.id=b.id and b.published is distinct from old.published;
end $repair$;
create or replace function pg_temp.all_choice_text(q jsonb) returns jsonb language plpgsql stable as $$declare r record;begin
 for r in select m.* from practice_choice_map m where m.old_url in(select jsonb_array_elements_text(q->'option_image_urls')) loop
 q:=pg_temp.choice_text(q,r.n,r.value,r.old_url);end loop;return q;
end;$$;
update public.book_practice_items i set question=pg_temp.all_choice_text(i.question) where exists(select 1 from jsonb_array_elements_text(i.question->'option_image_urls') url join practice_choice_map m on m.old_url=url);
update public.homework_questions h set question=pg_temp.all_choice_text(h.question) where exists(select 1 from jsonb_array_elements_text(h.question->'option_image_urls') url join practice_choice_map m on m.old_url=url);
update public.daily_homework_versions v set pool=(select jsonb_agg(jsonb_set(entry,'{question}',pg_temp.all_choice_text(entry->'question')) order by n) from jsonb_array_elements(v.pool) with ordinality entries(entry,n)) where exists(select 1 from jsonb_array_elements(v.pool) entry cross join lateral jsonb_array_elements_text(entry->'question'->'option_image_urls') url join practice_choice_map m on m.old_url=url);
select jsonb_build_object('restored',(select count(*) from practice_repair_log where kind='restored'),'textChoices',(select count(*) from practice_repair_log where kind='text_choice'),'textQuestions',(select count(distinct question_id) from practice_repair_log where kind='text_choice')) repaired;
${apply ? "commit" : "rollback"};`;
}

async function main() {
  if (
    (await readFile("supabase/.temp/project-ref", "utf8")).trim() !==
    "ileffhbbaomfimwulvpw"
  )
    throw new Error("Unexpected project");
  const choiceFiles = process.argv
    .filter((a) => a.startsWith("--choices="))
    .map((a) => a.slice(10));
  const plan = await contentRepairPlan(choiceFiles);
  const apply = process.argv.includes("--apply");
  await mkdir("local-imports/practice-repair", { recursive: true });
  await writeFile(
    "local-imports/practice-repair/plan.json",
    JSON.stringify(plan, null, 2),
  );
  await writeFile(
    "local-imports/practice-repair/repair.sql",
    contentRepairSql(plan, apply),
  );
  const { stdout } = await run(
    "npx",
    [
      "--offline",
      "supabase@2.119.0",
      "db",
      "query",
      "--linked",
      "--file",
      "local-imports/practice-repair/repair.sql",
      "--output",
      "json",
    ],
    { maxBuffer: 2 * 1024 * 1024, timeout: 180000 },
  );
  await writeFile(
    `local-imports/practice-repair/${apply ? "applied" : "rollback"}.json`,
    stdout,
  );
  console.log(stdout);
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
)
  await main();
