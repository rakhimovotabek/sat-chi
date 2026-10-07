begin;
-- Use the maintained student-eligibility cache when freezing daily pools.
-- Re-running the legacy per-question approval scan made edits time out.
create or replace function public.save_daily_homework(p_data jsonb,p_template uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid:=p_template; zone text; day date; start_day date; end_day date; pool jsonb; count_needed integer; mode text; t public.daily_homework_templates; revision integer; ids uuid[]; group_ids uuid[];
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 zone=coalesce(nullif(p_data->>'timezone',''),(select timezone from public.study_preferences where student_id=auth.uid()),'Asia/Tashkent');
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=zone) then raise exception 'Choose a valid IANA timezone';end if;
 day=timezone(zone,now())::date;start_day=(p_data->>'startDate')::date;end_day=nullif(p_data->>'endDate','')::date;count_needed=(p_data->>'count')::integer;mode=p_data->>'selection';
 if start_day is null or(end_day is not null and end_day<start_day) or count_needed is null or count_needed not between 1 and 500 or mode is null or mode not in('fixed','new','random') or coalesce(length(btrim(p_data->>'title')),0) not between 1 and 160 or length(coalesce(p_data->>'instructions',''))>10000 or (p_data->>'timeLimit')::int is not null and (p_data->>'timeLimit')::int not between 60 and 21600 then raise exception 'Invalid daily homework configuration';end if;
 select coalesce(array_agg(value::uuid),'{}')into ids from jsonb_array_elements_text(coalesce(p_data->'students','[]'));
 select coalesce(array_agg(value::uuid),'{}')into group_ids from jsonb_array_elements_text(coalesce(p_data->'groups','[]'));
 if exists(select 1 from unnest(ids) id where not exists(select 1 from public.profiles p where p.id=id and p.role='student' and p.active)) or exists(select 1 from unnest(group_ids) id where not exists(select 1 from public.groups g where g.id=id)) then raise exception 'Invalid recipients';end if;
 -- Freeze the eligible source pool, not live keys. Unpublished/unapproved content never enters daily assignments.
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'question',to_jsonb(q)-'correct_answer'-'explanation','correct_answer',a.correct_answer,'explanation',a.explanation,'open_key',(select to_jsonb(o)-'question_id' from public.book_open_answers o where o.question_id=q.id)) order by q.id),'[]')into pool
 from public.bank_candidate_ids(coalesce(p_data->'filters','{}')) candidates(id) join public.questions q on q.id=candidates.id join public.question_bank_eligibility eligible on eligible.question_id=q.id and eligible.student_ready join public.book_topics bt on bt.id=q.topic_id join public.books b on b.id=bt.book_id join public.question_answers a on a.question_id=q.id where b.published and(coalesce(jsonb_array_length(p_data->'questionIds'),0)=0 or q.id::text in(select jsonb_array_elements_text(p_data->'questionIds')));
 if jsonb_array_length(pool)<count_needed then raise exception 'Not enough usable published questions: % available, % required',jsonb_array_length(pool),count_needed;end if;
 if jsonb_array_length(pool)>5000 then raise exception 'Narrow the question pool to at most 5000 questions';end if;
 if mode='fixed' then select jsonb_agg(value order by value->>'id')into pool from(select value from jsonb_array_elements(pool) order by value->>'id' limit count_needed)x;end if;
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
 insert into public.daily_homework_versions(template_id,revision,valid_from,data,pool) values(tid,revision,greatest(day,start_day),p_data||jsonb_build_object('timezone',zone,'count',count_needed,'allowLate',coalesce((p_data->>'allowLate')::boolean,true),'allowRepeat',coalesce((p_data->>'allowRepeat')::boolean,false)),pool);
 perform public.sync_daily_roster(tid,day);
 if not exists(select 1 from public.daily_homework_enrollments where template_id=tid and(until_date is null or until_date>day)) then raise exception 'Choose at least one active student or populated group';end if;
 if p_template is not null and p_data ? 'active' then
 perform public.set_daily_homework_state(tid,case when (p_data->>'active')::boolean then 'active' else 'paused' end);
 end if;
 return tid;
end;$$;

commit;
