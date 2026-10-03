begin;
-- Parent topics include their subtopics; null counts cannot bypass session limits.
create or replace function public.bank_candidates(p_filters jsonb) returns setof public.questions language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(p_filters)<>'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','status')) then raise exception 'Invalid filters'; end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status'; end if;
 return query select q.* from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where (b.published or public.is_admin())
 and (coalesce(p_filters->>'section','')='' or q.section=p_filters->>'section')
 and (coalesce(p_filters->>'domain','')='' or q.domain=p_filters->>'domain')
 and (coalesce(p_filters->>'skill','')='' or q.skill=p_filters->>'skill')
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
 if p_count is null or p_count not between 1 and 500 then raise exception 'Select 1 to 500 questions'; end if;
 insert into public.book_practice_sessions(student_id,title,kind,filters,timed,time_limit) values(auth.uid(),'Question Bank practice','bank',p_filters,p_timed,case when p_timed then least(21600,p_count*90) end) returning id into sid;
 for q in select c.*,a.correct_answer,a.explanation from public.bank_candidates(p_filters) c join public.question_answers a on a.question_id=c.id order by random() limit p_count loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation); n=n+1; end loop;
 if n=0 then raise exception 'No matching questions'; end if;
 if p_timed then update public.book_practice_sessions set time_limit=least(21600,greatest(60,n*90)) where id=sid; end if;
 return sid;end;$$;
create or replace function public.start_vocabulary_test(p_set uuid,p_imported boolean default true) returns uuid language plpgsql security definer set search_path='' as $$declare sid uuid; q record; w record; opts jsonb; answer integer; iid uuid; n integer:=0; t text;begin
 if not public.can_read_vocab(p_set) then raise exception 'Set unavailable' using errcode='42501';end if;
 select title into t from public.vocabulary_sets where id=p_set;
 insert into public.book_practice_sessions(student_id,title,kind,source_id) values(auth.uid(),t||case when p_imported then ' · Test' else ' · Meanings' end,'vocabulary',p_set) returning id into sid;
 if p_imported then
 for q in select * from public.vocabulary_questions where set_id=p_set order by id limit 100 loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,jsonb_build_object('id',q.id,'question_text',q.payload->>'question','passage',coalesce(q.payload->>'passage',''),'options',q.payload->'options','section','Vocabulary','domain','Vocabulary','difficulty','unclassified')) returning id into iid;
 insert into public.book_practice_keys values(iid,(q.payload->>'correctAnswer')::integer,coalesce(q.payload->>'explanation',''));n=n+1;end loop;
 else
 if (select count(distinct definition) from public.vocabulary_words where set_id=p_set)<4 then raise exception 'Multiple choice needs at least four distinct definitions';end if;
 for w in select * from public.vocabulary_words where set_id=p_set order by position limit 100 loop
 -- Always include the correct definition; choose only distractors randomly.
 select jsonb_agg(x.definition order by random()) into opts from(select w.definition union all select d.definition from(select definition from (select distinct definition from public.vocabulary_words where set_id=p_set and definition<>w.definition) choices order by random() limit 3)d)x;
 select ordinality::int-1 into answer from jsonb_array_elements_text(opts) with ordinality where value=w.definition;
 insert into public.book_practice_items(session_id,position,question) values(sid,n,jsonb_build_object('id',w.id,'question_text','What does '||w.word||' mean?','passage',w.example,'options',opts,'section','Vocabulary','domain','Vocabulary','difficulty','unclassified')) returning id into iid;
 insert into public.book_practice_keys values(iid,answer,w.definition);n=n+1;end loop;end if;
 if n=0 then raise exception 'No imported test questions in this set';end if;
 insert into public.vocabulary_attempts(student_id,set_id,session_id) values(auth.uid(),p_set,sid);return sid;end;$$;
create or replace function public.admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 return jsonb_build_object('students',(select count(*) from public.profiles where role='student' and active),'groups',(select count(*) from public.groups),'assignments',(select count(*) from public.homework_assignments),'completed',(select count(*) from public.homework_attempts a join public.book_practice_sessions s on s.id=a.session_id where s.submitted_at is not null),'questions',(select count(*) from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.submitted_at is not null and i.selected_answer is not null and exists(select 1 from public.profiles p where p.id=s.student_id and p.role='student')),'activity',coalesce((select jsonb_agg(to_jsonb(a)) from(select sa.*,p.display_name from public.student_activity sa join public.profiles p on p.id=sa.student_id where p.role='student' order by sa.created_at desc limit 25)a),'[]'));end;$$;
create index vocabulary_progress_word_idx on public.vocabulary_progress(word_id);
create index vocabulary_passages_set_idx on public.vocabulary_passages(set_id);
create index vocabulary_questions_set_idx on public.vocabulary_questions(set_id);
create index vocabulary_attempts_student_idx on public.vocabulary_attempts(student_id,session_id);
revoke all on function public.bank_candidates(jsonb) from public,anon,authenticated;
commit;
