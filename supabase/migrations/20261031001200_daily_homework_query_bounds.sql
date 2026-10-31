begin;
-- Resolve a revision once per template/day, before multiplying by enrollment.
-- Keep original windows, local-midnight/timezone, revision and deduplication rules.
create or replace function public.daily_scheduled(p_student uuid,p_template uuid,p_from date,p_until date)
returns table(template_id uuid,student_id uuid,study_date date,version_id uuid,opens_at timestamptz,due_at timestamptz)
language sql stable security definer set search_path='' as $$
 with days as materialized(
 select t.id,t.timezone,d.day::date study_date,v.id version_id
 from public.daily_homework_templates t
 cross join lateral generate_series(p_from::timestamp,p_until::timestamp,interval '1 day')d(day)
 join lateral(select v.id,v.data from public.daily_homework_versions v
 where v.template_id=t.id and v.valid_from<=d.day::date order by valid_from desc,revision desc limit 1)v on true
 where(p_template is null or t.id=p_template)
 and exists(select 1 from public.daily_homework_enrollments e where e.template_id=t.id
 and(p_student is null or e.student_id=p_student)and e.from_date<=p_until and(e.until_date is null or e.until_date>p_from))
 and d.day::date>=(v.data->>'startDate')::date
 and(nullif(v.data->>'endDate','')is null or d.day::date<=(v.data->>'endDate')::date)
 and exists(select 1 from public.daily_homework_windows w where w.template_id=t.id and d.day::date>=w.from_date and(w.until_date is null or d.day::date<w.until_date))
 and d.day::timestamp at time zone t.timezone<=now()
 )
 select distinct d.id,e.student_id,d.study_date,d.version_id,
 d.study_date::timestamp at time zone d.timezone,(d.study_date+1)::timestamp at time zone d.timezone
 from days d join public.daily_homework_enrollments e on e.template_id=d.id
 and(p_student is null or e.student_id=p_student)
 and d.study_date>=e.from_date and(e.until_date is null or d.study_date<e.until_date);
$$;
-- Restrict detailed projections and correlated item counts to the displayed page.
-- The total remains the exact count of the narrow scheduled/started ID union.
create or replace function public.daily_homework_directory(p_student uuid default null,p_template uuid default null,p_from date default null,p_until date default null,p_page integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; first_day date; last_day date; result jsonb;
begin
 if not public.is_active_user() or (p_student is not null and p_student<>auth.uid() and not public.is_admin()) then raise exception 'Account unavailable'using errcode='42501';end if;
 uid=case when public.is_admin()then p_student else auth.uid()end;
 first_day=coalesce(p_from,(now() at time zone 'Asia/Tashkent')::date-30);last_day=coalesce(p_until,(now() at time zone 'Asia/Tashkent')::date+1);
 if last_day<first_day or last_day-first_day>31 or p_page is null or p_page not between 0 and 100000 then raise exception 'Choose up to 31 days';end if;
 with scheduled as materialized(select * from public.daily_scheduled(uid,p_template,first_day,last_day) union select i.template_id,i.student_id,i.study_date,i.version_id,i.opens_at,i.due_at from public.daily_homework_instances i where(uid is null or i.student_id=uid)and(p_template is null or i.template_id=p_template)and i.study_date between first_day and last_day),ordered as materialized(
 select d.* from scheduled d join public.daily_homework_versions v on v.id=d.version_id
 order by d.study_date desc,v.data->>'title',d.student_id,d.template_id limit 50 offset p_page*50
 ),all_rows as(
 select d.template_id,d.student_id,d.study_date,d.version_id,d.opens_at,d.due_at,i.id,i.session_id,i.started_at,i.completed_at,i.completed_late,s.submitted_at session_submitted_at,coalesce(s.elapsed_seconds,i.active_seconds,0)active_seconds,coalesce(i.attempts,0)attempts,coalesce(i.correct,0)correct,case when i.session_id is not null and i.completed_at is null then (select count(*)::int from public.book_practice_items pi where pi.session_id=i.session_id and pi.selected_answer is not null) else coalesce(i.answered,0) end answered,p.display_name,t.state,t.timezone,v.data->>'title' title,v.data->>'instructions' instructions,(v.data->>'count')::int question_count,(v.data->>'allowLate')::boolean allow_late,
 timezone(t.timezone,now())::date=d.study_date is_today,
 case when i.completed_at is not null then case when i.completed_late then 'Completed late'else 'Completed'end when now()>=d.due_at then 'Missed'when s.submitted_at is not null then 'Incomplete'when i.started_at is not null then 'In progress'else 'Not started'end status
 from ordered d join public.daily_homework_templates t on t.id=d.template_id join public.daily_homework_versions v on v.id=d.version_id join public.profiles p on p.id=d.student_id left join public.daily_homework_instances i on i.template_id=d.template_id and i.student_id=d.student_id and i.study_date=d.study_date left join public.book_practice_sessions s on s.id=i.session_id),paged as(select * from all_rows order by study_date desc,title,student_id,template_id )
 select jsonb_build_object('total',(select count(*)from scheduled),'rows',coalesce(jsonb_agg(to_jsonb(paged)),'[]'))into result from paged;
 return result;
end;$$;
create index daily_window_range_idx on public.daily_homework_windows(template_id,from_date,until_date);
notify pgrst,'reload schema';
commit;
