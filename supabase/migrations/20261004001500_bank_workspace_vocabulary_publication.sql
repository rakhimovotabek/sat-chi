begin;
create or replace function public.bank_candidates(p_filters jsonb) returns setof public.questions language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','status','domains','skills','marked')) then raise exception 'Invalid filters'; end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status'; end if;
 if p_filters ? 'domains' and (jsonb_typeof(p_filters->'domains') <> 'array' or jsonb_array_length(p_filters->'domains') > 32) then raise exception 'Invalid domains'; end if;
 if p_filters ? 'skills' and (jsonb_typeof(p_filters->'skills') <> 'array' or jsonb_array_length(p_filters->'skills') > 256) then raise exception 'Invalid skills'; end if;
 if coalesce(p_filters->>'marked','') not in ('','yes','no') then raise exception 'Invalid marked filter'; end if;
 return query select q.* from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where (b.published or public.is_admin())
 and (coalesce(p_filters->>'section','')='' or q.section=p_filters->>'section')
 and (coalesce(p_filters->>'domain','')='' or q.domain=p_filters->>'domain')
 and (coalesce(p_filters->>'skill','')='' or q.skill=p_filters->>'skill')
 and ((coalesce(jsonb_array_length(p_filters->'domains'),0) + coalesce(jsonb_array_length(p_filters->'skills'),0))=0
 or q.domain in (select jsonb_array_elements_text(p_filters->'domains'))
 or exists(select 1 from jsonb_array_elements(p_filters->'skills') s where s->>'domain'=q.domain and s->>'skill'=q.skill))
 and (coalesce(p_filters->>'marked','')='' or
 exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and i.marked and i.question->>'id'=q.id::text)=(p_filters->>'marked'='yes'))
 and (coalesce(p_filters->>'book','')='' or b.id=(p_filters->>'book')::uuid)
 and (coalesce(p_filters->>'topic','')='' or t.id in (with recursive topic_tree as (select id from public.book_topics where id=(p_filters->>'topic')::uuid union all select child.id from public.book_topics child join topic_tree parent on child.parent_id=parent.id) select id from topic_tree))
 and (coalesce(p_filters->>'difficulty','')='' or q.difficulty=p_filters->>'difficulty')
 and (coalesce(p_filters->>'status','')='' or
 case p_filters->>'status'
 when 'unanswered' then not exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.question->>'id'=q.id::text)
 when 'marked' then exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and i.marked and i.question->>'id'=q.id::text)
 else exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.correct=(p_filters->>'status'='correct') and i.question->>'id'=q.id::text) end);
end;$$;

-- Counts are aggregated on the server, scoped to the same visibility and history
-- rules as practice. Selection is omitted to keep other domains discoverable.
create function public.question_bank_facets(p_filters jsonb default '{}') returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(f)),'[]') from (
 select q.section,q.domain,q.skill,count(*)::integer count
 from public.bank_candidates(p_filters - 'domains' - 'skills' - 'domain' - 'skill') q
 group by q.section,q.domain,q.skill order by q.section,q.domain,q.skill
 ) f
$$;
revoke all on function public.question_bank_facets(jsonb) from public,anon;
grant execute on function public.question_bank_facets(jsonb) to authenticated;

alter table public.vocabulary_books add column archived boolean not null default false;
alter table public.vocabulary_books add constraint vocabulary_archive_visibility check(not archived or not published);

-- This also guards direct table mutations; publication cannot bypass readiness.
create function public.guard_vocabulary_readiness() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.published and (
 not exists(select 1 from public.vocabulary_sets where book_id=new.id)
 or exists(select 1 from public.vocabulary_sets s where s.book_id=new.id and not exists(select 1 from public.vocabulary_words w where w.set_id=s.id))
 ) then raise exception 'Each published vocabulary book needs sets containing words'; end if;
 return new;
end;$$;
revoke all on function public.guard_vocabulary_readiness() from public,anon,authenticated;
create trigger vocabulary_readiness before insert or update of published on public.vocabulary_books for each row execute function public.guard_vocabulary_readiness();

create function public.vocabulary_book_detail(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare b public.vocabulary_books; sets jsonb; pending integer:=0;
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 select * into b from public.vocabulary_books where id=p_book and (published or public.is_admin());
 if b.id is null then raise exception 'Vocabulary book unavailable' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.position,x.id),'[]') into sets from (
 select s.*,
 (select count(*) from public.vocabulary_words w where w.set_id=s.id) words,
 (select count(*) from public.vocabulary_passages p where p.set_id=s.id) passages,
 (select count(*) from public.vocabulary_questions q where q.set_id=s.id) exercises
 from public.vocabulary_sets s where s.book_id=p_book
 ) x;
 if public.is_admin() then
 select count(*) into pending from public.import_jobs j join public.content_review_items r on r.source_id=j.id
 where j.vocabulary_book_id=p_book and r.status<>'approved' and r.entity_id is not null
 and ((r.item_type='word' and exists(select 1 from public.vocabulary_words where id=r.entity_id))
 or (r.item_type='passage' and exists(select 1 from public.vocabulary_passages where id=r.entity_id))
 or (r.item_type='exercise' and exists(select 1 from public.vocabulary_questions where id=r.entity_id)));
 end if;
 return jsonb_build_object('book',to_jsonb(b),'sets',sets) || case when public.is_admin() then jsonb_build_object(
 'pending',pending,'state',case when b.archived then 'archived' when b.published then 'published' when pending>0 then 'needs_review' else 'draft' end,
 'eligible',jsonb_array_length(sets)>0 and not exists(select 1 from jsonb_array_elements(sets) s where (s->>'words')::integer=0) and pending=0
 ) else '{}'::jsonb end;
end;$$;

create function public.set_vocabulary_publication(p_book uuid,p_state text) returns void
language plpgsql security definer set search_path='' as $$
declare old_data jsonb; new_data jsonb;
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if p_state not in ('draft','published','archived') or p_state is null then raise exception 'Invalid publication state';end if;
 select to_jsonb(b) into old_data from public.vocabulary_books b where id=p_book for update;
 if old_data is null then raise exception 'Vocabulary book unavailable';end if;
 update public.vocabulary_books set published=(p_state='published'),archived=(p_state='archived') where id=p_book returning to_jsonb(vocabulary_books) into new_data;
 insert into public.content_review_audit(action,actor,before_data,after_data) values('vocabulary_publication',auth.uid(),jsonb_build_object('book_id',p_book,'published',old_data->'published','archived',old_data->'archived'),jsonb_build_object('book_id',p_book,'published',new_data->'published','archived',new_data->'archived'));
end;$$;
revoke all on function public.vocabulary_book_detail(uuid),public.set_vocabulary_publication(uuid,text) from public,anon;
grant execute on function public.vocabulary_book_detail(uuid),public.set_vocabulary_publication(uuid,text) to authenticated;

-- Existing validated JSON imports may publish, after all sets/words exist.
create or replace function public.import_vocabulary(p_payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare bid uuid; sid uuid; s jsonb; w jsonb; q jsonb; n integer:=0; pos integer:=0; wid integer;begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 if octet_length(p_payload::text)>4000000 or jsonb_typeof(p_payload->'sets') is distinct from 'array' or jsonb_array_length(p_payload->'sets') not between 1 and 100 then raise exception 'Provide 1 to 100 vocabulary sets under 4 MB';end if;
 insert into public.vocabulary_books(title,description,source,published,import_fingerprint) values(p_payload->>'title',coalesce(p_payload->>'description',''),coalesce(p_payload->>'source',''),false,md5(p_payload::text)) returning id into bid;
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
 if coalesce((p_payload->>'published')::boolean,false) then update public.vocabulary_books set published=true where id=bid;end if;
 return bid;end;$$;
commit;
