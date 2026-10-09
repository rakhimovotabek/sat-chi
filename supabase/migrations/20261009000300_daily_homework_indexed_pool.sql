begin;
-- Existing JSON versions are deliberately not rewritten. New versions freeze
-- the same source/keys in indexed private rows, without a 5,000-question cap.
alter table public.daily_homework_versions add column pool_count integer
 check (pool_count is null or pool_count>=0);
create table public.daily_homework_pool_questions (
 version_id uuid not null references public.daily_homework_versions(id) on delete cascade,
 question_id uuid not null,
 snapshot jsonb not null,
 primary key(version_id,question_id)
);
alter table public.daily_homework_pool_questions enable row level security;
revoke all on public.daily_homework_pool_questions from public,anon,authenticated;
grant select on public.daily_homework_pool_questions to authenticated;
create policy daily_pool_admin on public.daily_homework_pool_questions for select to authenticated using ((select public.is_admin()));
grant all on public.daily_homework_pool_questions to service_role;
-- No source-question FK: snapshots must survive later source archival/deletion.

create or replace function public.save_daily_homework(p_data jsonb,p_template uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid:=p_template; zone text; day date; start_day date; end_day date; pool jsonb; count_needed integer; mode text; t public.daily_homework_templates; revision integer; ids uuid[]; group_ids uuid[]; version_id uuid; pool_size integer;
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 zone=coalesce(nullif(p_data->>'timezone',''),(select timezone from public.study_preferences where student_id=auth.uid()),'Asia/Tashkent');
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Choose a valid IANA timezone';end if;
 day=timezone(zone,now())::date;start_day=(p_data->>'startDate')::date;end_day=nullif(p_data->>'endDate','')::date;count_needed=(p_data->>'count')::integer;mode=p_data->>'selection';
 if start_day is null or(end_day is not null and end_day<start_day) or count_needed is null or count_needed not between 1 and 500 or mode is null or mode not in('fixed','new','random') or coalesce(length(btrim(p_data->>'title')),0) not between 1 and 160 or length(coalesce(p_data->>'instructions',''))>10000 or (p_data->>'timeLimit')::int is not null and (p_data->>'timeLimit')::int not between 60 and 21600 then raise exception 'Invalid daily homework configuration';end if;
 select coalesce(array_agg(value::uuid),'{}')into ids from jsonb_array_elements_text(coalesce(p_data->'students','[]'));
 select coalesce(array_agg(value::uuid),'{}')into group_ids from jsonb_array_elements_text(coalesce(p_data->'groups','[]'));
 if exists(select 1 from unnest(ids) id where not exists(select 1 from public.profiles p where p.id=id and p.role='student' and p.active)) or exists(select 1 from unnest(group_ids) id where not exists(select 1 from public.groups g where g.id=id)) then raise exception 'Invalid recipients';end if;
 -- New versions store snapshots as private indexed rows; no giant JSON aggregate.
 pool:='[]';
 if tid is null then
 insert into public.daily_homework_templates(timezone,all_students,students,groups,state) values(zone,coalesce((p_data->>'allStudents')::boolean,false),ids,group_ids,case when coalesce((p_data->>'active')::boolean,true)then 'active' else 'paused' end)returning id into tid;
 revision=1;
 if coalesce((p_data->>'active')::boolean,true)then insert into public.daily_homework_windows(template_id,from_date)values(tid,greatest(day,start_day));end if;
 else
 select * into t from public.daily_homework_templates where id=tid for update;
 if t.id is null or t.state='archived' then raise exception 'Assignment unavailable';end if;
 if zone<>t.timezone then raise exception 'Timezone is fixed after creation to preserve historical days';end if;
 select max(v.revision)+1 into revision from public.daily_homework_versions v where template_id=tid;
 update public.daily_homework_templates set all_students=coalesce((p_data->>'allStudents')::boolean,false),students=ids,groups=group_ids where id=tid;
 day=day+1;
 end if;
 insert into public.daily_homework_versions(template_id,revision,valid_from,data,pool) values(tid,revision,greatest(day,start_day),p_data||jsonb_build_object('timezone',zone,'count',count_needed,'allowLate',coalesce((p_data->>'allowLate')::boolean,true),'allowRepeat',coalesce((p_data->>'allowRepeat')::boolean,false)),pool) returning id into version_id;
 insert into public.daily_homework_pool_questions(version_id,question_id,snapshot)
 select version_id,q.id,jsonb_build_object('id',q.id,
   'question',to_jsonb(q)-'correct_answer'-'explanation',
   'correct_answer',a.correct_answer,'explanation',a.explanation,
   'open_key',to_jsonb(o)-'question_id')
 from public.bank_candidate_ids(coalesce(p_data->'filters','{}')) candidates(id)
 join public.questions q on q.id=candidates.id
 join public.question_bank_eligibility eligible on eligible.question_id=q.id and eligible.student_ready
 join public.book_topics bt on bt.id=q.topic_id
 join public.books b on b.id=bt.book_id and b.published
 join public.question_answers a on a.question_id=q.id
 left join public.book_open_answers o on o.question_id=q.id
 where (coalesce(jsonb_array_length(p_data->'questionIds'),0)=0
   or q.id::text in(select jsonb_array_elements_text(p_data->'questionIds')))
 order by q.id limit case when mode='fixed' then count_needed else null end;
 get diagnostics pool_size=row_count;
 if pool_size<count_needed then
   raise exception 'Not enough usable published questions: % available, % required',pool_size,count_needed;
 end if;
 update public.daily_homework_versions set pool_count=pool_size where id=version_id;
 perform public.sync_daily_roster(tid,day);
 if not exists(select 1 from public.daily_homework_enrollments where template_id=tid and(until_date is null or until_date>day)) then raise exception 'Choose at least one active student or populated group';end if;
 if p_template is not null and p_data ? 'active' then
 perform public.set_daily_homework_state(tid,case when (p_data->>'active')::boolean then 'active' else 'paused' end);
 end if;
 return tid;
end;$$;

create or replace function public.start_daily_homework(p_template uuid,p_day date)returns uuid language plpgsql security definer set search_path='' as $$
declare d record;i public.daily_homework_instances;v public.daily_homework_versions;sid uuid;item uuid;q jsonb;pool jsonb;selected jsonb;count_needed integer;n integer:=0;repeat_allowed boolean;
begin
 if not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 -- Serialize per student/template so concurrent starts and pool selection cannot create duplicates.
 perform 1 from public.daily_homework_templates where id=p_template for update;
 select * into i from public.daily_homework_instances where template_id=p_template and student_id=auth.uid() and study_date=p_day for update;
 if i.session_id is not null then
 if i.completed_at is null and now()>=i.due_at and not(select(saved_version.data->>'allowLate')::boolean from public.daily_homework_versions saved_version where saved_version.id=i.version_id)then raise exception 'Late work is disabled';end if;
 return i.session_id;
 end if;
 select * into d from public.daily_scheduled(auth.uid(),p_template,p_day,p_day);
 if d.template_id is null then raise exception 'Daily assignment unavailable'using errcode='42501';end if;
 select * into v from public.daily_homework_versions where id=d.version_id;
 if now()>=d.due_at and not(v.data->>'allowLate')::boolean then raise exception 'Late work is disabled';end if;
 pool=v.pool;count_needed=(v.data->>'count')::integer;repeat_allowed=(v.data->>'allowRepeat')::boolean;
 if v.pool_count is not null then
 -- Scan/rank small IDs, then fetch only the chosen frozen snapshots. Existing
 -- JSON-backed versions keep their original selection path and answer keys.
 with used as materialized (
   select distinct unnest(di.question_ids) id from public.daily_homework_instances di
   where di.template_id=p_template and di.student_id=auth.uid()
 ), answered as materialized (
   select distinct pi.question->>'id' id from public.book_practice_sessions ps
   join public.book_practice_items pi on pi.session_id=ps.id
   where ps.student_id=auth.uid() and (pi.selected_answer is not null or pi.solved_at is not null)
 ), chosen as materialized (
   select p.question_id from public.daily_homework_pool_questions p
   left join used u on u.id=p.question_id
   left join answered a on a.id=p.question_id::text
   where p.version_id=v.id and (v.data->>'selection'='fixed' or repeat_allowed or u.id is null)
   order by case when v.data->>'selection'='fixed' or u.id is null then 0 else 1 end,
     case when v.data->>'selection'='fixed' or a.id is null then 0 else 1 end,
     case when v.data->>'selection'='fixed' then p.question_id::text
       else md5(p.question_id::text||p_day::text||auth.uid()::text) end
   limit count_needed
 )
 select coalesce(jsonb_agg(p.snapshot order by
   case when v.data->>'selection'='fixed' or u.id is null then 0 else 1 end,
   case when v.data->>'selection'='fixed' or a.id is null then 0 else 1 end,
   case when v.data->>'selection'='fixed' then p.question_id::text
     else md5(p.question_id::text||p_day::text||auth.uid()::text) end),'[]') into selected
 from chosen c join public.daily_homework_pool_questions p on p.version_id=v.id and p.question_id=c.question_id
 left join answered a on a.id=p.question_id::text
 left join used u on u.id=p.question_id;
 elsif v.data->>'selection'='fixed' then selected=pool;
 else
 select coalesce(jsonb_agg(value),'[]')into selected from(
 select value from jsonb_array_elements(pool) where repeat_allowed or not exists(select 1 from public.daily_homework_instances di where di.template_id=p_template and di.student_id=auth.uid() and(value->>'id')::uuid=any(di.question_ids))
 order by case when exists(select 1 from public.daily_homework_instances di where di.template_id=p_template and di.student_id=auth.uid() and(value->>'id')::uuid=any(di.question_ids))then 1 else 0 end,
 case when exists(select 1 from public.book_practice_items pi join public.book_practice_sessions ps on ps.id=pi.session_id where ps.student_id=auth.uid() and pi.question->>'id'=value->>'id' and(pi.selected_answer is not null or pi.solved_at is not null))then 1 else 0 end,
 md5(value->>'id'||p_day::text||auth.uid()::text)limit count_needed)x;
 end if;
 if jsonb_array_length(selected)<count_needed then raise exception 'Question pool exhausted: % unseen questions remain; ask your teacher to expand the pool or allow repetition',jsonb_array_length(selected);end if;
 insert into public.daily_homework_instances(template_id,student_id,study_date,version_id,opens_at,due_at)values(d.template_id,auth.uid(),p_day,v.id,d.opens_at,d.due_at)on conflict(template_id,student_id,study_date)do nothing;
 insert into public.book_practice_sessions(student_id,title,kind,source_id,timed,time_limit)values(auth.uid(),v.data->>'title','homework',p_template,(v.data->>'timeLimit')is not null,(v.data->>'timeLimit')::int)returning id into sid;
 for q in select value from jsonb_array_elements(selected)loop
 insert into public.book_practice_items(session_id,position,question)values(sid,n,q->'question'||jsonb_build_object('homework_section',v.data->>'title'))returning id into item;
 insert into public.book_practice_keys values(item,(q->>'correct_answer')::int,q->>'explanation');
 if q->'question'->>'question_type'='open' then
 if q->'open_key' is null or q->'open_key'='null'::jsonb then raise exception 'Open-response answer key missing for question %',q->>'id';end if;
 insert into public.book_practice_open_keys(item_id,accepted_answers,correct_answer,answer_format,accepted_range)
 values(item,q->'open_key'->'accepted_answers',q->'open_key'->>'correct_answer',q->'open_key'->>'answer_format',q->'open_key'->'accepted_range');
 end if;n=n+1;
 end loop;
 update public.daily_homework_instances set session_id=sid,started_at=now(),question_ids=array(select(value->>'id')::uuid from jsonb_array_elements(selected))where template_id=p_template and student_id=auth.uid() and study_date=p_day;
 return sid;
end;$$;

create or replace function public.daily_homework_templates()returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(r))from(select t.*,v.data,v.revision,v.valid_from,coalesce(v.pool_count,jsonb_array_length(v.pool))pool_count from public.daily_homework_templates t join lateral(select * from public.daily_homework_versions v where v.template_id=t.id order by revision desc limit 1)v on true order by t.created_at desc limit 100)r),'[]');
end;$$;
commit;
