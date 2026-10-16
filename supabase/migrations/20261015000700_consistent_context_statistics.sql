begin;
-- An existing review's frozen automatic_correct is original-grade evidence
-- for an immutable submitted answer with no Check log. A final-only snapshot
-- without this evidence stays unknown. Original answers/reviews are untouched.
-- historical-evidence-start
update public.practice_grade_events e set correct=r.automatic_correct,first_known=true
from public.practice_open_reviews r where e.item_id=r.item_id and e.source='legacy'
and not e.first_known and not exists(select 1 from public.question_check_attempts a where a.item_id=e.item_id);
-- historical-evidence-end
-- Channel reports describe canonical history for questions actually attempted
-- in that channel. Opening a new context alone is not a fresh attempt, and the
-- first outcome must not restart when moving from Book Practice to the Bank.
do $$declare definition text;begin
 select pg_get_functiondef('public.learning_question_facts(uuid,text)'::regprocedure)into definition;
 definition:=replace(definition,'and (p_kind is null or s.kind=p_kind)','');
 definition:=replace(definition,'canonical,correct,known,created_at from events',
 'canonical,case when known and correct is null then (select e.correct from events e where e.item_id=events.item_id and e.priority=2 and e.correct is not null order by e.created_at,e.ordinal limit 1) else correct end correct,known,created_at from events');
 definition:=replace(definition,'left join event_totals et on et.canonical=i.canonical;',
 'left join event_totals et on et.canonical=i.canonical
 where p_kind is null or exists(select 1 from public.book_practice_sessions cs join public.book_practice_items ci on ci.session_id=cs.id
 where cs.student_id=p_student and cs.kind=p_kind and coalesce(nullif(ci.question->>''id'',''''),ci.id::text)=i.canonical
 and(ci.has_answered or ci.selected_answer is not null or nullif(btrim(ci.selected_response),'''')is not null
 or exists(select 1 from public.question_check_attempts ca where ca.item_id=ci.id)));');
 execute definition;
end;$$;

create function public.practice_session_statistics(p_session uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare s public.book_practice_sessions;begin
 select * into s from public.book_practice_sessions where id=p_session;
 if not public.is_active_user()or s.id is null or(s.student_id<>auth.uid()and not public.is_admin())
 or not public.can_access_homework_session(s.id)then raise exception 'Session unavailable'using errcode='42501';end if;
 return(with targets as(
 select distinct coalesce(nullif(question->>'id',''),id::text)question_id from public.book_practice_items where session_id=s.id
 and(selected_answer is not null or nullif(btrim(selected_response),'')is not null)
 ),facts as(select f.*from public.learning_question_facts(s.student_id)f join targets t on t.question_id=f.question_id)
 select jsonb_build_object('first_correct',count(*)filter(where first_correct),'first_incorrect',count(*)filter(where first_correct=false),
 'first_known',count(first_correct),'first_unknown',count(*)filter(where checked and first_correct is null),
 'first_accuracy',round(100.0*count(*)filter(where first_correct)/nullif(count(first_correct),0),1),
 'eventually_correct',count(*)filter(where eventually_correct))from facts);
end;$$;
revoke all on function public.practice_session_statistics(uuid)from public,anon;
grant execute on function public.practice_session_statistics(uuid)to authenticated;

alter function public.admin_homework_results(uuid,date)rename to admin_homework_results_before_first_history;
revoke all on function public.admin_homework_results_before_first_history(uuid,date)from public,anon,authenticated;
create function public.admin_homework_results(p_homework uuid,p_day date default null)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;rows jsonb;begin
 result:=public.admin_homework_results_before_first_history(p_homework,p_day);
 select coalesce(jsonb_agg(r||jsonb_build_object('question_history',case when r->>'session_id' is not null then public.practice_session_statistics((r->>'session_id')::uuid)else null end)),'[]')into rows from jsonb_array_elements(result->'rows')r;
 return result||jsonb_build_object('rows',rows);
end;$$;
revoke all on function public.admin_homework_results(uuid,date)from public,anon;
grant execute on function public.admin_homework_results(uuid,date)to authenticated;
commit;
