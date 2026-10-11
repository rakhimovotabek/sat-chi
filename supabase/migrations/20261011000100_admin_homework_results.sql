begin;
-- Read-only admin reporting. No student keys or progress are changed.
create function public.admin_homework_results(p_homework uuid,p_day date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare meta jsonb; rows jsonb;
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if p_day is null then
 select to_jsonb(h)||jsonb_build_object('recurring',false,'audience',h.recipient_config) into meta from public.homeworks h where h.id=p_homework;
 with roster as(select a.student_id,(a.active and p.active) active,s.id session_id,s.submitted_at completed_at,s.elapsed_seconds active_seconds,
 p.display_name,p.username,
 case when s.id is null then (select count(*) from public.homework_questions q join public.homework_sections sec on sec.id=q.section_id where sec.homework_id=p_homework and sec.active) else (select count(*) from public.book_practice_items i where i.session_id=s.id) end question_count
 from public.homework_assignments a join public.profiles p on p.id=a.student_id left join public.homework_attempts ha on ha.assignment_id=a.id left join public.book_practice_sessions s on s.id=ha.session_id where a.homework_id=p_homework)
 select coalesce(jsonb_agg(to_jsonb(r) order by r.display_name,r.student_id),'[]') into rows from roster r;
 else
 select to_jsonb(t)||jsonb_build_object('recurring',true,'study_date',p_day,'data',v.data,'title',v.data->>'title',
 'audience',jsonb_build_object('students',v.data->'students','groups',v.data->'groups','allStudents',v.data->'allStudents')) into meta
 from public.daily_homework_templates t join lateral(select data from public.daily_homework_versions where template_id=t.id and valid_from<=p_day order by valid_from desc,revision desc limit 1)v on true where t.id=p_homework;
 with scheduled as(select * from public.daily_scheduled(null,p_homework,p_day,p_day)
 union select i.template_id,i.student_id,i.study_date,i.version_id,i.opens_at,i.due_at from public.daily_homework_instances i where i.template_id=p_homework and i.study_date=p_day)
 select coalesce(jsonb_agg(jsonb_build_object('student_id',d.student_id,'display_name',p.display_name,'username',p.username,'active',p.active,
 'session_id',i.session_id,'completed_at',i.completed_at,'due_at',d.due_at,'active_seconds',coalesce(s.elapsed_seconds,i.active_seconds,0),
 'question_count',case when i.session_id is not null then(select count(*) from public.book_practice_items pi where pi.session_id=i.session_id)else(v.data->>'count')::int end) order by p.display_name,d.student_id),'[]') into rows
 from scheduled d join public.profiles p on p.id=d.student_id join public.daily_homework_versions v on v.id=d.version_id left join public.daily_homework_instances i on i.template_id=d.template_id and i.student_id=d.student_id and i.study_date=d.study_date left join public.book_practice_sessions s on s.id=i.session_id;
 end if;
 if meta is null then raise exception 'Assignment or occurrence unavailable';end if;
 -- Results come from persisted items, including open responses and manual decisions.
 select coalesce(jsonb_agg(r||jsonb_build_object('answered',n.answered,'correct',n.correct,'incorrect',n.incorrect,'ungraded',n.answered-n.correct-n.incorrect)),'[]') into rows
 from jsonb_array_elements(rows)r cross join lateral(select count(*)filter(where i.selected_answer is not null or nullif(btrim(i.selected_response),'')is not null)answered,
 count(*)filter(where (i.selected_answer is not null or nullif(btrim(i.selected_response),'')is not null)and i.correct is true)correct,
 count(*)filter(where (i.selected_answer is not null or nullif(btrim(i.selected_response),'')is not null)and i.correct is false)incorrect
 from public.book_practice_items i where i.session_id=(r->>'session_id')::uuid)n;
 return jsonb_build_object('assignment',meta,'rows',rows,
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name))from public.groups g where g.id::text in(select jsonb_array_elements_text(coalesce(meta->'audience'->'groups','[]')))),'[]'));
end;$$;
create function public.admin_practice_answer_keys(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',i.id,'correct_answer',coalesce(o.correct_answer,k.correct_answer::text),'accepted_answers',o.accepted_answers,'accepted_range',o.accepted_range,'explanation',k.explanation,'review_correct',r.review_correct,'review_revision',coalesce(r.revision,0))) from public.book_practice_items i left join public.book_practice_keys k on k.item_id=i.id left join public.book_practice_open_keys o on o.item_id=i.id left join public.practice_open_reviews r on r.item_id=i.id where i.session_id=p_session),'[]');
end;$$;
revoke all on function public.admin_homework_results(uuid,date),public.admin_practice_answer_keys(uuid) from public,anon,authenticated;
grant execute on function public.admin_homework_results(uuid,date),public.admin_practice_answer_keys(uuid) to authenticated;
commit;
