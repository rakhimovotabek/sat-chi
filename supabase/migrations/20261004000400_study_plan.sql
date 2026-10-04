begin;
-- Improve obvious source classifications without changing published content.
update public.import_jobs set category='Reading & Writing' where category='Other' and source_file~*'(reading|writing|grammar|central ideas|dual texts|apostrophe|verbs|modifiers|pronoun|punctuation|agreement|tense|transition)';
create table public.study_preferences(
 student_id uuid primary key references public.profiles on delete cascade,
 minutes_per_day integer not null check(minutes_per_day between 10 and 180),
 preferred_days integer[] not null check(cardinality(preferred_days) between 1 and 7),
 timezone text not null default 'UTC',
 vocabulary_sets uuid[] not null default '{}',
 updated_at timestamptz not null default now()
);
create table public.study_plan_tasks(
 id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles on delete cascade,
 study_date date not null,slot integer not null check(slot between 0 and 10),
 kind text not null check(kind in ('questions','mistakes','vocabulary_due','vocabulary_weak','vocabulary_learn','homework')),
 title text not null,minutes integer not null check(minutes between 1 and 180),target_count integer not null check(target_count between 1 and 100),
 filters jsonb not null default '{}',set_ids uuid[] not null default '{}',word_ids uuid[] not null default '{}',assignment_id uuid references public.homework_assignments on delete set null,
 session_id uuid references public.book_practice_sessions on delete set null,started_at timestamptz,completed_at timestamptz,created_at timestamptz not null default now(),
 unique(student_id,study_date,slot)
);
create index study_tasks_owner_date_idx on public.study_plan_tasks(student_id,study_date);
alter table public.study_preferences enable row level security;
alter table public.study_plan_tasks enable row level security;
revoke all on public.study_preferences,public.study_plan_tasks from public,anon,authenticated;
grant select on public.study_preferences,public.study_plan_tasks to authenticated;
create policy study_preferences_self on public.study_preferences for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create policy study_tasks_self on public.study_plan_tasks for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create function public.save_study_preferences(p_minutes integer,p_days integer[],p_timezone text,p_test_date date,p_current integer,p_target integer,p_sets uuid[] default '{}') returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and role='student') then raise exception 'Active student required' using errcode='42501';end if;
 if p_minutes is null or p_minutes not between 10 and 180 or p_days is null or cardinality(p_days) not between 1 and 7 or exists(select 1 from unnest(p_days)d where d is null or d not between 0 and 6) or (select count(distinct d) from unnest(p_days)d)<>cardinality(p_days) or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) or (p_test_date is not null and p_test_date<timezone(p_timezone,now())::date) or (p_current is not null and (p_current not between 400 and 1600 or p_current%10<>0)) or p_target is null or p_target not between 400 and 1600 or p_target%10<>0 or p_sets is null or cardinality(p_sets)>100 or exists(select 1 from unnest(p_sets)id where not public.can_read_vocab(id)) then raise exception 'Invalid study preferences';end if;
 insert into public.study_preferences(student_id,minutes_per_day,preferred_days,timezone,vocabulary_sets)values(auth.uid(),p_minutes,p_days,p_timezone,p_sets)on conflict(student_id)do update set minutes_per_day=excluded.minutes_per_day,preferred_days=excluded.preferred_days,timezone=excluded.timezone,vocabulary_sets=excluded.vocabulary_sets,updated_at=now();
 update public.profiles set target_test_date=p_test_date,current_sat_score=p_current,target_sat_score=p_target where id=auth.uid();
 -- Reschedule only future unstarted work. History, today's tasks and active sessions survive.
 delete from public.study_plan_tasks where student_id=auth.uid() and study_date>timezone(p_timezone,now())::date and completed_at is null and started_at is null;
end;$$;
create function public.refresh_study_plan() returns jsonb language plpgsql security definer set search_path='' as $$
declare pref public.study_preferences; today date; day date; budget integer; slot integer; n integer; minutes integer; ids uuid[]; sets uuid[]; homework_row record; weak record; filters jsonb; title text; kind text; result jsonb; test_date date;
begin
 if not public.is_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and role='student') then raise exception 'Active student required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('study-plan:'||auth.uid()::text,0));
 select * into pref from public.study_preferences where student_id=auth.uid();
 if pref.student_id is null then return jsonb_build_object('preferences',null,'tasks','[]'::jsonb);end if;
 today=timezone(pref.timezone,now())::date;
 select target_test_date into test_date from public.profiles where id=auth.uid();
 -- Completion is verified from actual submitted answers or reviews of the scheduled words.
 update public.study_plan_tasks t set completed_at=now() where t.student_id=auth.uid() and t.completed_at is null and t.started_at is not null and (
  (t.session_id is not null and exists(select 1 from public.book_practice_sessions s where s.id=t.session_id and s.student_id=auth.uid() and s.submitted_at is not null and (select count(*) from public.book_practice_items i where i.session_id=s.id and i.selected_answer is not null)>=t.target_count))
  or (t.kind like 'vocabulary_%' and cardinality(t.word_ids)>0 and (select count(distinct r.word_id) from public.vocabulary_reviews r where r.student_id=auth.uid() and r.word_id=any(t.word_ids) and r.created_at>=t.started_at)>=t.target_count)
 );
 delete from public.study_plan_tasks where student_id=auth.uid() and study_date>today and completed_at is null and started_at is null;
 for offset_day in 0..13 loop
  day=today+offset_day;
  if extract(dow from day)::int<>all(pref.preferred_days) or (test_date is not null and day>test_date) or exists(select 1 from public.study_plan_tasks where student_id=auth.uid() and study_date=day) then continue;end if;
  budget=pref.minutes_per_day;slot=0;
  -- Homework is prioritized only when assigned and currently due, never fabricated.
  if offset_day=0 then
   select a.id,s.id session_id,h.title,count(q.id)::int question_count into homework_row from public.homework_assignments a join public.homeworks h on h.id=a.homework_id join public.homework_sections hs on hs.homework_id=h.id join public.homework_questions q on q.section_id=hs.id left join public.homework_attempts ha on ha.assignment_id=a.id left join public.book_practice_sessions s on s.id=ha.session_id where a.student_id=auth.uid() and (s.submitted_at is null) and timezone(pref.timezone,h.due_at)::date<=day group by a.id,s.id,h.title order by min(h.due_at) limit 1;
   if homework_row.id is not null and homework_row.question_count>0 and homework_row.question_count*2<=budget then
    minutes=greatest(5,homework_row.question_count*2);
    insert into public.study_plan_tasks(student_id,study_date,slot,kind,title,minutes,target_count,assignment_id)values(auth.uid(),day,slot,'homework',homework_row.title,minutes,least(100,homework_row.question_count),homework_row.id);
    budget=budget-minutes;slot=slot+1;
   end if;
  end if;
  -- Future reviews are predicted only from persisted due dates; no backlog doubling.
  select array_agg(id),array_agg(distinct set_id) into ids,sets from(select w.id,w.set_id from public.vocabulary_words w join public.vocabulary_progress p on p.word_id=w.id where p.student_id=auth.uid() and p.next_review<=timezone(pref.timezone,(day+1)::timestamp) and public.can_read_vocab(w.set_id) and (cardinality(pref.vocabulary_sets)=0 or w.set_id=any(pref.vocabulary_sets)) order by p.next_review limit least(30,greatest(1,budget*2/3)))pool;
  n=coalesce(cardinality(ids),0);
  if n>0 and budget>=5 then
   minutes=least(15,greatest(5,(n+1)/2),budget);
   insert into public.study_plan_tasks(student_id,study_date,slot,kind,title,minutes,target_count,set_ids,word_ids)values(auth.uid(),day,slot,'vocabulary_due','Review due vocabulary',minutes,n,sets,ids);
   budget=budget-minutes;slot=slot+1;
  end if;
  if budget>=6 then
   select count(*)::int into n from public.bank_candidates(jsonb_build_object('status','incorrect'));
   n=least(n,5,budget/3);
   if n>0 then
    insert into public.study_plan_tasks(student_id,study_date,slot,kind,title,minutes,target_count,filters)values(auth.uid(),day,slot,'mistakes','Review question mistakes',n*3,n,'{"status":"incorrect"}');
    budget=budget-n*3;slot=slot+1;
   end if;
  end if;
  -- Pick a weakness only with >=10 recent answered SAT questions.
  select i.question->>'section' section,i.question->>'domain' domain,count(*) samples,count(*)filter(where i.correct) correct into weak from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at>=now()-interval '30 days' and i.selected_answer is not null and i.question->>'section' in ('Math','Reading & Writing') and nullif(i.question->>'domain','') is not null group by 1,2 having count(*)>=10 and count(*)filter(where i.correct)::numeric/count(*)<0.65 order by count(*)filter(where i.correct)::numeric/count(*),count(*)desc limit 1;
  filters=case when weak.domain is not null then jsonb_build_object('section',weak.section,'domain',weak.domain) else '{}'::jsonb end;
  title=coalesce(weak.domain,'Balanced SAT practice');
  if budget>=3 then
   select count(*)::int into n from public.bank_candidates(filters);
   n=least(n,10,budget/3);
   if n>0 then
    insert into public.study_plan_tasks(student_id,study_date,slot,kind,title,minutes,target_count,filters)values(auth.uid(),day,slot,'questions',title,n*3,n,filters);
    budget=budget-n*3;slot=slot+1;
   end if;
  end if;
  -- Fill a short remaining slot with actual weak words or the next published set.
  if budget>=5 then
   select array_agg(id),array_agg(distinct set_id)into ids,sets from(select w.id,w.set_id from public.vocabulary_words w join public.vocabulary_progress p on p.word_id=w.id where p.student_id=auth.uid() and p.failed_recalls>=2 and p.mastery_state<>'mastered' and public.can_read_vocab(w.set_id) and (cardinality(pref.vocabulary_sets)=0 or w.set_id=any(pref.vocabulary_sets)) order by p.failed_recalls desc limit least(15,budget))pool;
   kind='vocabulary_weak';title='Practice weak vocabulary';
   if coalesce(cardinality(ids),0)=0 then
    select array_agg(id),array_agg(distinct set_id)into ids,sets from(select w.id,w.set_id from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid() where coalesce(p.mastery_state,'new')='new' and public.can_read_vocab(w.set_id) and (cardinality(pref.vocabulary_sets)=0 or w.set_id=any(pref.vocabulary_sets)) order by s.position,w.position limit least(15,budget))pool;
    kind='vocabulary_learn';title='Learn new vocabulary';
   end if;
   n=coalesce(cardinality(ids),0);
   if n>0 then insert into public.study_plan_tasks(student_id,study_date,slot,kind,title,minutes,target_count,set_ids,word_ids)values(auth.uid(),day,slot,kind,title,least(15,budget),n,sets,ids);end if;
  end if;
 end loop;
 select jsonb_build_object('preferences',to_jsonb(pref),'today',today,'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.study_date,t.slot)from public.study_plan_tasks t where student_id=auth.uid() and study_date between today-7 and today+13),'[]'))into result;
 return result;
end;$$;
create function public.start_study_task(p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare t public.study_plan_tasks;sid uuid;result jsonb;pref public.study_preferences;begin
 if not public.is_active_user() then raise exception 'Active student required' using errcode='42501';end if;
 select * into t from public.study_plan_tasks where id=p_task and student_id=auth.uid() for update;
 select * into pref from public.study_preferences where student_id=auth.uid();
 if t.id is null or t.study_date<>timezone(pref.timezone,now())::date then raise exception 'Only today’s own tasks can start' using errcode='42501';end if;
 if t.completed_at is not null then return jsonb_build_object('completed',true);end if;
 if t.kind in ('questions','mistakes','homework') then
  sid=t.session_id;
  if sid is null then
   if t.kind='homework' then sid=public.start_homework(t.assignment_id);else sid=public.start_bank_practice(t.filters,t.target_count,false);end if;
   update public.study_plan_tasks set session_id=sid,started_at=now(),target_count=least(t.target_count,(select count(*) from public.book_practice_items where session_id=sid)) where id=t.id;
  end if;
  return jsonb_build_object('session_id',sid);
 else
  update public.study_plan_tasks set started_at=coalesce(started_at,now())where id=t.id;
  return jsonb_build_object('set_ids',t.set_ids,'word_ids',t.word_ids,'mode',case when t.kind='vocabulary_learn' then 'learn' else 'cards' end,'filter',case when t.kind='vocabulary_due' then 'due' when t.kind='vocabulary_weak' then 'weak' else 'new' end);
 end if;
end;$$;
create function public.study_task_vocabulary(p_task uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare t public.study_plan_tasks;result jsonb;begin
 if not public.is_active_user() then raise exception 'Active user required' using errcode='42501';end if;
 select * into t from public.study_plan_tasks where id=p_task and student_id=auth.uid() and started_at is not null;
 if t.id is null then raise exception 'Start your own task first' using errcode='42501';end if;
 select jsonb_build_object('total',count(*),'words',coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('progress',to_jsonb(p),'source_sets',array[w.set_id],'set_title',s.title)order by w.position),'[]')) into result from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid() where w.id=any(t.word_ids) and public.can_read_vocab(w.set_id);
 return result;
end;$$;
revoke all on function public.study_task_vocabulary(uuid) from public,anon,authenticated;
grant execute on function public.study_task_vocabulary(uuid) to authenticated;
revoke all on function public.save_study_preferences(integer,integer[],text,date,integer,integer,uuid[]),public.refresh_study_plan(),public.start_study_task(uuid) from public,anon,authenticated;
grant execute on function public.save_study_preferences(integer,integer[],text,date,integer,integer,uuid[]),public.refresh_study_plan(),public.start_study_task(uuid) to authenticated;
commit;
