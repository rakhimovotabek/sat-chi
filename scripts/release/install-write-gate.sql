-- Operator-reviewed release preparation. NOT an automatic application migration.
begin;
create schema if not exists satchi_release;
revoke all on schema satchi_release from public;
create table if not exists satchi_release.control (
 id boolean primary key default true check(id),
 mode text not null default 'off' check(mode in('off','maintenance','compatible')),
 client_version text not null default '20261008',
 verification_users uuid[] not null default '{}'
);
insert into satchi_release.control(id)values(true)on conflict do nothing;
revoke all on satchi_release.control from public,anon,authenticated,service_role;
create or replace function satchi_release.check_request() returns void
language plpgsql security definer set search_path='' as $$
declare c satchi_release.control; headers jsonb; method text;
begin
 -- Both readonly and read/write requests participate. Activation drains requests
 -- already admitted, then later requests observe the committed mode.
 perform pg_catalog.pg_advisory_xact_lock_shared(88101008);
 select * into strict c from satchi_release.control where id;
 method:=coalesce(current_setting('request.method',true),'');
 if method in('GET','HEAD','OPTIONS') or c.mode='off' then return;end if;
 headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 -- Trusted server integrations retain their normal authorization after reopening.
 -- No service credential is sent to the browser. Maintenance still blocks them.
 if c.mode='compatible' and coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role'='service_role' then return;end if;
 if c.mode='maintenance' and not coalesce(auth.uid()=any(c.verification_users),false) then
  raise sqlstate 'PT503' using message='SAT''chi is temporarily read-only for maintenance. Keep this tab and your pending answers; retry after the update.';
 end if;
 if coalesce(headers->>'x-satchi-client-version','')<>c.client_version then
  raise sqlstate 'PT426' using message='This SAT''chi tab needs the current application version. Preserve pending answers before refreshing.';
 end if;
end;$$;
revoke all on function satchi_release.check_request() from public;
grant usage on schema satchi_release to anon,authenticated,service_role;
grant execute on function satchi_release.check_request() to anon,authenticated,service_role;
create or replace function satchi_release.set_mode(p_mode text,p_users uuid[] default '{}')returns void
language plpgsql security definer set search_path='' as $$begin
 if p_mode not in('off','maintenance','compatible') or p_mode is null then raise exception 'Invalid release mode';end if;
 if exists(select 1 from unnest(p_users) uid where not exists(select 1 from public.profiles where id=uid and active)) then raise exception 'Verification users must exist and be active';end if;
 perform pg_catalog.pg_advisory_xact_lock(88101008);
 update satchi_release.control set mode=p_mode,verification_users=case when p_mode='maintenance' then p_users else '{}'::uuid[] end where id;
end;$$;
revoke all on function satchi_release.set_mode(text,uuid[]) from public,anon,authenticated,service_role;
-- Auth-admin operations span separate provider transactions. Reject new account
-- mutations before their first side effect, including for verification users.
create or replace function public.satchi_assert_release_write_access() returns void
language plpgsql security definer set search_path='' as $$begin
 perform satchi_release.check_request();
 if exists(select 1 from satchi_release.control where id and mode='maintenance') then
  raise sqlstate 'PT503' using message='Account management is paused for maintenance. No account changes were made.';
 end if;
end;$$;
revoke all on function public.satchi_assert_release_write_access() from public,anon,service_role;
grant execute on function public.satchi_assert_release_write_access() to authenticated;
-- Refuse to replace an existing operator hook without reviewing its behavior.
do $$declare hook text;begin
 select split_part(setting,'=',2) into hook from pg_db_role_setting s
 cross join lateral unnest(s.setconfig) setting
 where s.setrole='authenticator'::regrole and s.setdatabase in(0,(select oid from pg_database where datname=current_database()))
 and setting like 'pgrst.db_pre_request=%' order by s.setdatabase desc limit 1;
 if coalesce(hook,'') not in('','satchi_release.check_request') then raise exception 'Existing PostgREST hook %. Review and chain it before installing the release gate.',hook;end if;
 alter role authenticator set pgrst.db_pre_request='satchi_release.check_request';
end;$$;
notify pgrst,'reload config';
notify pgrst,'reload schema';
commit;
