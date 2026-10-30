begin;
create table public.universal_book_jobs (
 id uuid primary key default gen_random_uuid(), fingerprint text unique not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 book_id uuid unique not null references public.books on delete restrict, created_by uuid not null references public.profiles,
 manifest jsonb not null, status text not null default 'importing' check(status in('importing','draft','published')),
 asset_cursor integer not null default 0, question_cursor integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.universal_book_jobs enable row level security;
revoke all on public.universal_book_jobs from public,anon,authenticated;
grant select on public.universal_book_jobs to authenticated;
grant all on public.universal_book_jobs to service_role;
create policy universal_admin on public.universal_book_jobs for select to authenticated using(public.is_admin());
create table public.universal_book_ids (
 job_id uuid references public.universal_book_jobs on delete restrict, source_id text not null,
 question_id uuid unique references public.questions on delete restrict, primary key(job_id,source_id)
);
alter table public.universal_book_ids enable row level security;
revoke all on public.universal_book_ids from public,anon,authenticated;
grant all on public.universal_book_ids to service_role;

-- Only the authenticated Edge worker (service role) can create/write jobs. No browser-supplied privileged SQL.
create function public.universal_begin(p_fingerprint text,p_manifest jsonb,p_actor uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare jid uuid; bid uuid; t jsonb; tid uuid; parent uuid; topic_ids jsonb:='{}';
begin
 if not exists(select 1 from public.profiles where id=p_actor and role='admin') then raise exception 'Admin required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_fingerprint,0));
 select id into jid from public.universal_book_jobs where fingerprint=p_fingerprint;
 if jid is not null then return jid; end if;
 if p_manifest->>'format'<>'satchi-book-v1' or p_manifest->'rights'->>'authorized'<>'true' then raise exception 'Invalid authorized package';end if;
 if exists(select 1 from public.book_import_packages where slug=p_manifest->'book'->>'id') then raise exception 'Book source ID already exists; edit the existing draft';end if;
 insert into public.books(title,description,category)values(p_manifest->'book'->>'title',coalesce(p_manifest->'book'->>'description',''),p_manifest->'book'->>'section')returning id into bid;
 insert into public.book_import_packages values(bid,p_manifest->'book'->>'id',p_fingerprint,'{}',p_manifest,'[]',p_manifest->'rights');
 insert into public.universal_book_jobs(fingerprint,book_id,manifest,created_by) values(p_fingerprint,bid,p_manifest,p_actor)returning id into jid;
 for t in select value from jsonb_array_elements(p_manifest->'topics') loop
 parent:=(topic_ids->>(t->>'parent'))::uuid;
 insert into public.book_topics(book_id,parent_id,title,position)values(bid,parent,t->>'title',(select count(*) from jsonb_object_keys(topic_ids)))returning id into tid;
 topic_ids:=topic_ids||jsonb_build_object(t->>'id',tid);
 end loop;
 update public.universal_book_jobs set manifest=manifest||jsonb_build_object('_topicIds',topic_ids)where id=jid;
 return jid;
end;$$;
create function public.universal_append(p_job uuid,p_expected integer,p_questions jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare j public.universal_book_jobs; q jsonb; qid uuid; pos integer; options jsonb; images jsonb;
begin
 select * into j from public.universal_book_jobs where id=p_job for update;
 if not found then raise exception 'Unknown job';end if;
 if j.question_cursor<>p_expected then return j.question_cursor;end if;
 if j.status<>'importing' or jsonb_array_length(p_questions)>25 then raise exception 'Invalid batch';end if;
 pos:=p_expected;
 for q in select value from jsonb_array_elements(p_questions) loop
 if q->>'type'='mcq' then
 select jsonb_agg(o->>'text' order by n),jsonb_agg(o->'imageUrl' order by n)into options,images from jsonb_array_elements(q->'options')with ordinality a(o,n);
 else options:='[]';images:='[null,null,null,null]';end if;
 insert into public.questions(topic_id,question_text,passage,options,option_image_urls,image_url,stimulus_table,domain,skill,difficulty,source,position,question_type,import_metadata)
 values((j.manifest->'_topicIds'->>(q->>'topic'))::uuid,q->>'text',coalesce(q->>'passage',''),options,images,q->>'imageUrl',nullif(q->'table','null'::jsonb),q->>'domain',q->>'skill',q->>'difficulty',q->'source'->>'reference',pos,q->>'type',jsonb_build_object('package_question_id',q->>'id','universal_review',q->>'reviewStatus'))returning id into qid;
 insert into public.question_answers(question_id,correct_answer,explanation)values(qid,(q->>'answer')::integer,q->>'explanation');
 if q->>'type'='open' then insert into public.book_open_answers(question_id,accepted_answers,correct_answer,answer_format)values(qid,q->'acceptedAnswers',q->'acceptedAnswers'->>0,'numeric');end if;
 insert into public.universal_book_ids values(j.id,q->>'id',qid);
 pos:=pos+1;
 end loop;
 if pos>(j.manifest->>'questionCount')::integer then raise exception 'Too many questions';end if;
 update public.universal_book_jobs set question_cursor=pos,updated_at=now()where id=j.id;
 return pos;
end;$$;
-- Universal content uses the existing canonical candidate and grading paths.
create function public.universal_question_ready(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.universal_book_ids u join public.questions q on q.id=u.question_id join public.question_answers a on a.question_id=q.id
 where q.id=p_id and q.import_metadata->>'universal_review'='approved' and
 ((q.question_type='mcq' and a.correct_answer between 0 and 3 and jsonb_array_length(q.options)=4)or(q.question_type='open' and exists(select 1 from public.book_open_answers where question_id=q.id))));$$;
alter function public.book_package_question_ready(uuid) rename to book_package_question_ready_before_universal;
create function public.book_package_question_ready(p_id uuid)returns boolean language sql stable security definer set search_path='' as $$select public.book_package_question_ready_before_universal(p_id)or public.universal_question_ready(p_id);$$;
-- The approval wrapper also needs to include the universal path (policies retain function OID).
alter function public.question_approved_for_students(uuid) rename to question_approved_before_universal;
create function public.question_approved_for_students(p_id uuid)returns boolean language sql stable security definer set search_path='' as $$select public.question_approved_before_universal(p_id)or public.universal_question_ready(p_id);$$;
-- Rebind the existing question policy to the new wrapper.
drop policy if exists questions_student_read on public.questions;
drop policy student_questions on public.questions;
create policy student_questions on public.questions for select to authenticated using((select public.is_active_user())and public.question_approved_for_students(id)and exists(select 1 from public.book_topics t join public.books b on b.id=t.book_id where t.id=topic_id and b.published));
create function public.universal_publish(p_job uuid,p_publish boolean default true)returns void language plpgsql security definer set search_path='' as $$
declare j public.universal_book_jobs;
begin
 if not public.is_admin()then raise exception 'Admin required'using errcode='42501';end if;
 select * into j from public.universal_book_jobs where id=p_job for update;
 if not found then raise exception 'Unknown job';end if;
 if p_publish and (j.status='importing' or j.question_cursor<>(j.manifest->>'questionCount')::integer or exists(select 1 from public.universal_book_ids where job_id=j.id and not public.universal_question_ready(question_id)))then raise exception 'Finish importing and approve all questions before publishing';end if;
 update public.books set published=p_publish where id=j.book_id;
 update public.universal_book_jobs set status=case when p_publish then 'published' else 'draft' end,updated_at=now()where id=j.id;
end;$$;
create function public.guard_universal_publication()returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.published and exists(select 1 from public.universal_book_jobs j where j.book_id=new.id and (j.status='importing' or j.question_cursor<>(j.manifest->>'questionCount')::integer or exists(select 1 from public.universal_book_ids u where u.job_id=j.id and not public.universal_question_ready(u.question_id))))then raise exception 'Incomplete or unreviewed import cannot be published';end if;return new;end;$$;
create trigger universal_publication before insert or update of published on public.books for each row execute function public.guard_universal_publication();
-- Prevent cascading deletion from erasing canonical identities referenced in saved JSON snapshots.
create function public.guard_book_history_delete()returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from public.book_practice_items i join public.questions q on q.id::text=i.question->>'id' join public.book_topics t on t.id=q.topic_id where t.book_id=old.id)then raise exception 'This book has saved practice or Homework history. Hide or archive it instead.';end if;return old;end;$$;
create trigger preserve_book_history before delete on public.books for each row execute function public.guard_book_history_delete();
revoke all on function public.universal_begin(text,jsonb,uuid),public.universal_append(uuid,integer,jsonb)from public,anon,authenticated;
grant execute on function public.universal_begin(text,jsonb,uuid),public.universal_append(uuid,integer,jsonb)to service_role;
revoke all on function public.universal_publish(uuid,boolean),public.universal_question_ready(uuid),public.guard_universal_publication(),public.guard_book_history_delete(),public.book_package_question_ready(uuid),public.question_approved_for_students(uuid)from public,anon;
grant execute on function public.universal_publish(uuid,boolean),public.universal_question_ready(uuid),public.book_package_question_ready(uuid),public.question_approved_for_students(uuid)to authenticated,service_role;
commit;
-- Storage bucket provisioning is conditional for the SQL-only isolated harness.
do $$begin
 if to_regclass('storage.buckets')is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('universal-book-staging','universal-book-staging',false,33554432,array['application/zip'])on conflict(id)do nothing;
 end if;
end;$$;
alter function public.can_read_book_package_asset(text) rename to can_read_book_package_asset_before_universal;
create function public.can_read_book_package_asset(p_path text)returns boolean language sql stable security definer set search_path='' as $$
 select public.can_read_book_package_asset_before_universal(p_path) or (public.is_active_user()and exists(
 select 1 from public.book_package_assets a join public.universal_book_jobs j on j.book_id=a.book_id join public.books b on b.id=a.book_id
 where a.path=p_path and (
 b.published and b.cover_url like '%/book-package-assets/'||p_path
 or exists(select 1 from public.universal_book_ids u join public.questions q on q.id=u.question_id join public.question_answers k on k.question_id=q.id
 where u.job_id=j.id and (
 b.published and public.universal_question_ready(q.id)and(q.image_url like '%/book-package-assets/'||p_path or q.option_image_urls::text like '%/book-package-assets/'||p_path||'"%')
 or exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid()and i.question->>'id'=q.id::text and public.can_access_homework_session(s.id)and
 (q.image_url like '%/book-package-assets/'||p_path or q.option_image_urls::text like '%/book-package-assets/'||p_path||'"%' or (i.has_answered or i.selected_answer is not null or s.submitted_at is not null)and k.explanation like '%/book-package-assets/'||p_path||')%'))
 )))));
$$;
-- Rebind Storage's policy to the current function identity.
do $$begin if to_regclass('storage.objects')is not null then
 execute 'drop policy if exists book_package_asset_read on storage.objects';
 execute 'create policy book_package_asset_read on storage.objects for select to authenticated using(bucket_id=''book-package-assets'' and public.can_read_book_package_asset(name))';
 update storage.buckets set allowed_mime_types=array['image/png','image/jpeg','image/webp']where id='book-package-assets';
 end if;end;$$;
revoke all on function public.can_read_book_package_asset(text)from public,anon;
grant execute on function public.can_read_book_package_asset(text)to authenticated,service_role;
alter function public.refresh_bank_eligibility(uuid)rename to refresh_bank_eligibility_before_universal;
create function public.refresh_bank_eligibility(p_id uuid)returns void language plpgsql security definer set search_path='' as $$begin
 perform public.refresh_bank_eligibility_before_universal(p_id);
 if exists(select 1 from public.universal_book_ids where question_id=p_id)then
 update public.question_bank_eligibility set admin_ready=public.universal_question_ready(p_id),student_ready=public.universal_question_ready(p_id)where question_id=p_id;
 end if;
end;$$;
create function public.universal_id_ready()returns trigger language plpgsql security definer set search_path='' as $$begin perform public.refresh_bank_eligibility(new.question_id);return new;end;$$;
create trigger universal_id_ready after insert on public.universal_book_ids for each row execute function public.universal_id_ready();
revoke all on function public.refresh_bank_eligibility(uuid),public.universal_id_ready()from public,anon,authenticated;
