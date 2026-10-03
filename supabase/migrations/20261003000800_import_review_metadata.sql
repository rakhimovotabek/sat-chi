begin;
-- Import evidence contains source coordinates/counts, never source PDF contents.
-- Existing import_jobs RLS remains admin-only; no new student grants are added.
alter table public.import_jobs
 add column source_path text not null default '',
 add column source_type text not null default 'book' check(source_type in ('book','vocabulary')),
 add column category text not null default 'Other',
 add column detected_vocabulary_sets integer not null default 0 check(detected_vocabulary_sets>=0),
 add column needs_review_count integer not null default 0 check(needs_review_count>=0),
 add column parser_version text not null default '',
 add column source_metadata jsonb not null default '{}',
 add column vocabulary_book_id uuid references public.vocabulary_books(id) on delete set null,
 add column updated_at timestamptz not null default now();
create index import_jobs_status_idx on public.import_jobs(status,updated_at desc);
-- The local importer reuses existing questions by exact content signature;
-- the admin-authored question API remains unchanged.
create table public.local_question_imports (
 fingerprint text primary key check(length(fingerprint)=32),
 question_id uuid not null references public.questions(id) on delete cascade
);
alter table public.local_question_imports enable row level security;
revoke all on public.local_question_imports from public,anon,authenticated;
create policy local_import_admin_read on public.local_question_imports for select to authenticated using(public.is_admin());
grant select on public.local_question_imports to authenticated;
insert into public.local_question_imports(fingerprint,question_id)
 select distinct on (md5(jsonb_build_array(question_text,passage,options)::text))
 md5(jsonb_build_array(question_text,passage,options)::text),id from public.questions order by md5(jsonb_build_array(question_text,passage,options)::text),created_at,id;
create function public.import_local_topic(p_book uuid,p_parent uuid,p_data jsonb,p_position integer,p_depth integer)
 returns integer language plpgsql set search_path='' as $$
 declare tid uuid; q jsonb; existing_answer integer; child jsonb; qid uuid; fp text; n integer:=0; pos integer:=0;
 begin
 if p_depth>8 then raise exception 'Topic depth limit';end if;
 insert into public.book_topics(book_id,parent_id,title,position)values(p_book,p_parent,p_data->>'title',p_position) returning id into tid;
 for q in select value from jsonb_array_elements(coalesce(p_data->'questions','[]'))loop
 fp:=md5(jsonb_build_array(q->>'question',coalesce(q->>'passage',''),q->'options')::text);
 select a.correct_answer into existing_answer from public.local_question_imports l join public.question_answers a on a.question_id=l.question_id where l.fingerprint=fp;
 if existing_answer is not null and existing_answer<>(q->>'correctAnswer')::integer then raise exception 'NEEDS_REVIEW: duplicate content has conflicting answer keys';end if;
 if existing_answer is null then
 qid:=public.write_book_question(tid,q,null,pos);
 insert into public.local_question_imports values(fp,qid);n:=n+1;pos:=pos+1;
 end if;end loop;
 pos:=0;
 for child in select value from jsonb_array_elements(coalesce(p_data->'children','[]'))loop
 n:=n+public.import_local_topic(p_book,tid,child,pos,p_depth+1);pos:=pos+1;end loop;
 return n;
 end;$$;
revoke all on function public.import_local_topic(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated,service_role;
commit;
