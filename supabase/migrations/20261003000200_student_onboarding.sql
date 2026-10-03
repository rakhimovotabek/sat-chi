begin;
alter table public.profiles
  add column current_sat_score integer check (current_sat_score between 400 and 1600 and current_sat_score % 10 = 0),
  add column target_sat_score integer check (target_sat_score between 400 and 1600 and target_sat_score % 10 = 0),
  add column grade text check (char_length(grade) <= 40),
  add column target_test_date date,
  add column main_goal text check (main_goal in ('Improve Math','Improve Reading & Writing','Improve Both','Prepare for first SAT','Reach target score')),
  add column onboarding_completed boolean not null default false;

-- Google metadata is used only for a display name. Every new account is a student.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,role,display_name,active)
  values(new.id,'student',nullif(left(btrim(coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name')),120),''),true);
  return new;
end;
$$;

-- No role, status, ID, or completion flag is accepted from the caller.
-- Column grants from migration 001 remain unchanged. New fields are RPC-only.
create function public.complete_onboarding(payload jsonb)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' or exists (
    select 1 from jsonb_object_keys(payload) k where k not in
    ('display_name','current_sat_score','target_sat_score','grade','target_test_date','main_goal')
  ) then raise exception 'Unsupported profile fields' using errcode='22023'; end if;
  select * into result from public.profiles where id=auth.uid() for update;
  if not found or not result.active or result.role <> 'student' then raise exception 'Active student required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(payload->>'display_name',''))) not between 1 and 120
    or char_length(btrim(coalesce(payload->>'grade',''))) not between 1 and 40
    or coalesce(payload->>'main_goal','') not in ('Improve Math','Improve Reading & Writing','Improve Both','Prepare for first SAT','Reach target score')
    or payload->>'target_sat_score' is null then raise exception 'Required learning information missing' using errcode='22023'; end if;
  update public.profiles set
    display_name=btrim(payload->>'display_name'),
    current_sat_score=(payload->>'current_sat_score')::integer,
    target_sat_score=(payload->>'target_sat_score')::integer,
    grade=btrim(payload->>'grade'),
    target_test_date=nullif(payload->>'target_test_date','')::date,
    main_goal=payload->>'main_goal',
    onboarding_completed=true
  where id=auth.uid() returning * into result;
  return result;
end;
$$;
revoke all on function public.complete_onboarding(jsonb) from public,anon,authenticated;
grant execute on function public.complete_onboarding(jsonb) to authenticated;
commit;
