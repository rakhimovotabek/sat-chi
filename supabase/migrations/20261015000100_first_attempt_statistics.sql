begin;

-- Checks already form an immutable, idempotent event log. Add the equivalent
-- evidence for submission and manual adjudication without changing any answers.
create table public.practice_grade_events (
 id bigint generated always as identity primary key,
 item_id uuid not null references public.book_practice_items on delete cascade,
 source text not null check(source in ('submission','legacy','review')),
 selected_answer integer, selected_response text, correct boolean,
 first_known boolean not null,
 created_at timestamptz not null default clock_timestamp()
);
create unique index practice_submission_event_idx on public.practice_grade_events(item_id) where source in ('submission','legacy');
create index practice_grade_item_idx on public.practice_grade_events(item_id,created_at,id);
create index practice_canonical_question_idx on public.book_practice_items((question->>'id'),session_id);
alter table public.practice_grade_events enable row level security;
revoke all on public.practice_grade_events from public,anon,authenticated;

-- A final legacy snapshot is evidence of a result, not proof of its first
-- outcome. Even a correct legacy snapshot must not become first-time correct.
insert into public.practice_grade_events(item_id,source,selected_answer,selected_response,correct,first_known,created_at)
select i.id,'legacy',i.selected_answer,i.selected_response,i.correct,false,coalesce(s.submitted_at,s.started_at)
from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
where s.kind in ('book','bank','homework') and (s.submitted_at is not null or i.correct is not null)
and (i.selected_answer is not null or nullif(btrim(i.selected_response),'') is not null)
and not exists(select 1 from public.question_check_attempts a where a.item_id=i.id);

insert into public.practice_grade_events(item_id,source,selected_answer,selected_response,correct,first_known,created_at)
select i.id,'review',i.selected_answer,i.selected_response,coalesce(r.review_correct,r.automatic_correct),false,r.reviewed_at
from public.practice_open_reviews r join public.book_practice_items i on i.id=r.item_id;

create function public.capture_practice_submission() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.submitted_at is not null and old.submitted_at is null and new.kind in ('book','bank','homework') then
 insert into public.practice_grade_events(item_id,source,selected_answer,selected_response,correct,first_known,created_at)
 select i.id,'submission',i.selected_answer,i.selected_response,i.correct,true,new.submitted_at
 from public.book_practice_items i where i.session_id=new.id
 and (i.selected_answer is not null or nullif(btrim(i.selected_response),'') is not null)
 on conflict do nothing;
 end if;
 return null;
end;$$;
create trigger learning_capture_submission after update of submitted_at on public.book_practice_sessions
for each row execute function public.capture_practice_submission();

create function public.capture_practice_review() returns trigger
language plpgsql security definer set search_path='' as $$begin
 insert into public.practice_grade_events(item_id,source,selected_answer,selected_response,correct,first_known)
 select i.id,'review',i.selected_answer,i.selected_response,coalesce(new.review_correct,new.automatic_correct),false
 from public.book_practice_items i where i.id=new.item_id;
 return null;
end;$$;
create trigger learning_capture_review after insert or update on public.practice_open_reviews
for each row execute function public.capture_practice_review();

-- Private, owner-indexed canonical facts. Retries and sessions are grouped by
-- question identity; missing identities stay distinct instead of being merged.
-- p_kind scopes practice-channel reports; global reports leave it null.
create function public.learning_question_facts(p_student uuid,p_kind text default null)
returns table(question_id text,question jsonb,item_id uuid,session_id uuid,
 attempted boolean,checked boolean,first_correct boolean,first_at timestamptz,
 last_at timestamptz,eventually_correct boolean,now_correct boolean,
 pending boolean,attempts bigint,active_seconds bigint,marked boolean)
language sql stable security definer set search_path='' as $$
 with owned as materialized (
 select i.*,s.submitted_at,s.started_at,coalesce(nullif(i.question->>'id',''),i.id::text) canonical
 from public.book_practice_sessions s join public.book_practice_items i on i.session_id=s.id
 where s.student_id=p_student and s.kind in ('book','bank','homework') and (p_kind is null or s.kind=p_kind)
 ), events as materialized (
 select i.canonical,i.id item_id,a.correct,true known,a.created_at,a.attempt_order::bigint ordinal,0 priority
 from owned i join public.question_check_attempts a on a.item_id=i.id
 union all
 select i.canonical,i.id,e.correct,e.first_known,e.created_at,e.id,case when e.source='review' then 2 else 1 end
 from owned i join public.practice_grade_events e on e.item_id=i.id
 ), first_event as (
 select distinct on(canonical) canonical,correct,known,created_at from events
 where priority<>2 order by canonical,created_at,priority,ordinal,item_id
 ), latest_event as (
 select distinct on(canonical) canonical,correct,created_at,item_id from events
 order by canonical,created_at desc,priority desc,ordinal desc,item_id
 ), latest_item as (
 select distinct on(i.canonical) i.* from owned i left join latest_event e on e.canonical=i.canonical
 order by i.canonical,(i.id=e.item_id) desc,i.started_at desc,i.id
 ), totals as (
 select canonical,bool_or(has_answered or selected_answer is not null or nullif(btrim(selected_response),'') is not null) attempted,
 sum(active_seconds)::bigint active_seconds,bool_or(marked) marked from owned group by canonical
 ), event_totals as (
 select canonical,bool_or(correct) eventually_correct,count(*)filter(where priority=0 or(priority=1 and known and not exists(
 select 1 from public.question_check_attempts a where a.item_id=events.item_id))) attempts from events group by canonical
 )
 select i.canonical,i.question,i.id,i.session_id,t.attempted or f.canonical is not null,
 f.canonical is not null,case when f.known then f.correct end,f.created_at,
 e.created_at,coalesce(et.eventually_correct,false),e.correct,
 e.canonical is not null and e.correct is null and i.question->>'question_type'='open',
 coalesce(et.attempts,0),t.active_seconds,t.marked
 from latest_item i join totals t on t.canonical=i.canonical
 left join first_event f on f.canonical=i.canonical left join latest_event e on e.canonical=i.canonical
 left join event_totals et on et.canonical=i.canonical;
$$;

create function public.learning_fact_totals(p_student uuid,p_kind text default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('attempted',count(*)filter(where attempted),'checked',count(*)filter(where checked),
 'first_correct',count(*)filter(where first_correct),'first_incorrect',count(*)filter(where not first_correct),
 'first_known',count(first_correct),'first_unknown',count(*)filter(where checked and first_correct is null),
 'first_accuracy',round(100.0*count(*)filter(where first_correct)/nullif(count(first_correct),0),1),
 'correct',count(*)filter(where first_correct),'incorrect',count(*)filter(where not first_correct),
 'eventually_correct',count(*)filter(where eventually_correct),'now_correct',count(*)filter(where now_correct),
 'still_incorrect',count(*)filter(where now_correct=false),'pending',count(*)filter(where pending),
 'accuracy_partial',count(*)filter(where checked and first_correct is null)>0)
 from public.learning_question_facts(p_student,p_kind);
$$;

-- Keep existing vocabulary, groups, homework, activity and streak contracts.
alter function public.learning_metrics(uuid) rename to learning_metrics_before_first_attempt;
revoke all on function public.learning_metrics_before_first_attempt(uuid) from public,anon,authenticated;
create function public.learning_metrics(p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid()); result jsonb; facts jsonb; breakdown jsonb; attention jsonb; zone text;
begin
 result:=public.learning_metrics_before_first_attempt(uid); -- established authorization boundary
 select coalesce((select timezone from public.study_preferences where student_id=uid),'UTC') into zone;
 with f as materialized(select * from public.learning_question_facts(uid))
 select jsonb_build_object('today',count(*)filter(where attempted and timezone(zone,first_at)::date=timezone(zone,now())::date),
 'recent_attempted',count(*)filter(where first_correct is not null and first_at>=now()-interval '14 days'),
 'recent_correct',count(*)filter(where first_correct and first_at>=now()-interval '14 days')) into facts from f;
 with f as materialized(select * from public.learning_question_facts(uid))
 select coalesce(jsonb_agg(to_jsonb(b)),'[]') into breakdown from (
 select question->>'section' section,question->>'domain' domain,question->>'skill' skill,question->>'difficulty' difficulty,
 question->>'source' source,count(*)filter(where attempted) attempted,count(first_correct) first_known,
 count(*)filter(where checked and first_correct is null) first_unknown,count(*)filter(where first_correct) correct,
 count(*)filter(where first_correct=false) incorrect,count(*)filter(where eventually_correct) eventually_correct
 from f where attempted group by 1,2,3,4,5)b;
 select coalesce(jsonb_agg(to_jsonb(a)),'[]') into attention from (
 select question->>'section' section,question->>'domain' domain,count(first_correct) attempted,count(*)filter(where first_correct) correct
 from public.learning_question_facts(uid) where first_at>=now()-interval '30 days' and nullif(question->>'domain','') is not null
 group by 1,2 having count(first_correct)>=10)a;
 return result||public.learning_fact_totals(uid)||facts||jsonb_build_object('breakdowns',breakdown,'attention',attention);
end;$$;
revoke all on function public.learning_metrics(uuid) from public,anon;
grant execute on function public.learning_metrics(uuid) to authenticated;

alter function public.practice_analytics(uuid) rename to practice_analytics_before_first_attempt;
revoke all on function public.practice_analytics_before_first_attempt(uuid) from public,anon,authenticated;
create function public.practice_analytics(p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid()); result jsonb; totals jsonb; areas jsonb;
begin
 result:=public.practice_analytics_before_first_attempt(uid); -- retain detailed activity contract and authorization
 totals:=public.learning_fact_totals(uid,'bank');
 select coalesce(jsonb_agg(to_jsonb(a)),'[]') into areas from (
 select g.level,g.label,count(first_correct) samples,count(first_correct) unique_questions,
 round(100.0*count(*)filter(where first_correct)/nullif(count(first_correct),0),1) first_accuracy,
 round(100.0*count(*)filter(where eventually_correct)/nullif(count(*),0),1) eventual_accuracy,
 round(avg(attempts),2) attempts,round(avg(active_seconds),1) seconds,
 count(*)filter(where first_correct=false) wrong,count(*)filter(where marked) review_marks
 from public.learning_question_facts(uid,'bank') f cross join lateral(values
 ('section',question->>'section'),('domain',question->>'domain'),('skill',question->>'skill'))g(level,label)
 where checked and nullif(g.label,'') is not null and first_at>=now()-interval '90 days'
 group by 1,2 having count(first_correct)>=10)a;
 return result||totals||jsonb_build_object('practiced',(totals->>'checked')::bigint,
 'solved',(totals->>'eventually_correct')::bigint,'unresolved',(totals->>'checked')::bigint-(totals->>'eventually_correct')::bigint,
 'eventual_accuracy',round(100.0*(totals->>'eventually_correct')::bigint/nullif((totals->>'checked')::bigint,0),1),'areas',areas);
end;$$;
revoke all on function public.practice_analytics(uuid) from public,anon;
grant execute on function public.practice_analytics(uuid) to authenticated;

-- Keep the materialized ranking and its existing concurrency serialization.
alter table public.learning_standing_totals add column first_known bigint not null default 0,
 add column first_incorrect bigint not null default 0,add column eventually_correct bigint not null default 0;
create or replace function public.refresh_learning_standing(p_student uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.profiles where id=p_student for no key update;
 if not found then return;end if;
 insert into public.learning_standing_totals(student_id,questions,correct,first_known,first_incorrect,eventually_correct,study_seconds,homework)
 select p_student,count(*)filter(where checked),count(*)filter(where first_correct),count(first_correct),
 count(*)filter(where first_correct=false),count(*)filter(where eventually_correct),
 (select coalesce(sum(elapsed_seconds),0)from public.book_practice_sessions where student_id=p_student and kind in('book','bank','homework')),
 (select count(*)from public.book_practice_sessions where student_id=p_student and kind='homework' and submitted_at is not null)
 from public.learning_question_facts(p_student)
 on conflict(student_id)do update set questions=excluded.questions,correct=excluded.correct,first_known=excluded.first_known,
 first_incorrect=excluded.first_incorrect,eventually_correct=excluded.eventually_correct,study_seconds=excluded.study_seconds,homework=excluded.homework;
end;$$;
create or replace function public.learning_standings(p_group boolean default true) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(r))from(select p.id,p.display_name,
 coalesce(t.questions,0)questions,coalesce(t.correct,0)correct,coalesce(t.first_known,0)first_known,
 coalesce(t.first_incorrect,0)first_incorrect,coalesce(t.questions-t.first_known,0)first_unknown,
 coalesce(t.eventually_correct,0)eventually_correct,coalesce(t.study_seconds,0)study_seconds,coalesce(t.homework,0)homework
 from public.profiles p left join public.learning_standing_totals t on t.student_id=p.id where p.active and p.role='student'
 and(not p_group or exists(select 1 from public.group_members mine join public.group_members theirs on mine.group_id=theirs.group_id where mine.student_id=auth.uid() and theirs.student_id=p.id))
 order by coalesce(t.questions,0)desc,p.id limit 100)r),'[]');
end;$$;
do $$declare uid uuid;begin for uid in select id from public.profiles where role='student' loop perform public.refresh_learning_standing(uid);end loop;end$$;

create or replace function public.book_practice_progress(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 return coalesce((with recursive tree as(
 select id root,id from public.book_topics where book_id=p_book
 union all select p.root,t.id from tree p join public.book_topics t on t.parent_id=p.id
 ), history as materialized(select * from public.learning_question_facts(auth.uid())), status as(
 select q.id,q.topic_id,h.attempted,h.checked,h.first_correct,h.eventually_correct,h.now_correct
 from public.questions q join public.book_topics t on t.id=q.topic_id
 join public.books b on b.id=t.book_id join public.question_bank_eligibility e on e.question_id=q.id
 left join history h on h.question_id=q.id::text
 where t.book_id=p_book and (b.published or public.is_admin())
 and case when public.is_admin() then e.admin_ready else e.student_ready end
 ), counts as(
 select tree.root topic_id,count(status.id)total,count(status.id)filter(where eventually_correct)solved,
 count(status.id)filter(where attempted)attempted,count(status.id)filter(where checked)checked,
 count(first_correct)first_known,count(status.id)filter(where first_correct)first_correct,
 count(status.id)filter(where first_correct=false)first_incorrect,
 count(status.id)filter(where checked and first_correct is null)first_unknown,
 round(100.0*count(status.id)filter(where first_correct)/nullif(count(first_correct),0),1)first_accuracy
 from tree left join status on status.topic_id=tree.id group by tree.root
 ) select jsonb_agg(to_jsonb(counts))from counts),'[]');
end;$$;

revoke all on function public.capture_practice_submission(),public.capture_practice_review(),
 public.learning_question_facts(uuid,text),public.learning_fact_totals(uuid,text),public.refresh_learning_standing(uuid) from public,anon,authenticated;
commit;
