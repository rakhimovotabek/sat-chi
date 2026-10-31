begin;
-- Cache the exact BOOK renderability predicate independently of Bank readiness.
-- No answers, grades or identities are changed. Existing approval remains separate.
alter table public.question_bank_eligibility add column book_practice_ready boolean not null default false;
create function public.refresh_book_renderability()returns trigger
language plpgsql security definer set search_path='' as $$begin
 new.book_practice_ready:=coalesce(public.question_practicable(new.question_id)or public.book_package_question_ready(new.question_id),false);
 return new;
end;$$;
revoke all on function public.refresh_book_renderability()from public,anon,authenticated,service_role;
-- Existing transactional eligibility/approval maintenance covers questions, keys,
-- review, packages/topics and universal publication. This trigger composes with it.
create trigger book_renderability_cache before insert or update of admin_ready,student_ready,book_student_ready
 on public.question_bank_eligibility for each row execute function public.refresh_book_renderability();
update public.question_bank_eligibility set book_practice_ready=coalesce(public.question_practicable(question_id)or public.book_package_question_ready(question_id),false);
create or replace function public.learning_book_progress(p_books uuid[],p_student uuid default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid()); admin_user boolean:=public.is_admin();
begin
 if not public.is_active_user()or(uid<>auth.uid()and not admin_user)then raise exception 'Account unavailable' using errcode='42501';end if;
 if p_books is null or cardinality(p_books)>50 then raise exception 'At most 50 books per page';end if;
 return coalesce((with available as materialized(
 select q.id,q.topic_id from public.questions q join public.book_topics t on t.id=q.topic_id
 join public.books b on b.id=t.book_id join public.question_bank_eligibility e on e.question_id=q.id
 where b.id=any(p_books)and(b.published or admin_user)and e.book_practice_ready and(admin_user or e.book_student_ready)
 ),history as materialized(select * from public.learning_question_facts(uid)), counts as(
 select b.id book_id,count(q.id)total,count(q.id)filter(where h.attempted)attempted,
 count(q.id)filter(where h.checked)checked,count(h.first_correct)first_known,
 count(q.id)filter(where h.first_correct)first_correct,count(q.id)filter(where h.first_correct=false)first_incorrect,
 count(q.id)filter(where h.checked and h.first_correct is null)first_unknown,
 round(100.0*count(q.id)filter(where h.first_correct)/nullif(count(h.first_correct),0),1)first_accuracy,
 count(q.id)filter(where h.eventually_correct)eventually_correct,count(q.id)filter(where h.now_correct)now_correct
 from public.books b left join public.book_topics t on t.book_id=b.id
 left join available q on q.topic_id=t.id
 left join history h on h.question_id=q.id::text
 where b.id=any(p_books)and(b.published or admin_user)group by b.id
 )select jsonb_agg(to_jsonb(counts))from counts),'[]');
end;$$;

do $$declare definition text;needle text;begin
 select pg_get_functiondef('public.book_practice_progress(uuid)'::regprocedure)into definition;
 needle:='(public.question_practicable(q.id) or public.book_package_question_ready(q.id))';
 if position(needle in definition)=0 then raise exception 'Chapter progress predicate changed; review required';end if;
 definition:=replace(definition,needle,'e.book_practice_ready');
 definition:=replace(definition,'public.is_admin()','(select public.is_admin())');
 execute definition;
end;$$;
notify pgrst,'reload schema';
commit;
