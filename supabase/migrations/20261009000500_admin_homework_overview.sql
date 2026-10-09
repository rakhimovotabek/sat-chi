begin;
-- Keep existing RPC keys, with explicit active/history scopes. Daily counters
-- represent started occurrences, not unmaterialized scheduled assignments.
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 return jsonb_build_object(
 'students',(select count(*) from public.profiles where role='student' and active),
 'groups',(select count(*) from public.groups),
 'assignments',(select count(*) from public.homework_assignments where active),
 'completed',(select count(*) from public.homework_attempts a join public.book_practice_sessions s on s.id=a.session_id where s.submitted_at is not null),
 'daily_started',(select count(*) from public.daily_homework_instances where session_id is not null),
 'daily_completed',(select count(*) from public.daily_homework_instances where completed_at is not null),
 'questions',(select count(*) from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.submitted_at is not null and (i.selected_answer is not null or nullif(btrim(i.selected_response),'') is not null) and exists(select 1 from public.profiles p where p.id=s.student_id and p.role='student')),
 'activity',coalesce((select jsonb_agg(to_jsonb(a)) from(select sa.*,p.display_name from public.student_activity sa join public.profiles p on p.id=sa.student_id where p.role='student' order by sa.created_at desc limit 25)a),'[]'));
end;$$;
commit;
