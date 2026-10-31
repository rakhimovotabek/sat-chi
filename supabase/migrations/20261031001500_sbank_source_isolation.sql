begin;
-- Defaults preserve every existing source and historical question identity.
alter table public.books add column bank_source text not null default 'satchi' check(bank_source in('satchi','sbank'));
create index books_bank_source_idx on public.books(bank_source,id);
alter function public.bank_candidate_ids(jsonb) rename to bank_candidate_ids_before_source;
revoke all on function public.bank_candidate_ids_before_source(jsonb) from public,anon,authenticated;
create function public.bank_candidate_ids(p_filters jsonb) returns setof uuid
language plpgsql stable security definer set search_path='' as $$begin
 if p_filters ? 'source' and (jsonb_typeof(p_filters->'source')is distinct from 'string' or p_filters->>'source' not in('satchi','sbank'))then raise exception 'Invalid question source';end if;
 return query select ids.id from public.bank_candidate_ids_before_source(p_filters-'source')ids(id)
 join public.questions q on q.id=ids.id join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 where b.bank_source=coalesce(p_filters->>'source','satchi');
end;$$;
revoke all on function public.bank_candidate_ids(jsonb)from public,anon,authenticated;
grant execute on function public.bank_candidate_ids(jsonb)to service_role;
-- Keep original catalog order; use supplied source order for the new collection.
create or replace function public.question_bank(p_filters jsonb default'{}',p_page integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid page';end if;
 with ids as materialized(select id from public.bank_candidate_ids(p_filters)ids(id)),page as(
 select q.id,q.question_text,q.image_url,q.question_type,q.import_metadata->>'questionNumber'question_number,q.section,
 public.sat_bank_domain(q.section,q.domain)domain,public.sat_bank_skill(q.skill,q.domain,t.title)skill,q.domain source_domain,q.skill source_skill,
 q.difficulty,b.title book_title,t.title topic_title,q.position
 from(select q0.id from ids join public.questions q0 on q0.id=ids.id
 order by case when p_filters->>'source'='sbank'then q0.position end,q0.id limit 25 offset p_page*25)selected
 join public.questions q on q.id=selected.id join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id)
 select jsonb_build_object('count',(select count(*)from ids),'rows',coalesce((select jsonb_agg(to_jsonb(page)order by case when p_filters->>'source'='sbank'then position end,id)from page),'[]'))into result;
 return result;
end;$$;
notify pgrst,'reload schema';
commit;
-- Tag draft collections before any question can enter the shared pool.
begin;
alter function public.universal_begin(text,jsonb,uuid) rename to universal_begin_before_bank_source;
revoke all on function public.universal_begin_before_bank_source(text,jsonb,uuid)from public,anon,authenticated,service_role;
create function public.universal_begin(p_fingerprint text,p_manifest jsonb,p_actor uuid)returns uuid
language plpgsql security definer set search_path='' as $$declare jid uuid;begin
 if p_manifest ? 'bankSource' and p_manifest->>'bankSource' not in('satchi','sbank')then raise exception 'Invalid question source';end if;
 jid:=public.universal_begin_before_bank_source(p_fingerprint,p_manifest,p_actor);
 update public.books b set bank_source=coalesce(p_manifest->>'bankSource','satchi')from public.universal_book_jobs j where j.id=jid and j.book_id=b.id and not b.published;
 return jid;
end;$$;
revoke all on function public.universal_begin(text,jsonb,uuid)from public,anon,authenticated;
grant execute on function public.universal_begin(text,jsonb,uuid)to service_role;
commit;
