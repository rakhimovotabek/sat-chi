begin;
-- Reuse the canonical selected exam date. Exam location has its own timezone;
-- changing it must not silently change study-day/deadline preferences.
alter table public.profiles add column exam_timezone text not null default 'UTC';
create function public.exam_countdown_settings()returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 return(select jsonb_build_object('date',target_test_date,'timezone',exam_timezone,
 'target',target_test_date::timestamp at time zone exam_timezone,'convention','Start of selected date (00:00), not an official exam start time')
 from public.profiles where id=auth.uid());
end;$$;
create function public.save_exam_countdown(p_date date,p_timezone text)returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not public.is_active_user()or not exists(select 1 from public.profiles where id=auth.uid()and role='student')then raise exception 'Active student required'using errcode='42501';end if;
 if p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone)then raise exception 'Choose a valid IANA exam timezone';end if;
 if p_date is not null and p_date<timezone(p_timezone,now())::date then raise exception 'Choose an upcoming exam date';end if;
 update public.profiles set target_test_date=p_date,exam_timezone=p_timezone where id=auth.uid();
 return public.exam_countdown_settings();
end;$$;

create function public.dashboard_study_activity()returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare zone text;today date;result jsonb;
begin
 if not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 select coalesce((select timezone from public.study_preferences where student_id=auth.uid()),'UTC')into zone;
 today:=timezone(zone,now())::date;
 with owned as materialized(select i.id,coalesce(nullif(i.question->>'id',''),i.id::text)question_id from public.book_practice_sessions s join public.book_practice_items i on i.session_id=s.id where s.student_id=auth.uid()and s.kind in('book','bank','homework')),
 events as(
 select o.question_id,timezone(zone,a.created_at)::date as study_day from owned o join public.question_check_attempts a on a.item_id=o.id where a.created_at>=now()-interval '8 days'
 union all select o.question_id,timezone(zone,e.created_at)::date from owned o join public.practice_grade_events e on e.item_id=o.id where e.source in('submission','legacy')and e.created_at>=now()-interval '8 days'
 ),days as(select d::date as study_day from generate_series(today-6,today,interval '1 day')d),counts as(
 select days.study_day,count(distinct e.question_id)questions from days left join events e on e.study_day=days.study_day group by days.study_day
 )select jsonb_build_object('timezone',zone,'days',jsonb_agg(jsonb_build_object('day',study_day,'questions',questions)order by study_day))into result from counts;
 return result||(select jsonb_build_object('recent_known',count(first_correct)filter(where first_at>=now()-interval '14 days'),
 'recent_correct',count(*)filter(where first_correct and first_at>=now()-interval '14 days'),
 'previous_known',count(first_correct)filter(where first_at>=now()-interval '28 days'and first_at<now()-interval '14 days'),
 'previous_correct',count(*)filter(where first_correct and first_at>=now()-interval '28 days'and first_at<now()-interval '14 days'))
 from public.learning_question_facts(auth.uid()));
end;$$;
revoke all on function public.exam_countdown_settings(),public.save_exam_countdown(date,text),public.dashboard_study_activity()from public,anon;
grant execute on function public.exam_countdown_settings(),public.save_exam_countdown(date,text),public.dashboard_study_activity()to authenticated;
commit;
