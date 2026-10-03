begin;
alter table public.homework_sections add constraint section_title_length check(length(btrim(title)) between 1 and 160);
alter table public.homeworks add constraint timed_requires_limit check(not timed or time_limit is not null);
alter table public.vocabulary_books add column import_fingerprint text unique;
create function public.import_vocabulary(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare bid uuid; sid uuid; s jsonb; w jsonb; q jsonb; n integer:=0; pos integer:=0; wid integer;begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if octet_length(p_payload::text)>4000000 or jsonb_typeof(p_payload->'sets') is distinct from 'array' or jsonb_array_length(p_payload->'sets') not between 1 and 100 then raise exception 'Provide 1 to 100 vocabulary sets under 4 MB';end if;
 insert into public.vocabulary_books(title,description,source,published,import_fingerprint) values(p_payload->>'title',coalesce(p_payload->>'description',''),coalesce(p_payload->>'source',''),coalesce((p_payload->>'published')::boolean,false),md5(p_payload::text)) returning id into bid;
 for s in select value from jsonb_array_elements(p_payload->'sets') loop
 insert into public.vocabulary_sets(book_id,title,position) values(bid,s->>'title',pos) returning id into sid;pos=pos+1;wid=0;
 if jsonb_typeof(s->'words') is distinct from 'array' or jsonb_array_length(s->'words') not between 1 and 100 then raise exception 'Each set needs 1 to 100 words';end if;
 for w in select value from jsonb_array_elements(s->'words') loop
 insert into public.vocabulary_words(set_id,word,definition,example,synonym,translation,position) values(sid,w->>'word',w->>'definition',coalesce(w->>'example',''),coalesce(w->>'synonym',''),coalesce(w->>'translation',''),wid);wid=wid+1;end loop;
 if nullif(s->>'passage','') is not null then insert into public.vocabulary_passages(set_id,title,passage) values(sid,s->>'title',s->>'passage');end if;
 for q in select value from jsonb_array_elements(coalesce(s->'questions','[]')) loop
 if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options')<>4 or jsonb_typeof(q->'correctAnswer') is distinct from 'number' or (q->>'correctAnswer') !~ '^[0-3]$' or coalesce(length(btrim(q->>'question')),0)=0 then raise exception 'Invalid vocabulary question';end if;
 insert into public.vocabulary_questions(set_id,payload) values(sid,q);end loop;
 n=n+wid;end loop;
 return bid;end;$$;
create function public.start_vocabulary_test(p_set uuid,p_imported boolean default true) returns uuid language plpgsql security definer set search_path='' as $$declare sid uuid; q record; w record; opts jsonb; answer integer; iid uuid; n integer:=0; t text;begin
 if not public.can_read_vocab(p_set) then raise exception 'Set unavailable' using errcode='42501';end if;
 select title into t from public.vocabulary_sets where id=p_set;
 insert into public.book_practice_sessions(student_id,title,kind,source_id) values(auth.uid(),t||case when p_imported then ' · Test' else ' · Meanings' end,'vocabulary',p_set) returning id into sid;
 if p_imported then
 for q in select * from public.vocabulary_questions where set_id=p_set order by id limit 100 loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,jsonb_build_object('id',q.id,'question_text',q.payload->>'question','passage',coalesce(q.payload->>'passage',''),'options',q.payload->'options','section','Vocabulary','domain','Vocabulary','difficulty','medium')) returning id into iid;
 insert into public.book_practice_keys values(iid,(q.payload->>'correctAnswer')::integer,coalesce(q.payload->>'explanation',''));n=n+1;end loop;
 else
 if (select count(distinct definition) from public.vocabulary_words where set_id=p_set)<4 then raise exception 'Multiple choice needs at least four distinct definitions';end if;
 for w in select * from public.vocabulary_words where set_id=p_set order by position limit 100 loop
 -- Always include the correct definition; choose only distractors randomly.
 select jsonb_agg(x.definition order by random()) into opts from(select w.definition union all select d.definition from(select definition from (select distinct definition from public.vocabulary_words where set_id=p_set and definition<>w.definition) choices order by random() limit 3)d)x;
 select ordinality::int-1 into answer from jsonb_array_elements_text(opts) with ordinality where value=w.definition;
 insert into public.book_practice_items(session_id,position,question) values(sid,n,jsonb_build_object('id',w.id,'question_text','What does '||w.word||' mean?','passage',w.example,'options',opts,'section','Vocabulary','domain','Vocabulary','difficulty','medium')) returning id into iid;
 insert into public.book_practice_keys values(iid,answer,w.definition);n=n+1;end loop;end if;
 if n=0 then raise exception 'No imported test questions in this set';end if;
 insert into public.vocabulary_attempts(student_id,set_id,session_id) values(auth.uid(),p_set,sid);return sid;end;$$;
-- Correct definitions are already available in learning mode, but test keys stay private until grading.
revoke all on function public.import_vocabulary(jsonb),public.start_vocabulary_test(uuid,boolean) from public,anon,authenticated;
grant execute on function public.import_vocabulary(jsonb),public.start_vocabulary_test(uuid,boolean) to authenticated;
create or replace function public.review_book_practice(p_session_id uuid) returns table(item_id uuid,correct_answer integer,explanation text) language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session_id and submitted_at is not null and (student_id=auth.uid() or public.is_admin()) and public.is_active_user()) then raise exception 'Submit your own session before review' using errcode='42501';end if;
 return query select k.item_id,k.correct_answer,k.explanation from public.book_practice_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session_id;end;$$;
alter function public.save_book_practice(uuid,jsonb) rename to save_book_practice_internal;
revoke all on function public.save_book_practice_internal(uuid,jsonb) from public,anon,authenticated;
create function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$declare s public.book_practice_sessions;begin
 select * into s from public.book_practice_sessions where id=p_session_id and student_id=auth.uid() for update;
 if s.timed and s.time_limit is not null and clock_timestamp()>=s.started_at+make_interval(secs=>s.time_limit) then raise exception 'Time limit reached. Submit saved answers.';end if;
 perform public.save_book_practice_internal(p_session_id,p_answers);end;$$;
revoke all on function public.save_book_practice(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_book_practice(uuid,jsonb) to authenticated;
create function public.group_summary(p_group uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 return jsonb_build_object('members',(select count(*) from public.group_members where group_id=p_group),'questions',(select count(*) from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id join public.group_members m on m.student_id=s.student_id where m.group_id=p_group and s.submitted_at is not null and i.selected_answer is not null),'study_seconds',(select coalesce(sum(s.elapsed_seconds),0) from public.book_practice_sessions s join public.group_members m on m.student_id=s.student_id where m.group_id=p_group),'completed',(select count(*) from public.homework_attempts a join public.homework_assignments ha on ha.id=a.assignment_id join public.group_members m on m.student_id=ha.student_id join public.book_practice_sessions s on s.id=a.session_id where m.group_id=p_group and s.submitted_at is not null));end;$$;
revoke all on function public.group_summary(uuid) from public,anon,authenticated;
grant execute on function public.group_summary(uuid) to authenticated;
commit;
