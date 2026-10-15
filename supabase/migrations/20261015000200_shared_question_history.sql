begin;
-- Prior activity is evidence, never copied into current answers or Homework.
create function public.practice_prior_progress(p_session uuid,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.book_practice_sessions;
begin
 select * into s from public.book_practice_sessions where id=p_session;
 if not public.is_active_user() or s.id is null or (s.student_id<>auth.uid() and not public.is_admin())
 or not public.can_access_homework_session(s.id) then raise exception 'Session unavailable' using errcode='42501';end if;
 if p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid history page';end if;
 return coalesce((with targets as materialized(
 select i.id,i.question->>'id' canonical from public.book_practice_items i where i.session_id=s.id
 order by i.position limit 1000 offset p_page*1000
 ), owned as materialized(
 select i.*,ps.kind,ps.started_at,ps.submitted_at,t.id target from targets t
 join public.book_practice_items i on i.question->>'id'=t.canonical
 join public.book_practice_sessions ps on ps.id=i.session_id
 where ps.student_id=s.student_id and ps.id<>s.id
 and (ps.kind in ('book','bank') or (ps.kind='homework' and ps.submitted_at is not null))
 ), events as materialized(
 select i.target,i.id item_id,a.selected_answer,a.selected_response,a.correct,a.created_at,true known,0 priority,a.attempt_order::bigint ordinal
 from owned i join public.question_check_attempts a on a.item_id=i.id
 union all
 select i.target,i.id,e.selected_answer,e.selected_response,e.correct,e.created_at,e.first_known,
 case when e.source='review' then 2 else 1 end,e.id from owned i join public.practice_grade_events e on e.item_id=i.id
 ), first_event as (
 select distinct on(target) target,case when known then correct end first_correct from events where priority<>2
 order by target,created_at,priority,ordinal,item_id
 ), latest as (
 select distinct on(target) * from events order by target,created_at desc,priority desc,ordinal desc,item_id
 ), drafts as (
 select distinct on(target) target,selected_answer,selected_response,started_at from owned
 where selected_answer is not null or nullif(btrim(selected_response),'')is not null
 order by target,started_at desc,id
 ), counts as(select target,bool_or(correct) eventually_correct,count(*) event_count from events group by target)
 select jsonb_agg(jsonb_build_object('item_id',t.id,'selected_answer',case when l.target is not null then l.selected_answer else d.selected_answer end,
 'selected_response',case when l.target is not null then l.selected_response else d.selected_response end,
 'checked',l.target is not null,'first_correct',f.first_correct,'correct',l.correct,
 'eventually_correct',coalesce(c.eventually_correct,false),'event_count',coalesce(c.event_count,0),'recorded_at',coalesce(l.created_at,d.started_at)))
 from targets t left join latest l on l.target=t.id left join first_event f on f.target=t.id
 left join drafts d on d.target=t.id left join counts c on c.target=t.id
 where l.target is not null or d.target is not null),'[]');
end;$$;

create function public.practice_history_events(p_session uuid,p_item uuid,p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s public.book_practice_sessions; canonical text;
begin
 select * into s from public.book_practice_sessions where id=p_session;
 if not public.is_active_user() or s.id is null or(s.student_id<>auth.uid() and not public.is_admin()) or not public.can_access_homework_session(s.id) then raise exception 'Session unavailable' using errcode='42501';end if;
 select question->>'id' into canonical from public.book_practice_items where session_id=s.id and id=p_item;
 if canonical is null or p_page is null or p_page not between 0 and 100000 then raise exception 'Question unavailable';end if;
 return (with owned as materialized(
 select i.id,ps.id session_id,ps.kind from public.book_practice_items i join public.book_practice_sessions ps on ps.id=i.session_id
 where i.question->>'id'=canonical and ps.student_id=s.student_id
 and (ps.kind in('book','bank') or(ps.kind='homework' and ps.submitted_at is not null))
 ), events as(
 select 'check:'||a.id id,o.session_id,o.kind,'check' source,a.selected_answer,a.selected_response,a.correct,true first_known,a.created_at,a.attempt_order::bigint ordinal
 from owned o join public.question_check_attempts a on a.item_id=o.id
 union all
 select 'grade:'||e.id,o.session_id,o.kind,e.source,e.selected_answer,e.selected_response,e.correct,e.first_known,e.created_at,e.id
 from owned o join public.practice_grade_events e on e.item_id=o.id
 ), paged as(select * from events order by created_at,case when source='check' then 0 when source='review' then 2 else 1 end,ordinal,id limit 50 offset p_page*50)
 select jsonb_build_object('total',(select count(*)from events),'rows',coalesce(jsonb_agg(to_jsonb(paged)-'ordinal'),'[]')) from paged);
end;$$;
revoke all on function public.practice_prior_progress(uuid,integer),public.practice_history_events(uuid,uuid,integer) from public,anon;
grant execute on function public.practice_prior_progress(uuid,integer),public.practice_history_events(uuid,uuid,integer) to authenticated;

-- Keep indexed source/publication/difficulty filters. Canonical status includes
-- unfinished checked practice and never depends solely on submitted sessions.
alter function public.bank_candidate_ids(jsonb) rename to bank_candidate_ids_before_shared_history;
revoke all on function public.bank_candidate_ids_before_shared_history(jsonb) from public,anon,authenticated;
create function public.bank_candidate_ids(p_filters jsonb) returns setof uuid
language plpgsql stable security definer set search_path='' as $$
declare status text:=coalesce(p_filters->>'status',''); marked_filter text:=coalesce(p_filters->>'marked','');
begin
 if status not in('','unanswered','attempted','correct','incorrect','corrected','marked') or marked_filter not in('','yes','no') then raise exception 'Invalid history filter';end if;
 if status='' and marked_filter='' then return query select * from public.bank_candidate_ids_before_shared_history(p_filters);return;end if;
 return query with history as materialized(select * from public.learning_question_facts(auth.uid()))
 select ids.id from public.bank_candidate_ids_before_shared_history(p_filters-'status'-'marked')ids(id)
 left join history h on h.question_id=ids.id::text
 where (marked_filter='' or coalesce(h.marked,false)=(marked_filter='yes'))
 and case status when '' then true when 'unanswered' then not coalesce(h.attempted,false)
 when 'attempted' then coalesce(h.attempted,false) when 'correct' then coalesce(h.now_correct,false)
 when 'incorrect' then h.now_correct=false when 'corrected' then h.first_correct=false and h.eventually_correct
 when 'marked' then coalesce(h.marked,false) else false end;
end;$$;
revoke all on function public.bank_candidate_ids(jsonb) from public,anon,authenticated;
grant execute on function public.bank_candidate_ids(jsonb) to service_role;
commit;
