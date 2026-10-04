begin;
create function public.daily_homework_statistics(p_student uuid default null)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid());first_day date;result jsonb;
begin
 if not public.is_active_user() or(uid<>auth.uid() and not public.is_admin())then raise exception 'Account unavailable'using errcode='42501';end if;
 select min(scheduled_day)into first_day from(select from_date as scheduled_day from public.daily_homework_enrollments where student_id=uid union all select study_date from public.daily_homework_instances where student_id=uid)d;
 with rows as materialized(select * from public.daily_homework_rows(uid,null,coalesce(first_day,current_date),(now()at time zone 'UTC')::date+1)),
 days as(select study_date,bool_and(on_time)good,bool_or(expired and completed_at is null)missed from rows group by study_date having bool_or(expired)or bool_and(completed_at is not null)),
 numbered as(select *,sum(case when good then 0 else 1 end)over(order by study_date)run from days),
 runs as(select run,count(*)length from numbered where good group by run)
 select jsonb_build_object('assigned',(select count(*)from rows),'completed',(select count(*)from rows where completed_at is not null),'completion_rate',(select round(100.0*count(*)filter(where completed_at is not null)/nullif(count(*)filter(where expired or completed_at is not null),0),1)from rows),'missed_days',(select count(*)from days where missed),'current_streak',coalesce((select count(*)from numbered where good and run=(select max(run)from numbered)),0),'longest_streak',coalesce((select max(length)from runs),0),'accuracy',(select round(100.0*sum(correct)/nullif(sum(question_count),0),1)from rows where completed_at is not null),'average_seconds',(select round(avg(active_seconds))from rows where completed_at is not null))into result;
 return result;
end;$$;
revoke all on function public.daily_homework_statistics(uuid)from public,anon,authenticated;
grant execute on function public.daily_homework_statistics(uuid)to authenticated;
-- Allowing reuse must still prefer never-assigned questions until the pool is exhausted.
do $$declare definition text;needle text;replacement text;begin
 definition=pg_get_functiondef('public.start_daily_homework(uuid,date)'::regprocedure);
 needle='order by case when exists(select 1 from public.book_practice_items';
 replacement='order by case when exists(select 1 from public.daily_homework_instances di where di.template_id=p_template and di.student_id=auth.uid() and(value->>''id'')::uuid=any(di.question_ids))then 1 else 0 end, case when exists(select 1 from public.book_practice_items';
 if position(needle in definition)=0 then raise exception 'Daily selector definition changed; review before deployment';end if;
 execute replace(definition,needle,replacement);
end;$$;
commit;
