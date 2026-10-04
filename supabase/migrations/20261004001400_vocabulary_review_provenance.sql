begin;
create or replace function public.seed_content_review(p_source uuid) returns void language plpgsql set search_path='' as $$
declare j public.import_jobs; x jsonb; n integer:=0;
begin
 select * into j from public.import_jobs where id=p_source;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status,reviewed_at,note)
 select j.id,'question',q.id,'question:'||q.id,q.source_page,coalesce(q.import_metadata->>'extraction_method','embedded_text'),case when b.published then 'approved' else 'pending' end,case when b.published then j.updated_at else null end,case when b.published then 'Existing administrator publication decision; historical reviewer unknown.' else '' end
 from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where b.id=j.book_id on conflict do nothing;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status)
 select j.id,'word',w.id,'word:'||w.id,w.source_page,'embedded_bbox',case when b.published then 'approved' else 'pending' end from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id join public.vocabulary_books b on b.id=s.book_id where b.id=j.vocabulary_book_id on conflict do nothing;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status)
 select j.id,'passage',p.id,'passage:'||p.id,null::integer,'embedded_bbox',case when b.published then 'approved' else 'pending' end from public.vocabulary_passages p join public.vocabulary_sets s on s.id=p.set_id join public.vocabulary_books b on b.id=s.book_id where b.id=j.vocabulary_book_id on conflict do nothing;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status)
 select j.id,'exercise',q.id,'exercise:'||q.id,case when coalesce(q.payload->>'sourcePage','')~'^[1-9][0-9]*$' then (q.payload->>'sourcePage')::int else null end,'embedded_bbox',case when b.published then 'approved' else 'pending' end from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id join public.vocabulary_books b on b.id=s.book_id where b.id=j.vocabulary_book_id on conflict do nothing;
 for x in select value from jsonb_array_elements(coalesce(j.source_metadata->'review_items','[]')) loop
 n:=n+1;
 insert into public.content_review_items(source_id,item_type,candidate_key,candidate,source_page,extraction_method,warnings)
 values(j.id,case when x?'candidate' then 'question' else 'source' end,'exclusion:'||coalesce(x->>'set','')||':'||coalesce(x->>'number',x->>'question_index',n::text)||':'||n,
 coalesce(x->'candidate',x),case when coalesce(x->>'page','')~'^[1-9][0-9]*$' then (x->>'page')::int else null end,'embedded_bbox',coalesce(x->'reasons',jsonb_build_array(coalesce(x->>'reason','Source mapping requires manual review')))) on conflict do nothing;
 end loop;
 if jsonb_typeof(j.source_metadata->'investigation')='object' and j.source_metadata->'investigation'<>'{}'::jsonb then
 insert into public.content_review_items(source_id,item_type,candidate_key,candidate,extraction_method,warnings)
 values(j.id,'source','source:diagnosis',j.source_metadata->'investigation',coalesce(j.source_metadata->'investigation'->>'extraction_method','embedded_text'),jsonb_build_array(coalesce(j.source_metadata->'investigation'->>'diagnosis','Manual source review required'))) on conflict do nothing;
 end if;
end;$$;
revoke all on function public.seed_content_review(uuid) from public,anon,authenticated,service_role;
-- Backfill pages only when persisted evidence and root-topic catalog order have
-- a complete one-to-one inventory. Unknown/mismatched histories stay unknown.
with ordered as (
 select q.id,j.id source_id,j.source_file,j.parser_version,j.source_metadata,
 row_number() over(partition by j.id order by t.position,t.id,q.position,q.id)-1 ordinal,
 count(*) over(partition by j.id) inventory
 from public.import_jobs j join public.book_topics t on t.book_id=j.book_id join public.questions q on q.topic_id=t.id
 where q.source_page is null and not exists(select 1 from public.book_topics bt where bt.book_id=j.book_id and bt.parent_id is not null)
), mapped as (
 select o.id,o.source_file,o.parser_version,e.value evidence from ordered o cross join lateral jsonb_array_elements(coalesce(o.source_metadata->'evidence','[]')) e
 where o.inventory=jsonb_array_length(o.source_metadata->'evidence')
 and case when e.value?'question_index' then (e.value->>'question_index')::int=o.ordinal else (e.value->>'number')::int=o.ordinal+1 end
 and coalesce(e.value->>'page','')~'^[1-9][0-9]*$'
)
update public.questions q set source_page=(m.evidence->>'page')::int,
 import_metadata=jsonb_build_object('source_file',m.source_file,'parser_version',m.parser_version,'source_number',m.evidence->'number','extraction_method','embedded_bbox','provenance_origin','persisted_source_checkpoint') from mapped m where q.id=m.id;

with desired as (
 select r.id,r.source_id,r.source_page previous_page,case when r.item_type='exercise' and coalesce(q.payload->>'sourcePage','')~'^[1-9][0-9]*$' then (q.payload->>'sourcePage')::int else null end page
 from public.content_review_items r left join public.vocabulary_questions q on r.item_type='exercise' and q.id=r.entity_id
 where r.entity_id is not null and r.item_type in ('exercise','passage')
), changed as (
 update public.content_review_items r set source_page=d.page,updated_at=clock_timestamp() from desired d where r.id=d.id and r.source_page is distinct from d.page returning r.id,r.source_id,d.previous_page,r.source_page
)
insert into public.content_review_audit(item_id,source_id,action,before_data,after_data)select id,source_id,'provenance_repair',jsonb_build_object('source_page',previous_page),jsonb_build_object('source_page',source_page,'reason','Use explicit exercise sourcePage; passage page is unknown, not the word-table page') from changed;
commit;
