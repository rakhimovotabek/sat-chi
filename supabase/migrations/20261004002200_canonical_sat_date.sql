begin;
-- profiles.target_test_date is the only selected exam date. Rebuild future
-- unstarted work on any change (profile, onboarding, settings or Study Plan).
create function public.reschedule_sat_date() returns trigger language plpgsql security definer set search_path='' as $$
declare tz text;
begin
 if new.target_test_date is distinct from old.target_test_date then
 select timezone into tz from public.study_preferences where student_id=new.id;
 delete from public.study_plan_tasks where student_id=new.id and study_date>timezone(coalesce(tz,'UTC'),now())::date and completed_at is null and started_at is null;
 end if;
 return new;
end;$$;
revoke all on function public.reschedule_sat_date() from public,anon,authenticated,service_role;
create trigger profile_sat_date_schedule after update of target_test_date on public.profiles for each row execute function public.reschedule_sat_date();
create function public.save_sat_date(p_date date default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and role='student') then raise exception 'Active student required' using errcode='42501';end if;
 if p_date is not null and p_date<current_date then raise exception 'Choose an upcoming SAT date';end if;
 update public.profiles set target_test_date=p_date where id=auth.uid();
end;$$;
revoke all on function public.save_sat_date(date) from public,anon;
grant execute on function public.save_sat_date(date) to authenticated;
commit;
