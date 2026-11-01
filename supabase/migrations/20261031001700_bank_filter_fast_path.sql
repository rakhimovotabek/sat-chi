begin;
-- Browsing uses one indexed source-aware query. History uses the same canonical
-- facts/semantics as before, without planning legacy per-question subqueries.
create or replace function public.bank_candidate_ids(p_filters jsonb)returns setof uuid
language plpgsql stable security definer set search_path='' as $$
declare admin_user boolean;choices jsonb;status_filter text:=coalesce(p_filters->>'status','');marked_filter text:=coalesce(p_filters->>'marked','');
begin
 if not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 if jsonb_typeof(p_filters)is distinct from'object'or exists(select 1 from jsonb_object_keys(p_filters)k where k not in('source','section','domain','domains','skill','skills','difficulty','difficulties','book','topic','status','marked','assignment'))then raise exception 'Invalid filters';end if;
 if p_filters ? 'source'and(jsonb_typeof(p_filters->'source')is distinct from'string'or p_filters->>'source'not in('satchi','sbank'))then raise exception 'Invalid question source';end if;
 if status_filter not in('','unanswered','attempted','correct','incorrect','corrected','marked')or marked_filter not in('','yes','no')then raise exception 'Invalid history filter';end if;
 if status_filter<>''or marked_filter<>''then
 return query with history as materialized(select * from public.learning_question_facts(auth.uid())),
 ids as materialized(select id from public.bank_candidate_ids(p_filters-'status'-'marked')ids(id))
 select ids.id from ids left join history h on h.question_id=ids.id::text
 where(marked_filter=''or coalesce(h.marked,false)=(marked_filter='yes'))
 and case status_filter when ''then true when 'unanswered'then not coalesce(h.attempted,false)
 when 'attempted'then coalesce(h.attempted,false)when 'correct'then coalesce(h.now_correct,false)
 when 'incorrect'then h.now_correct=false when 'corrected'then h.first_correct=false and h.eventually_correct
 when 'marked'then coalesce(h.marked,false)else false end;return;
 end if;
 if p_filters ? 'domains'and(jsonb_typeof(p_filters->'domains')is distinct from'array'or jsonb_array_length(p_filters->'domains')>32)then raise exception 'Invalid domains';end if;
 if p_filters ? 'skills'and(jsonb_typeof(p_filters->'skills')is distinct from'array'or jsonb_array_length(p_filters->'skills')>256)then raise exception 'Invalid skills';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_filters->'domains','[]'))d where jsonb_typeof(d)<>'string')then raise exception 'Invalid domains';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_filters->'skills','[]'))s where jsonb_typeof(s)<>'object'or jsonb_typeof(s->'domain')is distinct from'string'or jsonb_typeof(s->'skill')is distinct from'string')then raise exception 'Invalid skills';end if;
 if p_filters ? 'difficulties'then
 choices:=p_filters->'difficulties';
 if jsonb_typeof(choices)is distinct from'array'then raise exception 'Invalid difficulties';end if;
 if jsonb_array_length(choices)>4 or exists(select 1 from jsonb_array_elements(choices)v where jsonb_typeof(v)<>'string'or v#>>'{}'not in('easy','medium','hard','unclassified'))then raise exception 'Invalid difficulties';end if;
 else choices:=case when coalesce(p_filters->>'difficulty','')=''then'[]'::jsonb else jsonb_build_array(p_filters->>'difficulty')end;end if;
 admin_user:=public.is_admin();
 return query with recursive topic_tree as(
 select id from public.book_topics where id=nullif(p_filters->>'topic','')::uuid
 union all select t.id from public.book_topics t join topic_tree p on t.parent_id=p.id
 )select q.id from public.questions q join public.question_bank_eligibility e on e.question_id=q.id
 join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 cross join lateral(select public.sat_bank_domain(q.section,q.domain)domain,public.sat_bank_skill(q.skill,q.domain,t.title)skill)c
 where b.bank_source=coalesce(p_filters->>'source','satchi')and(b.published or admin_user)
 and case when admin_user then e.admin_ready else e.student_ready end
 and(not coalesce((p_filters->>'assignment')::boolean,false)or(b.published and e.student_ready))
 and(coalesce(p_filters->>'section','')=''or q.section=p_filters->>'section')
 and(coalesce(p_filters->>'book','')=''or b.id=nullif(p_filters->>'book','')::uuid)
 and(coalesce(p_filters->>'topic','')=''or q.topic_id in(select id from topic_tree))
 and(jsonb_array_length(choices)=0 or q.difficulty in(select jsonb_array_elements_text(choices)))
 and(coalesce(p_filters->>'domain','')=''or c.domain=public.sat_bank_domain(q.section,p_filters->>'domain'))
 and(coalesce(p_filters->>'skill','')=''or c.skill=p_filters->>'skill')
 and(coalesce(jsonb_array_length(p_filters->'domains'),0)+coalesce(jsonb_array_length(p_filters->'skills'),0)=0
 or c.domain in(select public.sat_bank_domain(q.section,jsonb_array_elements_text(p_filters->'domains')))
 or exists(select 1 from jsonb_array_elements(p_filters->'skills')s where c.domain=public.sat_bank_domain(q.section,s->>'domain')and c.skill=s->>'skill'));
end;$$;
revoke all on function public.bank_candidate_ids(jsonb)from public,anon,authenticated;
grant execute on function public.bank_candidate_ids(jsonb)to service_role;
notify pgrst,'reload schema';
commit;
