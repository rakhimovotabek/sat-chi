begin;
create function public.start_vocabulary_practice(p_sets uuid[],p_mode text default 'meaning',p_count integer default 20,p_filter text default 'all') returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; w record; q record; opts jsonb; correct integer; iid uuid; n integer:=0; reverse boolean; ids uuid[]; total integer;
begin
 if not public.is_active_user() or p_sets is null or cardinality(p_sets)>100 or p_mode is null or p_mode not in ('meaning','reverse','mixed','source') or p_filter is null or p_filter not in ('all','due','starred','weak') or p_count is null or p_count not between 1 and 200 then raise exception 'Invalid vocabulary session';end if;
 select array_agg(id) into ids from public.vocabulary_sets where public.can_read_vocab(id) and (cardinality(p_sets)=0 or id=any(p_sets));
 if ids is null then raise exception 'No available sets';end if;
 insert into public.book_practice_sessions(student_id,title,kind,source_id)values(auth.uid(),'Vocabulary · '||p_mode,'vocabulary',case when cardinality(ids)=1 then ids[1] else null end)returning id into sid;
 if p_mode='source' then
  for q in select vq.*,s.title set_title from public.vocabulary_questions vq join public.vocabulary_sets s on s.id=vq.set_id where set_id=any(ids) order by random() limit p_count loop
   select id into iid from public.vocabulary_words where set_id=q.set_id and lower(btrim(word))=lower(btrim(q.payload->'options'->>((q.payload->>'correctAnswer')::int))) limit 1;
   insert into public.book_practice_items(session_id,position,question) values(sid,n,jsonb_build_object('id',q.id,'word_id',iid,'set_id',q.set_id,'set_title',q.set_title,'question_text',q.payload->>'question','passage',coalesce(q.payload->>'passage',''),'options',q.payload->'options','section','Vocabulary','domain','Vocabulary','source_page',q.payload->'sourcePage','source',q.set_title,'difficulty','unclassified')) returning id into iid;
   insert into public.book_practice_keys values(iid,(q.payload->>'correctAnswer')::int,coalesce(q.payload->>'explanation',''));n=n+1;
  end loop;
 else
  if (select count(distinct definition) from public.vocabulary_words where set_id=any(ids))<4 or (select count(distinct lower(btrim(word))) from public.vocabulary_words where set_id=any(ids))<4 then raise exception 'Choose sets with at least four distinct words and meanings';end if;
  for w in
   select distinct on(lower(btrim(vw.word)),lower(btrim(vw.definition))) vw.*,s.title set_title from public.vocabulary_words vw join public.vocabulary_sets s on s.id=vw.set_id left join public.vocabulary_progress p on p.word_id=vw.id and p.student_id=auth.uid() where vw.set_id=any(ids) and case p_filter when 'due' then p.next_review<=now() when 'starred' then p.starred when 'weak' then p.failed_recalls>=2 and p.mastery_state<>'mastered' else true end order by lower(btrim(vw.word)),lower(btrim(vw.definition)),vw.id limit p_count
  loop
   reverse=p_mode='reverse' or (p_mode='mixed' and n%2=1);
   if reverse then
    -- The correct word must survive selection; choose distractors separately.
    select jsonb_agg(value order by random()) into opts from(select w.word value union all select value from(select distinct on(lower(btrim(word))) word value from public.vocabulary_words where set_id=any(ids) and lower(btrim(word))<>lower(btrim(w.word)) and lower(btrim(definition))<>lower(btrim(w.definition)) order by lower(btrim(word)) limit 3)d)x;
    select ordinality::int-1 into correct from jsonb_array_elements_text(opts)with ordinality where value=w.word;
   else
    select jsonb_agg(value order by random()) into opts from(select w.definition value union all select value from(select distinct definition value from public.vocabulary_words where set_id=any(ids) and definition<>w.definition order by definition limit 3)d)x;
    select ordinality::int-1 into correct from jsonb_array_elements_text(opts)with ordinality where value=w.definition;
   end if;
   if jsonb_array_length(opts)<>4 then raise exception 'Not enough distinct distractors for a reliable test';end if;
   insert into public.book_practice_items(session_id,position,question) values(sid,n,jsonb_build_object('id',w.id,'word_id',w.id,'set_id',w.set_id,'set_title',w.set_title,'question_text',case when reverse then 'Which word means: '||w.definition else 'What does '||w.word||' mean?' end,'passage','','options',opts,'section','Vocabulary','domain','Vocabulary','source',w.set_title,'difficulty','unclassified')) returning id into iid;
   insert into public.book_practice_keys values(iid,correct,w.word||': '||w.definition||case when w.example<>'' then E'\n'||w.example else '' end);n=n+1;
  end loop;
 end if;
 if n=0 then raise exception 'No words or supplied exercises match this selection';end if;
 insert into public.vocabulary_attempts(student_id,set_id,session_id)values(auth.uid(),case when cardinality(ids)=1 then ids[1] else null end,sid);
 return sid;
end;$$;
create function public.record_vocabulary_test_reviews() returns trigger language plpgsql security definer set search_path='' as $$declare item record;begin
 if new.kind='vocabulary' and old.submitted_at is null and new.submitted_at is not null and new.student_id=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='student') then
  for item in select i.* from public.book_practice_items i join public.vocabulary_words w on w.id=(i.question->>'word_id')::uuid where i.session_id=new.id and i.selected_answer is not null and public.can_read_vocab(w.set_id) loop
   perform public.review_vocabulary((item.question->>'word_id')::uuid,case when item.correct then 'good' else 'again' end,0,item.id,'cards',null);
  end loop;
 end if;return new;
end;$$;
create trigger vocabulary_test_reviews after update on public.book_practice_sessions for each row execute function public.record_vocabulary_test_reviews();
revoke all on function public.record_vocabulary_test_reviews(),public.start_vocabulary_practice(uuid[],text,integer,text) from public,anon,authenticated;
grant execute on function public.start_vocabulary_practice(uuid[],text,integer,text) to authenticated;
alter table public.vocabulary_sets add column import_fingerprint text unique;
create function public.import_vocabulary_set(p_book uuid,p_set jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare temporary_book uuid; sid uuid; pos integer;begin
 if not public.is_admin() or not exists(select 1 from public.vocabulary_books where id=p_book) then raise exception 'Admin and existing book required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('vocab-set-import:'||p_book::text,0));
 if exists(select 1 from public.vocabulary_sets where import_fingerprint=md5(p_book::text||p_set::text))then raise exception 'This set was already imported' using errcode='23505';end if;
 temporary_book=public.import_vocabulary(jsonb_build_object('title','Set import','published',false,'sets',jsonb_build_array(p_set)));
 select id into sid from public.vocabulary_sets where book_id=temporary_book;
 select coalesce(max(position)+1,0) into pos from public.vocabulary_sets where book_id=p_book;
 update public.vocabulary_sets set book_id=p_book,position=pos,import_fingerprint=md5(p_book::text||p_set::text) where id=sid;
 delete from public.vocabulary_books where id=temporary_book;
 return sid;
end;$$;
revoke all on function public.import_vocabulary_set(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_vocabulary_set(uuid,jsonb) to authenticated;
commit;
