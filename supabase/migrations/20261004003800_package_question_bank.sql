begin;
create or replace function public.bank_candidates(p_filters jsonb) returns setof public.questions language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','status','domains','skills','marked')) then raise exception 'Invalid filters'; end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status'; end if;
 if p_filters ? 'domains' and (jsonb_typeof(p_filters->'domains') <> 'array' or jsonb_array_length(p_filters->'domains') > 32) then raise exception 'Invalid domains'; end if;
 if p_filters ? 'skills' and (jsonb_typeof(p_filters->'skills') <> 'array' or jsonb_array_length(p_filters->'skills') > 256) then raise exception 'Invalid skills'; end if;
 if coalesce(p_filters->>'marked','') not in ('','yes','no') then raise exception 'Invalid marked filter'; end if;
 return query select q.* from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where (public.question_practicable(q.id) or public.book_package_question_ready(q.id)) and (b.published or public.is_admin()) and (public.is_admin() or public.question_approved_for_students(q.id))
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
 and (coalesce(p_filters->>'difficulty','')='' or q.difficulty=p_filters->>'difficulty')
 and (coalesce(p_filters->>'status','')='' or
 case p_filters->>'status'
 when 'unanswered' then not exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.question->>'id'=q.id::text)
 when 'marked' then exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and i.marked and i.question->>'id'=q.id::text)
 else exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.correct=(p_filters->>'status'='correct') and i.question->>'id'=q.id::text) end);
end;$$;
create or replace function public.start_bank_practice(p_filters jsonb,p_count integer default 20,p_timed boolean default false) returns uuid language plpgsql security definer set search_path='' as $$declare sid uuid; q record; iid uuid; n integer:=0;begin
 if p_count not between 1 and 500 then raise exception 'Select 1 to 500 questions'; end if;
 insert into public.book_practice_sessions(student_id,title,kind,filters,timed,time_limit) values(auth.uid(),'Question Bank practice','bank',p_filters,p_timed,case when p_timed then least(21600,p_count*90) end) returning id into sid;
 for q in select c.*,a.correct_answer,a.explanation from public.bank_candidates(p_filters) c join public.question_answers a on a.question_id=c.id order by random() limit p_count loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation); insert into public.book_practice_open_keys select iid,accepted_answers from public.book_open_answers where question_id=q.id; n=n+1; end loop;
 if n=0 then raise exception 'No matching questions'; end if;
 if p_timed then update public.book_practice_sessions set time_limit=least(21600,greatest(60,n*90)) where id=sid; end if;
 return sid;end;$$;
create or replace function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; a jsonb; cleaned jsonb:='[]'; i public.book_practice_items; response text;
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501';end if;
 if s.kind not in ('book','bank') then perform public.save_book_practice_before_packages(p_session_id,p_answers);return;end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then raise exception 'Invalid answers';end if;
 for a in select value from jsonb_array_elements(p_answers) loop
 select * into i from public.book_practice_items where id=(a->>'id')::uuid and session_id=s.id;
 if i.id is null then raise exception 'Question does not belong to session';end if;
 if i.question->>'question_type'='open' then
 if a ? 'selected_response' and jsonb_typeof(a->'selected_response') not in ('string','null') then raise exception 'Invalid response';end if;
 response:=a->>'selected_response';if i.solved_at is not null and i.selected_response is distinct from response then raise exception 'Solved answers cannot change';end if;if length(response)>200 then raise exception 'Response too long';end if;
 -- selected_answer=0 is an answered marker for existing progress/analytics;
 -- grading uses only the frozen accepted strings, never this marker.
 a:=(a-'selected_response')||jsonb_build_object('selected_answer',case when nullif(btrim(response),'') is not null then 0 else null end);
 update public.book_practice_items set selected_response=response,has_answered=has_answered or nullif(btrim(response),'') is not null where id=i.id;
 else
 if a ? 'selected_response' then raise exception 'Unexpected open response';end if;
 update public.book_practice_items set has_answered=has_answered or nullif(a->>'selected_answer','') is not null where id=i.id;
 end if;
 cleaned:=cleaned||jsonb_build_array(a);
 end loop;
 perform public.save_book_practice_before_packages(p_session_id,cleaned);
end;$$;

create or replace function public.book_practice_explanation(p_session uuid,p_item uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('explanation',k.explanation) into result from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id join public.book_practice_keys k on k.item_id=i.id
 where s.id=p_session and i.id=p_item and s.kind in ('book','bank') and s.student_id=auth.uid() and public.is_active_user() and (i.has_answered or i.selected_answer is not null);
 if result is null then raise exception 'Select an answer on your own book question first' using errcode='42501';end if;
 return result;
end;$$;
create or replace function public.book_practice_open_review(p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session and student_id=auth.uid() and kind in ('book','bank') and submitted_at is not null and public.is_active_user()) then raise exception 'Submit your own book practice first' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',k.item_id,'accepted_answers',k.accepted_answers)) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session),'[]');
end;$$;
create or replace function public.can_read_book_package_asset(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_user() and (public.is_admin() or exists(select 1 from public.book_package_assets a join public.books b on b.id=a.book_id
 where a.path=p_path and a.kind<>'archive' and (a.kind in ('question','option') and b.published and public.book_package_question_ready(a.question_id)
 or exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.kind in ('book','bank') and i.question->>'id'=a.question_id::text and (a.kind<>'explanation' or i.has_answered or i.selected_answer is not null or s.submitted_at is not null)))));
$$;
alter table public.question_check_attempts add column selected_response text check(length(selected_response)<=200);
create function public.check_bank_response(p_session uuid,p_item uuid,p_response text,p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; i public.book_practice_items; a public.question_check_attempts; is_correct boolean; n integer; previous integer;
begin
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() or s.kind<>'bank' then raise exception 'Own bank session required' using errcode='42501';end if;
 select * into i from public.book_practice_items where id=p_item and session_id=s.id;
 if i.id is null or i.question->>'question_type'<>'open' or nullif(btrim(p_response),'') is null or length(p_response)>200 or p_event is null then raise exception 'Invalid attempt';end if;
 select * into a from public.question_check_attempts where id=p_event;
 if a.id is not null then
 if a.item_id<>i.id or a.selected_response is distinct from p_response then raise exception 'Attempt event conflict';end if;
 return to_jsonb(a);
 end if;
 if s.submitted_at is not null or i.solved_at is not null then raise exception 'Question already completed';end if;
 select exists(select 1 from public.book_practice_open_keys k, jsonb_array_elements_text(k.accepted_answers) v where k.item_id=i.id and btrim(v)=btrim(p_response)) into is_correct;
 select count(*)+1,coalesce(max(active_seconds),0) into n,previous from public.question_check_attempts where item_id=i.id;
 insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,selected_response,correct,active_seconds,between_seconds,eliminated,marked)
 values(p_event,i.id,n,0,p_response,is_correct,i.active_seconds,i.active_seconds-previous,i.eliminated,i.marked) returning * into a;
 update public.book_practice_items set selected_answer=0,selected_response=p_response,has_answered=true,correct=a.correct,solved_at=case when a.correct then now() end where id=i.id;
 insert into public.student_activity(student_id,session_id,kind,title) values(s.student_id,s.id,s.kind,s.title) on conflict(session_id) do nothing;
 if not exists(select 1 from public.book_practice_items where session_id=s.id and solved_at is null) then update public.book_practice_sessions set submitted_at=now() where id=s.id;end if;
 return to_jsonb(a);
end;$$;
create or replace function public.reject_open_integer_check() returns trigger language plpgsql set search_path='' as $$begin
 if new.selected_response is null and exists(select 1 from public.book_practice_items where id=new.item_id and question->>'question_type'='open') then raise exception 'Open response required';end if;return new;end;$$;
create trigger reject_open_integer_check before insert on public.question_check_attempts for each row execute function public.reject_open_integer_check();
revoke all on function public.check_bank_response(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.check_bank_response(uuid,uuid,text,uuid) to authenticated;
create or replace function public.finish_book_practice(p_session_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.finish_book_practice_before_packages(p_session_id);
 update public.book_practice_items i set correct=exists(select 1 from jsonb_array_elements_text(k.accepted_answers) v where btrim(v)=btrim(i.selected_response))
 from public.book_practice_open_keys k,public.book_practice_sessions s where k.item_id=i.id and s.id=i.session_id and s.id=p_session_id and s.kind in ('book','bank') and s.student_id=auth.uid();
end;$$;

create or replace function public.create_homework(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare hid uuid; sec jsonb; sid uuid; q record; n integer; pos integer:=0; iid uuid; students uuid[]; groups_ids uuid[]; total integer:=0;begin
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
 insert into public.homework_questions(section_id,position,question,correct_answer,explanation) values(sid,n,to_jsonb(q)-'correct_answer'-'explanation',q.correct_answer,q.explanation);n=n+1;end loop;
 if n<>(sec->>'count')::integer then raise exception 'Not enough eligible questions for section %',sec->>'title'; end if;total=total+n;
 end loop;
 if total>500 then raise exception 'Homework supports at most 500 questions'; end if;
 insert into public.homework_assignments(homework_id,student_id) select hid,p.id from public.profiles p where p.role='student' and p.active and (coalesce((p_data->>'allStudents')::boolean,false) or p.id=any(students) or exists(select 1 from public.group_members m where m.student_id=p.id and m.group_id=any(groups_ids)));
 if not found then raise exception 'Choose at least one active student'; end if;
 return hid;end;$$;
create or replace function public.question_bank(p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb; n integer;begin
 if p_page not between 0 and 100000 then raise exception 'Invalid page'; end if;
 select count(*) into n from public.bank_candidates(p_filters);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select q.id,q.question_text,q.image_url,q.question_type,q.import_metadata->>'questionNumber' question_number,q.section,q.domain,q.skill,q.difficulty,b.title book_title,t.title topic_title from public.bank_candidates(p_filters) q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id order by q.id limit 25 offset p_page*25) x;
 return jsonb_build_object('count',n,'rows',result);
end;$$;
commit;
