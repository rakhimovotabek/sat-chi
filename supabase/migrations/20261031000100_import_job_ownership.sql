begin;
-- Preserve the applied implementation; enforce current status and ownership before
-- the old fingerprint-idempotency path can return another administrator's job.
alter function public.universal_begin(text,jsonb,uuid) rename to universal_begin_before_ownership;
create function public.universal_begin(p_fingerprint text,p_manifest jsonb,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin' and active) then
  raise exception 'Active admin required' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,0));
 if exists(select 1 from public.universal_book_jobs where fingerprint=p_fingerprint and created_by<>p_actor) then
  raise exception 'Import job belongs to another administrator' using errcode='42501';
 end if;
 return public.universal_begin_before_ownership(p_fingerprint,p_manifest,p_actor);
end;$$;
revoke all on function public.universal_begin_before_ownership(text,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.universal_begin(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.universal_begin(text,jsonb,uuid) to service_role;
create index universal_jobs_owner_recent on public.universal_book_jobs(created_by,created_at desc);
commit;
