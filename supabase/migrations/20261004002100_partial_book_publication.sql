begin;
create or replace function public.validate_review_payload(p_type text,p jsonb) returns void language plpgsql set search_path='' as $$
declare asset text; present boolean;
begin
 perform public.validate_review_payload_source(p_type,p);
 if p_type in ('question','exercise') and exists(select 1 from jsonb_array_elements_text(p->'options') o where o ~* '^\s*Choice [A-D] in the source image\s*$') then raise exception 'Recover actual answer choices before approval';end if;
 if p_type='question' and p->'import_metadata'->>'options_verified'='false' then raise exception 'Answer choice extraction requires verification';end if;
 if p_type='question' and p->>'imageUrl' like '%/storage/v1/object/authenticated/question-assets/%' then
 asset:=split_part(p->>'imageUrl','/storage/v1/object/authenticated/question-assets/',2);
 if asset !~ '^[a-f0-9]{64}/[a-f0-9]{64}\.webp$' then raise exception 'Invalid preserved question asset';end if;
 if to_regclass('storage.objects') is not null then
 execute 'select exists(select 1 from storage.objects where bucket_id=''question-assets'' and name=$1)' into present using asset;
 if not present then raise exception 'Preserved source image is missing; recover the asset before approval';end if;
 end if;
 end if;
end;$$;

create function public.question_approved_for_students(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.questions q where q.id=p_id and not exists(select 1 from jsonb_array_elements_text(q.options) o where o ~* '^\s*Choice [A-D] in the source image\s*$') and not exists(select 1 from public.content_review_items r where r.item_type='question' and r.entity_id=q.id and (r.status<>'approved' or r.warnings @> '["Possible duplicate"]')));
$$;
revoke all on function public.question_approved_for_students(uuid) from public,anon;
grant execute on function public.question_approved_for_students(uuid) to authenticated;
drop policy student_questions on public.questions;
create policy student_questions on public.questions for select to authenticated using((select public.is_active_user()) and public.question_approved_for_students(id) and exists(select 1 from public.book_topics t join public.books b on b.id=t.book_id where t.id=topic_id and b.published));

create or replace function public.bank_candidates(p_filters jsonb) returns setof public.questions language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','status','domains','skills','marked')) then raise exception 'Invalid filters'; end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status'; end if;
 if p_filters ? 'domains' and (jsonb_typeof(p_filters->'domains') <> 'array' or jsonb_array_length(p_filters->'domains') > 32) then raise exception 'Invalid domains'; end if;
 if p_filters ? 'skills' and (jsonb_typeof(p_filters->'skills') <> 'array' or jsonb_array_length(p_filters->'skills') > 256) then raise exception 'Invalid skills'; end if;
 if coalesce(p_filters->>'marked','') not in ('','yes','no') then raise exception 'Invalid marked filter'; end if;
 return query select q.* from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where (b.published or public.is_admin()) and (public.is_admin() or public.question_approved_for_students(q.id))
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
 select qs.*,a.correct_answer,a.explanation from public.questions qs join topics t on t.id=qs.topic_id join public.question_answers a on a.question_id=qs.id where public.is_admin() or public.question_approved_for_students(qs.id) order by t.sort_path,qs.position,qs.id limit 501 loop
 n=n+1; if n>500 then raise exception 'Practice supports at most 500 questions; choose a smaller topic'; end if;
 insert into public.book_practice_items(session_id,position,question) values(sid,n-1,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation);
 end loop;
 if n=0 then raise exception 'No questions available'; end if;
 return sid;
end; $$;
create or replace function public.can_read_question_asset(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select p_path ~ '^[a-f0-9]{64}/[a-f0-9]{64}\.webp$' and public.is_active_user() and (public.is_admin() or exists(
 select 1 from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 where b.published and public.question_approved_for_students(q.id) and right(q.image_url,length('/storage/v1/object/authenticated/question-assets/'||p_path))='/storage/v1/object/authenticated/question-assets/'||p_path));
$$;
create or replace function public.guard_review_publication() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.content_review_items;
begin
 if tg_table_name='books' then
 if new.published and exists(select 1 from public.import_jobs where book_id=new.id) then
 if not exists(select 1 from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=new.id and public.question_approved_for_students(q.id)) then raise exception 'Review imported catalog items before publishing: approve at least one validated question';end if;
 for r in select ri.* from public.content_review_items ri join public.questions q on q.id=ri.entity_id join public.book_topics t on t.id=q.topic_id where t.book_id=new.id and ri.item_type='question' and ri.status='approved' loop
 perform public.validate_review_payload('question',public.content_review_payload(r));
 if r.source_page is null then raise exception 'Approved question source page is missing';end if;
 end loop;
 end if;
 else
 if new.published and exists(select 1 from public.import_jobs j join public.content_review_items ri on ri.source_id=j.id where j.vocabulary_book_id=new.id and ri.entity_id is not null and ri.status<>'approved') then raise exception 'Review imported catalog items before publishing';end if;
 end if;
 return new;
end;$$;
create function public.book_review_summary(p_book uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare counts jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select coalesce(jsonb_object_agg(bucket,n),'{}') into counts from (select public.review_triage(r)->>'bucket' bucket,count(*) n from public.content_review_items r join public.import_jobs j on j.id=r.source_id where j.book_id=p_book and r.item_type='question' group by 1) c;
 return jsonb_build_object('validated',coalesce((counts->>'ready')::int,0),'human',coalesce((counts->>'human')::int,0),'excluded',(select count(*) from public.content_review_items ri join public.import_jobs j on j.id=ri.source_id where j.book_id=p_book and ((ri.entity_id is null and ri.candidate_key like 'exclusion:%') or (ri.item_type='question' and ri.status='rejected'))),'duplicates',coalesce((counts->>'duplicates')::int,0),'approved',(select count(*) from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=p_book and public.question_approved_for_students(q.id)),'published',(select published from public.books where id=p_book));
end;$$;
create function public.publish_approved_book(p_book uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 perform 1 from public.books where id=p_book for update;
 if not found then raise exception 'Book unavailable';end if;
 update public.books set published=true where id=p_book;
 insert into public.content_review_audit(action,actor,before_data,after_data) values('publish_approved_content',auth.uid(),jsonb_build_object('book_id',p_book),jsonb_build_object('book_id',p_book,'published',true));
end;$$;
revoke all on function public.book_review_summary(uuid),public.publish_approved_book(uuid) from public,anon;
grant execute on function public.book_review_summary(uuid),public.publish_approved_book(uuid) to authenticated;
create or replace function public.update_content_review_core(p_id uuid,p_action text,p_payload jsonb default null,p_note text default '',p_version timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.content_review_items; before_p jsonb; after_p jsonb; j public.import_jobs; bid uuid; tid uuid; qid uuid;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_action not in ('approve','edit','reject','duplicate','defer') or char_length(p_note)>2000 then raise exception 'Invalid review action';end if;
 select * into r from public.content_review_items where id=p_id for update;if not found then raise exception 'Review item unavailable';end if;
 if p_version is null or r.updated_at<>p_version then raise exception 'Review item changed; refresh before saving';end if;
 before_p:=public.content_review_payload(r);after_p:=before_p;
 if p_action='edit' then
 if p_payload is null then raise exception 'Edit payload required';end if;
 perform public.validate_review_payload(r.item_type,p_payload);
 if r.item_type='question' then
 if r.entity_id is not null then
 select topic_id into tid from public.questions where id=r.entity_id;
 if tid is null then raise exception 'Catalog question was removed';end if;
 perform public.write_book_question(tid,p_payload,r.entity_id);
 else update public.content_review_items set candidate=p_payload where id=p_id;end if;
 elsif r.item_type='word' then
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('word','definition','example','synonym','translation','part_of_speech','additional_definitions','antonym','notes','source_page','extraction_confidence')) then raise exception 'Unsupported word fields';end if;
 update public.vocabulary_words set word=p_payload->>'word',definition=p_payload->>'definition',example=coalesce(p_payload->>'example',''),synonym=coalesce(p_payload->>'synonym',''),translation=coalesce(p_payload->>'translation',''),part_of_speech=coalesce(p_payload->>'part_of_speech',''),additional_definitions=coalesce(p_payload->>'additional_definitions',''),antonym=coalesce(p_payload->>'antonym',''),notes=coalesce(p_payload->>'notes',''),source_page=(p_payload->>'source_page')::int where id=r.entity_id;
 elsif r.item_type='passage' then update public.vocabulary_passages set title=coalesce(p_payload->>'title',''),passage=p_payload->>'passage' where id=r.entity_id;
 elsif r.item_type='exercise' then update public.vocabulary_questions set payload=p_payload where id=r.entity_id;
 end if;after_p:=p_payload;
 elsif p_action='approve' then
 perform public.validate_review_payload(r.item_type,before_p);
 if jsonb_array_length(r.warnings)>0 and char_length(btrim(p_note))<12 then raise exception 'Record how source warnings were verified or corrected';end if;
 if r.item_type='question' and r.entity_id is null then
 select * into j from public.import_jobs where id=r.source_id for update;
 if j.source_type<>'book' or r.source_page is null then raise exception 'Question source and physical page required';end if;
 bid:=j.book_id;
 if bid is null then insert into public.books(title,category,published)values(j.title,case when j.category in ('Math','Reading & Writing') then j.category else 'Other' end,false) returning id into bid;update public.import_jobs set book_id=bid where id=j.id;end if;
 select id into tid from public.book_topics where book_id=bid and title='Manually reviewed import' order by position,id limit 1;
 if tid is null then insert into public.book_topics(book_id,title,position)values(bid,'Manually reviewed import',10000) returning id into tid;end if;
 qid:=public.write_book_question(tid,(before_p-'source_number')||jsonb_build_object('source',j.source_file,'source_page',r.source_page,'import_metadata',jsonb_build_object('extraction_method',r.extraction_method,'parser_version',j.parser_version,'manual_review',true)));
 delete from public.content_review_items where entity_id=qid and id<>p_id;
 update public.content_review_items set entity_id=qid where id=p_id;
 end if;
 end if;
 if p_action in ('edit','reject','duplicate','defer') and r.entity_id is not null then
 update public.vocabulary_books set published=false where id=(select vocabulary_book_id from public.import_jobs where id=r.source_id) and published;
 end if;
 update public.content_review_items set source_page=case when p_action='edit' and p_payload?'source_page' then (p_payload->>'source_page')::int else source_page end,status=case p_action when 'edit' then 'pending' when 'approve' then 'approved' when 'reject' then 'rejected' when 'duplicate' then 'duplicate' else 'deferred' end,note=p_note,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=clock_timestamp() where id=p_id;
 insert into public.content_review_audit(item_id,source_id,action,actor,before_data,after_data)values(p_id,r.source_id,p_action,auth.uid(),jsonb_build_object('status',r.status,'payload',before_p,'note',r.note),jsonb_build_object('payload',after_p,'note',p_note));
 return p_id;
end;$$;
create or replace function public.invalidate_content_review() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; eid uuid; r public.content_review_items;
begin
 if to_jsonb(new)=to_jsonb(old) then return new;end if;
 kind:=case tg_table_name when 'questions' then 'question' when 'question_answers' then 'question' when 'vocabulary_words' then 'word' when 'vocabulary_passages' then 'passage' else 'exercise' end;
 eid:=case when tg_table_name='question_answers' then (to_jsonb(new)->>'question_id')::uuid else (to_jsonb(new)->>'id')::uuid end;
 select * into r from public.content_review_items where item_type=kind and entity_id=eid;
 if r.id is not null then
 update public.vocabulary_books set published=false where id=(select vocabulary_book_id from public.import_jobs where id=r.source_id) and published;
 update public.content_review_items set status='pending',updated_at=clock_timestamp() where id=r.id;
 insert into public.content_review_audit(item_id,source_id,action,actor,before_data,after_data)values(r.id,r.source_id,'catalog_edit',auth.uid(),to_jsonb(old),to_jsonb(new));
 end if;return new;
end;$$;
create or replace function public.queue_new_import_content() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; kind text; page integer;
begin
 kind:=case tg_table_name when 'questions' then 'question' when 'vocabulary_words' then 'word' when 'vocabulary_passages' then 'passage' else 'exercise' end;
 if kind='question' then select j.id into sid from public.import_jobs j join public.book_topics t on t.book_id=j.book_id where t.id=(to_jsonb(new)->>'topic_id')::uuid;else select j.id into sid from public.import_jobs j join public.vocabulary_sets s on s.book_id=j.vocabulary_book_id where s.id=(to_jsonb(new)->>'set_id')::uuid;end if;
 page:=nullif(to_jsonb(new)->>'source_page','')::int;
 if sid is not null then
 insert into public.content_review_items(source_id,item_type,entity_id,candidate_key,source_page,extraction_method) values(sid,kind,new.id,kind||':'||new.id,page,'manual') on conflict do nothing;
 update public.vocabulary_books set published=false where id=(select vocabulary_book_id from public.import_jobs where id=sid) and published;
 end if;return new;
end;$$;
create or replace function public.save_book_practice_internal(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; a jsonb; affected integer; choice integer; v_eliminated integer[];
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501'; end if;
 if s.submitted_at is not null then raise exception 'Session already submitted'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then raise exception 'Invalid answers'; end if;
 for a in select value from jsonb_array_elements(p_answers) loop
 if jsonb_typeof(a)<>'object' or exists(select 1 from jsonb_object_keys(a) k where k not in ('id','selected_answer','marked','eliminated')) then raise exception 'Invalid answer fields'; end if;
 choice=(a->>'selected_answer')::integer;
 if jsonb_typeof(coalesce(a->'eliminated','[]'))<>'array' then raise exception 'Invalid eliminated choices'; end if;
 select coalesce(array_agg(value::integer),'{}') into v_eliminated from jsonb_array_elements_text(coalesce(a->'eliminated','[]'));
 if exists(select 1 from unnest(v_eliminated) v where v not between 0 and 3) then raise exception 'Invalid eliminated choices'; end if;
 update public.book_practice_items set selected_answer=choice,marked=coalesce((a->>'marked')::boolean,false),eliminated=v_eliminated where id=(a->>'id')::uuid and session_id=s.id;
 get diagnostics affected=row_count; if affected<>1 then raise exception 'Question does not belong to session'; end if;
 end loop;
end; $$;
commit;
