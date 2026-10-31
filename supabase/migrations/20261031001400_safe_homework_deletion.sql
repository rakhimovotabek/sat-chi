begin;
alter table public.homeworks add column lifecycle_state text not null default 'active' check(lifecycle_state in('active','paused','archived')),
 add column deleted_at timestamptz,add column deleted_by uuid references public.profiles;
alter table public.daily_homework_templates add column deleted_at timestamptz,add column deleted_by uuid references public.profiles;
alter table public.study_plan_tasks add column canceled_at timestamptz;
create table public.homework_deletions(
 kind text not null check(kind in('one-time','recurring')),homework_id uuid not null,
 actor uuid not null references public.profiles,deleted_at timestamptz not null default now(),
 mode text not null check(mode in('permanent','retained')),snapshot jsonb not null,
 primary key(kind,homework_id)
);
alter table public.homework_deletions enable row level security;
revoke all on public.homework_deletions from public,anon,authenticated;
grant select on public.homework_deletions to authenticated;
create policy homework_deletion_admin on public.homework_deletions for select to authenticated using((select public.is_admin()));
grant all on public.homework_deletions to service_role;
revoke insert,update,delete on public.homeworks from authenticated;

create function public.homework_delete_preview(p_kind text,p_homework uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 if p_kind='one-time' then
 select jsonb_build_object('id',h.id,'kind',p_kind,'title',h.title,'state',h.lifecycle_state,'deleted',h.deleted_at is not null,
 'audience',coalesce(h.recipient_config,'{}'),
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name))from public.homework_assignments a join public.profiles p on p.id=a.student_id where a.homework_id=h.id),'[]'),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name))from public.groups g where g.id::text in(select jsonb_array_elements_text(coalesce(h.recipient_config->'groups','[]')))),'[]'),
 'assignments',(select count(*)from public.homework_assignments where homework_id=h.id),
 'started',(select count(*)from public.book_practice_sessions where kind='homework'and source_id=h.id),
 'submissions',(select count(*)from public.homework_attempts a join public.homework_assignments r on r.id=a.assignment_id join public.book_practice_sessions s on s.id=a.session_id where r.homework_id=h.id and s.submitted_at is not null),
 'dependent_history',exists(select 1 from public.study_plan_tasks st join public.homework_assignments a on a.id=st.assignment_id where a.homework_id=h.id and(st.started_at is not null or st.completed_at is not null or st.session_id is not null))or exists(select 1 from public.homework_attempts i join public.homework_assignments a on a.id=i.assignment_id where a.homework_id=h.id)or exists(select 1 from public.homework_item_history i join public.homework_assignments a on a.id=i.assignment_id where a.homework_id=h.id))into result from public.homeworks h where h.id=p_homework;
 elsif p_kind='recurring' then
 select jsonb_build_object('id',t.id,'kind',p_kind,'title',coalesce(v.data->>'title','Untitled recurring homework'),'state',t.state,'deleted',t.deleted_at is not null,
 'audience',jsonb_build_object('allStudents',t.all_students,'students',to_jsonb(t.students),'groups',to_jsonb(t.groups)),
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name))from public.profiles p where p.id=any(t.students)),'[]'),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name))from public.groups g where g.id=any(t.groups)),'[]'),
 'assignments',(select count(distinct student_id)from public.daily_homework_enrollments where template_id=t.id),
 'started',(select count(*)from public.book_practice_sessions where kind='homework'and source_id=t.id),
 'submissions',(select count(*)from public.daily_homework_instances i join public.book_practice_sessions s on s.id=i.session_id where i.template_id=t.id and s.submitted_at is not null),
 'dependent_history',exists(select 1 from public.daily_homework_instances where template_id=t.id))into result
 from public.daily_homework_templates t left join lateral(select data from public.daily_homework_versions where template_id=t.id order by revision desc limit 1)v on true where t.id=p_homework;
 else raise exception 'Invalid homework kind';end if;
 if result is null then raise exception 'Assignment unavailable'using errcode='42501';end if;
 return result||jsonb_build_object('retains_history',(result->>'started')::bigint>0 or(result->>'dependent_history')::boolean);
end;$$;
revoke all on function public.homework_delete_preview(text,uuid)from public,anon;
grant execute on function public.homework_delete_preview(text,uuid)to authenticated;

create function public.delete_homework(p_kind text,p_homework uuid,p_confirm boolean default false)returns jsonb
language plpgsql security definer set search_path='' as $$
declare preview jsonb;prior public.homework_deletions;kept boolean;at_time timestamptz:=clock_timestamp();
begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 if p_confirm is distinct from true then raise exception 'Explicit confirmation required';end if;
 if p_kind not in('one-time','recurring')or p_kind is null or p_homework is null then raise exception 'Invalid assignment';end if;
 -- This admission lock also serializes retries after permanent deletion removed the row.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('homework-delete:'||p_kind||':'||p_homework::text,0));
 select * into prior from public.homework_deletions where kind=p_kind and homework_id=p_homework;
 if prior.homework_id is not null then return jsonb_build_object('id',p_homework,'mode',prior.mode,'already_deleted',true);end if;
 -- Match start/save/finish/assignment edit lock order. No student work can be
 -- created between dependency inspection and deletion of its parent.
 if p_kind='one-time' then
 perform 1 from public.homeworks where id=p_homework for update;
 perform 1 from public.homework_assignments where homework_id=p_homework order by id for update;
 else perform 1 from public.daily_homework_templates where id=p_homework for update;end if;
 preview:=public.homework_delete_preview(p_kind,p_homework);kept:=(preview->>'retains_history')::boolean;
 insert into public.homework_deletions(kind,homework_id,actor,deleted_at,mode,snapshot)
 values(p_kind,p_homework,auth.uid(),at_time,case when kept then 'retained'else 'permanent'end,preview);
 if p_kind='one-time'then
 update public.study_plan_tasks st set canceled_at=at_time where st.completed_at is null and st.assignment_id in(select a.id from public.homework_assignments a where a.homework_id=p_homework);
 if kept then
 update public.homeworks set deleted_at=at_time,deleted_by=auth.uid(),lifecycle_state='archived' where id=p_homework;
 update public.homework_assignments set active=false where homework_id=p_homework;
 else delete from public.homeworks where id=p_homework;end if;
 else
 if kept then
 update public.daily_homework_templates set deleted_at=at_time,deleted_by=auth.uid(),state='archived'where id=p_homework;
 else
 delete from public.daily_homework_enrollments where template_id=p_homework;
 delete from public.daily_homework_windows where template_id=p_homework;
 delete from public.daily_homework_versions where template_id=p_homework;
 delete from public.daily_homework_templates where id=p_homework;
 end if;
 end if;
 return jsonb_build_object('id',p_homework,'mode',case when kept then 'retained'else 'permanent'end,'already_deleted',false);
end;$$;
revoke all on function public.delete_homework(text,uuid,boolean)from public,anon;
grant execute on function public.delete_homework(text,uuid,boolean)to authenticated;

create function public.guard_deleted_homework()returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE'and old.deleted_at is not null then raise exception 'Deleted assignments cannot be restored or edited'using errcode='42501';end if;
 if tg_op='DELETE'then
 if tg_table_name='homeworks'and(exists(select 1 from public.book_practice_sessions where kind='homework'and source_id=old.id)
 or exists(select 1 from public.homework_attempts i join public.homework_assignments a on a.id=i.assignment_id where a.homework_id=old.id)or exists(select 1 from public.homework_item_history i join public.homework_assignments a on a.id=i.assignment_id where a.homework_id=old.id))then
 raise exception 'Student history prevents permanent deletion'using errcode='42501';
 elsif tg_table_name='daily_homework_templates'and(exists(select 1 from public.book_practice_sessions where kind='homework'and source_id=old.id)
 or exists(select 1 from public.daily_homework_instances where template_id=old.id))then raise exception 'Student history prevents permanent deletion'using errcode='42501';end if;
 return old;end if;
 return new;
end;$$;
revoke all on function public.guard_deleted_homework()from public,anon,authenticated,service_role;
create trigger protect_deleted_homework before update or delete on public.homeworks for each row execute function public.guard_deleted_homework();
create trigger protect_deleted_homework before update or delete on public.daily_homework_templates for each row execute function public.guard_deleted_homework();

create function public.set_homework_state(p_homework uuid,p_state text)returns void
language plpgsql security definer set search_path='' as $$begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 if p_state is null or p_state not in('active','paused','archived')then raise exception 'Invalid state';end if;
 perform 1 from public.homeworks where id=p_homework and deleted_at is null for update;
 if not found then raise exception 'Assignment unavailable'using errcode='42501';end if;
 update public.homeworks set lifecycle_state=p_state where id=p_homework;
end;$$;
revoke all on function public.set_homework_state(uuid,text)from public,anon;
grant execute on function public.set_homework_state(uuid,text)to authenticated;

-- All existing administrators have assignment-management scope in this app;
-- no school/tenant ownership model is inferred from missing creator metadata.
create function public.homework_management_directory(p_kind text default 'one-time',p_page integer default 0,p_search text default '',p_archived boolean default true)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 if p_archived is null or p_page is null or p_page not between 0 and 100000 or p_search is null or length(p_search)>160 then raise exception 'Invalid assignment page';end if;
 if p_kind='one-time'then
 with filtered as materialized(select *from public.homeworks where deleted_at is null and(p_archived or lifecycle_state<>'archived')and position(lower(btrim(p_search))in lower(title))>0),
 page as materialized(select *from filtered order by created_at desc,id limit 25 offset p_page*25),
 rows as(select h.id,h.title,h.due_at,h.created_at,h.lifecycle_state state,
 (select count(*)from public.homework_assignments where homework_id=h.id)assigned,
 (select count(*)from public.homework_attempts a join public.homework_assignments r on r.id=a.assignment_id join public.book_practice_sessions s on s.id=a.session_id where r.homework_id=h.id and s.submitted_at is not null)submissions
 from page h)
 select jsonb_build_object('total',(select count(*)from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(rows)order by created_at desc,id)from rows),'[]'))into result;
 elsif p_kind='recurring'then
 with filtered as materialized(select t.*,coalesce(v.data,'{}')data,v.revision,v.valid_from,coalesce(v.pool_count,jsonb_array_length(v.pool),0)pool_count
 from public.daily_homework_templates t left join lateral(select data,revision,valid_from,pool_count,pool from public.daily_homework_versions where template_id=t.id order by revision desc limit 1)v on true
 where t.deleted_at is null and(p_archived or t.state<>'archived')and position(lower(btrim(p_search))in lower(coalesce(v.data->>'title','Untitled recurring homework')))>0),
 page as(select *from filtered order by created_at desc,id limit 25 offset p_page*25)
 select jsonb_build_object('total',(select count(*)from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)order by created_at desc,id)from page),'[]'))into result;
 else raise exception 'Invalid homework kind';end if;
 return result;
end;$$;
revoke all on function public.homework_management_directory(text,integer,text,boolean)from public,anon;
grant execute on function public.homework_management_directory(text,integer,text,boolean)to authenticated;

-- Preserve historical late-policy restrictions and protect pending deleted work.
do $$declare definition text;needle text;begin
 select pg_get_functiondef('public.can_access_homework_session(uuid)'::regprocedure)into definition;
 needle:='and not exists(select 1 from public.daily_homework_instances';
 if position(needle in definition)=0 then raise exception 'Session access definition changed; review required';end if;
 definition:=replace(definition,needle,
 'and not exists(select 1 from public.homework_attempts ha join public.homework_assignments a on a.id=ha.assignment_id join public.homeworks h on h.id=a.homework_id join public.book_practice_sessions s on s.id=ha.session_id where ha.session_id=p_session and s.submitted_at is null and(h.deleted_at is not null or h.lifecycle_state<>''active''))
 and not exists(select 1 from public.daily_homework_instances d join public.daily_homework_templates t on t.id=d.template_id join public.book_practice_sessions s on s.id=d.session_id where d.session_id=p_session and s.submitted_at is null and t.deleted_at is not null)
 and not exists(select 1 from public.daily_homework_instances');
 execute definition;
 select pg_get_functiondef('public.lock_homework_session(uuid)'::regprocedure)into definition;
 definition:=replace(definition,'begin','begin
 perform t.id from public.daily_homework_templates t join public.daily_homework_instances i on i.template_id=t.id where i.session_id=p_session for update of t;');
 execute definition;
 select pg_get_functiondef('public.start_homework(uuid)'::regprocedure)into definition;
 needle:='if a.id is null or not a.active';
 if position(needle in definition)=0 then raise exception 'One-time start definition changed';end if;
 execute replace(definition,needle,'if h.deleted_at is not null or h.lifecycle_state<>''active''or a.id is null or not a.active');
 select pg_get_functiondef('public.start_daily_homework(uuid,date)'::regprocedure)into definition;
 needle:='select * into i from public.daily_homework_instances';
 if position(needle in definition)=0 then raise exception 'Recurring start definition changed';end if;
 execute replace(definition,needle,'if exists(select 1 from public.daily_homework_templates where id=p_template and deleted_at is not null)then raise exception ''Assignment unavailable''using errcode=''42501'';end if;
 select * into i from public.daily_homework_instances');
 select pg_get_functiondef('public.sync_one_time_roster()'::regprocedure)into definition;
 if position('where recipient_config is not null' in definition)=0 then raise exception 'One-time roster definition changed';end if;
 execute replace(definition,'where recipient_config is not null','where recipient_config is not null and deleted_at is null');
 select pg_get_functiondef('public.homework_directory()'::regprocedure)into definition;
 needle:='where a.active and p.active and';
 if position(needle in definition)=0 then raise exception 'Homework directory definition changed';end if;
 execute replace(definition,needle,'where h.deleted_at is null and(public.is_admin()or h.lifecycle_state=''active''or s.submitted_at is not null)and a.active and p.active and');
 select pg_get_functiondef('public.daily_homework_templates()'::regprocedure)into definition;
 needle:='order by t.created_at desc limit 100';
 if position(needle in definition)=0 then raise exception 'Recurring management definition changed';end if;
 execute replace(definition,needle,'where t.deleted_at is null order by t.created_at desc limit 100');
 select pg_get_functiondef('public.daily_homework_directory(uuid,uuid,date,date,integer)'::regprocedure)into definition;
 needle:='with scheduled as materialized(';
 if position(needle in definition)=0 or position('),ordered as materialized('in definition)=0 then raise exception 'Daily directory scope changed';end if;
 definition:=replace(definition,needle,'with scheduled as materialized(select candidate.*from(');
 definition:=replace(definition,'),ordered as materialized(',')candidate join public.daily_homework_templates visible on visible.id=candidate.template_id and visible.deleted_at is null),ordered as materialized(');
 execute definition;
end;$$;

-- Preserve due historical days and submitted results, without generating new
-- canceled obligations or future daily work after deletion.
do $$declare definition text;needle text;begin
 select pg_get_functiondef('public.daily_scheduled(uuid,uuid,date,date)'::regprocedure)into definition;
 needle:='where(p_template is null or t.id=p_template)';
 if position(needle in definition)=0 then raise exception 'Daily schedule definition changed';end if;
 execute replace(definition,needle,'where(t.deleted_at is null or(d.day::date+1)::timestamp at time zone t.timezone<=t.deleted_at)and(p_template is null or t.id=p_template)');
 select pg_get_functiondef('public.daily_homework_rows(uuid,uuid,date,date)'::regprocedure)into definition;
 needle:='left join public.book_practice_sessions s on s.id=i.session_id;';
 if position(needle in definition)=0 then raise exception 'Historical row projection changed';end if;
 execute replace(definition,needle,'left join public.book_practice_sessions s on s.id=i.session_id
 where t.deleted_at is null or i.completed_at is not null or d.due_at<=t.deleted_at;');
 select pg_get_functiondef('public.daily_homework_report(uuid,uuid,date,date,integer)'::regprocedure)into definition;
 needle:='from rows where is_today group by template_id';
 if position(needle in definition)=0 then raise exception 'Current daily counters changed';end if;
 execute replace(definition,needle,'from rows where is_today and not exists(select 1 from public.daily_homework_templates t where t.id=rows.template_id and t.deleted_at is not null)group by template_id');
 select pg_get_functiondef('public.admin_overview()'::regprocedure)into definition;
 definition:=replace(definition,'from public.homework_assignments where active','from public.homework_assignments a join public.homeworks h on h.id=a.homework_id where a.active and h.lifecycle_state=''active''and h.deleted_at is null');
 definition:=replace(definition,'where s.submitted_at is not null),','where s.submitted_at is not null and exists(select 1 from public.homework_assignments r join public.homeworks h on h.id=r.homework_id where r.id=a.assignment_id and h.deleted_at is null)),');
 -- Keep historical answer and completion analytics elsewhere; current KPI cards
 -- omit deleted definitions while actual submitted question totals remain saved.
 definition:=replace(definition,'from public.daily_homework_instances where session_id is not null','from public.daily_homework_instances i join public.daily_homework_templates t on t.id=i.template_id where i.session_id is not null and t.deleted_at is null');
 definition:=replace(definition,'from public.daily_homework_instances where completed_at is not null','from public.daily_homework_instances i join public.daily_homework_templates t on t.id=i.template_id where i.completed_at is not null and t.deleted_at is null');
 execute definition;
end;$$;

create function public.can_read_daily_instance(p_instance uuid)returns boolean
language sql stable security definer set search_path=''as $$
 select exists(select 1 from public.daily_homework_instances i join public.daily_homework_templates t on t.id=i.template_id
 left join public.book_practice_sessions s on s.id=i.session_id
 where i.id=p_instance and i.student_id=auth.uid()and public.is_active_user()and(t.deleted_at is null or s.submitted_at is not null));
$$;
revoke all on function public.can_read_daily_instance(uuid)from public,anon;
grant execute on function public.can_read_daily_instance(uuid)to authenticated;
drop policy daily_instance_self on public.daily_homework_instances;
create policy daily_instance_self on public.daily_homework_instances for select to authenticated
 using(student_id=(select auth.uid())and public.can_read_daily_instance(id));
-- An archived definition can be restored to paused status; deleted ones cannot.
do $$declare definition text;needle text;begin
 select pg_get_functiondef('public.set_daily_homework_state(uuid,text)'::regprocedure)into definition;
 needle:='if t.id is null or t.state=''archived''';
 if position(needle in definition)=0 then raise exception 'Daily state definition changed';end if;
 execute replace(definition,needle,'if t.state=''archived''and p_state=''active''then raise exception ''Assignment unavailable for direct resume. Restore to paused first.'';end if;
 if t.id is null or t.deleted_at is not null');
end;$$;

-- Retain canceled study-plan rows, but remove them from pending counts/starts.
-- Acquire the homework parent before the task row, matching Delete lock order.
do $$declare definition text;needle text;begin
 select pg_get_functiondef('public.refresh_study_plan()'::regprocedure)into definition;
 needle:='where a.student_id=auth.uid()';
 if position(needle in definition)=0 then raise exception 'Study-plan homework selection changed';end if;
 definition:=replace(definition,needle,'where a.active and h.deleted_at is null and h.lifecycle_state=''active''and a.student_id=auth.uid()');
 needle:='from public.study_plan_tasks t where student_id=auth.uid()';
 if position(needle in definition)=0 then raise exception 'Study-plan projection changed';end if;
 definition:=replace(definition,needle,'from public.study_plan_tasks t where t.canceled_at is null and student_id=auth.uid()');
 execute definition;
 select pg_get_functiondef('public.start_study_task(uuid)'::regprocedure)into definition;
 needle:='select * into t from public.study_plan_tasks where id=p_task';
 if position(needle in definition)=0 then raise exception 'Task admission changed';end if;
 definition:=replace(definition,needle,'perform h.id from public.homeworks h join public.homework_assignments a on a.homework_id=h.id join public.study_plan_tasks st on st.assignment_id=a.id where st.id=p_task and st.student_id=auth.uid()for update of h;
 select * into t from public.study_plan_tasks where id=p_task');
 definition:=replace(definition,'if t.id is null or t.study_date','if t.canceled_at is not null then raise exception ''Task unavailable''using errcode=''42501'';end if;
 if t.id is null or t.study_date');
 execute definition;
end;$$;
drop policy study_tasks_self on public.study_plan_tasks;
create policy study_tasks_self on public.study_plan_tasks for select to authenticated using(student_id=(select auth.uid())and canceled_at is null and(select public.is_active_user()));

create function public.purge_deleted_homework(p_kind text,p_homework uuid,p_confirm boolean default false)returns void
language plpgsql security definer set search_path=''as $$
declare preview jsonb;
begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 if p_confirm is distinct from true then raise exception 'Explicit permanent-purge confirmation required';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('homework-delete:'||p_kind||':'||p_homework::text,0));
 if not exists(select 1 from public.homework_deletions where kind=p_kind and homework_id=p_homework)then raise exception 'Only deleted assignments can be purged';end if;
 if p_kind='one-time'then perform 1 from public.homeworks where id=p_homework for update;
 elsif p_kind='recurring'then perform 1 from public.daily_homework_templates where id=p_homework for update;
 else raise exception 'Invalid homework kind';end if;
 if not found then return;end if;
 preview:=public.homework_delete_preview(p_kind,p_homework);
 if(preview->>'retains_history')::boolean then raise exception 'Student attempts or dependent history prevent permanent purge'using errcode='42501';end if;
 if p_kind='one-time'then delete from public.homeworks where id=p_homework;
 else
 delete from public.daily_homework_enrollments where template_id=p_homework;
 delete from public.daily_homework_windows where template_id=p_homework;
 delete from public.daily_homework_versions where template_id=p_homework;
 delete from public.daily_homework_templates where id=p_homework;
 end if;
end;$$;
revoke all on function public.purge_deleted_homework(text,uuid,boolean)from public,anon;
grant execute on function public.purge_deleted_homework(text,uuid,boolean)to authenticated;
notify pgrst,'reload schema';
commit;
