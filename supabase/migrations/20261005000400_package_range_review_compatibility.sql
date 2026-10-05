begin;
create or replace function public.book_practice_open_review(p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session and student_id=auth.uid() and kind in ('book','bank') and submitted_at is not null and public.is_active_user()) then raise exception 'Submit your own book practice first' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'item_id',k.item_id,
   'accepted_answers',case when k.answer_format='numeric-range' and jsonb_array_length(k.accepted_answers)=0 and k.correct_answer is not null then jsonb_build_array(k.correct_answer) else k.accepted_answers end,
   'correct_answer',k.correct_answer,
   'answer_format',k.answer_format,
   'accepted_range',k.accepted_range
 )) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session),'[]');
end;$$;
revoke all on function public.book_practice_open_review(uuid) from public,anon;
grant execute on function public.book_practice_open_review(uuid) to authenticated;
commit;
