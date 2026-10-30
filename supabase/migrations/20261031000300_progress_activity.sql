begin;
-- Personal, bounded aggregates only. No answer text or cross-user identifiers.
create function public.progress_activity(p_days integer default 30,p_section text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare zone text; today date; result jsonb;
begin
 if auth.uid() is null or not public.is_active_user()then raise exception 'Active account required' using errcode='42501';end if;
 if p_days is null or p_days not in(7,30,90) or p_section is null or p_section not in('','Math','Reading & Writing')then raise exception 'Invalid progress scope';end if;
 select coalesce((select timezone from public.study_preferences where student_id=auth.uid()),'UTC')into zone;
 today:=timezone(zone,now())::date;
 with facts as materialized(
 select timezone(zone,first_at)::date activity_date,first_correct,eventually_correct
 from public.learning_question_facts(auth.uid())
 where checked and first_at is not null and (p_section=''or question->>'section'=p_section)
 and timezone(zone,first_at)::date between today-(p_days-1) and today
 ), days as(
 select activity_date::date activity_date,count(f.activity_date) questions,count(f.first_correct) known,
 count(*)filter(where f.first_correct) correct,
 count(*)filter(where f.first_correct=false and f.eventually_correct) corrected
 from generate_series(today-(p_days-1),today,interval '1 day') calendar(activity_date)
 left join facts f using(activity_date) group by activity_date
 )
 select jsonb_build_object('timezone',zone,'days',coalesce(jsonb_agg(jsonb_build_object(
 'day',activity_date,'questions',questions,'known',known,'correct',correct,'corrected',corrected,
 'accuracy',round(100.0*correct/nullif(known,0),1))order by activity_date),'[]'),
 'questions',sum(questions),'known',sum(known),'correct',sum(correct),'corrected',sum(corrected),
 'accuracy',round(100.0*sum(correct)/nullif(sum(known),0),1)) into result from days;
 return result;
end;$$;
revoke all on function public.progress_activity(integer,text) from public,anon;
grant execute on function public.progress_activity(integer,text) to authenticated;
commit;
