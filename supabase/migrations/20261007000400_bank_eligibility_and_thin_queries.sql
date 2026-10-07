begin;
-- Eligibility changes only when source/keys/review change. Keep it private and
-- maintain it transactionally; filter RPCs need IDs, not every image/metadata row.
create table public.question_bank_eligibility (
 question_id uuid primary key references public.questions(id) on delete cascade,
 admin_ready boolean not null,student_ready boolean not null
);
alter table public.question_bank_eligibility enable row level security;
revoke all on public.question_bank_eligibility from public,anon,authenticated;
grant all on public.question_bank_eligibility to service_role;

create function public.refresh_bank_eligibility(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare q public.questions; packaged boolean; ordinary boolean; approved boolean; clear_review boolean; ui boolean;
begin
 select * into q from public.questions where id=p_id;
 if q.id is null then return;end if;
 ui:=public.question_answer_ui_supported(to_jsonb(q));
 approved:=exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and r.status='approved');
 clear_review:=not exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and (r.status<>'approved' or r.warnings @> '["Possible duplicate"]'));
 packaged:=q.import_metadata->>'package_question_id' is not null
 and exists(select 1 from public.book_topics t join public.book_import_packages p on p.book_id=t.book_id where t.id=q.topic_id)
 and approved and exists(select 1 from public.question_answers a where a.question_id=q.id and
 (q.question_type='mcq' and a.correct_answer between 0 and 3 or q.question_type='open' and exists(select 1 from public.book_open_answers o where o.question_id=q.id)));
 ordinary:=q.question_type='mcq' and jsonb_array_length(q.options)=4 and coalesce(q.import_metadata->>'options_verified','true')<>'false'
 and not exists(select 1 from jsonb_array_elements_text(q.options) o where btrim(o)='' or o ~* '^\s*Choice [A-D] in the source image\s*$')
 and (select count(distinct lower(btrim(o))) from jsonb_array_elements_text(q.options) o)=4;
 insert into public.question_bank_eligibility values(q.id,coalesce(ui and(packaged or ordinary),false),coalesce(ui and(packaged or(ordinary and(q.import_metadata='{}'::jsonb or approved)and clear_review)),false))
 on conflict(question_id) do update set admin_ready=excluded.admin_ready,student_ready=excluded.student_ready;
end;$$;
revoke all on function public.refresh_bank_eligibility(uuid) from public,anon,authenticated,service_role;

create function public.bank_eligibility_changed() returns trigger
language plpgsql security definer set search_path='' as $$declare v jsonb;id uuid;begin
 v:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name='questions' then id:=(v->>'id')::uuid;
 elsif tg_table_name='content_review_items' then
 if v->>'item_type'<>'question' then return null;end if;id:=(v->>'entity_id')::uuid;
 else id:=(v->>'question_id')::uuid;end if;
 if id is not null then perform public.refresh_bank_eligibility(id);end if;
 if tg_op='UPDATE' and tg_table_name='content_review_items' then
 if old.entity_id is distinct from new.entity_id and old.item_type='question' then perform public.refresh_bank_eligibility(old.entity_id);end if;
 end if;
 return null;
end;$$;
revoke all on function public.bank_eligibility_changed() from public,anon,authenticated,service_role;
create trigger bank_question_changed after insert or update on public.questions for each row execute function public.bank_eligibility_changed();
create trigger bank_answer_changed after insert or update or delete on public.question_answers for each row execute function public.bank_eligibility_changed();
create trigger bank_open_key_changed after insert or update or delete on public.book_open_answers for each row execute function public.bank_eligibility_changed();
create trigger bank_review_changed after insert or update or delete on public.content_review_items for each row execute function public.bank_eligibility_changed();
create function public.bank_package_changed() returns trigger language plpgsql security definer set search_path='' as $$declare package_book_id uuid;qid uuid;begin
 package_book_id:=case when tg_op='DELETE' then old.book_id else new.book_id end;
 for qid in select q.id from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=package_book_id loop perform public.refresh_bank_eligibility(qid);end loop;
 return null;end;$$;
revoke all on function public.bank_package_changed() from public,anon,authenticated,service_role;
create trigger bank_package_changed after insert or update or delete on public.book_import_packages for each row execute function public.bank_package_changed();
do $$declare id uuid;begin for id in select q.id from public.questions q loop perform public.refresh_bank_eligibility(id);end loop;end;$$;

create function public.bank_candidate_ids(p_filters jsonb) returns setof uuid
language plpgsql stable security definer set search_path='' as $$declare choices jsonb;admin_user boolean;begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','difficulties','status','domains','skills','marked')) then raise exception 'Invalid filters';end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status';end if;
 if p_filters ? 'domains' and (jsonb_typeof(p_filters->'domains') is distinct from 'array' or jsonb_array_length(p_filters->'domains')>32) then raise exception 'Invalid domains';end if;
 if p_filters ? 'skills' and (jsonb_typeof(p_filters->'skills') is distinct from 'array' or jsonb_array_length(p_filters->'skills')>256) then raise exception 'Invalid skills';end if;
 if coalesce(p_filters->>'marked','') not in ('','yes','no') then raise exception 'Invalid marked filter';end if;
 if p_filters ? 'difficulties' then
 choices:=p_filters->'difficulties';
 if jsonb_typeof(choices) is distinct from 'array' then raise exception 'Invalid difficulties';end if;
 if jsonb_array_length(choices)>4 or exists(select 1 from jsonb_array_elements(choices) v where jsonb_typeof(v)<>'string' or v#>>'{}' not in ('easy','medium','hard','unclassified')) then raise exception 'Invalid difficulties';end if;
 else choices:=case when coalesce(p_filters->>'difficulty','')='' then '[]'::jsonb else jsonb_build_array(p_filters->>'difficulty') end;end if;
 admin_user:=public.is_admin();
 return query select q.id from public.questions q join public.question_bank_eligibility eligible on eligible.question_id=q.id
 join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 where (b.published or admin_user) and case when admin_user then eligible.admin_ready else eligible.student_ready end
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
 and (jsonb_array_length(choices)=0 or q.difficulty in(select jsonb_array_elements_text(choices)))
 and (coalesce(p_filters->>'status','')='' or
 case p_filters->>'status'
 when 'unanswered' then not exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.question->>'id'=q.id::text)
 when 'marked' then exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and i.marked and i.question->>'id'=q.id::text)
 else exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.correct=(p_filters->>'status'='correct') and i.question->>'id'=q.id::text) end);
end;$$;
revoke all on function public.bank_candidate_ids(jsonb) from public,anon,authenticated;
grant execute on function public.bank_candidate_ids(jsonb) to service_role;

create or replace function public.bank_candidates(p_filters jsonb) returns setof public.questions
language sql stable security definer set search_path='' as $$
 select q.* from public.bank_candidate_ids(p_filters) ids(id) join public.questions q on q.id=ids.id;
$$;
create or replace function public.question_bank(p_filters jsonb default '{}',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if p_page is null or p_page not between 0 and 100000 then raise exception 'Invalid page';end if;
 with ids as materialized(select id from public.bank_candidate_ids(p_filters) ids(id)),
 page as (select q.id,q.question_text,q.image_url,q.question_type,q.import_metadata->>'questionNumber' question_number,q.section,q.domain,q.skill,q.difficulty,b.title book_title,t.title topic_title
 from(select id from ids order by id limit 25 offset p_page*25) selected join public.questions q on q.id=selected.id join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id)
 select jsonb_build_object('count',(select count(*) from ids),'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'))into result;
 return result;end;$$;
create or replace function public.question_bank_facets(p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 return coalesce((select jsonb_agg(to_jsonb(f)) from(select q.section,q.domain,q.skill,count(*)::int count
 from public.bank_candidate_ids(p_filters-'domains'-'skills') ids(id) join public.questions q on q.id=ids.id
 group by q.section,q.domain,q.skill order by q.section,q.domain,q.skill) f),'[]');
end;$$;
create index questions_package_source_idx on public.questions((import_metadata->>'package_question_id')) where import_metadata->>'package_question_id' is not null;
analyze public.question_bank_eligibility;
analyze public.questions;
commit;
