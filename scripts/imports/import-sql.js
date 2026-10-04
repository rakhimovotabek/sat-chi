import { randomBytes } from "node:crypto";
const literal = (value) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
export function buildImportSql(safeReport, payload) {
  if (!/^[a-f0-9]{64}$/.test(safeReport.fingerprint))
    throw new Error("Invalid source fingerprint.");
  const contents = literal(safeReport) + (payload ? literal(payload) : "null");
  let delimiter;
  do {
    delimiter = `$satchi_${randomBytes(16).toString("hex")}$`;
  } while (contents.includes(delimiter));
  return `begin;
 do ${delimiter} declare r jsonb:=${literal(safeReport)}; data jsonb:=${payload ? literal(payload) : "null"}; bid uuid; vid uuid; sid uuid; s jsonb; w jsonb; q jsonb; wpos integer; fp text; t jsonb; pos integer:=0; n integer:=0;begin
 perform pg_advisory_xact_lock(hashtextextended('satchi-local-import',0));
 if data is not null then
 if r->>'source_type'='vocabulary' then
 fp=md5(data::text);select id into vid from public.vocabulary_books where import_fingerprint=fp;
 if vid is null then
 insert into public.vocabulary_books(title,description,source,published,import_fingerprint)values(data->>'title',coalesce(data->>'description',''),coalesce(data->>'source',r->>'source_file'),false,fp) returning id into vid;
 for s in select value from jsonb_array_elements(data->'sets') loop
 insert into public.vocabulary_sets(book_id,title,position,source_page,source_set,collection)values(vid,s->>'title',pos,(s->>'source_page')::int,(s->>'source_set')::int,coalesce(s->>'collection','')) returning id into sid;pos=pos+1;wpos=0;
 for w in select value from jsonb_array_elements(s->'words') loop
 insert into public.vocabulary_words(set_id,word,definition,example,synonym,translation,position,part_of_speech,additional_definitions,antonym,notes,source_page,extraction_confidence)values(sid,w->>'word',w->>'definition',coalesce(w->>'example',''),coalesce(w->>'synonym',''),coalesce(w->>'translation',''),wpos,coalesce(w->>'part_of_speech',''),coalesce(w->>'additional_definitions',''),coalesce(w->>'antonym',''),coalesce(w->>'notes',''),(w->>'source_page')::int,coalesce(w->>'extraction_confidence',''));wpos=wpos+1;end loop;
 if nullif(s->>'passage','') is not null then insert into public.vocabulary_passages(set_id,title,passage)values(sid,s->>'title',s->>'passage');end if;
 for q in select value from jsonb_array_elements(coalesce(s->'questions','[]'))loop insert into public.vocabulary_questions(set_id,payload)values(sid,q);n=n+1;end loop;end loop;
 else select count(*)::int into n from public.vocabulary_questions q join public.vocabulary_sets s on s.id=q.set_id where s.book_id=vid;end if;
 else
 fp=md5(data::text||'book');select book_id,question_count into bid,n from public.content_imports where fingerprint=fp;
 if bid is null then
 n:=0;
 insert into public.books(title,description,category,published) values(data->'book'->>'title',coalesce(data->'book'->>'description',''),coalesce(data->'book'->>'category','Other'),false) returning id into bid;
 for t in select value from jsonb_array_elements(data->'topics') loop n=n+public.import_local_topic(bid,null,t,pos,0);pos=pos+1;end loop;
 insert into public.content_imports(fingerprint,book_id,question_count) values(fp,bid,n);
 end if;
 end if;
 r=r||jsonb_build_object('status','imported','imported_count',n,'skipped_count',greatest(coalesce((r->>'detected_questions')::int,0)-n,0));end if;
 insert into public.import_jobs(fingerprint,source_file,title,status,detected_topics,detected_questions,imported_count,skipped_count,warnings,errors,book_id)
 values(r->>'fingerprint',r->>'source_file',r->>'title',r->>'status',(r->>'detected_topics')::int,(r->>'detected_questions')::int,(r->>'imported_count')::int,(r->>'skipped_count')::int,r->'warnings',r->'errors',bid)
 on conflict(fingerprint) do update set status=excluded.status,imported_count=excluded.imported_count,skipped_count=excluded.skipped_count,warnings=excluded.warnings,errors=excluded.errors,book_id=coalesce(excluded.book_id,public.import_jobs.book_id);
 update public.import_jobs set title=r->>'title',detected_topics=(r->>'detected_topics')::int,detected_questions=(r->>'detected_questions')::int,
 source_path=coalesce(r->>'source_path',r->>'source_file'),source_type=coalesce(r->>'source_type','book'),category=coalesce(r->>'category','Other'),
 detected_vocabulary_sets=coalesce((r->>'detected_vocabulary_sets')::int,0),needs_review_count=coalesce((r->>'needs_review_count')::int,0),
 parser_version=coalesce(r->>'parser_version',''),vocabulary_book_id=coalesce(vid,vocabulary_book_id),updated_at=now(),
 source_metadata=jsonb_build_object('investigation',coalesce(r->'investigation','{}'::jsonb),'resolution_status',r->'resolution_status','verified_key_count',r->'verified_key_count','evidence',coalesce(r->'evidence','[]'::jsonb),'review_items',coalesce(r->'review_items','[]'::jsonb),'asset_pages',coalesce(r->'asset_pages','[]'::jsonb),'asset_references',coalesce(r->'asset_references','[]'::jsonb),'has_tables',coalesce(r->'has_tables','false'::jsonb),'aliases',coalesce(r->'aliases','[]'::jsonb),'detected_words',coalesce(r->'detected_words','0'::jsonb))
 where fingerprint=r->>'fingerprint';
 end ${delimiter};
 commit;
 select source_file,status,imported_count,skipped_count,book_id,vocabulary_book_id from public.import_jobs where fingerprint='${safeReport.fingerprint}';`;
}
