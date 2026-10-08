begin;
-- An authorized frozen Homework snapshot has the same private source-image
-- access as Book/Bank history. Source approval is still required for browsing.
create or replace function public.can_read_book_package_asset(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_active_user() and (public.is_admin() or exists(
 select 1 from public.book_package_assets a join public.books b on b.id=a.book_id
 where a.path=p_path and a.kind<>'archive' and (
 a.kind in('question','option') and b.published and public.book_package_question_ready(a.question_id)
 or exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
 where s.student_id=auth.uid() and s.kind in('book','bank','homework')
 and public.can_access_homework_session(s.id)
 and i.question->>'id'=a.question_id::text
 and (a.kind<>'explanation' or i.has_answered or i.selected_answer is not null or s.submitted_at is not null))
 )));
$$;
commit;
