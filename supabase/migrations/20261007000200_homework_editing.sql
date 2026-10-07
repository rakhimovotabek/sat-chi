begin;
-- Soft removal keeps recipient history and frozen question definitions intact.
alter table public.homework_assignments add column active boolean not null default true;
alter table public.homework_sections add column active boolean not null default true;
alter table public.homeworks add column recipient_config jsonb;

alter function public.create_homework(jsonb) rename to create_homework_before_editing;
revoke all on function public.create_homework_before_editing(jsonb) from public,anon,authenticated;
create or replace function public.create_homework_before_editing(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare hid uuid; sec jsonb; sid uuid; q record; n integer; pos integer:=0; iid uuid; students uuid[]; groups_ids uuid[]; total integer:=0;begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if jsonb_typeof(p_data->'sections') is distinct from 'array' or jsonb_array_length(p_data->'sections') not between 1 and 20 then raise exception 'Provide 1 to 20 sections'; end if;
 select coalesce(array_agg(value::uuid),'{}') into students from jsonb_array_elements_text(coalesce(p_data->'students','[]'));
 select coalesce(array_agg(value::uuid),'{}') into groups_ids from jsonb_array_elements_text(coalesce(p_data->'groups','[]'));
 if exists(select 1 from unnest(students) id where not exists(select 1 from public.profiles p where p.id=id and p.role='student' and p.active)) or exists(select 1 from unnest(groups_ids) id where not exists(select 1 from public.groups g where g.id=id)) then raise exception 'Invalid assignees'; end if;
 insert into public.homeworks(title,instructions,due_at,timed,time_limit) values(p_data->>'title',coalesce(p_data->>'instructions',''),(p_data->>'dueAt')::timestamptz,coalesce((p_data->>'timed')::boolean,false),(p_data->>'timeLimit')::integer) returning id into hid;
 for sec in select value from jsonb_array_elements(p_data->'sections') loop
 insert into public.homework_sections(homework_id,title,position) values(hid,sec->>'title',pos) returning id into sid;pos=pos+1;n=0;
 if coalesce((sec->>'count')::integer,0) not between 1 and 500 then raise exception 'Section count must be 1 to 500';end if;
 for q in select c.*,a.correct_answer,a.explanation from public.bank_candidates(coalesce(sec->'filters','{}')) c join public.question_answers a on a.question_id=c.id where c.question_type='mcq' and (sec->'questionIds' is null or c.id::text in(select jsonb_array_elements_text(sec->'questionIds'))) order by random() limit (sec->>'count')::integer loop
 insert into public.homework_questions(section_id,position,question,correct_answer,explanation) values(sid,n,to_jsonb(q)-'correct_answer'-'explanation',q.correct_answer,coalesce(q.explanation,''));n=n+1;end loop;
 if n<>(sec->>'count')::integer then raise exception 'Not enough eligible questions for section %',sec->>'title'; end if;total=total+n;
 end loop;
 if total>500 then raise exception 'Homework supports at most 500 questions'; end if;
 insert into public.homework_assignments(homework_id,student_id) select hid,p.id from public.profiles p where p.role='student' and p.active and (coalesce((p_data->>'allStudents')::boolean,false) or p.id=any(students) or exists(select 1 from public.group_members m where m.student_id=p.id and m.group_id=any(groups_ids)));
 if not found then raise exception 'Choose at least one active student'; end if;
 return hid;end;$$;

create function public.create_homework(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare hid uuid;begin
 hid:=public.create_homework_before_editing(p_data);
 update public.homeworks set recipient_config=jsonb_build_object('allStudents',coalesce((p_data->>'allStudents')::boolean,false),'students',coalesce(p_data->'students','[]'),'groups',coalesce(p_data->'groups','[]')) where id=hid;
 return hid;end;$$;

create function public.homework_edit_data(p_homework uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 select jsonb_build_object('id',h.id,'data',jsonb_build_object('title',h.title,'instructions',h.instructions,'dueAt',h.due_at,'timed',h.timed,'timeLimit',h.time_limit,
 'allStudents',coalesce(h.recipient_config->'allStudents','false'),
 'students',coalesce(h.recipient_config->'students',(select jsonb_agg(a.student_id) from public.homework_assignments a join public.profiles p on p.id=a.student_id where a.homework_id=h.id and a.active and p.active),'[]'),
 'groups',coalesce(h.recipient_config->'groups','[]'),
 'sections',(select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'count',(select count(*) from public.homework_questions q where q.section_id=s.id),'questionIds',(select jsonb_agg(q.question->>'id' order by q.position) from public.homework_questions q where q.section_id=s.id),'filters','{}'::jsonb) order by s.position) from public.homework_sections s where s.homework_id=h.id and s.active))) into result
 from public.homeworks h where h.id=p_homework;
 if result is null then raise exception 'Homework unavailable';end if;
 return result;end;$$;

create function public.update_homework(p_homework uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 for picked in select c.*,a.correct_answer,a.explanation from public.bank_candidates(coalesce(sec->'filters','{}')) c join public.question_answers a on a.question_id=c.id where c.question_type='mcq' and (sec->'questionIds' is null or c.id::text in(select jsonb_array_elements_text(sec->'questionIds'))) order by random() limit (sec->>'count')::integer loop
 insert into public.homework_questions(section_id,position,question,correct_answer,explanation) values(sid,n,to_jsonb(picked)-'correct_answer'-'explanation',picked.correct_answer,coalesce(picked.explanation,''));n:=n+1;end loop;
 if n<>(sec->>'count')::integer then raise exception 'Not enough eligible questions for section %',sec->>'title';end if;
 end if;
 kept:=array_append(kept,sid);total:=total+n;
 end loop;
 if total>500 then raise exception 'Homework supports at most 500 questions';end if;
 update public.homework_sections set active=false where homework_id=p_homework and not(id=any(kept));
 update public.homework_assignments set active=student_id=any(recipients) where homework_id=p_homework;
 insert into public.homework_assignments(homework_id,student_id) select p_homework,id from unnest(recipients) id on conflict(homework_id,student_id) do update set active=true;
 return p_homework;
end;$$;

drop policy assignment_self on public.homework_assignments;
create policy assignment_self on public.homework_assignments for select to authenticated using(active and student_id=(select auth.uid()) and (select public.is_active_user()));

create or replace function public.start_homework(p_assignment uuid) returns uuid language plpgsql security definer set search_path='' as $$declare a public.homework_assignments; h public.homeworks; sid uuid; q record; iid uuid; n integer:=0;begin
 select * into a from public.homework_assignments where id=p_assignment for update;
 if a.id is null or not a.active or a.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Assignment unavailable' using errcode='42501';end if;
 select session_id into sid from public.homework_attempts where assignment_id=a.id;
 if sid is not null then return sid;end if;
 select * into h from public.homeworks where id=a.homework_id;
 insert into public.book_practice_sessions(student_id,title,kind,source_id,timed,time_limit) values(auth.uid(),h.title,'homework',h.id,h.timed,h.time_limit) returning id into sid;
 for q in select qs.*,s.title section_title from public.homework_questions qs join public.homework_sections s on s.id=qs.section_id where s.homework_id=h.id and s.active and public.question_answer_ui_supported(qs.question) order by s.position,qs.position loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,q.question||jsonb_build_object('homework_section',q.section_title)) returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation);n:=n+1;end loop;
 if n=0 then raise exception 'No answerable questions in homework';end if;
 insert into public.homework_attempts(assignment_id,session_id) values(a.id,sid);return sid;end;$$;

create or replace function public.homework_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at) from(select h.*,a.id assignment_id,a.student_id,p.display_name,s.id session_id,s.submitted_at,s.elapsed_seconds,(select jsonb_agg(jsonb_build_object('title',sec.title,'count',(select count(*) from public.homework_questions qs where qs.section_id=sec.id)) order by sec.position) from public.homework_sections sec where sec.homework_id=h.id and sec.active) sections from public.homework_assignments a join public.homeworks h on h.id=a.homework_id join public.profiles p on p.id=a.student_id left join public.homework_attempts ha on ha.assignment_id=a.id left join public.book_practice_sessions s on s.id=ha.session_id where a.active and p.active and (public.is_admin() or a.student_id=auth.uid()) order by h.due_at desc limit 200) x),'[]');end;$$;
revoke all on function public.homework_edit_data(uuid),public.update_homework(uuid,jsonb),public.create_homework(jsonb) from public,anon;
grant execute on function public.homework_edit_data(uuid),public.update_homework(uuid,jsonb),public.create_homework(jsonb) to authenticated;
commit;
