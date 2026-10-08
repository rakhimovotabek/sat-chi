begin;
-- Book RLS and snapshot selection used repeated source/review/package joins
-- for every question. Cache the SAME approval rule in the existing private,
-- transactionally maintained eligibility table; do not substitute bank rules.
alter table public.question_bank_eligibility
 add column book_student_ready boolean not null default false;

create function public.book_question_approved_uncached(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.question_approved_before_packages(p_id)
 or public.book_package_question_ready(p_id);
$$;
revoke all on function public.book_question_approved_uncached(uuid)
 from public,anon,authenticated,service_role;

update public.question_bank_eligibility e
 set book_student_ready=public.book_question_approved_uncached(e.question_id);

create or replace function public.question_approved_for_students(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select e.book_student_ready
 from public.question_bank_eligibility e where e.question_id=p_id),false);
$$;
-- Existing function identity/ACLs and dependent RLS policies remain intact.

create function public.book_approval_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_row jsonb;after_row jsonb;ids uuid[]:='{}';qid uuid;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new);end if;
 if tg_table_name='questions' then
  ids:=array[(before_row->>'id')::uuid,(after_row->>'id')::uuid];
 elsif tg_table_name in('question_answers','book_open_answers') then
  ids:=array[(before_row->>'question_id')::uuid,(after_row->>'question_id')::uuid];
 elsif tg_table_name='content_review_items' then
  if before_row->>'item_type'='question' then ids:=array_append(ids,(before_row->>'entity_id')::uuid);end if;
  if after_row->>'item_type'='question' then ids:=array_append(ids,(after_row->>'entity_id')::uuid);end if;
 elsif tg_table_name='book_import_packages' then
  select coalesce(array_agg(q.id),'{}') into ids
  from public.questions q join public.book_topics t on t.id=q.topic_id
  where t.book_id in((before_row->>'book_id')::uuid,(after_row->>'book_id')::uuid);
 elsif tg_table_name='book_topics' then
  select coalesce(array_agg(q.id),'{}') into ids from public.questions q
  where q.topic_id in((before_row->>'id')::uuid,(after_row->>'id')::uuid);
 end if;
 for qid in select distinct id from unnest(ids) id where id is not null loop
  update public.question_bank_eligibility e
  set book_student_ready=public.book_question_approved_uncached(qid)
  where e.question_id=qid;
 end loop;
 return null;
end;$$;
revoke all on function public.book_approval_changed()
 from public,anon,authenticated,service_role;

-- AFTER triggers run alphabetically: bank_* creates/refreshes the private row
-- first, then book_* refreshes this independent approval field in the same tx.
create trigger book_approval_question_changed after insert or update on public.questions
 for each row execute function public.book_approval_changed();
create trigger book_approval_answer_changed after insert or update or delete on public.question_answers
 for each row execute function public.book_approval_changed();
create trigger book_approval_open_changed after insert or update or delete on public.book_open_answers
 for each row execute function public.book_approval_changed();
create trigger book_approval_review_changed after insert or update or delete on public.content_review_items
 for each row execute function public.book_approval_changed();
create trigger book_approval_package_changed after insert or update or delete on public.book_import_packages
 for each row execute function public.book_approval_changed();
create trigger book_approval_topic_changed after update of book_id on public.book_topics
 for each row execute function public.book_approval_changed();

-- The recursive join estimate previously pushed expensive eligibility checks
-- onto a whole-library scan even for a two-question leaf. Materialize only the
-- selected topic rows first. Snapshot fields, ordering, keys and limits match.
create or replace function public.start_book_practice_new_snapshot(p_topic_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid;q record;iid uuid;n integer:=0;topic_title text;
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 select t.title into topic_title from public.book_topics t join public.books b on b.id=t.book_id
 where t.id=p_topic_id and (b.published or public.is_admin());
 if topic_title is null then raise exception 'Topic unavailable' using errcode='42501';end if;
 insert into public.book_practice_sessions(student_id,title)values(auth.uid(),topic_title) returning id into sid;
 for q in with recursive topics as(
  select id,array[position] sort_path from public.book_topics where id=p_topic_id
  union all select t.id,p.sort_path||t.position from public.book_topics t join topics p on t.parent_id=p.id
 ), scoped as materialized(
  select qs question_row,a.correct_answer,a.explanation,t.sort_path
  from public.questions qs join topics t on t.id=qs.topic_id
  join public.question_answers a on a.question_id=qs.id
 )
 select (question_row).*,correct_answer,explanation from scoped
 where (public.question_practicable((question_row).id) or public.book_package_question_ready((question_row).id))
 and (public.is_admin() or public.question_approved_for_students((question_row).id))
 order by sort_path,(question_row).position,(question_row).id limit 501 loop
  n=n+1;if n>500 then raise exception 'Practice supports at most 500 questions; choose a smaller topic';end if;
  insert into public.book_practice_items(session_id,position,question)
  values(sid,n-1,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
  insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation);
  insert into public.book_practice_open_keys select iid,accepted_answers from public.book_open_answers where question_id=q.id;
 end loop;
 if n=0 then raise exception 'No questions available';end if;
 return sid;
end;$$;
commit;
