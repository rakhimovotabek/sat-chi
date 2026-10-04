begin;
-- A recreated function inherits PUBLIC execute unless explicitly revoked.
-- Preserve authenticated submission and keep the internal delegate private.
revoke all on function public.finish_book_practice(uuid) from public,anon;
grant execute on function public.finish_book_practice(uuid) to authenticated;
commit;
