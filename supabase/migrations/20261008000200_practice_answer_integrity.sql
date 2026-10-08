begin;
-- Per-item optimistic concurrency: unrelated questions may save independently.
-- This counter also changes for legacy saves/checks, so they cannot evade CAS.
alter table public.book_practice_items add column answer_revision bigint not null default 0 check(answer_revision>=0);
create function public.practice_answer_revision() returns trigger
language plpgsql set search_path='' as $$begin
 if row(new.selected_answer,new.selected_response,new.marked,new.eliminated)
 is distinct from row(old.selected_answer,old.selected_response,old.marked,old.eliminated)
 then new.answer_revision:=old.answer_revision+1; else new.answer_revision:=old.answer_revision;end if;
 return new;
end;$$;
revoke all on function public.practice_answer_revision() from public,anon,authenticated;
create trigger practice_answer_revision before update on public.book_practice_items for each row execute function public.practice_answer_revision();

-- Recurring work keeps the occurrence's frozen late policy. A saved URL must
-- not bypass the deadline that start/finish already enforce.
create or replace function public.can_access_homework_session(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.homework_attempts ha join public.homework_assignments a on a.id=ha.assignment_id join public.book_practice_sessions s on s.id=ha.session_id where ha.session_id=p_session and not a.active and s.submitted_at is null)
 and not exists(select 1 from public.daily_homework_instances d join public.daily_homework_versions v on v.id=d.version_id join public.book_practice_sessions s on s.id=d.session_id where d.session_id=p_session and s.submitted_at is null and now()>=d.due_at and not (v.data->>'allowLate')::boolean);
$$;

create function public.persist_practice_changes(p_session uuid,p_changes jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions;i public.book_practice_items;c jsonb;cleaned jsonb:='[]';ids uuid[]:='{}';expected bigint;identical boolean;
begin
 perform public.lock_homework_session(p_session);
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501';end if;
 if not public.can_access_homework_session(p_session) then raise exception 'Assignment unavailable' using errcode='42501';end if;
 if s.submitted_at is not null then raise exception 'Submitted answers cannot change';end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes)>500 then raise exception 'Invalid answers';end if;
 for c in select value from jsonb_array_elements(p_changes) loop
 if jsonb_typeof(c) is distinct from 'object' or exists(select 1 from jsonb_object_keys(c) k where k not in('id','expected_revision','selected_answer','selected_response','marked','eliminated')) then raise exception 'Invalid answer fields';end if;
 if jsonb_typeof(c->'expected_revision') is distinct from 'number' or (c->>'expected_revision') !~ '^[0-9]{1,15}$' then raise exception 'Answer version required. Refresh the application before saving.';end if;
 expected:=(c->>'expected_revision')::bigint;
 select * into i from public.book_practice_items where id=(c->>'id')::uuid and session_id=s.id;
 if i.id is null then raise exception 'Homework questions changed. Reload and review your recovered answers.' using errcode='40001';end if;
 if i.id=any(ids) then raise exception 'Duplicate answer';end if;ids:=array_append(ids,i.id);
 if i.question->>'question_type' is distinct from 'open' and c ? 'selected_response' then raise exception 'Unexpected open response';end if;
 -- Omitted fields are a patch, never an implicit instruction to clear answers.
 c:=jsonb_build_object('id',i.id,'selected_answer',i.selected_answer,'marked',i.marked,'eliminated',i.eliminated)
 ||case when i.question->>'question_type'='open' then jsonb_build_object('selected_response',i.selected_response) else '{}'::jsonb end||c;
 identical:=(c->'selected_answer') is not distinct from coalesce(to_jsonb(i.selected_answer),'null')
 and (not(c ? 'selected_response') or (c->'selected_response') is not distinct from coalesce(to_jsonb(i.selected_response),'null'))
 and (not(c ? 'marked') or c->'marked'=to_jsonb(i.marked))
 and (not(c ? 'eliminated') or c->'eliminated'=to_jsonb(i.eliminated));
 if expected<>i.answer_revision and not coalesce(identical,false) then
 raise exception 'Answers changed in another tab. Reload and review your recovered answers.' using errcode='40001';end if;
 if not coalesce(identical,false) then cleaned:=cleaned||jsonb_build_array(c-'expected_revision');end if;
 end loop;
 if jsonb_array_length(cleaned)>0 then perform public.save_book_practice_before_homework_access(p_session,cleaned);end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'answer_revision',answer_revision)) from public.book_practice_items where session_id=s.id and id=any(ids)),'[]');
end;$$;
revoke all on function public.persist_practice_changes(uuid,jsonb) from public,anon,authenticated;
create function public.save_practice_changes(p_session uuid,p_changes jsonb) returns jsonb
language sql security definer set search_path='' as $$select public.persist_practice_changes(p_session,p_changes);$$;
-- Keep one guarded implementation. Older callers receive a version error rather
-- than blindly overwriting answers saved by a refreshed client.
create or replace function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void
language plpgsql security definer set search_path='' as $$begin
 perform public.persist_practice_changes(p_session_id,p_answers);
end;$$;
revoke all on function public.save_practice_changes(uuid,jsonb),public.save_book_practice(uuid,jsonb) from public,anon;
grant execute on function public.save_practice_changes(uuid,jsonb),public.save_book_practice(uuid,jsonb) to authenticated;

-- Check must grade the acknowledged answer, not overwrite a newer answer from
-- another tab. Preserve existing immutable/idempotent attempt behavior.
do $$declare signature text;definition text;needle text:='select count(*)+1,coalesce(max(active_seconds),0)';guard text;begin
 foreach signature in array array['check_bank_answer(uuid,uuid,integer,uuid)','check_book_practice_answer(uuid,uuid,integer,uuid)','check_bank_response(uuid,uuid,text,uuid)','check_book_practice_response(uuid,uuid,text,uuid)'] loop
 definition:=pg_get_functiondef(('public.'||signature)::regprocedure);
 guard:=case when signature like '%response%' then 'if i.answer_revision>0 and i.selected_response is distinct from p_response then raise exception ''Save the current answer before Check. An answer changed in another tab.'' using errcode=''40001'';end if;'
 else 'if i.answer_revision>0 and i.selected_answer is distinct from p_choice then raise exception ''Save the current answer before Check. An answer changed in another tab.'' using errcode=''40001'';end if;' end;
 if position(needle in definition)=0 then raise exception 'Check definition changed; review the answer-version guard';end if;
 execute replace(definition,needle,guard||chr(10)||needle);
 end loop;
end;$$;

-- A withdrawn in-progress assignment must reject time writes too.
create or replace function public.practice_heartbeat(p_session uuid,p_position integer,p_seconds integer default 0) returns integer
language plpgsql security definer set search_path='' as $$declare s public.book_practice_sessions;credited integer;begin
 perform public.lock_homework_session(p_session);
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() or not public.can_access_homework_session(p_session) then raise exception 'Session unavailable' using errcode='42501';end if;
 if s.submitted_at is not null then return s.elapsed_seconds;end if;
 if p_position is null or not exists(select 1 from public.book_practice_items where session_id=s.id and position=p_position) or p_seconds is null or p_seconds<0 then raise exception 'Invalid heartbeat';end if;
 credited=least(p_seconds,120,greatest(0,floor(extract(epoch from clock_timestamp()-s.last_heartbeat))::int));
 update public.book_practice_items set active_seconds=active_seconds+credited where session_id=s.id and position=p_position and solved_at is null;
 if not found then credited=0;end if;
 update public.book_practice_sessions set current_position=p_position,elapsed_seconds=elapsed_seconds+credited,last_heartbeat=case when p_seconds>0 then clock_timestamp() else last_heartbeat end where id=s.id;
 return s.elapsed_seconds+credited;
end;$$;
-- Read-only administrators need the same submitted open-response review as owners.
create or replace function public.book_practice_open_review(p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session and (student_id=auth.uid() or public.is_admin()) and kind in('book','bank','homework') and submitted_at is not null and public.is_active_user()) then raise exception 'Submit your own book practice first' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',k.item_id,'accepted_answers',case when k.answer_format='numeric-range' and jsonb_array_length(k.accepted_answers)=0 and k.correct_answer is not null then jsonb_build_array(k.correct_answer) else k.accepted_answers end,'correct_answer',k.correct_answer,'answer_format',k.answer_format,'accepted_range',k.accepted_range)) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session),'[]');
end;$$;
-- Picker eligibility must not admit ordinary questions without a valid key.
create or replace function public.refresh_bank_eligibility(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare q public.questions; packaged boolean; ordinary boolean; approved boolean; clear_review boolean; ui boolean;
begin
 select * into q from public.questions where id=p_id;
 if q.id is null then return;end if;
 ui:=public.question_answer_ui_supported(to_jsonb(q));
 approved:=exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and r.status='approved');
 clear_review:=not exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and (r.status<>'approved' or r.warnings @> '["Possible duplicate"]'));
 packaged:=q.import_metadata->>'package_question_id' is not null
 and exists(select 1 from public.book_topics t join public.book_import_packages p on p.book_id=t.book_id where t.id=q.topic_id)
 and approved and exists(select 1 from public.question_answers a where a.question_id=q.id and
 (q.question_type='mcq' and a.correct_answer between 0 and 3 or q.question_type='open' and exists(select 1 from public.book_open_answers o where o.question_id=q.id)));
 ordinary:=exists(select 1 from public.question_answers a where a.question_id=q.id and a.correct_answer between 0 and 3) and q.question_type='mcq' and jsonb_array_length(q.options)=4 and coalesce(q.import_metadata->>'options_verified','true')<>'false'
 and not exists(select 1 from jsonb_array_elements_text(q.options) o where btrim(o)='' or o ~* '^\s*Choice [A-D] in the source image\s*$')
 and (select count(distinct lower(btrim(o))) from jsonb_array_elements_text(q.options) o)=4;
 insert into public.question_bank_eligibility values(q.id,coalesce(ui and(packaged or ordinary),false),coalesce(ui and(packaged or(ordinary and(q.import_metadata='{}'::jsonb or approved)and clear_review)),false))
 on conflict(question_id) do update set admin_ready=excluded.admin_ready,student_ready=excluded.student_ready;
end;$$;
select public.refresh_bank_eligibility(id) from public.questions;
commit;
