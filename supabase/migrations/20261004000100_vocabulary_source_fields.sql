begin;
alter table public.vocabulary_words
 add column part_of_speech text not null default '' check(length(part_of_speech)<=100),
 add column additional_definitions text not null default '' check(length(additional_definitions)<=6000),
 add column antonym text not null default '' check(length(antonym)<=6000),
 add column notes text not null default '' check(length(notes)<=6000),
 add column source_page integer check(source_page>0),
 add column extraction_confidence text not null default '' check(length(extraction_confidence)<=100);
alter table public.vocabulary_sets add column source_page integer check(source_page>0), add column source_set integer check(source_set>0), add column collection text not null default '' check(length(collection)<=200);
create unique index vocabulary_word_normalized_idx on public.vocabulary_words(set_id,lower(btrim(word)));
create or replace function public.import_vocabulary(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare bid uuid; sid uuid; s jsonb; w jsonb; q jsonb; n integer:=0; pos integer:=0; wid integer;begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if octet_length(p_payload::text)>4000000 or jsonb_typeof(p_payload->'sets') is distinct from 'array' or jsonb_array_length(p_payload->'sets') not between 1 and 100 then raise exception 'Provide 1 to 100 vocabulary sets under 4 MB';end if;
 insert into public.vocabulary_books(title,description,source,published,import_fingerprint) values(p_payload->>'title',coalesce(p_payload->>'description',''),coalesce(p_payload->>'source',''),coalesce((p_payload->>'published')::boolean,false),md5(p_payload::text)) returning id into bid;
 for s in select value from jsonb_array_elements(p_payload->'sets') loop
 insert into public.vocabulary_sets(book_id,title,position,source_page,source_set,collection) values(bid,s->>'title',pos,(s->>'source_page')::int,(s->>'source_set')::int,coalesce(s->>'collection','')) returning id into sid;pos=pos+1;wid=0;
 if jsonb_typeof(s->'words') is distinct from 'array' or jsonb_array_length(s->'words') not between 1 and 100 then raise exception 'Each set needs 1 to 100 words';end if;
 for w in select value from jsonb_array_elements(s->'words') loop
 insert into public.vocabulary_words(set_id,word,definition,example,synonym,translation,position,part_of_speech,additional_definitions,antonym,notes,source_page,extraction_confidence) values(sid,w->>'word',w->>'definition',coalesce(w->>'example',''),coalesce(w->>'synonym',''),coalesce(w->>'translation',''),wid,coalesce(w->>'part_of_speech',''),coalesce(w->>'additional_definitions',''),coalesce(w->>'antonym',''),coalesce(w->>'notes',''),(w->>'source_page')::int,coalesce(w->>'extraction_confidence',''));wid=wid+1;end loop;
 if nullif(s->>'passage','') is not null then insert into public.vocabulary_passages(set_id,title,passage) values(sid,s->>'title',s->>'passage');end if;
 for q in select value from jsonb_array_elements(coalesce(s->'questions','[]')) loop
 if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options')<>4 or jsonb_typeof(q->'correctAnswer') is distinct from 'number' or (q->>'correctAnswer') !~ '^[0-3]$' or coalesce(length(btrim(q->>'question')),0)=0 then raise exception 'Invalid vocabulary question';end if;
 insert into public.vocabulary_questions(set_id,payload) values(sid,q);end loop;
 n=n+wid;end loop;
 return bid;end;$$;

commit;
