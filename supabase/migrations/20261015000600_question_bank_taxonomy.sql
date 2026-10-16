begin;
-- Classification is a query projection. Original domains, skills, topic IDs,
-- source metadata, publication decisions, snapshots and keys are not updated.
create function public.sat_bank_domain(p_section text,p_domain text)returns text
language sql immutable parallel safe set search_path='' as $$
 select case when p_section='Math' then case regexp_replace(lower(coalesce(p_domain,'')),'[^a-z0-9]','','g')
 when 'algebra'then'Algebra' when 'advancedmath'then'Advanced Math'
 when 'problemsolvinganddataanalysis'then'Problem-Solving and Data Analysis'
 when 'problemsolvingdataanalysis'then'Problem-Solving and Data Analysis'
 when 'geometryandtrigonometry'then'Geometry and Trigonometry'
 when 'geometrytrigonometry'then'Geometry and Trigonometry' when 'geometry'then'Geometry and Trigonometry'
 else 'Other Math Topics & Strategies'end
 else case regexp_replace(lower(coalesce(p_domain,'')),'[^a-z0-9]','','g')
 when 'informationandideas'then'Information and Ideas' when 'craftandstructure'then'Craft and Structure'
 when 'expressionofideas'then'Expression of Ideas' when 'standardenglishconventions'then'Standard English Conventions'
 else 'Other Reading & Writing Topics'end end;
$$;
create function public.sat_bank_skill(p_skill text,p_domain text,p_topic text)returns text
language sql immutable parallel safe set search_path='' as $$
 select coalesce(nullif(btrim(p_skill),''),nullif(btrim(p_domain),''),nullif(btrim(p_topic),''),'Unclassified skill');
$$;
create index question_bank_domain_projection_idx on public.questions(section,public.sat_bank_domain(section,domain),topic_id,difficulty);

alter function public.bank_candidate_ids(jsonb)rename to bank_candidate_ids_before_taxonomy;
revoke all on function public.bank_candidate_ids_before_taxonomy(jsonb)from public,anon,authenticated;
create function public.bank_candidate_ids(p_filters jsonb)returns setof uuid
language plpgsql stable security definer set search_path='' as $$begin
 if p_filters ? 'domains'and(jsonb_typeof(p_filters->'domains')is distinct from'array'or jsonb_array_length(p_filters->'domains')>32)then raise exception 'Invalid domains';end if;
 if p_filters ? 'skills'and(jsonb_typeof(p_filters->'skills')is distinct from'array'or jsonb_array_length(p_filters->'skills')>256)then raise exception 'Invalid skills';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_filters->'domains','[]'))d where jsonb_typeof(d)<>'string')then raise exception 'Invalid domains';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p_filters->'skills','[]'))s where jsonb_typeof(s)<>'object'or jsonb_typeof(s->'domain')is distinct from'string'or jsonb_typeof(s->'skill')is distinct from'string')then raise exception 'Invalid skills';end if;
 return query select ids.id from public.bank_candidate_ids_before_taxonomy(p_filters-'domain'-'domains'-'skill'-'skills')ids(id)
 join public.questions q on q.id=ids.id join public.book_topics t on t.id=q.topic_id
 cross join lateral(select public.sat_bank_domain(q.section,q.domain)domain,public.sat_bank_skill(q.skill,q.domain,t.title)skill)c
 where(coalesce(p_filters->>'domain','')=''or c.domain=public.sat_bank_domain(q.section,p_filters->>'domain'))
 and(coalesce(p_filters->>'skill','')=''or c.skill=p_filters->>'skill')
 and(coalesce(jsonb_array_length(p_filters->'domains'),0)+coalesce(jsonb_array_length(p_filters->'skills'),0)=0
 or c.domain in(select public.sat_bank_domain(q.section,jsonb_array_elements_text(p_filters->'domains')))
 or exists(select 1 from jsonb_array_elements(p_filters->'skills')s where c.domain=public.sat_bank_domain(q.section,s->>'domain')and c.skill=s->>'skill'));
end;$$;
revoke all on function public.bank_candidate_ids(jsonb)from public,anon,authenticated;
grant execute on function public.bank_candidate_ids(jsonb)to service_role;

create or replace function public.question_bank(p_filters jsonb default'{}',p_page integer default 0)returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid page';end if;
 with ids as materialized(select id from public.bank_candidate_ids(p_filters)ids(id)),page as(
 select q.id,q.question_text,q.image_url,q.question_type,q.import_metadata->>'questionNumber'question_number,q.section,
 public.sat_bank_domain(q.section,q.domain)domain,public.sat_bank_skill(q.skill,q.domain,t.title)skill,q.domain source_domain,q.skill source_skill,
 q.difficulty,b.title book_title,t.title topic_title
 from(select id from ids order by id limit 25 offset p_page*25)selected join public.questions q on q.id=selected.id
 join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id)
 select jsonb_build_object('count',(select count(*)from ids),'rows',coalesce((select jsonb_agg(to_jsonb(page))from page),'[]'))into result;
 return result;
end;$$;
create or replace function public.question_bank_facets(p_filters jsonb default'{}')returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 return coalesce((select jsonb_agg(to_jsonb(f))from(
 select q.section,public.sat_bank_domain(q.section,q.domain)domain,public.sat_bank_skill(q.skill,q.domain,t.title)skill,count(*)::int count
 from public.bank_candidate_ids(p_filters-'domain'-'domains'-'skill'-'skills')ids(id)
 join public.questions q on q.id=ids.id join public.book_topics t on t.id=q.topic_id
 group by 1,2,3 order by 1,2,3)f),'[]');
end;$$;

-- Reports use the same conservative domain projection while retaining the
-- original domain in source_domain. No frozen question JSON is overwritten.
do $$declare definition text;begin
 select pg_get_functiondef('public.learning_question_facts(uuid,text)'::regprocedure)into definition;
 definition:=replace(definition,'select i.canonical,i.question,i.id,i.session_id',
 'select i.canonical,i.question||jsonb_build_object(''source_domain'',i.question->>''domain'',''domain'',public.sat_bank_domain(i.question->>''section'',i.question->>''domain'')),i.id,i.session_id');
 execute definition;
end;$$;
revoke all on function public.sat_bank_domain(text,text),public.sat_bank_skill(text,text,text)from public,anon;
grant execute on function public.sat_bank_domain(text,text),public.sat_bank_skill(text,text,text)to authenticated;
commit;
