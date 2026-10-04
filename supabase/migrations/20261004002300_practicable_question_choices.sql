begin;
create function public.question_practicable(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.questions q where q.id=p_id and jsonb_array_length(q.options)=4 and not exists(select 1 from jsonb_array_elements_text(q.options) o where btrim(o)='' or o ~* '^\s*Choice [A-D] in the source image\s*$') and (select count(distinct lower(btrim(o))) from jsonb_array_elements_text(q.options) o)=4 and coalesce(q.import_metadata->>'options_verified','true')<>'false');
$$;
revoke all on function public.question_practicable(uuid) from public,anon;
grant execute on function public.question_practicable(uuid) to authenticated;
create or replace function public.bank_candidates(p_filters jsonb) returns setof public.questions language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','status','domains','skills','marked')) then raise exception 'Invalid filters'; end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status'; end if;
 if p_filters ? 'domains' and (jsonb_typeof(p_filters->'domains') <> 'array' or jsonb_array_length(p_filters->'domains') > 32) then raise exception 'Invalid domains'; end if;
 if p_filters ? 'skills' and (jsonb_typeof(p_filters->'skills') <> 'array' or jsonb_array_length(p_filters->'skills') > 256) then raise exception 'Invalid skills'; end if;
 if coalesce(p_filters->>'marked','') not in ('','yes','no') then raise exception 'Invalid marked filter'; end if;
 return query select q.* from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where public.question_practicable(q.id) and (b.published or public.is_admin()) and (public.is_admin() or public.question_approved_for_students(q.id))
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
create or replace function public.start_book_practice(p_topic_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; q record; iid uuid; n integer:=0; topic_title text;
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 select t.title into topic_title from public.book_topics t join public.books b on b.id=t.book_id where t.id=p_topic_id and (b.published or public.is_admin());
 if topic_title is null then raise exception 'Topic unavailable' using errcode='42501'; end if;
 insert into public.book_practice_sessions(student_id,title) values(auth.uid(),topic_title) returning id into sid;
 for q in with recursive topics as (select id,array[position] as sort_path from public.book_topics where id=p_topic_id union all select t.id,p.sort_path||t.position from public.book_topics t join topics p on t.parent_id=p.id)
 select qs.*,a.correct_answer,a.explanation from public.questions qs join topics t on t.id=qs.topic_id join public.question_answers a on a.question_id=qs.id where public.question_practicable(qs.id) and (public.is_admin() or public.question_approved_for_students(qs.id)) order by t.sort_path,qs.position,qs.id limit 501 loop
 n=n+1; if n>500 then raise exception 'Practice supports at most 500 questions; choose a smaller topic'; end if;
 insert into public.book_practice_items(session_id,position,question) values(sid,n-1,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation);
 end loop;
 if n=0 then raise exception 'No questions available'; end if;
 return sid;
end; $$;
create or replace function public.update_content_review(p_id uuid,p_action text,p_payload jsonb default null,p_note text default '',p_version timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.content_review_items;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select * into r from public.content_review_items where id=p_id for update;
 if p_action='approve' and r.item_type='question' and r.source_page is null then raise exception 'Verify and save the physical source page before approval';end if;
 if p_action='approve' then
 select * into r from public.content_review_items where id=p_id;
 if r.item_type='question' then
 if r.source_page is null or nullif(btrim(public.content_review_payload(r)->>'source'),'') is null or r.extraction_method='' then raise exception 'Verify physical source page and provenance before approval';end if;
 if r.warnings @> '["Possible duplicate"]' then raise exception 'Resolve the duplicate before approval';end if;
 end if;
 end if;
 return public.update_content_review_core(p_id,p_action,p_payload,p_note,p_version);
end;$$;
create or replace function public.question_approved_for_students(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.questions q where q.id=p_id and public.question_practicable(q.id) and not exists(select 1 from jsonb_array_elements_text(q.options) o where o ~* '^\s*Choice [A-D] in the source image\s*$') and not exists(select 1 from public.content_review_items r where r.item_type='question' and r.entity_id=q.id and (r.status<>'approved' or r.warnings @> '["Possible duplicate"]')));
$$;
commit;