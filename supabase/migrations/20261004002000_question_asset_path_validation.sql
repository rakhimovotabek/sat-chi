begin;
create or replace function public.can_read_question_asset(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select p_path ~ '^[a-f0-9]{64}/[a-f0-9]{64}\.webp$' and public.is_active_user() and (public.is_admin() or exists(
 select 1 from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 where b.published and right(q.image_url,length('/storage/v1/object/authenticated/question-assets/'||p_path))='/storage/v1/object/authenticated/question-assets/'||p_path));
$$;
commit;
