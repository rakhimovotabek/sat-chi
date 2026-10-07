begin;
-- Preserve source data and historical snapshots; extend the existing contracts.

create or replace function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; a jsonb; cleaned jsonb:='[]'; i public.book_practice_items; response text;
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501';end if;
 if s.kind not in ('book','bank','homework') then perform public.save_book_practice_before_packages(p_session_id,p_answers);return;end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then raise exception 'Invalid answers';end if;
 for a in select value from jsonb_array_elements(p_answers) loop
 select * into i from public.book_practice_items where id=(a->>'id')::uuid and session_id=s.id;
 if i.id is null then raise exception 'Question does not belong to session';end if;
 if i.question->>'question_type'='open' then
 if not exists(select 1 from public.book_practice_open_keys where item_id=i.id) then raise exception 'Open-response answer key missing for question %',i.question->>'id';end if;
 if a ? 'selected_response' and jsonb_typeof(a->'selected_response') not in ('string','null') then raise exception 'Invalid response';end if;
 response:=case when a ? 'selected_response' then a->>'selected_response' else i.selected_response end;if i.solved_at is not null and i.selected_response is distinct from response then raise exception 'Solved answers cannot change';end if;if length(response)>200 then raise exception 'Response too long';end if;
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

create or replace function public.finish_book_practice_before_daily(p_session_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions;
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501'; end if;
 if s.submitted_at is not null then return; end if;
 update public.book_practice_items i set correct=case when i.question->>'question_type'='open' then public.package_open_response_correct(i.id,i.selected_response) else coalesce(i.selected_answer=k.correct_answer,false) end from public.book_practice_keys k where i.session_id=s.id and k.item_id=i.id;
 update public.book_practice_sessions set submitted_at=now() where id=s.id;
end; $$;

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

create or replace function public.fill_package_open_practice_key() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.answer_format is not null or new.correct_answer is not null or new.accepted_range is not null then return new;end if;
  select a.correct_answer,a.answer_format,a.accepted_range
    into new.correct_answer,new.answer_format,new.accepted_range
    from public.book_practice_items i
    join public.book_open_answers a on a.question_id=(i.question->>'id')::uuid
    where i.id=new.item_id;
  return new;
end;
$$;

-- Recover missing frozen keys only from canonical keys or the retained package
-- with the same asset fingerprint and exact source question identifier.
-- This helper is private: it must never expose answer keys to browser roles.
create function public.homework_snapshot_open_key(q jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 with canonical as (
 select to_jsonb(o)-'question_id' key from public.book_open_answers o
 where o.question_id::text=q->>'id'
 ), supplied as (
 select jsonb_build_object('accepted_answers',coalesce(sq->'acceptedAnswers','[]'),
 'correct_answer',sq->>'correctAnswer','answer_format',coalesce(sq->>'answerFormat',case when p.slug='800-challenge-hard-math-150-part-1-sat-math-club' then 'numeric' end),
 'accepted_range',sq->'acceptedRange') key
 from public.book_import_packages p
 cross join lateral jsonb_array_elements(p.source_payload->'chapters') chapter
 cross join lateral jsonb_array_elements(chapter->'topics') topic
 cross join lateral jsonb_array_elements(topic->'questions') sq
 where q->>'image_url' like '%/book-package-assets/'||p.fingerprint||'/%'
 and sq->>'id'=q->'import_metadata'->>'package_question_id'
 and sq->>'type'='open' and sq->'needsReview'='false'::jsonb
 and (jsonb_array_length(coalesce(sq->'acceptedAnswers','[]'))>0
 or (sq->'acceptedRange' is not null and sq->'acceptedRange'<>'null'::jsonb))
 )
 select coalesce((select key from canonical),(select key from (select key,count(*) over() n from supplied) unique_key where n=1));
$$;
revoke all on function public.homework_snapshot_open_key(jsonb) from public,anon,authenticated;

update public.daily_homework_versions v set pool=(select jsonb_agg(
 case when e->'question'->>'question_type'='open' and (e->'open_key' is null or e->'open_key'='null'::jsonb)
 then e||jsonb_build_object('open_key',public.homework_snapshot_open_key(e->'question')) else e end order by n)
 from jsonb_array_elements(v.pool) with ordinality x(e,n))
where exists(select 1 from jsonb_array_elements(v.pool) e where e->'question'->>'question_type'='open' and (e->'open_key' is null or e->'open_key'='null'::jsonb));
insert into public.book_practice_open_keys(item_id,accepted_answers,correct_answer,answer_format,accepted_range)
select i.id,k.key->'accepted_answers',k.key->>'correct_answer',k.key->>'answer_format',k.key->'accepted_range'
from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
cross join lateral (select public.homework_snapshot_open_key(i.question) key) k
where s.kind='homework' and i.question->>'question_type'='open' and k.key is not null
and not exists(select 1 from public.book_practice_open_keys existing where existing.item_id=i.id);



create function public.question_answer_ui_supported(q jsonb) returns boolean
language sql immutable set search_path='' as $$
 select case when q->>'question_type'='open' then true
 when coalesce(q->>'question_type','mcq')<>'mcq' or jsonb_typeof(q->'options') is distinct from 'array' then false
 else jsonb_array_length(q->'options')=4 and not exists(
 select 1 from jsonb_array_elements(q->'options') with ordinality o(value,n)
 where jsonb_typeof(value)<>'string' or not (
 nullif(q->'option_image_urls'->>(n::int-1),'') is not null
 or (q->'import_metadata'->'questionImageIncludesOptions'='true'::jsonb and nullif(q->>'image_url','') is not null)
 or (nullif(btrim(value#>>'{}'),'') is not null and value#>>'{}' !~* '^\s*Choice [A-D] in the source image\s*$')) is true)
 end;
$$;
revoke all on function public.question_answer_ui_supported(jsonb) from public,anon;
grant execute on function public.question_answer_ui_supported(jsonb) to authenticated,service_role;


create or replace function public.book_package_question_ready(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.questions q join public.book_topics t on t.id=q.topic_id
 join public.book_import_packages p on p.book_id=t.book_id join public.question_answers a on a.question_id=q.id
 where q.id=p_id and public.question_answer_ui_supported(to_jsonb(q)) and q.import_metadata->>'package_question_id' is not null
 and exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and r.status='approved')
 and (q.question_type='mcq' and a.correct_answer between 0 and 3
 or q.question_type='open' and exists(select 1 from public.book_open_answers o where o.question_id=q.id)));
$$;

create or replace function public.bank_candidates_before_difficulties(p_filters jsonb) returns setof public.questions language plpgsql stable security definer set search_path='' as $$declare admin_user boolean;begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','status','domains','skills','marked')) then raise exception 'Invalid filters'; end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status'; end if;
 if p_filters ? 'domains' and (jsonb_typeof(p_filters->'domains') <> 'array' or jsonb_array_length(p_filters->'domains') > 32) then raise exception 'Invalid domains'; end if;
 if p_filters ? 'skills' and (jsonb_typeof(p_filters->'skills') <> 'array' or jsonb_array_length(p_filters->'skills') > 256) then raise exception 'Invalid skills'; end if;
 if coalesce(p_filters->>'marked','') not in ('','yes','no') then raise exception 'Invalid marked filter'; end if;
 admin_user:=public.is_admin();
 return query select q.* from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where (b.published or admin_user) and public.question_answer_ui_supported(to_jsonb(q)) and (
 -- Packages require an approval, a supplied key, and usable answer controls.
 (q.import_metadata->>'package_question_id' is not null
 and exists(select 1 from public.book_import_packages p where p.book_id=b.id)
 and exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and r.status='approved')
 and exists(select 1 from public.question_answers a where a.question_id=q.id and
 (q.question_type='mcq' and a.correct_answer between 0 and 3 or q.question_type='open' and exists(select 1 from public.book_open_answers o where o.question_id=q.id))))
 or (q.question_type='mcq' and jsonb_array_length(q.options)=4 and coalesce(q.import_metadata->>'options_verified','true')<>'false' and not exists(select 1 from jsonb_array_elements_text(q.options) o where btrim(o)='' or o ~* '^\s*Choice [A-D] in the source image\s*$') and (select count(distinct lower(btrim(o))) from jsonb_array_elements_text(q.options) o)=4 and (admin_user or (
 (q.import_metadata='{}'::jsonb or exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and r.status='approved'))
 and not exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and (r.status<>'approved' or r.warnings @> '["Possible duplicate"]'))))))
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

-- Count and preview share one candidate scan.
create or replace function public.question_bank(p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page';end if;
 with candidates as materialized (select q.id,q.question_text,q.image_url,q.question_type,q.import_metadata->>'questionNumber' question_number,q.section,q.domain,q.skill,q.difficulty,q.topic_id from public.bank_candidates(p_filters) q),
 page as (select q.id,q.question_text,q.image_url,q.question_type,q.question_number,q.section,q.domain,q.skill,q.difficulty,b.title book_title,t.title topic_title from candidates q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id order by q.id limit 25 offset p_page*25)
 select jsonb_build_object('count',(select count(*) from candidates),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]')) into result;
 return result;end;$$;


create or replace function public.book_practice_open_review(p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session and student_id=auth.uid() and kind in ('book','bank','homework') and submitted_at is not null and public.is_active_user()) then raise exception 'Submit your own book practice first' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',k.item_id,'accepted_answers',case when k.answer_format='numeric-range' and jsonb_array_length(k.accepted_answers)=0 and k.correct_answer is not null then jsonb_build_array(k.correct_answer) else k.accepted_answers end,'correct_answer',k.correct_answer,'answer_format',k.answer_format,'accepted_range',k.accepted_range)) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session),'[]');
end;$$;
commit;
