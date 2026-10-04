begin;
-- Internal projection shared by reports; no browser execution and no frozen keys.
create function public.daily_homework_rows(p_student uuid,p_template uuid,p_from date,p_until date)
returns table(template_id uuid,student_id uuid,study_date date,timezone text,is_today boolean,question_count int,answered int,correct int,active_seconds int,completed_at timestamptz,on_time boolean,expired boolean)
language sql stable security definer set search_path='' as $$
 with scheduled as (
 select * from public.daily_scheduled(p_student,p_template,p_from,p_until)
 union select i.template_id,i.student_id,i.study_date,i.version_id,i.opens_at,i.due_at from public.daily_homework_instances i where(p_student is null or i.student_id=p_student)and(p_template is null or i.template_id=p_template)and i.study_date between p_from and p_until)
 select d.template_id,d.student_id,d.study_date,t.timezone,timezone(t.timezone,now())::date=d.study_date,(v.data->>'count')::int,coalesce(i.answered,0),coalesce(i.correct,0),coalesce(s.elapsed_seconds,i.active_seconds,0),i.completed_at,coalesce(not i.completed_late and i.completed_at is not null,false),now()>=d.due_at
 from scheduled d join public.daily_homework_templates t on t.id=d.template_id join public.daily_homework_versions v on v.id=d.version_id left join public.daily_homework_instances i on i.template_id=d.template_id and i.student_id=d.student_id and i.study_date=d.study_date left join public.book_practice_sessions s on s.id=i.session_id;
$$;
create function public.daily_homework_report(p_student uuid default null,p_template uuid default null,p_from date default null,p_until date default null,p_page int default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid; first_day date;last_day date;result jsonb;
begin
 if not public.is_active_user() or(p_student is not null and p_student<>auth.uid() and not public.is_admin())then raise exception 'Account unavailable'using errcode='42501';end if;
 uid=case when public.is_admin()then p_student else auth.uid()end;
 first_day=coalesce(p_from,(now() at time zone 'Asia/Tashkent')::date-30);last_day=coalesce(p_until,(now() at time zone 'Asia/Tashkent')::date+1);
 if last_day<first_day or last_day-first_day>31 or p_page is null or p_page not between 0 and 100000 then raise exception 'Choose up to 31 days';end if;
 with rows as materialized(select * from public.daily_homework_rows(uid,p_template,first_day,last_day)),
 today as(select template_id,count(*) assigned,count(*)filter(where completed_at is not null)completed from rows where is_today group by template_id),
 history as(select study_date,count(*) assigned,count(*)filter(where completed_at is not null)completed,count(*)filter(where completed_at is not null and not on_time)late,count(*)filter(where expired and completed_at is null)missed,round(100.0*sum(correct)filter(where completed_at is not null)/nullif(sum(question_count)filter(where completed_at is not null),0),1)accuracy,round(avg(active_seconds)filter(where completed_at is not null))average_seconds from rows group by study_date),
 students as(select r.student_id,p.display_name,count(*) assigned,count(*)filter(where completed_at is not null)completed,count(*)filter(where expired and completed_at is null)missed,round(100.0*count(*)filter(where completed_at is not null)/nullif(count(*)filter(where expired or completed_at is not null),0),1)completion_rate,round(100.0*sum(correct)filter(where completed_at is not null)/nullif(sum(question_count)filter(where completed_at is not null),0),1)accuracy,round(avg(active_seconds)filter(where completed_at is not null))average_seconds from rows r join public.profiles p on p.id=r.student_id group by r.student_id,p.display_name),
 paged as(select * from students order by display_name,student_id limit 50 offset p_page*50)
 select jsonb_build_object('today',coalesce((select jsonb_agg(to_jsonb(today))from today),'[]'),'history',coalesce((select jsonb_agg(to_jsonb(history)order by study_date desc)from history),'[]'),'students',coalesce((select jsonb_agg(to_jsonb(paged))from paged),'[]'),'student_total',(select count(*)from students))into result;
 return result;
end;$$;
revoke all on function public.daily_homework_rows(uuid,uuid,date,date),public.daily_homework_report(uuid,uuid,date,date,integer)from public,anon,authenticated;
grant execute on function public.daily_homework_report(uuid,uuid,date,date,integer)to authenticated;
commit;
