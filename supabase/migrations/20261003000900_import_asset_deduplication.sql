begin;
select pg_advisory_xact_lock(hashtextextended('satchi-local-import',0));
-- Distinct stimuli/assets must never collapse merely because prompts match.
create function public.local_question_fingerprint(q jsonb) returns text language sql immutable set search_path='' as $$
 select md5(jsonb_build_array(q->>'question',coalesce(q->>'passage',''),coalesce(q->>'stimulus',''),q->'options',nullif(q->>'imageUrl',''),q->'table')::text);
$$;
revoke all on function public.local_question_fingerprint(jsonb) from public,anon,authenticated,service_role;
delete from public.local_question_imports;
insert into public.local_question_imports(fingerprint,question_id)
 select distinct on (public.local_question_fingerprint(jsonb_build_object('question',question_text,'passage',passage,'stimulus',stimulus,'options',options,'imageUrl',image_url,'table',stimulus_table)))
 public.local_question_fingerprint(jsonb_build_object('question',question_text,'passage',passage,'stimulus',stimulus,'options',options,'imageUrl',image_url,'table',stimulus_table)),id
 from public.questions order by public.local_question_fingerprint(jsonb_build_object('question',question_text,'passage',passage,'stimulus',stimulus,'options',options,'imageUrl',image_url,'table',stimulus_table)),created_at,id;
create or replace function public.import_local_topic(p_book uuid,p_parent uuid,p_data jsonb,p_position integer,p_depth integer)
 returns integer language plpgsql set search_path='' as $$
 declare tid uuid; q jsonb; existing_answer integer; child jsonb; qid uuid; fp text; n integer:=0; pos integer:=0;
 begin
 if p_depth>8 then raise exception 'Topic depth limit';end if;
 insert into public.book_topics(book_id,parent_id,title,position)values(p_book,p_parent,p_data->>'title',p_position) returning id into tid;
 for q in select value from jsonb_array_elements(coalesce(p_data->'questions','[]'))loop
 fp:=public.local_question_fingerprint(q);
 select a.correct_answer into existing_answer from public.local_question_imports l join public.question_answers a on a.question_id=l.question_id where l.fingerprint=fp;
 if existing_answer is not null and existing_answer<>(q->>'correctAnswer')::integer then raise exception 'NEEDS_REVIEW: duplicate content has conflicting answer keys';end if;
 if existing_answer is null then
 qid:=public.write_book_question(tid,q,null,pos);
 insert into public.local_question_imports values(fp,qid);n:=n+1;pos:=pos+1;
 end if;end loop;
 pos:=0;
 for child in select value from jsonb_array_elements(coalesce(p_data->'children','[]'))loop
 n:=n+public.import_local_topic(p_book,tid,child,pos,p_depth+1);pos:=pos+1;end loop;
 return n;
 end;$$;
revoke all on function public.import_local_topic(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated,service_role;
commit;
