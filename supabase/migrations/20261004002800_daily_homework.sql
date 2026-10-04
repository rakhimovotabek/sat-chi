begin;
create table public.daily_homework_templates(
 id uuid primary key default gen_random_uuid(),timezone text not null default 'Asia/Tashkent', state text not null default 'active' check(state in('active','paused','archived')),
 all_students boolean not null default false,students uuid[] not null default '{}',groups uuid[] not null default '{}',created_at timestamptz not null default now());
create table public.daily_homework_versions(
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.daily_homework_templates,revision integer not null,valid_from date not null,data jsonb not null,pool jsonb not null,unique(template_id,revision));
create index daily_version_date_idx on public.daily_homework_versions(template_id,valid_from desc,revision desc);
create table public.daily_homework_enrollments(
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.daily_homework_templates,student_id uuid not null references public.profiles,from_date date not null,until_date date,check(until_date is null or until_date>=from_date),unique(template_id,student_id,from_date));
create index daily_enrollment_student_idx on public.daily_homework_enrollments(student_id,template_id,from_date,until_date);
create table public.daily_homework_windows(
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.daily_homework_templates,from_date date not null,until_date date,check(until_date is null or until_date>=from_date));
create unique index daily_window_open_idx on public.daily_homework_windows(template_id) where until_date is null;
create table public.daily_homework_instances(
 id uuid primary key default gen_random_uuid(),template_id uuid not null references public.daily_homework_templates,version_id uuid not null references public.daily_homework_versions,student_id uuid not null references public.profiles,study_date date not null,
 opens_at timestamptz not null,due_at timestamptz not null,session_id uuid unique references public.book_practice_sessions,question_ids uuid[] not null default '{}',started_at timestamptz,completed_at timestamptz,
 active_seconds integer not null default 0,attempts integer not null default 0,correct integer not null default 0,answered integer not null default 0,completed_late boolean not null default false,
 unique(template_id,student_id,study_date),check(due_at>opens_at));
create index daily_instance_student_date_idx on public.daily_homework_instances(student_id,study_date desc);
create index daily_instance_template_date_idx on public.daily_homework_instances(template_id,study_date desc,student_id);
do $$declare t text;begin
 foreach t in array array['daily_homework_templates','daily_homework_versions','daily_homework_enrollments','daily_homework_windows','daily_homework_instances']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy daily_admin_read on public.%I for select to authenticated using((select public.is_admin()))',t);
 end loop;
end;$$;
-- Version pools include frozen answer keys and are intentionally admin-only.
create policy daily_instance_self on public.daily_homework_instances for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create policy daily_enrollment_self on public.daily_homework_enrollments for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create function public.sync_daily_roster(p_template uuid,p_from date default null) returns void language plpgsql security definer set search_path='' as $$
declare t public.daily_homework_templates; day date;
begin
 select * into t from public.daily_homework_templates where id=p_template for update;
 day=coalesce(p_from,timezone(t.timezone,now())::date);
 update public.daily_homework_enrollments e set until_date=greatest(e.from_date,day) where e.template_id=t.id and e.until_date is null and not exists(select 1 from public.profiles p where p.id=e.student_id and p.active and p.role='student' and(t.all_students or p.id=any(t.students) or exists(select 1 from public.group_members m where m.student_id=p.id and m.group_id=any(t.groups))));
 insert into public.daily_homework_enrollments(template_id,student_id,from_date)
 select t.id,p.id,day from public.profiles p where p.active and p.role='student' and(t.all_students or p.id=any(t.students) or exists(select 1 from public.group_members m where m.student_id=p.id and m.group_id=any(t.groups))) and not exists(select 1 from public.daily_homework_enrollments e where e.template_id=t.id and e.student_id=p.id and(e.until_date is null or e.until_date>day))
 on conflict(template_id,student_id,from_date) do update set until_date=null;
end;$$;
create function public.daily_membership_changed() returns trigger language plpgsql security definer set search_path='' as $$declare t record;begin
 for t in select id,timezone from public.daily_homework_templates where state<>'archived' loop perform public.sync_daily_roster(t.id,timezone(t.timezone,now())::date+1);end loop;
 return null;
end;$$;
create trigger daily_group_roster after insert or delete or update on public.group_members for each statement execute function public.daily_membership_changed();
create trigger daily_active_roster after insert or update of active,role on public.profiles for each statement execute function public.daily_membership_changed();
create function public.save_daily_homework(p_data jsonb,p_template uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
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
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'question',to_jsonb(q)-'correct_answer'-'explanation','correct_answer',a.correct_answer,'explanation',a.explanation) order by q.id),'[]')into pool
 from public.bank_candidates(coalesce(p_data->'filters','{}'))q join public.book_topics bt on bt.id=q.topic_id join public.books b on b.id=bt.book_id join public.question_answers a on a.question_id=q.id where b.published and public.question_approved_for_students(q.id) and(coalesce(jsonb_array_length(p_data->'questionIds'),0)=0 or q.id::text in(select jsonb_array_elements_text(p_data->'questionIds')));
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
 return tid;
end;$$;
create function public.set_daily_homework_state(p_template uuid,p_state text) returns void language plpgsql security definer set search_path='' as $$
declare t public.daily_homework_templates; day date;
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if p_state is null or p_state not in('active','paused','archived')then raise exception 'Invalid state';end if;
 select * into t from public.daily_homework_templates where id=p_template for update;
 if t.id is null or t.state='archived' then raise exception 'Assignment unavailable';end if;
 if t.state=p_state then return;end if;
 day=timezone(t.timezone,now())::date;
 if p_state='active' then
 if exists(select 1 from public.daily_homework_windows where template_id=t.id and until_date=day+1)then update public.daily_homework_windows set until_date=null where template_id=t.id and until_date=day+1;
 else insert into public.daily_homework_windows(template_id,from_date)values(t.id,day);end if;
 else update public.daily_homework_windows set until_date=greatest(from_date,day+1)where template_id=t.id and until_date is null;
 end if;
 update public.daily_homework_templates set state=p_state where id=t.id;
end;$$;
-- Historical schedule is derived from immutable revisions and bounded recipient/activity periods.
create function public.daily_scheduled(p_student uuid,p_template uuid,p_from date,p_until date) returns table(template_id uuid,student_id uuid,study_date date,version_id uuid,opens_at timestamptz,due_at timestamptz) language sql stable security definer set search_path='' as $$
 select distinct t.id,e.student_id,d.day::date,v.id,d.day::timestamp at time zone t.timezone,(d.day::date+1)::timestamp at time zone t.timezone
 from public.daily_homework_templates t join public.daily_homework_enrollments e on e.template_id=t.id
 cross join lateral generate_series(p_from::timestamp,p_until::timestamp,interval '1 day')d(day)
 join lateral(select * from public.daily_homework_versions v where v.template_id=t.id and v.valid_from<=d.day::date order by valid_from desc,revision desc limit 1)v on true
 where(p_student is null or e.student_id=p_student)and(p_template is null or t.id=p_template)
 and d.day::date>=e.from_date and(e.until_date is null or d.day::date<e.until_date)
 and d.day::date>=(v.data->>'startDate')::date and(nullif(v.data->>'endDate','')is null or d.day::date<=(v.data->>'endDate')::date)
 and exists(select 1 from public.daily_homework_windows w where w.template_id=t.id and d.day::date>=w.from_date and(w.until_date is null or d.day::date<w.until_date))
 and d.day::timestamp at time zone t.timezone<=now();
$$;
create function public.daily_homework_directory(p_student uuid default null,p_template uuid default null,p_from date default null,p_until date default null,p_page integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; first_day date; last_day date; result jsonb;
begin
 if not public.is_active_user() or (p_student is not null and p_student<>auth.uid() and not public.is_admin()) then raise exception 'Account unavailable'using errcode='42501';end if;
 uid=case when public.is_admin()then p_student else auth.uid()end;
 first_day=coalesce(p_from,(now() at time zone 'Asia/Tashkent')::date-30);last_day=coalesce(p_until,(now() at time zone 'Asia/Tashkent')::date+1);
 if last_day<first_day or last_day-first_day>31 or p_page is null or p_page not between 0 and 100000 then raise exception 'Choose up to 31 days';end if;
 with scheduled as(select * from public.daily_scheduled(uid,p_template,first_day,last_day) union select i.template_id,i.student_id,i.study_date,i.version_id,i.opens_at,i.due_at from public.daily_homework_instances i where(uid is null or i.student_id=uid)and(p_template is null or i.template_id=p_template)and i.study_date between first_day and last_day),all_rows as(
 select d.template_id,d.student_id,d.study_date,d.version_id,d.opens_at,d.due_at,i.id,i.session_id,i.started_at,i.completed_at,i.completed_late,coalesce(s.elapsed_seconds,i.active_seconds,0)active_seconds,coalesce(i.attempts,0)attempts,coalesce(i.correct,0)correct,case when i.session_id is not null and i.completed_at is null then (select count(*)::int from public.book_practice_items pi where pi.session_id=i.session_id and pi.selected_answer is not null) else coalesce(i.answered,0) end answered,p.display_name,t.state,t.timezone,v.data->>'title' title,v.data->>'instructions' instructions,(v.data->>'count')::int question_count,(v.data->>'allowLate')::boolean allow_late,
 timezone(t.timezone,now())::date=d.study_date is_today,
 case when i.completed_at is not null then case when i.completed_late then 'Completed late'else 'Completed'end when now()>=d.due_at then 'Missed'when s.submitted_at is not null then 'Incomplete'when i.started_at is not null then 'In progress'else 'Not started'end status
 from scheduled d join public.daily_homework_templates t on t.id=d.template_id join public.daily_homework_versions v on v.id=d.version_id join public.profiles p on p.id=d.student_id left join public.daily_homework_instances i on i.template_id=d.template_id and i.student_id=d.student_id and i.study_date=d.study_date left join public.book_practice_sessions s on s.id=i.session_id),paged as(select * from all_rows order by study_date desc,title,student_id limit 50 offset p_page*50)
 select jsonb_build_object('total',(select count(*)from all_rows),'rows',coalesce(jsonb_agg(to_jsonb(paged)),'[]'))into result from paged;
 return result;
end;$$;
create function public.start_daily_homework(p_template uuid,p_day date)returns uuid language plpgsql security definer set search_path='' as $$
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
 if v.data->>'selection'='fixed' then selected=pool;
 else
 select coalesce(jsonb_agg(value),'[]')into selected from(
 select value from jsonb_array_elements(pool) where repeat_allowed or not exists(select 1 from public.daily_homework_instances di where di.template_id=p_template and di.student_id=auth.uid() and(value->>'id')::uuid=any(di.question_ids))
 order by case when exists(select 1 from public.book_practice_items pi join public.book_practice_sessions ps on ps.id=pi.session_id where ps.student_id=auth.uid() and pi.question->>'id'=value->>'id' and(pi.selected_answer is not null or pi.solved_at is not null))then 1 else 0 end,
 md5(value->>'id'||p_day::text||auth.uid()::text)limit count_needed)x;
 end if;
 if jsonb_array_length(selected)<count_needed then raise exception 'Question pool exhausted: % unseen questions remain; ask your teacher to expand the pool or allow repetition',jsonb_array_length(selected);end if;
 insert into public.daily_homework_instances(template_id,student_id,study_date,version_id,opens_at,due_at)values(d.template_id,auth.uid(),p_day,v.id,d.opens_at,d.due_at)on conflict(template_id,student_id,study_date)do nothing;
 insert into public.book_practice_sessions(student_id,title,kind,source_id,timed,time_limit)values(auth.uid(),v.data->>'title','homework',p_template,(v.data->>'timeLimit')is not null,(v.data->>'timeLimit')::int)returning id into sid;
 for q in select value from jsonb_array_elements(selected)loop
 insert into public.book_practice_items(session_id,position,question)values(sid,n,q->'question'||jsonb_build_object('homework_section',v.data->>'title'))returning id into item;
 insert into public.book_practice_keys values(item,(q->>'correct_answer')::int,q->>'explanation');n=n+1;
 end loop;
 update public.daily_homework_instances set session_id=sid,started_at=now(),question_ids=array(select(value->>'id')::uuid from jsonb_array_elements(selected))where template_id=p_template and student_id=auth.uid() and study_date=p_day;
 return sid;
end;$$;
create function public.daily_homework_completed()returns trigger language plpgsql security definer set search_path='' as $$
declare i public.daily_homework_instances;v public.daily_homework_versions;n integer;a integer;c integer;
begin
 select * into i from public.daily_homework_instances where session_id=new.id;
 if i.id is null or old.submitted_at is not null or new.submitted_at is null then return new;end if;
 select * into v from public.daily_homework_versions where id=i.version_id;
 select count(*),count(*)filter(where selected_answer is not null),count(*)filter(where correct and selected_answer is not null)into n,a,c from public.book_practice_items where session_id=new.id;
 -- Homework keeps one final answer per item. Completion requires all assigned work, independently of correctness.
 update public.daily_homework_instances set answered=a,correct=c,attempts=a,active_seconds=new.elapsed_seconds,completed_at=case when a=n and n=(v.data->>'count')::int then new.submitted_at end,completed_late=(new.submitted_at>=due_at)where id=i.id;
 return new;
end;$$;
create trigger daily_completion after update of submitted_at on public.book_practice_sessions for each row execute function public.daily_homework_completed();
-- Reject incomplete daily submissions so students can finish actual required work.
alter function public.finish_book_practice(uuid)rename to finish_book_practice_before_daily;
revoke all on function public.finish_book_practice_before_daily(uuid)from public,anon,authenticated;
create function public.finish_book_practice(p_session_id uuid)returns void language plpgsql security definer set search_path='' as $$
declare i public.daily_homework_instances;s public.book_practice_sessions;
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 select * into i from public.daily_homework_instances where session_id=s.id;
 if i.id is not null and s.student_id=auth.uid() and s.submitted_at is null then
 if exists(select 1 from public.book_practice_items where session_id=s.id and selected_answer is null) and not(s.timed and s.time_limit is not null and now()>=s.started_at+make_interval(secs=>s.time_limit))then raise exception 'Answer every daily homework question before submitting';end if;
 if now()>=i.due_at and not(select(saved_version.data->>'allowLate')::boolean from public.daily_homework_versions saved_version where saved_version.id=i.version_id)then raise exception 'Late work is disabled';end if;
 end if;
 perform public.finish_book_practice_before_daily(p_session_id);
end;$$;
create function public.daily_homework_templates()returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(r))from(select t.*,v.data,v.revision,v.valid_from,jsonb_array_length(v.pool)pool_count from public.daily_homework_templates t join lateral(select * from public.daily_homework_versions v where v.template_id=t.id order by revision desc limit 1)v on true order by t.created_at desc limit 100)r),'[]');
end;$$;
do $$declare f regprocedure;begin
 for f in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in('sync_daily_roster','daily_membership_changed','save_daily_homework','set_daily_homework_state','daily_scheduled','daily_homework_directory','start_daily_homework','daily_homework_completed','daily_homework_templates')loop execute format('revoke all on function %s from public,anon,authenticated',f);end loop;
end;$$;
grant execute on function public.save_daily_homework(jsonb,uuid),public.set_daily_homework_state(uuid,text),public.daily_homework_directory(uuid,uuid,date,date,integer),public.start_daily_homework(uuid,date),public.daily_homework_templates(),public.finish_book_practice(uuid)to authenticated;
commit;
