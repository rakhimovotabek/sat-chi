begin;

-- Keep the source structure available for future Vocabulary views and review.
alter table public.vocabulary_books add column source_metadata jsonb not null default '{}'::jsonb;
alter table public.vocabulary_sets add column source_metadata jsonb not null default '{}'::jsonb;
alter table public.vocabulary_words add column source_metadata jsonb not null default '{}'::jsonb;

create table public.vocabulary_package_import_chunks (
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  part_no integer not null check (part_no >= 0),
  data text not null,
  primary key (fingerprint, part_no)
);
alter table public.vocabulary_package_import_chunks enable row level security;
revoke all on public.vocabulary_package_import_chunks from public, anon, authenticated;
grant all on public.vocabulary_package_import_chunks to service_role;

create function public.import_vocabulary_package(p_fingerprint text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  d jsonb;
  b public.vocabulary_books;
  s jsonb;
  w jsonb;
  q jsonb;
  review_item public.content_review_items;
  sid uuid;
  wid uuid;
  qid uuid;
  set_position integer := 0;
  word_position integer;
  expected_sets integer;
  expected_words integer;
  expected_questions integer;
  seen_sets integer := 0;
  seen_words integer := 0;
  seen_questions integer := 0;
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Admin required' using errcode='42501';
  end if;
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid package fingerprint';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vocabulary-package:'||p_fingerprint,0));
  select string_agg(c.data,'' order by c.part_no)::jsonb into d
    from public.vocabulary_package_import_chunks c where c.fingerprint=p_fingerprint;
  if d is null or d->>'fingerprint' is distinct from p_fingerprint then
    raise exception 'Incomplete vocabulary package transport';
  end if;
  if jsonb_typeof(d->'sets') is distinct from 'array' or jsonb_array_length(d->'sets') <> 56 then
    raise exception 'Expected 56 Vocabook sets';
  end if;
  expected_sets:=(d->'expected'->>'sets')::integer;
  expected_words:=(d->'expected'->>'words')::integer;
  expected_questions:=(d->'expected'->>'questions')::integer;
  select * into b from public.vocabulary_books where title=d->>'title' for update;
  if b.id is null then
    insert into public.vocabulary_books(title,description,source,published,import_fingerprint,source_metadata)
    values(d->>'title',d->>'description',d->>'source',false,p_fingerprint,d->'source_metadata') returning * into b;
  elsif b.import_fingerprint=p_fingerprint
    and (select count(*) from public.vocabulary_sets where book_id=b.id)=56
    and (select count(*) from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id where s.book_id=b.id)=expected_words
    and (select count(*) from public.vocabulary_passages p join public.vocabulary_sets s on s.id=p.set_id where s.book_id=b.id)=56
    and (select count(*) from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id where s.book_id=b.id)=expected_questions then
    delete from public.vocabulary_package_import_chunks where fingerprint=p_fingerprint;
    return jsonb_build_object('id',b.id,'title',b.title,'sets',expected_sets,'words',expected_words,'passages',56,'questions',expected_questions,'published',b.published,'alreadyImported',true);
  else
    update public.vocabulary_books set description=d->>'description',source=d->>'source',
      source_metadata=d->'source_metadata',import_fingerprint=p_fingerprint where id=b.id returning * into b;
  end if;

  for s in select value from jsonb_array_elements(d->'sets') loop
    select id into sid from public.vocabulary_sets where book_id=b.id and position=set_position order by id limit 1 for update;
    if sid is null then
      insert into public.vocabulary_sets(book_id,title,position,source_page,source_set,collection,source_metadata,import_fingerprint)
      values(b.id,s->>'title',set_position,(s->>'source_page')::integer,(s->>'source_set')::integer,s->>'collection',s->'source_metadata',md5(p_fingerprint||':'||(s->>'source_id'))) returning id into sid;
    else
      update public.vocabulary_sets set title=s->>'title',source_page=(s->>'source_page')::integer,
        source_set=(s->>'source_set')::integer,collection=s->>'collection',source_metadata=s->'source_metadata',
        import_fingerprint=md5(p_fingerprint||':'||(s->>'source_id')) where id=sid;
    end if;
    seen_sets:=seen_sets+1;
    word_position:=0;
    for w in select value from jsonb_array_elements(s->'words') loop
      select id into wid from public.vocabulary_words where set_id=sid and position=word_position order by id limit 1 for update;
      if wid is null then
        insert into public.vocabulary_words(set_id,word,definition,example,synonym,translation,position,
          part_of_speech,additional_definitions,antonym,notes,source_page,extraction_confidence,source_metadata)
        values(sid,w->>'word',w->>'definition',coalesce(w->>'example',''),coalesce(w->>'synonym',''),coalesce(w->>'translation',''),word_position,
          coalesce(w->>'part_of_speech',''),coalesce(w->>'additional_definitions',''),coalesce(w->>'antonym',''),coalesce(w->>'notes',''),
          (w->>'source_page')::integer,coalesce(w->>'extraction_confidence',''),w->'source_metadata')
        on conflict(set_id,word) do update set definition=excluded.definition,example=excluded.example,synonym=excluded.synonym,
          translation=excluded.translation,position=excluded.position,part_of_speech=excluded.part_of_speech,
          additional_definitions=excluded.additional_definitions,antonym=excluded.antonym,notes=excluded.notes,
          source_page=excluded.source_page,extraction_confidence=excluded.extraction_confidence,source_metadata=excluded.source_metadata
        returning id into wid;
      else
        update public.vocabulary_words set word=w->>'word',definition=w->>'definition',example=coalesce(w->>'example',''),
          synonym=coalesce(w->>'synonym',''),translation=coalesce(w->>'translation',''),part_of_speech=coalesce(w->>'part_of_speech',''),
          additional_definitions=coalesce(w->>'additional_definitions',''),antonym=coalesce(w->>'antonym',''),notes=coalesce(w->>'notes',''),
          source_page=(w->>'source_page')::integer,extraction_confidence=coalesce(w->>'extraction_confidence',''),source_metadata=w->'source_metadata'
          where id=wid;
      end if;
      word_position:=word_position+1;
      seen_words:=seen_words+1;
    end loop;

    if exists(select 1 from public.vocabulary_passages where set_id=sid) then
      update public.vocabulary_passages set title=s->>'passageTitle',passage=s->>'passage'
        where id=(select id from public.vocabulary_passages where set_id=sid order by id limit 1);
    else
      insert into public.vocabulary_passages(set_id,title,passage) values(sid,s->>'passageTitle',s->>'passage');
    end if;
    for q in select value from jsonb_array_elements(s->'questions') loop
      select id into qid from public.vocabulary_questions where set_id=sid
        and (payload->>'sourceId'=q->>'sourceId' or payload->>'question'=q->>'question')
        order by (payload->>'sourceId'=q->>'sourceId') desc nulls last,id limit 1 for update;
      if qid is null then
        insert into public.vocabulary_questions(set_id,payload) values(sid,q) returning id into qid;
      else
        update public.vocabulary_questions set payload=q where id=qid;
      end if;
      seen_questions:=seen_questions+1;
    end loop;
    set_position:=set_position+1;
  end loop;

  if seen_sets<>expected_sets or seen_words<>expected_words or seen_questions<>expected_questions then
    raise exception 'Vocabulary package count mismatch: sets %, words %, questions %',seen_sets,seen_words,seen_questions;
  end if;
  for review_item in
    select ri.* from public.content_review_items ri
    join public.import_jobs j on j.id=ri.source_id
    where j.vocabulary_book_id=b.id and ri.entity_id is not null
      and ((ri.item_type='word' and exists(select 1 from public.vocabulary_words where id=ri.entity_id))
        or (ri.item_type='passage' and exists(select 1 from public.vocabulary_passages where id=ri.entity_id))
        or (ri.item_type='exercise' and exists(select 1 from public.vocabulary_questions where id=ri.entity_id)))
      and ri.status<>'approved'
  loop
    update public.content_review_items set status='approved',
      note='Validated against the supplied Vocabook 4 package; source content retained.',
      reviewed_at=now(),updated_at=now() where id=review_item.id;
    insert into public.content_review_audit(item_id,source_id,action,before_data,after_data)
      values(review_item.id,review_item.source_id,'package_source_approval',to_jsonb(review_item),
        jsonb_build_object('status','approved','note','Validated against the supplied Vocabook 4 package; source content retained.'));
  end loop;
  update public.vocabulary_books set archived=false,published=true where id=b.id;
  delete from public.vocabulary_package_import_chunks where fingerprint=p_fingerprint;
  return jsonb_build_object('id',b.id,'title',b.title,'sets',seen_sets,'words',seen_words,'passages',seen_sets,'questions',seen_questions,'published',true,'alreadyImported',false);
end;$$;
revoke all on function public.import_vocabulary_package(text) from public,anon,authenticated;
grant execute on function public.import_vocabulary_package(text) to service_role;

create function public.check_book_practice_answer(p_session uuid,p_item uuid,p_choice integer,p_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; i public.book_practice_items; a public.question_check_attempts; answer integer; n integer; previous integer;
begin
  select * into s from public.book_practice_sessions where id=p_session for update;
  if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() or s.kind<>'book' then raise exception 'Own book practice required' using errcode='42501'; end if;
  select * into i from public.book_practice_items where id=p_item and session_id=s.id;
  if i.id is null or i.question->>'question_type'='open' or p_choice is null or p_choice not between 0 and 3 or p_event is null then raise exception 'Invalid attempt'; end if;
  select * into a from public.question_check_attempts where id=p_event;
  if a.id is not null then
    if a.item_id<>i.id or a.selected_answer<>p_choice then raise exception 'Attempt event conflict'; end if;
    return to_jsonb(a);
  end if;
  if s.submitted_at is not null or i.solved_at is not null then raise exception 'Question already completed'; end if;
  if p_choice=any(i.eliminated) then raise exception 'Restore this choice first'; end if;
  select correct_answer into answer from public.book_practice_keys where item_id=i.id;
  select count(*)+1,coalesce(max(active_seconds),0) into n,previous from public.question_check_attempts where item_id=i.id;
  insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,correct,active_seconds,between_seconds,eliminated,marked)
  values(p_event,i.id,n,p_choice,p_choice=answer,i.active_seconds,i.active_seconds-previous,i.eliminated,i.marked) returning * into a;
  update public.book_practice_items set selected_answer=p_choice,correct=a.correct,solved_at=case when a.correct then now() end,has_answered=true where id=i.id;
  insert into public.student_activity(student_id,session_id,kind,title) values(s.student_id,s.id,s.kind,s.title) on conflict(session_id) do nothing;
  if not exists(select 1 from public.book_practice_items where session_id=s.id and solved_at is null) then update public.book_practice_sessions set submitted_at=now() where id=s.id; end if;
  return to_jsonb(a);
end;$$;

create function public.check_book_practice_response(p_session uuid,p_item uuid,p_response text,p_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; i public.book_practice_items; a public.question_check_attempts; is_correct boolean; n integer; previous integer;
begin
  select * into s from public.book_practice_sessions where id=p_session for update;
  if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() or s.kind<>'book' then raise exception 'Own book practice required' using errcode='42501'; end if;
  select * into i from public.book_practice_items where id=p_item and session_id=s.id;
  if i.id is null or i.question->>'question_type'<>'open' or nullif(btrim(p_response),'') is null or length(p_response)>200 or p_event is null then raise exception 'Invalid attempt'; end if;
  select * into a from public.question_check_attempts where id=p_event;
  if a.id is not null then
    if a.item_id<>i.id or a.selected_response is distinct from p_response then raise exception 'Attempt event conflict'; end if;
    return to_jsonb(a);
  end if;
  if s.submitted_at is not null or i.solved_at is not null then raise exception 'Question already completed'; end if;
  select public.package_open_response_correct(i.id,p_response) into is_correct;
  select count(*)+1,coalesce(max(active_seconds),0) into n,previous from public.question_check_attempts where item_id=i.id;
  insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,selected_response,correct,active_seconds,between_seconds,eliminated,marked)
  values(p_event,i.id,n,0,p_response,is_correct,i.active_seconds,i.active_seconds-previous,i.eliminated,i.marked) returning * into a;
  update public.book_practice_items set selected_answer=0,selected_response=p_response,correct=a.correct,solved_at=case when a.correct then now() end,has_answered=true where id=i.id;
  insert into public.student_activity(student_id,session_id,kind,title) values(s.student_id,s.id,s.kind,s.title) on conflict(session_id) do nothing;
  if not exists(select 1 from public.book_practice_items where session_id=s.id and solved_at is null) then update public.book_practice_sessions set submitted_at=now() where id=s.id; end if;
  return to_jsonb(a);
end;$$;
revoke all on function public.check_book_practice_answer(uuid,uuid,integer,uuid),public.check_book_practice_response(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.check_book_practice_answer(uuid,uuid,integer,uuid),public.check_book_practice_response(uuid,uuid,text,uuid) to authenticated;

commit;
