begin;
-- Aggregate this student's history once instead of joining every source question
-- to every owned Book session. Keep publication/approval and counting semantics.
create or replace function public.book_practice_progress(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 return coalesce((with recursive tree as(
 select id root,id from public.book_topics where book_id=p_book
 union all select p.root,t.id from tree p join public.book_topics t on t.parent_id=p.id
 ), history as (
 select i.question->>'id' id,
 bool_or(i.correct=true and (i.solved_at is not null or s.submitted_at is not null)) solved,
 bool_or(i.correct is not null and i.selected_answer is not null) checked
 from public.book_practice_sessions s join public.book_practice_items i on i.session_id=s.id
 where s.student_id=auth.uid() and s.kind='book'
 group by i.question->>'id'
 ), status as(
 select q.id,q.topic_id,
 coalesce(h.solved,false) solved,coalesce(h.checked,false) checked
 from public.questions q join public.book_topics t on t.id=q.topic_id
 left join history h on h.id=q.id::text
 where t.book_id=p_book and exists(select 1 from public.books b where b.id=t.book_id and (b.published or public.is_admin()))
 and (public.question_practicable(q.id) or public.book_package_question_ready(q.id))
 and (public.is_admin() or public.question_approved_for_students(q.id))

 ), counts as(
 select tree.root topic_id,count(status.id) total,count(status.id) filter(where solved) solved,
 count(status.id) filter(where checked) checked from tree left join status on status.topic_id=tree.id group by tree.root
 ) select jsonb_agg(to_jsonb(counts)) from counts),'[]'::jsonb);
end;$$;

commit;
