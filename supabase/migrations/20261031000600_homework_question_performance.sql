begin;
create function public.homework_question_performance(p_homework uuid,p_day date default null,p_page integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare report jsonb; result jsonb;
begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 if p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid performance page';end if;
 report:=public.admin_homework_results(p_homework,p_day);
 with sessions as materialized(
 select distinct (value->>'session_id')::uuid id from jsonb_array_elements(report->'rows')
 where value->>'session_id' is not null and value->>'completed_at' is not null
 ), items as materialized(
 select i.*,f.correct first_correct,f.first_known,
 (i.selected_answer is not null or nullif(btrim(i.selected_response),'')is not null) answered
 from sessions s join public.book_practice_items i on i.session_id=s.id
 left join lateral(select e.correct,e.first_known from public.practice_grade_events e where e.item_id=i.id and e.source<>'review'order by e.created_at,e.id limit 1)f on true
 ), grouped as(
 select coalesce(question->>'id',id::text) question_id,min(position)+1 position,
 max(question->>'section') section,max(question->>'domain') domain,max(question->>'skill') skill,max(question->>'difficulty') difficulty,
 count(*) samples,count(*)filter(where answered and first_known and first_correct is not null) known,
 count(*)filter(where answered and first_known and first_correct) correct,
 count(*)filter(where not answered) skipped,
 count(*)filter(where answered and (not coalesce(first_known,false)or first_correct is null)) unknown,
 count(*)filter(where active_seconds>0) timing_samples,
 round(avg(active_seconds)filter(where active_seconds>0),1) average_seconds,
 percentile_cont(0.5)within group(order by active_seconds)filter(where active_seconds>0) median_seconds
 from items group by coalesce(question->>'id',id::text)
 ), rows as(select *,round(100.0*correct/nullif(known,0),1)accuracy from grouped order by position,question_id limit 100 offset p_page*100)
 select jsonb_build_object('completed_sessions',(select count(*)from sessions),'total_questions',(select count(*)from grouped),'page',p_page,
 'rows',coalesce((select jsonb_agg(to_jsonb(rows)order by position,question_id)from rows),'[]')) into result;
 return result;
end;$$;
revoke all on function public.homework_question_performance(uuid,date,integer)from public,anon;
grant execute on function public.homework_question_performance(uuid,date,integer)to authenticated;
commit;
