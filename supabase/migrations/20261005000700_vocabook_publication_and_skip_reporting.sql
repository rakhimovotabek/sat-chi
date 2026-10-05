begin;
create or replace function public.import_vocabulary_package(p_fingerprint text)
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
commit;
