begin;
-- Duplicate flags may coexist with a historical approval. Keep the actual
-- decision total visible; do not alter that administrator decision.
alter function public.content_review_overview() rename to content_review_overview_triage;
revoke all on function public.content_review_overview_triage() from public,anon,authenticated,service_role;
create function public.content_review_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 return public.content_review_overview_triage()||jsonb_build_object('approved',(select count(*) from public.content_review_items where entity_id is not null and status='approved'),'rejected',(select count(*) from public.content_review_items where entity_id is not null and status='rejected'));
end;$$;
revoke all on function public.content_review_overview() from public,anon,authenticated;
grant execute on function public.content_review_overview() to authenticated;
commit;
