begin;
alter table public.questions add column source_page integer check(source_page between 1 and 100000);
alter table public.questions add column import_metadata jsonb not null default '{}' check(jsonb_typeof(import_metadata)='object' and octet_length(import_metadata::text)<=4000);
alter function public.write_book_question(uuid,jsonb,uuid,integer) rename to write_book_question_core;
revoke all on function public.write_book_question_core(uuid,jsonb,uuid,integer) from public,anon,authenticated,service_role;
create function public.write_book_question(p_topic uuid,p_data jsonb,p_id uuid default null,p_position integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare qid uuid;
begin
 if p_data ? 'source_page' and (jsonb_typeof(p_data->'source_page')<>'number' or (p_data->>'source_page')!~'^[1-9][0-9]{0,5}$' or (p_data->>'source_page')::integer>100000) then raise exception 'Invalid physical source page';end if;
 if p_data ? 'import_metadata' and (jsonb_typeof(p_data->'import_metadata')<>'object' or octet_length((p_data->'import_metadata')::text)>4000) then raise exception 'Invalid import metadata';end if;
 qid:=public.write_book_question_core(p_topic,p_data-'source_page'-'import_metadata',p_id,p_position);
 update public.questions set source_page=case when p_data?'source_page' then (p_data->>'source_page')::integer else source_page end,
 import_metadata=case when p_data?'import_metadata' then p_data->'import_metadata' else import_metadata end where id=qid;
 return qid;
end;$$;
revoke all on function public.write_book_question(uuid,jsonb,uuid,integer) from public,anon,authenticated,service_role;
create index questions_source_page_idx on public.questions(topic_id,source_page);
commit;
