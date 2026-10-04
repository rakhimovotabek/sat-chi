begin;
create function public.save_account_settings(p_display_name text,p_daily_minutes integer default null,p_timezone text default 'UTC') returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles;tz text;
begin
 select * into p from public.profiles where id=auth.uid() for update;
 if not found or not p.active then raise exception 'Active account required' using errcode='42501';end if;
 if char_length(btrim(p_display_name)) not between 1 and 120 or p_display_name is null then raise exception 'Display name must contain 1–120 characters';end if;
 if p_daily_minutes is not null and (p.role<>'student' or p_daily_minutes not between 10 and 180 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone)) then raise exception 'Invalid student study goal';end if;
 update public.profiles set display_name=btrim(p_display_name) where id=auth.uid();
 if p_daily_minutes is not null then
 insert into public.study_preferences(student_id,minutes_per_day,preferred_days,timezone)values(auth.uid(),p_daily_minutes,array[1,2,3,4,5],p_timezone)
 on conflict(student_id)do update set minutes_per_day=excluded.minutes_per_day,updated_at=now();
 select timezone into tz from public.study_preferences where student_id=auth.uid();
 delete from public.study_plan_tasks where student_id=auth.uid() and study_date>timezone(tz,now())::date and completed_at is null and started_at is null;
 end if;
end;$$;
revoke all on function public.save_account_settings(text,integer,text) from public,anon,authenticated;
grant execute on function public.save_account_settings(text,integer,text) to authenticated;
commit;
