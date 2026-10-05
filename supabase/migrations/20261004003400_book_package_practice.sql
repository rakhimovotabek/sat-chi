begin;
-- Package source and open answer keys stay private, like existing answer keys.
create table public.book_import_packages (
 book_id uuid primary key references public.books on delete cascade,
 slug text not null unique, fingerprint text not null, source_payload jsonb not null,
 manifest jsonb not null, review jsonb not null, provenance jsonb not null
);
create table public.book_open_answers (
 question_id uuid primary key references public.questions on delete cascade,
 accepted_answers jsonb not null check(jsonb_typeof(accepted_answers)='array' and jsonb_array_length(accepted_answers)>0)
);
create table public.book_practice_open_keys (
 item_id uuid primary key references public.book_practice_items on delete cascade,
 accepted_answers jsonb not null
);
create table public.book_package_assets (
 path text primary key, book_id uuid not null references public.books on delete cascade,
 question_id uuid references public.questions on delete cascade, kind text not null check(kind in ('question','option','explanation','archive')),
 source_path text not null, sha256 text not null
);
do $$ declare t text;begin
 foreach t in array array['book_import_packages','book_open_answers','book_practice_open_keys','book_package_assets'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy package_admin on public.%I for select to authenticated using(public.is_admin())',t);
 end loop;
end $$;
alter table public.questions add column question_type text not null default 'mcq' check(question_type in ('mcq','open'));
alter table public.questions drop constraint questions_question_text_check;
alter table public.questions add constraint questions_question_text_check check(char_length(question_text)<=20000 and (char_length(btrim(question_text))>0 or image_url is not null));
alter table public.questions drop constraint questions_options_check;
alter table public.questions add constraint questions_options_check check(jsonb_typeof(options)='array' and jsonb_array_length(options)=case when question_type='open' then 0 else 4 end);
alter table public.question_answers alter column correct_answer drop not null, alter column explanation drop not null;
alter table public.book_practice_keys alter column correct_answer drop not null, alter column explanation drop not null;
alter table public.book_practice_items add column selected_response text check(length(selected_response)<=200), add column has_answered boolean not null default false;

-- Package-only eligibility extends Books. The Question Bank keeps its existing
-- question_practicable filter, which excludes source-image/open-response choices.
create function public.book_package_question_ready(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.questions q join public.book_topics t on t.id=q.topic_id
 join public.book_import_packages p on p.book_id=t.book_id join public.question_answers a on a.question_id=q.id
 where q.id=p_id and q.import_metadata->>'package_question_id' is not null
 and exists(select 1 from public.content_review_items r where r.entity_id=q.id and r.item_type='question' and r.status='approved')
 and (q.question_type='mcq' and a.correct_answer between 0 and 3
 or q.question_type='open' and exists(select 1 from public.book_open_answers o where o.question_id=q.id)));
$$;
alter function public.question_approved_for_students(uuid) rename to question_approved_before_packages;
create function public.question_approved_for_students(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.question_approved_before_packages(p_id) or public.book_package_question_ready(p_id);
$$;
create or replace function public.start_book_practice(p_topic_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; q record; iid uuid; n integer:=0; topic_title text;
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 select t.title into topic_title from public.book_topics t join public.books b on b.id=t.book_id where t.id=p_topic_id and (b.published or public.is_admin());
 if topic_title is null then raise exception 'Topic unavailable' using errcode='42501';end if;
 insert into public.book_practice_sessions(student_id,title)values(auth.uid(),topic_title) returning id into sid;
 for q in with recursive topics as(select id,array[position] sort_path from public.book_topics where id=p_topic_id union all select t.id,p.sort_path||t.position from public.book_topics t join topics p on t.parent_id=p.id)
 select qs.*,a.correct_answer,a.explanation from public.questions qs join topics t on t.id=qs.topic_id join public.question_answers a on a.question_id=qs.id
 where (public.question_practicable(qs.id) or public.book_package_question_ready(qs.id)) and (public.is_admin() or public.question_approved_for_students(qs.id)) order by t.sort_path,qs.position,qs.id limit 501 loop
 n=n+1;if n>500 then raise exception 'Practice supports at most 500 questions; choose a smaller topic';end if;
 insert into public.book_practice_items(session_id,position,question)values(sid,n-1,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation);
 insert into public.book_practice_open_keys select iid,accepted_answers from public.book_open_answers where question_id=q.id;
 end loop;
 if n=0 then raise exception 'No questions available';end if;return sid;
end;$$;

alter function public.save_book_practice(uuid,jsonb) rename to save_book_practice_before_packages;
revoke all on function public.save_book_practice_before_packages(uuid,jsonb) from public,anon,authenticated;
create function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; a jsonb; cleaned jsonb:='[]'; i public.book_practice_items; response text;
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501';end if;
 if s.kind<>'book' then perform public.save_book_practice_before_packages(p_session_id,p_answers);return;end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then raise exception 'Invalid answers';end if;
 for a in select value from jsonb_array_elements(p_answers) loop
 select * into i from public.book_practice_items where id=(a->>'id')::uuid and session_id=s.id;
 if i.id is null then raise exception 'Question does not belong to session';end if;
 if i.question->>'question_type'='open' then
 if a ? 'selected_response' and jsonb_typeof(a->'selected_response') not in ('string','null') then raise exception 'Invalid response';end if;
 response:=a->>'selected_response';if length(response)>200 then raise exception 'Response too long';end if;
 -- selected_answer=0 is an answered marker for existing progress/analytics;
 -- grading uses only the frozen accepted strings, never this marker.
 a:=(a-'selected_response')||jsonb_build_object('selected_answer',case when nullif(btrim(response),'') is not null then 0 else null end);
 update public.book_practice_items set selected_response=response,has_answered=has_answered or nullif(btrim(response),'') is not null where id=i.id;
 else
 if a ? 'selected_response' then raise exception 'Unexpected open response';end if;
 update public.book_practice_items set has_answered=has_answered or nullif(a->>'selected_answer','') is not null where id=i.id;
 end if;
 cleaned:=cleaned||jsonb_build_array(a);
 end loop;
 perform public.save_book_practice_before_packages(p_session_id,cleaned);
end;$$;

alter function public.finish_book_practice(uuid) rename to finish_book_practice_before_packages;
revoke all on function public.finish_book_practice_before_packages(uuid) from public,anon,authenticated;
create function public.finish_book_practice(p_session_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform public.finish_book_practice_before_packages(p_session_id);
 update public.book_practice_items i set correct=exists(select 1 from jsonb_array_elements_text(k.accepted_answers) v where btrim(v)=btrim(i.selected_response))
 from public.book_practice_open_keys k,public.book_practice_sessions s where k.item_id=i.id and s.id=i.session_id and s.id=p_session_id and s.kind='book' and s.student_id=auth.uid();
end;$$;

create function public.book_practice_explanation(p_session uuid,p_item uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 select jsonb_build_object('explanation',k.explanation) into result from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id join public.book_practice_keys k on k.item_id=i.id
 where s.id=p_session and i.id=p_item and s.kind='book' and s.student_id=auth.uid() and public.is_active_user() and (i.has_answered or i.selected_answer is not null);
 if result is null then raise exception 'Select an answer on your own book question first' using errcode='42501';end if;
 return result;
end;$$;
create function public.book_practice_open_review(p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session and student_id=auth.uid() and kind='book' and submitted_at is not null and public.is_active_user()) then raise exception 'Submit your own book practice first' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',k.item_id,'accepted_answers',k.accepted_answers)) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session),'[]');
end;$$;
create function public.can_read_book_package_asset(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_user() and (public.is_admin() or exists(select 1 from public.book_package_assets a join public.books b on b.id=a.book_id
 where a.path=p_path and a.kind<>'archive' and (a.kind in ('question','option') and b.published and public.book_package_question_ready(a.question_id)
 or exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.kind='book' and i.question->>'id'=a.question_id::text and (a.kind<>'explanation' or i.has_answered or i.selected_answer is not null or s.submitted_at is not null)))));
$$;
do $$begin
 if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('book-package-assets','book-package-assets',false,10485760,array['image/png']) on conflict(id) do nothing;
 execute 'create policy book_package_asset_read on storage.objects for select to authenticated using(bucket_id=''book-package-assets'' and public.can_read_book_package_asset(name))';
 end if;
end $$;
revoke all on function public.book_package_question_ready(uuid),public.question_approved_for_students(uuid),public.save_book_practice(uuid,jsonb),public.finish_book_practice(uuid),public.book_practice_explanation(uuid,uuid),public.book_practice_open_review(uuid),public.can_read_book_package_asset(text) from public,anon;
grant execute on function public.book_package_question_ready(uuid),public.question_approved_for_students(uuid),public.save_book_practice(uuid,jsonb),public.finish_book_practice(uuid),public.book_practice_explanation(uuid,uuid),public.book_practice_open_review(uuid),public.can_read_book_package_asset(text) to authenticated;
commit;
