begin;
-- Shared practice records are scoped by kind, not by their table names.
lock table public.books, public.book_topics, public.questions,
 public.book_practice_sessions, public.import_jobs in share row exclusive mode;
create temporary table reset_protected_hashes(relation text, predicate text, digest text);
do $$ declare t text; p text; d text; begin
 for t in select tablename from pg_tables where schemaname='public' loop
 p := case
 when t='book_practice_sessions' then 'kind<>''book'''
 when t in ('book_practice_items','book_practice_keys','question_check_attempts') then
 case when t='book_practice_items' then 'session_id in (select id from public.book_practice_sessions where kind<>''book'')'
 else 'item_id in (select i.id from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.kind<>''book'')' end
 when t='student_activity' then 'kind<>''book'' and (session_id is null or session_id in (select id from public.book_practice_sessions where kind<>''book''))'
 when t='study_plan_tasks' then 'session_id is null or session_id in (select id from public.book_practice_sessions where kind<>''book'')'
 when t='import_jobs' then 'source_type<>''book'''
 when t in ('content_review_items','content_review_audit','import_runs') then 'source_id is null or source_id in (select id from public.import_jobs where source_type<>''book'')'
 when t in ('books','book_topics','questions','question_answers','content_imports','local_question_imports') then null
 else 'true' end;
 if p is not null then
 execute format('select md5(coalesce(string_agg(to_jsonb(r)::text,'''' order by to_jsonb(r)::text),'''')) from public.%I r where %s',t,p) into d;
 insert into reset_protected_hashes values(t,p,d);
 end if;
 end loop;
 insert into reset_protected_hashes select 'auth.users','true',md5(coalesce(string_agg(to_jsonb(u)::text,'' order by to_jsonb(u)::text),'')) from auth.users u;
end $$;
create temporary table reset_counts as select
 (select count(*) from public.books) books_deleted,
 (select count(*) from public.book_topics) topics_deleted,
 (select count(*) from public.questions) questions_deleted,
 (select count(*) from public.book_practice_sessions where kind='book') sessions_deleted,
 (select count(*) from public.import_jobs where source_type='book') import_jobs_deleted;
delete from public.study_plan_tasks where session_id in (select id from public.book_practice_sessions where kind='book');
delete from public.student_activity where kind='book';
delete from public.book_practice_sessions where kind='book';
delete from public.content_review_audit where source_id in (select id from public.import_jobs where source_type='book')
 or item_id in (select r.id from public.content_review_items r join public.import_jobs j on j.id=r.source_id where j.source_type='book');
delete from public.import_runs where source_id in (select id from public.import_jobs where source_type='book');
delete from public.import_jobs where source_type='book';
delete from public.books;
do $$ declare r record; d text; begin
 for r in select * from reset_protected_hashes loop
 execute format('select md5(coalesce(string_agg(to_jsonb(t)::text,'''' order by to_jsonb(t)::text),'''')) from %s t where %s',
 case when r.relation='auth.users' then 'auth.users' else format('public.%I',r.relation) end,r.predicate) into d;
 if d is distinct from r.digest then raise exception 'Protected data changed: %',r.relation; end if;
 end loop;
 if exists(select 1 from public.books) or exists(select 1 from public.questions) then raise exception 'Book reset incomplete'; end if;
end $$;
commit;
select c.*, (select count(*) from public.books) books_remaining,
 (select count(*) from public.questions) book_questions_remaining,
 (select count(*) from reset_protected_hashes) protected_relations_verified from reset_counts c;
