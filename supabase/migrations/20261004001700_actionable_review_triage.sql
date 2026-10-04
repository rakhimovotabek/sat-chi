begin;
-- Derived live from the catalog and the same validator used by individual approval.
-- Nothing is approved, published, deleted or re-imported by this migration.
create function public.review_triage(r public.content_review_items) returns jsonb
language plpgsql stable set search_path='' as $$
declare p jsonb; valid_entity boolean; reason text; bucket text;
begin
 if r.entity_id is null or r.item_type='source' then
 return jsonb_build_object('bucket','audit','reason','Unimported candidate or source diagnostic');end if;
 if r.status='duplicate' or r.warnings @> '["Possible duplicate"]' then
 return jsonb_build_object('bucket','duplicates','reason','Duplicate verification required');end if;
 if r.status in ('approved','rejected') then return jsonb_build_object('bucket',r.status,'reason','');end if;
 select case r.item_type
 when 'question' then exists(select 1 from public.questions q join public.book_topics t on t.id=q.topic_id join public.import_jobs j on j.book_id=t.book_id where q.id=r.entity_id and j.id=r.source_id)
 when 'word' then exists(select 1 from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id join public.import_jobs j on j.vocabulary_book_id=s.book_id where w.id=r.entity_id and j.id=r.source_id)
 when 'passage' then exists(select 1 from public.vocabulary_passages w join public.vocabulary_sets s on s.id=w.set_id join public.import_jobs j on j.vocabulary_book_id=s.book_id where w.id=r.entity_id and j.id=r.source_id)
 when 'exercise' then exists(select 1 from public.vocabulary_questions w join public.vocabulary_sets s on s.id=w.set_id join public.import_jobs j on j.vocabulary_book_id=s.book_id where w.id=r.entity_id and j.id=r.source_id)
 else false end into valid_entity;
 if not valid_entity then return jsonb_build_object('bucket','audit','reason','Catalog entity removed or source relationship invalid');end if;
 p:=public.content_review_payload(r);
 begin
 perform public.validate_review_payload(r.item_type,p);
 if r.item_type='question' and (r.source_page is null or nullif(btrim(p->>'source'),'') is null) then raise exception 'Verify physical source page and provenance';end if;
 if r.extraction_method='' then raise exception 'Source extraction provenance missing';end if;
 if r.item_type in ('word','exercise') and r.source_page is null then raise exception 'Verify physical source page';end if;
 -- Passage pages were deliberately marked unknown in migration 014. Keep that
 -- uncertainty visible rather than borrowing the word-table page.
 if r.item_type='passage' and r.source_page is null then raise exception 'Verify passage source page';end if;
 if jsonb_array_length(r.warnings)>0 then raise exception 'Source warnings require verification';end if;
 bucket:='ready';reason:='Validated structure, answer and source relationship';
 exception when others then bucket:='human';reason:=SQLERRM;end;
 return jsonb_build_object('bucket',bucket,'reason',reason);
end;$$;
revoke all on function public.review_triage(public.content_review_items) from public,anon,authenticated,service_role;

alter function public.content_review_overview() rename to content_review_overview_legacy;
revoke all on function public.content_review_overview_legacy() from public,anon,authenticated,service_role;
create function public.content_review_overview() returns jsonb language plpgsql security definer set search_path='' as $$
declare counts jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select coalesce(jsonb_object_agg(bucket,n),'{}') into counts from
 (select public.review_triage(r)->>'bucket' bucket,count(*) n from public.content_review_items r group by 1) c;
 return public.content_review_overview_legacy()||counts||jsonb_build_object(
 'ready',coalesce((counts->>'ready')::int,0),'human',coalesce((counts->>'human')::int,0),'duplicates',coalesce((counts->>'duplicates')::int,0),'approved',coalesce((counts->>'approved')::int,0),'rejected',coalesce((counts->>'rejected')::int,0),'audit',coalesce((counts->>'audit')::int,0),
 'awaiting_review',coalesce((counts->>'ready')::int,0)+coalesce((counts->>'human')::int,0),
 'blocked_sources',(select count(*) from public.import_jobs where coalesce(source_metadata->>'resolution_status','') in ('manual','partial','unsupported','failed') and coalesce(source_metadata->>'triage_disposition','') not in ('ignored','unsupported')));
end;$$;

alter function public.content_review_sources(integer,text) rename to content_review_sources_legacy;
revoke all on function public.content_review_sources_legacy(integer,text) from public,anon,authenticated,service_role;
create function public.content_review_sources(p_page integer default 0,p_search text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 result:=public.content_review_sources_legacy(p_page,p_search);
 return result||jsonb_build_object('rows',(select coalesce(jsonb_agg(x||jsonb_build_object('triage',
 (select coalesce(jsonb_object_agg(bucket,n),'{}') from (select public.review_triage(r)->>'bucket' bucket,count(*) n from public.content_review_items r where r.source_id=(x->>'id')::uuid group by 1) c),
 'pages',j.source_metadata->'investigation'->'page_count','reason',j.source_metadata->'investigation'->>'diagnosis',
 'blocked',coalesce(j.source_metadata->>'resolution_status','') in ('manual','partial','unsupported','failed') and coalesce(j.source_metadata->>'triage_disposition','') not in ('ignored','unsupported'),
 'disposition',j.source_metadata->>'triage_disposition')),'[]') from jsonb_array_elements(result->'rows') x join public.import_jobs j on j.id=(x->>'id')::uuid));
end;$$;

create function public.content_review_triage_queue(p_source uuid default null,p_bucket text default 'human',p_type text default '',p_search text default '',p_page integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_bucket not in ('ready','human','duplicates','audit','approved','rejected','actionable') or p_page<0 or p_page>100000 or char_length(p_search)>200 then raise exception 'Invalid triage filter';end if;
 return (with matched as materialized (
 select r.*,j.title source_title,coalesce(p->>'question',p->>'word',p->>'passage',p->>'diagnosis','Source diagnostic') label,t->>'bucket' bucket,t->>'reason' reason
 from public.content_review_items r join public.import_jobs j on j.id=r.source_id
 cross join lateral (select public.review_triage(r) t,public.content_review_payload(r) p) derived
 where (p_source is null or r.source_id=p_source) and (p_type='' or r.item_type=p_type)
 and (p_bucket=t->>'bucket' or (p_bucket='actionable' and t->>'bucket' in ('ready','human','duplicates')))
 and (p_search='' or p::text ilike '%'||p_search||'%'))
 select jsonb_build_object('total',(select count(*) from matched),'rows',coalesce((select jsonb_agg(to_jsonb(x)-'candidate') from (select * from matched order by source_title,source_page,id limit 25 offset p_page*25) x),'[]')));
end;$$;

-- Preview and execution use identical live rules. The caller supplies the exact
-- preview inventory and versions; edits/additions invalidate confirmation.
create function public.content_review_bulk(p_source uuid default null,p_ids uuid[] default null,p_book uuid default null,p_confirm jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.content_review_items; safe jsonb:='[]'; excluded jsonb; n integer:=0; result jsonb;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_ids is not null and cardinality(p_ids)>5000 then raise exception 'Too many selected items';end if;
 -- Consistent ordering prevents competing bulk operations from deadlocking.
 for r in select ri.* from public.content_review_items ri join public.import_jobs j on j.id=ri.source_id
 where (p_source is null or ri.source_id=p_source) and (p_ids is null or ri.id=any(p_ids))
 and (p_book is null or j.book_id=p_book or j.vocabulary_book_id=p_book) and ri.status in ('pending','deferred') order by ri.id for update of ri loop
 if public.review_triage(r)->>'bucket'='ready' then safe:=safe||jsonb_build_array(jsonb_build_object('id',r.id,'version',r.updated_at));end if;
 end loop;
 select coalesce(jsonb_object_agg(x.bucket,x.n),'{}') into excluded from (
 select public.review_triage(ri)->>'bucket' bucket,count(*) n from public.content_review_items ri join public.import_jobs j on j.id=ri.source_id
 where (p_source is null or ri.source_id=p_source) and (p_ids is null or ri.id=any(p_ids)) and (p_book is null or j.book_id=p_book or j.vocabulary_book_id=p_book)
 and ri.status in ('pending','deferred') and public.review_triage(ri)->>'bucket'<>'ready' group by 1) x;
 result:=jsonb_build_object('safe',safe,'count',jsonb_array_length(safe),'excluded',excluded);
 if p_confirm is null then return result;end if;
 if safe<>p_confirm then raise exception 'Review inventory changed; preview approval again';end if;
 for r in select * from public.content_review_items where id in (select (x->>'id')::uuid from jsonb_array_elements(safe) x) order by id loop
 perform public.update_content_review(r.id,'approve',null,'Bulk approval: existing validators and provenance checks passed.',r.updated_at);n:=n+1;
 end loop;
 return result||jsonb_build_object('approved',n);
end;$$;

create function public.content_review_source_action(p_source uuid,p_action text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare j public.import_jobs;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_action not in ('retry','ignored','unsupported') or char_length(btrim(p_note))<12 or char_length(p_note)>2000 then raise exception 'Choose a source action and explain it';end if;
 select * into j from public.import_jobs where id=p_source for update;if not found then raise exception 'Source unavailable';end if;
 update public.import_jobs set source_metadata=source_metadata||jsonb_build_object('triage_disposition',p_action,'triage_note',p_note) where id=p_source;
 insert into public.content_review_audit(source_id,action,actor,before_data,after_data) values(p_source,'source_'||p_action,auth.uid(),jsonb_build_object('disposition',j.source_metadata->>'triage_disposition'),jsonb_build_object('note',p_note));
end;$$;
revoke all on function public.content_review_overview(),public.content_review_sources(integer,text),public.content_review_triage_queue(uuid,text,text,text,integer),public.content_review_bulk(uuid,uuid[],uuid,jsonb),public.content_review_source_action(uuid,text,text) from public,anon,authenticated;
grant execute on function public.content_review_overview(),public.content_review_sources(integer,text),public.content_review_triage_queue(uuid,text,text,text,integer),public.content_review_bulk(uuid,uuid[],uuid,jsonb),public.content_review_source_action(uuid,text,text) to authenticated;
commit;
