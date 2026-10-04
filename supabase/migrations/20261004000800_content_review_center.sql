begin;
create table public.content_review_items(
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.import_jobs(id) on delete cascade,
 item_type text not null check(item_type in ('question','word','passage','exercise','source')),
 entity_id uuid, candidate_key text not null, candidate jsonb not null default '{}',
 source_page integer check(source_page between 1 and 100000), extraction_method text not null default '', confidence numeric check(confidence between 0 and 100),
 warnings jsonb not null default '[]' check(jsonb_typeof(warnings)='array'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','duplicate','deferred')),
 note text not null default '' check(char_length(note)<=2000), reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
 updated_at timestamptz not null default now(), unique(source_id,candidate_key)
);
create index content_review_queue_idx on public.content_review_items(status,source_id,item_type,updated_at,id);
create unique index content_review_entity_idx on public.content_review_items(item_type,entity_id) where entity_id is not null;
create index content_review_warnings_idx on public.content_review_items using gin(warnings);
create table public.content_review_audit(
 id bigint generated always as identity primary key, item_id uuid references public.content_review_items(id) on delete set null,
 source_id uuid references public.import_jobs(id) on delete set null, action text not null,
 actor uuid references public.profiles(id), happened_at timestamptz not null default now(), before_data jsonb, after_data jsonb
);
create index content_review_audit_source_idx on public.content_review_audit(source_id,happened_at desc);
create table public.import_runs(
 id bigint generated always as identity primary key,source_id uuid references public.import_jobs(id) on delete set null,
 checkpoint_key text unique not null, recorded_at timestamptz not null default now(), parser_version text not null,
 status text not null, imported_count integer not null, skipped_count integer not null, warnings jsonb not null, errors jsonb not null,
 history_origin text not null default 'checkpoint'
);
create index import_runs_source_idx on public.import_runs(source_id,recorded_at desc);
alter table public.content_review_items enable row level security;
alter table public.content_review_audit enable row level security;
alter table public.import_runs enable row level security;
create policy review_admin_read on public.content_review_items for select to authenticated using(public.is_admin());
create policy review_audit_admin_read on public.content_review_audit for select to authenticated using(public.is_admin());
create policy import_runs_admin_read on public.import_runs for select to authenticated using(public.is_admin());
revoke all on public.content_review_items,public.content_review_audit,public.import_runs from anon,authenticated;
grant select on public.content_review_items,public.content_review_audit,public.import_runs to authenticated;

-- Current catalog, including keys, is read only inside checked administrator RPCs.
create function public.content_review_payload(r public.content_review_items) returns jsonb language sql stable set search_path='' as $$
 select case r.item_type
 when 'question' then coalesce((select jsonb_build_object('type','mcq','question',q.question_text,'passage',q.passage,'stimulus',q.stimulus,'options',q.options,'correctAnswer',a.correct_answer,'explanation',coalesce(a.explanation,''),'domain',q.domain,'skill',q.skill,'difficulty',q.difficulty,'source',q.source,'imageUrl',coalesce(q.image_url,''),'table',q.stimulus_table,'source_page',q.source_page,'import_metadata',q.import_metadata) from public.questions q join public.question_answers a on a.question_id=q.id where q.id=r.entity_id),r.candidate)
 when 'word' then coalesce((select to_jsonb(w)-'id'-'set_id'-'position'-'created_at' from public.vocabulary_words w where w.id=r.entity_id),r.candidate)
 when 'passage' then coalesce((select jsonb_build_object('title',p.title,'passage',p.passage) from public.vocabulary_passages p where p.id=r.entity_id),r.candidate)
 when 'exercise' then coalesce((select q.payload from public.vocabulary_questions q where q.id=r.entity_id),r.candidate)
 else r.candidate end;
$$;
revoke all on function public.content_review_payload(public.content_review_items) from public,anon,authenticated,service_role;
create function public.seed_content_review(p_source uuid) returns void language plpgsql set search_path='' as $$
declare j public.import_jobs; x jsonb; n integer:=0;
begin
 select * into j from public.import_jobs where id=p_source;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status,reviewed_at,note)
 select j.id,'question',q.id,'question:'||q.id,q.source_page,coalesce(q.import_metadata->>'extraction_method','embedded_text'),case when b.published then 'approved' else 'pending' end,case when b.published then j.updated_at else null end,case when b.published then 'Existing administrator publication decision; historical reviewer unknown.' else '' end
 from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where b.id=j.book_id on conflict do nothing;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status)
 select j.id,'word',w.id,'word:'||w.id,w.source_page,'embedded_bbox',case when b.published then 'approved' else 'pending' end from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id join public.vocabulary_books b on b.id=s.book_id where b.id=j.vocabulary_book_id on conflict do nothing;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status)
 select j.id,'passage',p.id,'passage:'||p.id,s.source_page,'embedded_bbox',case when b.published then 'approved' else 'pending' end from public.vocabulary_passages p join public.vocabulary_sets s on s.id=p.set_id join public.vocabulary_books b on b.id=s.book_id where b.id=j.vocabulary_book_id on conflict do nothing;
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method,status)
 select j.id,'exercise',q.id,'exercise:'||q.id,s.source_page,'embedded_bbox',case when b.published then 'approved' else 'pending' end from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id join public.vocabulary_books b on b.id=s.book_id where b.id=j.vocabulary_book_id on conflict do nothing;
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
select public.seed_content_review(id) from public.import_jobs;
insert into public.import_runs(source_id,checkpoint_key,recorded_at,parser_version,status,imported_count,skipped_count,warnings,errors,history_origin)
select id,id||':'||parser_version||':'||updated_at,updated_at,parser_version,status,imported_count,skipped_count,warnings,errors,'reconciled_latest_checkpoint' from public.import_jobs;
create function public.record_import_checkpoint() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform public.seed_content_review(new.id);
 if new.parser_version<>'' then
 insert into public.import_runs(source_id,checkpoint_key,parser_version,status,imported_count,skipped_count,warnings,errors)
 values(new.id,new.id||':'||new.parser_version||':'||new.updated_at,new.parser_version,new.status,new.imported_count,new.skipped_count,new.warnings,new.errors) on conflict do nothing;
 end if;
 return new;
end;$$;
revoke all on function public.record_import_checkpoint() from public,anon,authenticated,service_role;
create trigger import_checkpoint_history after insert or update on public.import_jobs for each row execute function public.record_import_checkpoint();

create function public.content_review_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 return jsonb_build_object('sources',(select count(*) from public.import_jobs),'questions',(select count(*) from public.questions),'words',(select count(*) from public.vocabulary_words),'sets',(select count(*) from public.vocabulary_sets),'passages',(select count(*) from public.vocabulary_passages),'exercises',(select count(*) from public.vocabulary_questions),
 'awaiting_review',(select count(*) from public.content_review_items where status in ('pending','deferred')),'question_review',(select count(*) from public.content_review_items where item_type='question' and status in ('pending','deferred')),'word_review',(select count(*) from public.content_review_items where item_type='word' and status in ('pending','deferred')),
 'duplicates',(select count(*) from public.content_review_items where status='duplicate' or warnings @> '["Possible duplicate"]'),'warnings',(select coalesce(sum(jsonb_array_length(warnings)),0) from public.import_jobs),
 'outcomes',(select coalesce(jsonb_object_agg(outcome,n),'{}') from (select coalesce(j.source_metadata->>'resolution_status',case when j.status='imported' then case when coalesce(b.published,v.published,false) then 'imported' else 'imported_review' end when j.status='failed' then 'failed' else 'manual' end) outcome,count(*) n from public.import_jobs j left join public.books b on b.id=j.book_id left join public.vocabulary_books v on v.id=j.vocabulary_book_id group by 1) s));
end;$$;
create function public.content_review_sources(p_page integer default 0,p_search text default '') returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_page<0 or p_page>100000 or char_length(p_search)>200 then raise exception 'Invalid source filter';end if;
 return (select jsonb_build_object('total',(select count(*) from public.import_jobs where title ilike '%'||p_search||'%' or source_file ilike '%'||p_search||'%'),'rows',coalesce(jsonb_agg(to_jsonb(s)),'[]')) from (
 select j.id,j.title,j.source_file,j.source_type,j.category,j.status,j.parser_version,j.updated_at,j.book_id,j.vocabulary_book_id,j.skipped_count,j.detected_questions,
 coalesce(j.source_metadata->>'resolution_status',case when j.status='imported' then case when coalesce(b.published,v.published,false) then 'imported' else 'imported_review' end when j.status='failed' then 'failed' else 'manual' end) outcome,
 (select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=j.book_id) question_count,
 (select count(*) from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id where s.book_id=j.vocabulary_book_id) word_count,
 (select count(*) from public.content_review_items r where r.source_id=j.id and r.status in ('pending','deferred')) review_count,
 jsonb_array_length(j.warnings)+jsonb_array_length(j.errors) warning_count
 from public.import_jobs j left join public.books b on b.id=j.book_id left join public.vocabulary_books v on v.id=j.vocabulary_book_id where j.title ilike '%'||p_search||'%' or j.source_file ilike '%'||p_search||'%' order by j.source_file,j.id limit 25 offset p_page*25) s);
end;$$;
create function public.content_review_source(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.import_jobs;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select * into j from public.import_jobs where id=p_id;if not found then raise exception 'Source unavailable';end if;
 return (to_jsonb(j)-'source_metadata')||jsonb_build_object('investigation',j.source_metadata->'investigation','review_progress',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.content_review_items where source_id=p_id group by status) s),'catalog',jsonb_build_object('sets',(select count(*) from public.vocabulary_sets where book_id=j.vocabulary_book_id),'words',(select count(*) from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id where s.book_id=j.vocabulary_book_id),'passages',(select count(*) from public.vocabulary_passages p join public.vocabulary_sets s on s.id=p.set_id where s.book_id=j.vocabulary_book_id),'exercises',(select count(*) from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id where s.book_id=j.vocabulary_book_id)),
 'evidence_count',jsonb_array_length(coalesce(j.source_metadata->'evidence','[]')));
end;$$;
create function public.content_review_queue(p_source uuid default null,p_type text default '',p_status text default 'pending',p_warning text default '',p_search text default '',p_page integer default 0,p_domain text default '',p_confidence numeric default null,p_catalog boolean default false,p_set text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_page<0 or p_page>100000 or char_length(p_search)>200 or char_length(p_warning)>200 or char_length(p_domain)>200 or char_length(p_set)>200 then raise exception 'Invalid review filter';end if;
 return (with matched as (select r.id,r.item_type,r.entity_id,r.source_page,r.extraction_method,r.confidence,r.warnings,r.status,r.updated_at,j.title source_title,
 coalesce(q.question_text,w.word,r.candidate->>'question',r.candidate->>'word',r.candidate->>'diagnosis','Source mapping') label,q.domain,vs.id set_id,vs.title set_title,
 (select count(*) from public.vocabulary_words where set_id=vs.id) set_size,
 (select count(*) from public.vocabulary_passages where set_id=vs.id) set_passages,
 (select count(*) from public.vocabulary_questions where set_id=vs.id) set_exercises
 from public.content_review_items r join public.import_jobs j on j.id=r.source_id left join public.questions q on r.item_type='question' and q.id=r.entity_id left join public.vocabulary_words w on r.item_type='word' and w.id=r.entity_id left join public.vocabulary_passages vp on r.item_type='passage' and vp.id=r.entity_id left join public.vocabulary_questions vq on r.item_type='exercise' and vq.id=r.entity_id left join public.vocabulary_sets vs on vs.id=coalesce(w.set_id,vp.set_id,vq.set_id)
 where (not p_catalog or r.entity_id is not null) and (p_source is null or r.source_id=p_source) and (p_type='' or r.item_type=p_type) and (p_status='' or r.status=p_status) and (p_warning='' or r.warnings::text ilike '%'||p_warning||'%') and (p_search='' or coalesce(q.question_text,w.word,r.candidate::text,'') ilike '%'||p_search||'%') and (p_set='' or vs.title ilike '%'||p_set||'%') and (p_domain='' or q.domain=p_domain) and (p_confidence is null or r.confidence<=p_confidence))
 select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(s)) from (select * from matched order by updated_at,id limit 25 offset p_page*25) s),'[]')));
end;$$;
create function public.content_review_detail(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.content_review_items;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select * into r from public.content_review_items where id=p_id;if not found then raise exception 'Review item unavailable';end if;
 return to_jsonb(r)||jsonb_build_object('payload',public.content_review_payload(r),'source',(select source_file from public.import_jobs where id=r.source_id),'parser_version',(select parser_version from public.import_jobs where id=r.source_id));
end;$$;

-- Strict server-side approval validation; viewing/editing alone never approves.
create function public.validate_review_payload(p_type text,p jsonb) returns void language plpgsql set search_path='' as $$
begin
 if p_type in ('question','exercise') then
 if char_length(btrim(coalesce(p->>'question','')))<12 then raise exception 'Question prompt is too short';end if;
 if jsonb_typeof(p->'options') is distinct from 'array' or jsonb_array_length(p->'options')<>4 then raise exception 'Four choices required';end if;
 if exists(select 1 from jsonb_array_elements(p->'options') o where jsonb_typeof(o)<>'string' or char_length(btrim(o#>>'{}')) not between 1 and 4000) or (select count(distinct lower(btrim(o#>>'{}'))) from jsonb_array_elements(p->'options') o)<>4 then raise exception 'Choices must be nonempty and distinct';end if;
 if jsonb_typeof(p->'correctAnswer') is distinct from 'number' or coalesce(p->>'correctAnswer','')!~'^[0-3]$' then raise exception 'Valid explicit correct answer required';end if;
 if p_type='question' and p->>'question'~*'completes the text' and coalesce(p->>'passage','')!~'_' and coalesce(p->>'imageUrl','')='' then raise exception 'Source blank or image must be preserved';end if;
 if p->>'question'~*'(answer key|Answers:)' then raise exception 'Answer-key contamination';end if;
 elsif p_type='word' then
 if char_length(btrim(coalesce(p->>'word',''))) not between 1 and 160 or char_length(btrim(coalesce(p->>'definition',''))) not between 1 and 10000 then raise exception 'Word and definition required';end if;
 elsif p_type='passage' then
 if char_length(btrim(coalesce(p->>'passage',''))) not between 25 and 60000 then raise exception 'Source passage required';end if;
 else raise exception 'Source diagnostics cannot be approved as learning content';end if;
end;$$;
revoke all on function public.validate_review_payload(text,jsonb) from public,anon,authenticated,service_role;
create function public.update_content_review(p_id uuid,p_action text,p_payload jsonb default null,p_note text default '',p_version timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.content_review_items; before_p jsonb; after_p jsonb; j public.import_jobs; bid uuid; tid uuid; qid uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_action not in ('approve','edit','reject','duplicate','defer') or char_length(p_note)>2000 then raise exception 'Invalid review action';end if;
 select * into r from public.content_review_items where id=p_id for update;if not found then raise exception 'Review item unavailable';end if;
 if p_version is null or r.updated_at<>p_version then raise exception 'Review item changed; refresh before saving';end if;
 before_p:=public.content_review_payload(r);after_p:=before_p;
 if p_action='edit' then
 if p_payload is null then raise exception 'Edit payload required';end if;
 perform public.validate_review_payload(r.item_type,p_payload);
 if r.item_type='question' then
 if r.entity_id is not null then
 select topic_id into tid from public.questions where id=r.entity_id;
 if tid is null then raise exception 'Catalog question was removed';end if;
 perform public.write_book_question(tid,p_payload,r.entity_id);
 else update public.content_review_items set candidate=p_payload where id=p_id;end if;
 elsif r.item_type='word' then
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('word','definition','example','synonym','translation','part_of_speech','additional_definitions','antonym','notes','source_page','extraction_confidence')) then raise exception 'Unsupported word fields';end if;
 update public.vocabulary_words set word=p_payload->>'word',definition=p_payload->>'definition',example=coalesce(p_payload->>'example',''),synonym=coalesce(p_payload->>'synonym',''),translation=coalesce(p_payload->>'translation',''),part_of_speech=coalesce(p_payload->>'part_of_speech',''),additional_definitions=coalesce(p_payload->>'additional_definitions',''),antonym=coalesce(p_payload->>'antonym',''),notes=coalesce(p_payload->>'notes',''),source_page=(p_payload->>'source_page')::int where id=r.entity_id;
 elsif r.item_type='passage' then update public.vocabulary_passages set title=coalesce(p_payload->>'title',''),passage=p_payload->>'passage' where id=r.entity_id;
 elsif r.item_type='exercise' then update public.vocabulary_questions set payload=p_payload where id=r.entity_id;
 end if;after_p:=p_payload;
 elsif p_action='approve' then
 perform public.validate_review_payload(r.item_type,before_p);
 if jsonb_array_length(r.warnings)>0 and char_length(btrim(p_note))<12 then raise exception 'Record how source warnings were verified or corrected';end if;
 if r.item_type='question' and r.entity_id is null then
 select * into j from public.import_jobs where id=r.source_id for update;
 if j.source_type<>'book' or r.source_page is null then raise exception 'Question source and physical page required';end if;
 bid:=j.book_id;
 if bid is null then insert into public.books(title,category,published)values(j.title,case when j.category in ('Math','Reading & Writing') then j.category else 'Other' end,false) returning id into bid;update public.import_jobs set book_id=bid where id=j.id;end if;
 select id into tid from public.book_topics where book_id=bid and title='Manually reviewed import' order by position,id limit 1;
 if tid is null then insert into public.book_topics(book_id,title,position)values(bid,'Manually reviewed import',10000) returning id into tid;end if;
 qid:=public.write_book_question(tid,(before_p-'source_number')||jsonb_build_object('source',j.source_file,'source_page',r.source_page,'import_metadata',jsonb_build_object('extraction_method',r.extraction_method,'parser_version',j.parser_version,'manual_review',true)));
 delete from public.content_review_items where entity_id=qid and id<>p_id;
 update public.content_review_items set entity_id=qid where id=p_id;
 end if;
 end if;
 if p_action in ('edit','reject','duplicate','defer') and r.entity_id is not null then
 update public.books set published=false where id=(select book_id from public.import_jobs where id=r.source_id) and published;
 update public.vocabulary_books set published=false where id=(select vocabulary_book_id from public.import_jobs where id=r.source_id) and published;
 end if;
 update public.content_review_items set source_page=case when p_action='edit' and p_payload?'source_page' then (p_payload->>'source_page')::int else source_page end,status=case p_action when 'edit' then 'pending' when 'approve' then 'approved' when 'reject' then 'rejected' when 'duplicate' then 'duplicate' else 'deferred' end,note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=clock_timestamp() where id=p_id;
 insert into public.content_review_audit(item_id,source_id,action,actor,before_data,after_data)values(p_id,r.source_id,p_action,auth.uid(),jsonb_build_object('status',r.status,'payload',before_p,'note',r.note),jsonb_build_object('payload',after_p,'note',p_note));
 return p_id;
end;$$;

-- Publication is explicit and blocked by unreviewed catalog content. Excluded
-- candidates/source diagnostics do not block publication of an approved subset.
create function public.guard_review_publication() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.published and exists(select 1 from public.import_jobs j join public.content_review_items r on r.source_id=j.id where (case when tg_table_name='books' then j.book_id else j.vocabulary_book_id end)=new.id and r.entity_id is not null and r.status<>'approved' and (r.item_type<>'question' or exists(select 1 from public.questions where id=r.entity_id)) and (r.item_type<>'word' or exists(select 1 from public.vocabulary_words where id=r.entity_id)) and (r.item_type<>'passage' or exists(select 1 from public.vocabulary_passages where id=r.entity_id)) and (r.item_type<>'exercise' or exists(select 1 from public.vocabulary_questions where id=r.entity_id))) then raise exception 'Review imported catalog items before publishing';end if;
 return new;
end;$$;
revoke all on function public.guard_review_publication() from public,anon,authenticated,service_role;
create trigger books_review_publication before update of published on public.books for each row execute function public.guard_review_publication();
create trigger vocab_review_publication before update of published on public.vocabulary_books for each row execute function public.guard_review_publication();
create function public.invalidate_content_review() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; eid uuid; r public.content_review_items;
begin
 if to_jsonb(new)=to_jsonb(old) then return new;end if;
 kind:=case tg_table_name when 'questions' then 'question' when 'question_answers' then 'question' when 'vocabulary_words' then 'word' when 'vocabulary_passages' then 'passage' else 'exercise' end;
 eid:=case when tg_table_name='question_answers' then (to_jsonb(new)->>'question_id')::uuid else (to_jsonb(new)->>'id')::uuid end;
 select * into r from public.content_review_items where item_type=kind and entity_id=eid;
 if r.id is not null then
 update public.books set published=false where id=(select book_id from public.import_jobs where id=r.source_id) and published;
 update public.vocabulary_books set published=false where id=(select vocabulary_book_id from public.import_jobs where id=r.source_id) and published;
 update public.content_review_items set status='pending',updated_at=clock_timestamp() where id=r.id;
 insert into public.content_review_audit(item_id,source_id,action,actor,before_data,after_data)values(r.id,r.source_id,'catalog_edit',auth.uid(),to_jsonb(old),to_jsonb(new));
 end if;return new;
end;$$;
revoke all on function public.invalidate_content_review() from public,anon,authenticated,service_role;
create trigger questions_review_edit after update on public.questions for each row execute function public.invalidate_content_review();
create trigger answers_review_edit after update on public.question_answers for each row execute function public.invalidate_content_review();
create trigger words_review_edit after update on public.vocabulary_words for each row execute function public.invalidate_content_review();
create trigger passages_review_edit after update on public.vocabulary_passages for each row execute function public.invalidate_content_review();
create trigger exercises_review_edit after update on public.vocabulary_questions for each row execute function public.invalidate_content_review();
create function public.queue_new_import_content() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; kind text; page integer;
begin
 kind:=case tg_table_name when 'questions' then 'question' when 'vocabulary_words' then 'word' when 'vocabulary_passages' then 'passage' else 'exercise' end;
 if kind='question' then select j.id into sid from public.import_jobs j join public.book_topics t on t.book_id=j.book_id where t.id=(to_jsonb(new)->>'topic_id')::uuid;else select j.id into sid from public.import_jobs j join public.vocabulary_sets s on s.book_id=j.vocabulary_book_id where s.id=(to_jsonb(new)->>'set_id')::uuid;end if;
 page:=nullif(to_jsonb(new)->>'source_page','')::int;
 if sid is not null then
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method) values(sid,kind,new.id,kind||':'||new.id,page,'manual') on conflict do nothing;
 update public.books set published=false where id=(select book_id from public.import_jobs where id=sid) and published;
 update public.vocabulary_books set published=false where id=(select vocabulary_book_id from public.import_jobs where id=sid) and published;
 end if;return new;
end;$$;
revoke all on function public.queue_new_import_content() from public,anon,authenticated,service_role;
create trigger question_review_insert after insert on public.questions for each row execute function public.queue_new_import_content();
create trigger word_review_insert after insert on public.vocabulary_words for each row execute function public.queue_new_import_content();
create trigger passage_review_insert after insert on public.vocabulary_passages for each row execute function public.queue_new_import_content();
create trigger exercise_review_insert after insert on public.vocabulary_questions for each row execute function public.queue_new_import_content();
-- Flag normalized content repeats without deleting either source or guessing keys.
with signatures as(select id,md5(lower(regexp_replace(question_text||' '||passage||' '||options::text,'\s+',' ','g'))) sig from public.questions),dups as(select sig from signatures group by sig having count(*)>1)
update public.content_review_items r set warnings=warnings||'["Possible duplicate"]'::jsonb from signatures s join dups d on d.sig=s.sig where r.item_type='question' and r.entity_id=s.id;
revoke all on function public.content_review_overview(),public.content_review_sources(integer,text),public.content_review_source(uuid),public.content_review_queue(uuid,text,text,text,text,integer,text,numeric,boolean,text),public.content_review_detail(uuid),public.update_content_review(uuid,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.content_review_overview(),public.content_review_sources(integer,text),public.content_review_source(uuid),public.content_review_queue(uuid,text,text,text,text,integer,text,numeric,boolean,text),public.content_review_detail(uuid),public.update_content_review(uuid,text,jsonb,text,timestamptz) to authenticated;
commit;
