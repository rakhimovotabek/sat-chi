begin;
-- Defer position uniqueness so active/inactive sections can be reordered in
-- one update without ever-growing offsets or transient unique violations.
alter table public.homework_sections drop constraint homework_sections_homework_id_position_key;
alter table public.homework_sections add constraint homework_sections_homework_id_position_key
 unique(homework_id,position) deferrable initially deferred;
-- One-time homework must support every answer type exposed by the picker.
alter table public.homework_questions alter column correct_answer drop not null;
alter table public.homework_questions add column open_key jsonb;
update public.homework_questions set open_key=public.homework_snapshot_open_key(question)
where question->>'question_type'='open';

-- Retain removed in-progress answers privately; completed sessions are immutable.
create table public.homework_item_history (
 id uuid primary key default gen_random_uuid(),
 assignment_id uuid not null references public.homework_assignments(id) on delete cascade,
 item jsonb not null, answer_key jsonb, open_key jsonb,
 archived_at timestamptz not null default now()
);
alter table public.homework_item_history enable row level security;
revoke all on public.homework_item_history from public,anon,authenticated;
grant select on public.homework_item_history to authenticated;
create policy homework_history_admin on public.homework_item_history for select to authenticated using((select public.is_admin()));
grant all on public.homework_item_history to service_role;

create function public.homework_candidates(sec jsonb)
returns table(question jsonb,correct_answer integer,explanation text,open_key jsonb)
language plpgsql security definer set search_path='' as $$
declare requested integer:=(sec->>'count')::integer; selected_ids uuid[]; candidate_ids uuid[];
begin
 if requested is null or requested not between 1 and 500 then raise exception 'Section count must be 1 to 500';end if;
 if sec ? 'questionIds' then
 if jsonb_typeof(sec->'questionIds') is distinct from 'array' then raise exception 'Question IDs must be an array';end if;
 select array_agg(distinct value::uuid) into selected_ids from jsonb_array_elements_text(sec->'questionIds');
 if coalesce(cardinality(selected_ids),0)<>requested or jsonb_array_length(sec->'questionIds')<>requested then
 raise exception 'Select exactly % distinct questions for section %',requested,sec->>'title';end if;
 end if;
 candidate_ids:=selected_ids;
 if candidate_ids is null then select array_agg(id) into candidate_ids from public.bank_candidate_ids(coalesce(sec->'filters','{}')) candidates(id);end if;
 return query
 select to_jsonb(q),a.correct_answer,coalesce(a.explanation,''),to_jsonb(o)-'question_id'
 from unnest(candidate_ids) candidates(id)
 join public.questions q on q.id=candidates.id
 join public.question_bank_eligibility e on e.question_id=q.id and e.student_ready
 join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id and b.published
 join public.question_answers a on a.question_id=q.id
 left join public.book_open_answers o on o.question_id=q.id
 where (selected_ids is null or q.id=any(selected_ids))
 and (q.question_type='mcq' and a.correct_answer between 0 and 3 or q.question_type='open' and o.question_id is not null)
 order by case when selected_ids is null then random() else 0 end,q.id limit requested;
end;$$;
revoke all on function public.homework_candidates(jsonb) from public,anon,authenticated;

create function public.sync_homework_sessions(p_homework uuid,p_assignment uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare attempt record; q record; item_id uuid; pos integer; retained uuid[]; offset_position integer; current_item uuid;
begin
 for attempt in select a.id assignment_id,s.id session_id from public.homework_assignments a
 join public.homework_attempts ha on ha.assignment_id=a.id
 join public.book_practice_sessions s on s.id=ha.session_id
 where a.homework_id=p_homework and (p_assignment is null or a.id=p_assignment) and a.active and s.submitted_at is null order by s.id for update of s loop
 retained:='{}';pos:=0;
 select i.id into current_item from public.book_practice_items i join public.book_practice_sessions ps on ps.id=i.session_id where i.session_id=attempt.session_id and i.position=ps.current_position;
 select coalesce(max(position),0)+501 into offset_position from public.book_practice_items where session_id=attempt.session_id;
 update public.book_practice_items set position=position+offset_position where session_id=attempt.session_id;
 for q in select qs.*,s.title section_title from public.homework_questions qs join public.homework_sections s on s.id=qs.section_id
 where s.homework_id=p_homework and s.active order by s.position,qs.position loop
 item_id:=null;
 select i.id into item_id from public.book_practice_items i
 where i.session_id=attempt.session_id and not(i.id=any(retained))
 and i.question-'homework_section'=q.question
 and exists(select 1 from public.book_practice_keys k where k.item_id=i.id and k.correct_answer is not distinct from q.correct_answer and k.explanation=q.explanation)
 and (q.question->>'question_type'<>'open' or exists(select 1 from public.book_practice_open_keys o where o.item_id=i.id and to_jsonb(o)-'item_id'=q.open_key)) limit 1;
 if item_id is null then
 insert into public.book_practice_items(session_id,position,question) values(attempt.session_id,pos,q.question||jsonb_build_object('homework_section',q.section_title)) returning id into item_id;
 insert into public.book_practice_keys values(item_id,q.correct_answer,q.explanation);
 if q.question->>'question_type'='open' then
 if q.open_key is null then raise exception 'Missing frozen open answer';end if;
 insert into public.book_practice_open_keys(item_id,accepted_answers,correct_answer,answer_format,accepted_range)
 values(item_id,q.open_key->'accepted_answers',q.open_key->>'correct_answer',q.open_key->>'answer_format',q.open_key->'accepted_range');
 end if;
 else update public.book_practice_items set position=pos,question=q.question||jsonb_build_object('homework_section',q.section_title) where id=item_id;
 end if;
 retained:=array_append(retained,item_id);pos:=pos+1;
 end loop;
 insert into public.homework_item_history(assignment_id,item,answer_key,open_key)
 select attempt.assignment_id,to_jsonb(i),to_jsonb(k),to_jsonb(o) from public.book_practice_items i
 left join public.book_practice_keys k on k.item_id=i.id left join public.book_practice_open_keys o on o.item_id=i.id
 where i.session_id=attempt.session_id and not(i.id=any(retained));
 delete from public.book_practice_items where session_id=attempt.session_id and not(id=any(retained));
 update public.book_practice_sessions s set title=h.title,timed=h.timed,time_limit=h.time_limit,
 current_position=coalesce((select position from public.book_practice_items where id=current_item),least(s.current_position,greatest(0,pos-1)))
 from public.homeworks h where h.id=p_homework and s.id=attempt.session_id;
 end loop;
end;$$;
revoke all on function public.sync_homework_sessions(uuid,uuid) from public,anon,authenticated;
create or replace function public.update_homework(p_homework uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sec jsonb; sid uuid; kept uuid[]:='{}'; recipients uuid[]; groups_ids uuid[]; n integer; total integer:=0; pos integer; picked record; old_ids jsonb;
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 perform 1 from public.homeworks where id=p_homework for update;
 if not found then raise exception 'Homework unavailable';end if;
 if jsonb_typeof(p_data->'sections') is distinct from 'array' or jsonb_array_length(p_data->'sections') not between 1 and 20 then raise exception 'Provide 1 to 20 sections';end if;
 select coalesce(array_agg(value::uuid),'{}') into recipients from jsonb_array_elements_text(coalesce(p_data->'students','[]'));
 select coalesce(array_agg(value::uuid),'{}') into groups_ids from jsonb_array_elements_text(coalesce(p_data->'groups','[]'));
 if exists(select 1 from unnest(recipients) id where not exists(select 1 from public.profiles p where p.id=id and p.role='student' and p.active)) or exists(select 1 from unnest(groups_ids) id where not exists(select 1 from public.groups g where g.id=id)) then raise exception 'Invalid assignees';end if;
 select coalesce(array_agg(p.id),'{}') into recipients from public.profiles p where p.role='student' and p.active and (coalesce((p_data->>'allStudents')::boolean,false) or p.id=any(recipients) or exists(select 1 from public.group_members m where m.student_id=p.id and m.group_id=any(groups_ids)));
 if cardinality(recipients)=0 then raise exception 'Choose at least one active student';end if;
 update public.homeworks set title=p_data->>'title',instructions=coalesce(p_data->>'instructions',''),due_at=(p_data->>'dueAt')::timestamptz,timed=coalesce((p_data->>'timed')::boolean,false),time_limit=(p_data->>'timeLimit')::integer,
 recipient_config=jsonb_build_object('allStudents',coalesce((p_data->>'allStudents')::boolean,false),'students',coalesce(p_data->'students','[]'),'groups',coalesce(p_data->'groups','[]')) where id=p_homework;
 select coalesce(max(position),-1)+1 into pos from public.homework_sections where homework_id=p_homework;
 for sec in select value from jsonb_array_elements(p_data->'sections') loop
 if coalesce((sec->>'count')::integer,0) not between 1 and 500 or nullif(btrim(sec->>'title'),'') is null then raise exception 'Invalid section';end if;
 sid:=null;old_ids:=null;
 if sec->>'id' is not null then
 select s.id,(select jsonb_agg(q.question->>'id' order by q.position) from public.homework_questions q where q.section_id=s.id) into sid,old_ids from public.homework_sections s where s.id=(sec->>'id')::uuid and s.homework_id=p_homework and s.active;
 if sid is null then raise exception 'Section does not belong to homework';end if;
 end if;
 if sid is not null and old_ids=sec->'questionIds' and jsonb_array_length(old_ids)=(sec->>'count')::integer then
 update public.homework_sections set title=sec->>'title' where id=sid;
 n:=jsonb_array_length(old_ids);
 else
 insert into public.homework_sections(homework_id,title,position) values(p_homework,sec->>'title',pos) returning id into sid;pos:=pos+1;n:=0;
 for picked in select * from public.homework_candidates(sec) loop
 insert into public.homework_questions(section_id,position,question,correct_answer,explanation,open_key) values(sid,n,picked.question,picked.correct_answer,picked.explanation,picked.open_key);n:=n+1;end loop;
 if n<>(sec->>'count')::integer then raise exception 'Not enough eligible questions for section %',sec->>'title';end if;
 end if;
 if sid=any(kept) then raise exception 'Duplicate section';end if;
 kept:=array_append(kept,sid);total:=total+n;
 end loop;
 if total>500 then raise exception 'Homework supports at most 500 questions';end if;
 with ordered as (
 select s.id,row_number() over(order by k.n nulls last,s.position,s.id)-1 position
 from public.homework_sections s left join unnest(kept) with ordinality k(id,n) on k.id=s.id where s.homework_id=p_homework)
 update public.homework_sections s set position=o.position from ordered o where s.id=o.id;
 update public.homework_sections set active=false where homework_id=p_homework and not(id=any(kept));
 update public.homework_assignments set active=student_id=any(recipients) where homework_id=p_homework;
 insert into public.homework_assignments(homework_id,student_id) select p_homework,id from unnest(recipients) id on conflict(homework_id,student_id) do update set active=true;
 perform public.sync_homework_sessions(p_homework);
 return p_homework;
end;$$;

create or replace function public.create_homework(p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$declare hid uuid;begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 insert into public.homeworks(title,instructions,due_at,timed,time_limit)
 values(p_data->>'title',coalesce(p_data->>'instructions',''),(p_data->>'dueAt')::timestamptz,coalesce((p_data->>'timed')::boolean,false),(p_data->>'timeLimit')::integer) returning id into hid;
 perform public.update_homework(hid,p_data);return hid;
end;$$;

create or replace function public.start_homework(p_assignment uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.homework_assignments;h public.homeworks;sid uuid;
begin
 -- Match update's lock order: homework, assignment, session.
 select h0.* into h from public.homeworks h0 join public.homework_assignments a0 on a0.homework_id=h0.id where a0.id=p_assignment for update of h0;
 select * into a from public.homework_assignments where id=p_assignment for update;
 if a.id is null or not a.active or a.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Assignment unavailable' using errcode='42501';end if;
 select session_id into sid from public.homework_attempts where assignment_id=a.id;
 if sid is not null then return sid;end if;
 insert into public.book_practice_sessions(student_id,title,kind,source_id,timed,time_limit)
 values(auth.uid(),h.title,'homework',h.id,h.timed,h.time_limit) returning id into sid;
 insert into public.homework_attempts(assignment_id,session_id) values(a.id,sid);
 perform public.sync_homework_sessions(h.id,a.id);
 if not exists(select 1 from public.book_practice_items where session_id=sid) then raise exception 'No answerable questions in homework';end if;
 return sid;
end;$$;

-- Resolve one-time group/all-student recipients after roster changes as well as Save.
create function public.sync_one_time_roster() returns trigger
language plpgsql security definer set search_path='' as $$declare h record;recipients uuid[];reactivated boolean;begin
 for h in select * from public.homeworks where recipient_config is not null order by id for update loop
 select coalesce(array_agg(p.id),'{}') into recipients from public.profiles p where p.active and p.role='student'
 and (coalesce((h.recipient_config->>'allStudents')::boolean,false)
 or p.id::text in(select jsonb_array_elements_text(h.recipient_config->'students'))
 or exists(select 1 from public.group_members m where m.student_id=p.id and m.group_id::text in(select jsonb_array_elements_text(h.recipient_config->'groups'))));
 reactivated:=exists(select 1 from public.homework_assignments a where a.homework_id=h.id and not a.active and a.student_id=any(recipients));
 update public.homework_assignments set active=student_id=any(recipients) where homework_id=h.id and active is distinct from (student_id=any(recipients));
 insert into public.homework_assignments(homework_id,student_id) select h.id,id from unnest(recipients) id
 on conflict(homework_id,student_id) do update set active=true where not homework_assignments.active;
 if found or reactivated then perform public.sync_homework_sessions(h.id);end if;
 end loop;return null;
end;$$;
revoke all on function public.sync_one_time_roster() from public,anon,authenticated;
create trigger homework_group_roster after insert or update or delete on public.group_members for each statement execute function public.sync_one_time_roster();
create trigger homework_active_roster after insert or update of active,role on public.profiles for each statement execute function public.sync_one_time_roster();
create or replace function public.bank_candidate_ids(p_filters jsonb) returns setof uuid
language plpgsql stable security definer set search_path='' as $$declare choices jsonb;admin_user boolean;begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','difficulties','status','domains','skills','marked','assignment')) then raise exception 'Invalid filters';end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status';end if;
 if p_filters ? 'domains' and (jsonb_typeof(p_filters->'domains') is distinct from 'array' or jsonb_array_length(p_filters->'domains')>32) then raise exception 'Invalid domains';end if;
 if p_filters ? 'skills' and (jsonb_typeof(p_filters->'skills') is distinct from 'array' or jsonb_array_length(p_filters->'skills')>256) then raise exception 'Invalid skills';end if;
 if coalesce(p_filters->>'marked','') not in ('','yes','no') then raise exception 'Invalid marked filter';end if;
 if p_filters ? 'difficulties' then
 choices:=p_filters->'difficulties';
 if jsonb_typeof(choices) is distinct from 'array' then raise exception 'Invalid difficulties';end if;
 if jsonb_array_length(choices)>4 or exists(select 1 from jsonb_array_elements(choices) v where jsonb_typeof(v)<>'string' or v#>>'{}' not in ('easy','medium','hard','unclassified')) then raise exception 'Invalid difficulties';end if;
 else choices:=case when coalesce(p_filters->>'difficulty','')='' then '[]'::jsonb else jsonb_build_array(p_filters->>'difficulty') end;end if;
 admin_user:=public.is_admin();
 return query select q.id from public.questions q join public.question_bank_eligibility eligible on eligible.question_id=q.id
 join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 where (b.published or admin_user) and case when admin_user then eligible.admin_ready else eligible.student_ready end
 and (not coalesce((p_filters->>'assignment')::boolean,false) or (b.published and eligible.student_ready))
 and (coalesce(p_filters->>'section','')='' or q.section=p_filters->>'section')
 and (coalesce(p_filters->>'domain','')='' or q.domain=p_filters->>'domain')
 and (coalesce(p_filters->>'skill','')='' or q.skill=p_filters->>'skill')
 and ((coalesce(jsonb_array_length(p_filters->'domains'),0) + coalesce(jsonb_array_length(p_filters->'skills'),0))=0
 or q.domain in (select jsonb_array_elements_text(p_filters->'domains'))
 or exists(select 1 from jsonb_array_elements(p_filters->'skills') s where s->>'domain'=q.domain and s->>'skill'=q.skill))
 and (coalesce(p_filters->>'marked','')='' or
 exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and i.marked and i.question->>'id'=q.id::text)=(p_filters->>'marked'='yes'))
 and (coalesce(p_filters->>'book','')='' or b.id=(p_filters->>'book')::uuid)
 and (coalesce(p_filters->>'topic','')='' or t.id in (with recursive topic_tree as (select id from public.book_topics where id=(p_filters->>'topic')::uuid union all select child.id from public.book_topics child join topic_tree parent on child.parent_id=parent.id) select id from topic_tree))
 and (jsonb_array_length(choices)=0 or q.difficulty in(select jsonb_array_elements_text(choices)))
 and (coalesce(p_filters->>'status','')='' or
 case p_filters->>'status'
 when 'unanswered' then not exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.question->>'id'=q.id::text)
 when 'marked' then exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and i.marked and i.question->>'id'=q.id::text)
 else exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.correct=(p_filters->>'status'='correct') and i.question->>'id'=q.id::text) end);
end;$$;

create function public.can_access_homework_session(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.homework_attempts ha join public.homework_assignments a on a.id=ha.assignment_id
 join public.book_practice_sessions s on s.id=ha.session_id
 where ha.session_id=p_session and not a.active and s.submitted_at is null);
$$;
revoke all on function public.can_access_homework_session(uuid) from public,anon;
grant execute on function public.can_access_homework_session(uuid) to authenticated;
drop policy practice_read on public.book_practice_sessions;
create policy practice_read on public.book_practice_sessions for select to authenticated using((select public.is_admin()) or
 (student_id=(select auth.uid()) and (select public.is_active_user()) and public.can_access_homework_session(id)));
create function public.lock_homework_session(p_session uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 perform h.id from public.homeworks h join public.homework_assignments a on a.homework_id=h.id
 join public.homework_attempts ha on ha.assignment_id=a.id where ha.session_id=p_session for update of h;
 perform a.id from public.homework_assignments a join public.homework_attempts ha on ha.assignment_id=a.id
 where ha.session_id=p_session for update of a;
end;$$;
revoke all on function public.lock_homework_session(uuid) from public,anon,authenticated;
-- Guard the existing player RPCs as well as the directory/RLS: old URLs must not bypass withdrawal.
alter function public.save_book_practice(uuid,jsonb) rename to save_book_practice_before_homework_access;
revoke all on function public.save_book_practice_before_homework_access(uuid,jsonb) from public,anon,authenticated;
create function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void
language plpgsql security definer set search_path='' as $$begin
 perform public.lock_homework_session(p_session_id);
 if not public.can_access_homework_session(p_session_id) then raise exception 'Assignment unavailable' using errcode='42501';end if;
 perform public.save_book_practice_before_homework_access(p_session_id,p_answers);
end;$$;
alter function public.finish_book_practice(uuid) rename to finish_book_practice_before_homework_access;
revoke all on function public.finish_book_practice_before_homework_access(uuid) from public,anon,authenticated;
create function public.finish_book_practice(p_session_id uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 perform public.lock_homework_session(p_session_id);
 if not public.can_access_homework_session(p_session_id) then raise exception 'Assignment unavailable' using errcode='42501';end if;
 perform public.finish_book_practice_before_homework_access(p_session_id);
end;$$;
revoke all on function public.save_book_practice(uuid,jsonb),public.finish_book_practice(uuid) from public,anon;
grant execute on function public.save_book_practice(uuid,jsonb),public.finish_book_practice(uuid) to authenticated;
create or replace function public.homework_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at) from(select h.*,a.id assignment_id,a.student_id,p.display_name,s.id session_id,s.submitted_at,s.elapsed_seconds,
 (select count(*) from public.book_practice_items pi where pi.session_id=s.id and pi.selected_answer is not null) answered,
 case when s.id is not null then (select count(*) from public.book_practice_items pi where pi.session_id=s.id)
 else (select count(*) from public.homework_questions qs join public.homework_sections hs on hs.id=qs.section_id where hs.homework_id=h.id and hs.active) end question_count,case when s.submitted_at is not null then
 (select jsonb_agg(jsonb_build_object('title',f.title,'count',f.n) order by f.position)
 from (select coalesce(pi.question->>'homework_section','Practice') title,count(*) n,min(pi.position) position
 from public.book_practice_items pi where pi.session_id=s.id group by coalesce(pi.question->>'homework_section','Practice')) f)
 else (select jsonb_agg(jsonb_build_object('title',sec.title,'count',(select count(*) from public.homework_questions qs where qs.section_id=sec.id)) order by sec.position) from public.homework_sections sec where sec.homework_id=h.id and sec.active) end sections from public.homework_assignments a join public.homeworks h on h.id=a.homework_id join public.profiles p on p.id=a.student_id left join public.homework_attempts ha on ha.assignment_id=a.id left join public.book_practice_sessions s on s.id=ha.session_id where a.active and p.active and (public.is_admin() or a.student_id=auth.uid()) order by h.due_at desc limit case when public.is_admin() then 200 else null end) x),'[]');end;$$;
-- Internal full-row candidate helpers are not browser RPCs.
revoke all on function public.bank_candidates(jsonb) from public,anon,authenticated;
grant execute on function public.bank_candidates(jsonb) to service_role;
commit;
