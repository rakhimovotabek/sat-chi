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
 do ${delimiter} declare r jsonb:=${literal(safeReport)}; data jsonb:=${payload ? literal(payload) : "null"}; bid uuid; fp text; t jsonb; pos integer:=0; n integer:=0;begin
 if data is not null then
 fp=md5(data::text||'book');select book_id,question_count into bid,n from public.content_imports where fingerprint=fp;
 if bid is null then
 n:=0;
 insert into public.books(title,description,category,published) values(data->'book'->>'title',coalesce(data->'book'->>'description',''),coalesce(data->'book'->>'category','Other'),false) returning id into bid;
 for t in select value from jsonb_array_elements(data->'topics') loop n=n+public.import_book_topic(bid,null,t,pos,0);pos=pos+1;end loop;
 insert into public.content_imports(fingerprint,book_id,question_count) values(fp,bid,n);
 end if;
 r=r||jsonb_build_object('status','imported','imported_count',n,'skipped_count',0);end if;
 insert into public.import_jobs(fingerprint,source_file,title,status,detected_topics,detected_questions,imported_count,skipped_count,warnings,errors,book_id)
 values(r->>'fingerprint',r->>'source_file',r->>'title',r->>'status',(r->>'detected_topics')::int,(r->>'detected_questions')::int,(r->>'imported_count')::int,(r->>'skipped_count')::int,r->'warnings',r->'errors',bid)
 on conflict(fingerprint) do update set status=excluded.status,imported_count=excluded.imported_count,skipped_count=excluded.skipped_count,warnings=excluded.warnings,errors=excluded.errors,book_id=excluded.book_id;
 end ${delimiter};
 commit;
 select source_file,status,imported_count from public.import_jobs where fingerprint='${safeReport.fingerprint}';`;
}
