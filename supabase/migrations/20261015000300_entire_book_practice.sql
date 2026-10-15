begin;
alter table public.book_practice_sessions add column whole_book boolean not null default false;
create index entire_book_resume_idx on public.book_practice_sessions(student_id,source_id,started_at desc)where whole_book;

create function public.create_ordered_book_snapshot(p_book uuid,p_topic uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; iid uuid; q record; title text; n integer:=0;
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 select coalesce((select t.title from public.book_topics t where t.id=p_topic and t.book_id=b.id),b.title) into title
 from public.books b where b.id=p_book and (b.published or public.is_admin());
 if title is null or(p_topic is not null and not exists(select 1 from public.book_topics where id=p_topic and book_id=p_book)) then raise exception 'Book unavailable' using errcode='42501';end if;
 insert into public.book_practice_sessions(student_id,title,kind,source_id,whole_book)
 values(auth.uid(),title,'book',coalesce(p_topic,p_book),p_topic is null)returning id into sid;
 for q in with recursive topics as(
 select t.id,array[t.position] sort_path from public.book_topics t where t.book_id=p_book
 and case when p_topic is null then t.parent_id is null else t.id=p_topic end
 union all select t.id,p.sort_path||t.position from public.book_topics t join topics p on t.parent_id=p.id where t.book_id=p_book
 ),scoped as materialized(
 select qs question_row,a.correct_answer,a.explanation,t.sort_path from topics t
 join public.questions qs on qs.topic_id=t.id join public.question_answers a on a.question_id=qs.id
 ) select (question_row).*,correct_answer,explanation from scoped
 where(public.question_practicable((question_row).id)or public.book_package_question_ready((question_row).id))
 and(public.is_admin()or public.question_approved_for_students((question_row).id))
 order by sort_path,(question_row).position,(question_row).id loop
 n:=n+1;if n>20000 then raise exception 'Book exceeds the supported 20,000-question session size';end if;
 insert into public.book_practice_items(session_id,position,question)values(sid,n-1,to_jsonb(q)-'correct_answer'-'explanation')returning id into iid;
 insert into public.book_practice_keys(item_id,correct_answer,explanation)values(iid,q.correct_answer,q.explanation);
 insert into public.book_practice_open_keys(item_id,accepted_answers,correct_answer,answer_format,accepted_range)
 select iid,o.accepted_answers,o.correct_answer,o.answer_format,o.accepted_range from public.book_open_answers o where o.question_id=q.id;
 end loop;
 if n=0 then raise exception 'No eligible questions available in this book';end if;
 return sid;
end;$$;

create or replace function public.start_book_practice_new_snapshot(p_topic_id uuid)returns uuid
language plpgsql security definer set search_path='' as $$declare book_id uuid;begin
 select t.book_id into book_id from public.book_topics t where t.id=p_topic_id;
 return public.create_ordered_book_snapshot(book_id,p_topic_id);
end;$$;

create function public.start_entire_book_practice(p_book uuid)returns uuid
language plpgsql security definer set search_path='' as $$declare sid uuid;begin
 if not public.is_active_user() or not exists(select 1 from public.books where id=p_book and(published or public.is_admin())) then raise exception 'Book unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'entire-book:'||p_book::text,0));
 select id into sid from public.book_practice_sessions where student_id=auth.uid() and kind='book' and whole_book and source_id=p_book
 order by started_at desc,id limit 1;
 if sid is null then sid:=public.create_ordered_book_snapshot(p_book);end if;
 return sid;
end;$$;
revoke all on function public.create_ordered_book_snapshot(uuid,uuid),public.start_book_practice_new_snapshot(uuid)from public,anon,authenticated;
revoke all on function public.start_entire_book_practice(uuid)from public,anon;
grant execute on function public.start_entire_book_practice(uuid)to authenticated;

-- Book eligibility deliberately retains the book-specific approval contract;
-- Question Bank has additional UI/review restrictions and is a separate pool.
do $$declare definition text;begin
 select pg_get_functiondef('public.book_practice_progress(uuid)'::regprocedure)into definition;
 definition:=replace(definition,'and case when public.is_admin() then e.admin_ready else e.student_ready end',
 'and (public.question_practicable(q.id) or public.book_package_question_ready(q.id)) and (public.is_admin() or e.book_student_ready)');
 execute definition;
end;$$;
commit;
