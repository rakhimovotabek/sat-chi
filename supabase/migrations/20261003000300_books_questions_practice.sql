begin;
create table public.books (
 id uuid primary key default gen_random_uuid(), title text not null check(char_length(btrim(title)) between 1 and 160),
 description text not null default '' check(char_length(description)<=10000), category text not null default 'Other' check(category in ('Math','Reading & Writing','Vocabulary','Other')),
 cover_url text check(cover_url is null or (cover_url ~ '^https://' and char_length(cover_url)<=2048)),
 published boolean not null default false, created_at timestamptz not null default now()
);
create table public.book_topics (
 id uuid primary key default gen_random_uuid(), book_id uuid not null references public.books(id) on delete cascade,
 parent_id uuid, title text not null check(char_length(btrim(title)) between 1 and 160), position integer not null default 0 check(position>=0),
 unique(book_id,id), foreign key(book_id,parent_id) references public.book_topics(book_id,id) on delete cascade
);
create index book_topics_order_idx on public.book_topics(book_id,parent_id,position,id);
create function public.guard_topic_tree() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.book_id::text,0));
 if tg_op='UPDATE' and new.book_id<>old.book_id then raise exception 'Topics cannot move between books'; end if;
 if new.parent_id=new.id or exists(with recursive ancestors as (
 select id,parent_id from public.book_topics where id=new.parent_id
 union all select t.id,t.parent_id from public.book_topics t join ancestors a on t.id=a.parent_id
 ) select 1 from ancestors where id=new.id) then raise exception 'Topic hierarchy cannot contain cycles'; end if;
 return new;
end; $$;
create trigger book_topic_tree before insert or update on public.book_topics for each row execute function public.guard_topic_tree();
create table public.questions (
 id uuid primary key default gen_random_uuid(), topic_id uuid not null references public.book_topics(id) on delete cascade,
 question_text text not null check(char_length(btrim(question_text)) between 1 and 20000), passage text not null default '' check(char_length(passage)<=60000),
 stimulus text not null default '' check(char_length(stimulus)<=60000), options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options)=4),
 image_url text check(image_url is null or (image_url ~ '^https://' and char_length(image_url)<=2048)), stimulus_table jsonb,
 domain text not null default '' check(char_length(domain)<=200), skill text not null default '' check(char_length(skill)<=200),
 difficulty text not null default 'medium' check(difficulty in ('easy','medium','hard')), source text not null default '' check(char_length(source)<=500),
 position integer not null default 0 check(position>=0), created_at timestamptz not null default now()
);
create index questions_topic_order_idx on public.questions(topic_id,position,id);
create table public.question_answers (
 question_id uuid primary key references public.questions(id) on delete cascade,
 correct_answer integer not null check(correct_answer between 0 and 3), explanation text not null default '' check(char_length(explanation)<=60000)
);
create table public.content_imports (
 id uuid primary key default gen_random_uuid(), fingerprint text not null unique,
 book_id uuid not null references public.books(id) on delete cascade, topic_id uuid references public.book_topics(id) on delete cascade,
 question_count integer not null, created_at timestamptz not null default now()
);
create table public.book_practice_sessions (
 id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id) on delete cascade,
 title text not null, started_at timestamptz not null default now(), submitted_at timestamptz
);
create index book_practice_owner_idx on public.book_practice_sessions(student_id,started_at desc);
create table public.book_practice_items (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.book_practice_sessions(id) on delete cascade,
 position integer not null, question jsonb not null, selected_answer integer check(selected_answer between 0 and 3),
 marked boolean not null default false, eliminated integer[] not null default '{}', correct boolean,
 unique(session_id,position)
);
create table public.book_practice_keys (
 item_id uuid primary key references public.book_practice_items(id) on delete cascade,
 correct_answer integer not null, explanation text not null
);
-- All answer-bearing relations have admin-only access. Students cannot write content or grade themselves.
do $$ declare t text; begin
 foreach t in array array['books','book_topics','questions','question_answers','content_imports','book_practice_sessions','book_practice_items','book_practice_keys'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['books','book_topics','questions','question_answers'] loop
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy admin_manage on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',t);
 end loop;
end $$;
create policy student_books on public.books for select to authenticated using(published and (select public.is_active_user()));
create policy student_topics on public.book_topics for select to authenticated using((select public.is_active_user()) and exists(select 1 from public.books b where b.id=book_id and b.published));
create policy student_questions on public.questions for select to authenticated using((select public.is_active_user()) and exists(select 1 from public.book_topics t join public.books b on b.id=t.book_id where t.id=topic_id and b.published));
grant select on public.content_imports,public.book_practice_sessions,public.book_practice_items,public.book_practice_keys to authenticated;
create policy import_admin on public.content_imports for select to authenticated using((select public.is_admin()));
create policy practice_read on public.book_practice_sessions for select to authenticated using((select public.is_admin()) or (student_id=(select auth.uid()) and (select public.is_active_user())));
create policy practice_items_read on public.book_practice_items for select to authenticated using((select public.is_admin()) or exists(select 1 from public.book_practice_sessions s where s.id=session_id and s.student_id=(select auth.uid()) and (select public.is_active_user())));
create policy practice_keys_admin on public.book_practice_keys for select to authenticated using((select public.is_admin()));

-- Internal helper: no browser execution grant; only checked admin entrypoints call it.
create function public.write_book_question(p_topic uuid,p_data jsonb,p_id uuid default null,p_position integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare qid uuid; answer integer; table_data jsonb; field text;
begin
 perform 1 from public.book_topics where id=p_topic for update;
 if not found then raise exception 'Topic not found'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('type','question','passage','stimulus','options','correctAnswer','explanation','domain','skill','difficulty','source','imageUrl','table')) then raise exception 'Unsupported question fields'; end if;
 if coalesce(p_data->>'type','mcq')<>'mcq' then raise exception 'Only mcq questions are supported'; end if;
 if jsonb_typeof(p_data->'options') is distinct from 'array' then raise exception 'Options must be an array'; end if;
 if jsonb_array_length(p_data->'options')<>4 or exists(select 1 from jsonb_array_elements(p_data->'options') v where jsonb_typeof(v)<>'string' or char_length(btrim(v#>>'{}')) not between 1 and 4000) then raise exception 'Exactly four nonempty choices required'; end if;
 if jsonb_typeof(p_data->'correctAnswer') is distinct from 'number' or (p_data->>'correctAnswer') !~ '^[0-3]$' then raise exception 'correctAnswer must be a zero-based choice index'; end if;
 if jsonb_typeof(p_data->'question') is distinct from 'string' then raise exception 'Question text is required'; end if;
 foreach field in array array['type','passage','stimulus','explanation','domain','skill','difficulty','source','imageUrl'] loop
 if p_data ? field and jsonb_typeof(p_data->field)<>'string' then raise exception 'Question text fields must be strings'; end if;
 end loop;
 answer=(p_data->>'correctAnswer')::integer;
 table_data=nullif(p_data->'table','null'::jsonb);
 if table_data is not null then
 if exists(select 1 from jsonb_object_keys(table_data) k where k not in ('columns','rows')) then raise exception 'Unsupported table fields'; end if;
 if jsonb_typeof(table_data)<>'object' or jsonb_typeof(table_data->'columns') is distinct from 'array' or jsonb_typeof(table_data->'rows') is distinct from 'array' then raise exception 'Invalid stimulus table'; end if;
 if jsonb_array_length(table_data->'columns') not between 1 and 12 or jsonb_array_length(table_data->'rows')>100 then raise exception 'Stimulus table too large'; end if;
 if exists(select 1 from jsonb_array_elements(table_data->'columns') v where jsonb_typeof(v)<>'string') then raise exception 'Table headings must be text'; end if;
 if exists(select 1 from jsonb_array_elements(table_data->'rows') v where jsonb_typeof(v)<>'array') then raise exception 'Table rows must be arrays'; end if;
 if exists(select 1 from jsonb_array_elements(table_data->'rows') v where jsonb_array_length(v)<>jsonb_array_length(table_data->'columns')) then raise exception 'Table rows must match headings'; end if;
 if exists(select 1 from jsonb_array_elements(table_data->'rows') r cross join lateral jsonb_array_elements(r) v where jsonb_typeof(v) not in ('string','number')) then raise exception 'Table cells must be text or numbers'; end if;
 end if;
 if p_id is null then
 insert into public.questions(topic_id,question_text,passage,stimulus,options,image_url,stimulus_table,domain,skill,difficulty,source,position)
 values(p_topic,p_data->>'question',coalesce(p_data->>'passage',''),coalesce(p_data->>'stimulus',''),p_data->'options',nullif(p_data->>'imageUrl',''),table_data,coalesce(p_data->>'domain',''),coalesce(p_data->>'skill',''),coalesce(p_data->>'difficulty','medium'),coalesce(p_data->>'source',''),coalesce(p_position,(select coalesce(max(position)+1,0) from public.questions where topic_id=p_topic))) returning id into qid;
 else
 update public.questions set topic_id=p_topic,question_text=p_data->>'question',passage=coalesce(p_data->>'passage',''),stimulus=coalesce(p_data->>'stimulus',''),options=p_data->'options',image_url=nullif(p_data->>'imageUrl',''),stimulus_table=table_data,domain=coalesce(p_data->>'domain',''),skill=coalesce(p_data->>'skill',''),difficulty=coalesce(p_data->>'difficulty','medium'),source=coalesce(p_data->>'source','') where id=p_id returning id into qid;
 if qid is null then raise exception 'Question not found'; end if;
 end if;
 insert into public.question_answers(question_id,correct_answer,explanation) values(qid,answer,coalesce(p_data->>'explanation','')) on conflict(question_id) do update set correct_answer=excluded.correct_answer,explanation=excluded.explanation;
 return qid;
end; $$;
create function public.save_book_question(p_topic_id uuid,p_payload jsonb,p_question_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 return public.write_book_question(p_topic_id,p_payload,p_question_id);
end; $$;
create function public.import_book_topic(p_book uuid,p_parent uuid,p_data jsonb,p_position integer,p_depth integer)
returns integer language plpgsql security definer set search_path='' as $$
declare tid uuid; child jsonb; q jsonb; n integer:=0; pos integer:=0;
begin
 if p_depth>8 or jsonb_typeof(p_data) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_data) k where k not in ('title','questions','children')) then raise exception 'Invalid topic structure or depth'; end if;
 if jsonb_typeof(coalesce(p_data->'questions','[]'))<>'array' or jsonb_typeof(coalesce(p_data->'children','[]'))<>'array' then raise exception 'Topic questions and children must be arrays'; end if;
 if jsonb_typeof(p_data->'title') is distinct from 'string' then raise exception 'Topic title must be text'; end if;
 insert into public.book_topics(book_id,parent_id,title,position) values(p_book,p_parent,p_data->>'title',p_position) returning id into tid;
 for q in select value from jsonb_array_elements(coalesce(p_data->'questions','[]')) loop perform public.write_book_question(tid,q,null,n); n=n+1; end loop;
 for child in select value from jsonb_array_elements(coalesce(p_data->'children','[]')) loop n=n+public.import_book_topic(p_book,tid,child,pos,p_depth+1); pos=pos+1; end loop;
 return n;
end; $$;
create function public.import_book_content(p_payload jsonb,p_topic_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare bid uuid; topic jsonb; q jsonb; n integer:=0; pos integer:=0; v_fingerprint text; b jsonb; field text;
begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>4000000 then raise exception 'Import must be an object under 4 MB'; end if;
 if p_payload ? 'schemaVersion' and p_payload->'schemaVersion'<>'1'::jsonb then raise exception 'Unsupported schema version'; end if;
 if p_payload ? 'kind' and p_payload->>'kind'<>(case when p_topic_id is null then 'book' else 'topic' end) then raise exception 'Import kind does not match destination'; end if;
 v_fingerprint=md5(p_payload::text||coalesce(p_topic_id::text,'book'));
 if exists(select 1 from public.content_imports i where i.fingerprint=v_fingerprint) then raise exception 'This content was already imported' using errcode='23505'; end if;
 if p_topic_id is null then
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('schemaVersion','kind','book','topics')) or jsonb_typeof(p_payload->'book') is distinct from 'object' or jsonb_typeof(p_payload->'topics') is distinct from 'array' then raise exception 'Full import requires book and topics'; end if;
 b=p_payload->'book';
 if jsonb_typeof(b->'title') is distinct from 'string' then raise exception 'Book title must be text'; end if;
 foreach field in array array['description','category'] loop
 if b ? field and jsonb_typeof(b->field)<>'string' then raise exception 'Book text fields must be strings'; end if;
 end loop;
 if b ? 'published' and jsonb_typeof(b->'published')<>'boolean' then raise exception 'published must be boolean'; end if;
 if exists(select 1 from jsonb_object_keys(b) k where k not in ('title','description','category','coverUrl','published')) then raise exception 'Unsupported book fields'; end if;
 insert into public.books(title,description,category,cover_url,published) values(b->>'title',coalesce(b->>'description',''),coalesce(b->>'category','Other'),nullif(b->>'coverUrl',''),coalesce((b->>'published')::boolean,false)) returning id into bid;
 for topic in select value from jsonb_array_elements(p_payload->'topics') loop n=n+public.import_book_topic(bid,null,topic,pos,0); pos=pos+1; end loop;
 if (select count(*) from public.book_topics where book_id=bid)>200 then raise exception 'At most 200 topics per import'; end if;
 else
 if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('schemaVersion','kind','questions')) or jsonb_typeof(p_payload->'questions') is distinct from 'array' then raise exception 'Topic import requires questions'; end if;
 select book_id into bid from public.book_topics where id=p_topic_id;
 if bid is null then raise exception 'Topic not found'; end if;
 for q in select value from jsonb_array_elements(p_payload->'questions') loop perform public.write_book_question(p_topic_id,q); n=n+1; end loop;
 end if;
 if n>500 then raise exception 'At most 500 questions per import'; end if;
 insert into public.content_imports(fingerprint,book_id,topic_id,question_count) values(v_fingerprint,bid,p_topic_id,n);
 return jsonb_build_object('book_id',bid,'question_count',n);
end; $$;
create function public.start_book_practice(p_topic_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; q record; iid uuid; n integer:=0; topic_title text;
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 select t.title into topic_title from public.book_topics t join public.books b on b.id=t.book_id where t.id=p_topic_id and (b.published or public.is_admin());
 if topic_title is null then raise exception 'Topic unavailable' using errcode='42501'; end if;
 insert into public.book_practice_sessions(student_id,title) values(auth.uid(),topic_title) returning id into sid;
 for q in with recursive topics as (select id,array[position] as sort_path from public.book_topics where id=p_topic_id union all select t.id,p.sort_path||t.position from public.book_topics t join topics p on t.parent_id=p.id)
 select qs.*,a.correct_answer,a.explanation from public.questions qs join topics t on t.id=qs.topic_id join public.question_answers a on a.question_id=qs.id order by t.sort_path,qs.position,qs.id limit 501 loop
 n=n+1; if n>500 then raise exception 'Practice supports at most 500 questions; choose a smaller topic'; end if;
 insert into public.book_practice_items(session_id,position,question) values(sid,n-1,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation);
 end loop;
 if n=0 then raise exception 'No questions available'; end if;
 return sid;
end; $$;
create function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; a jsonb; affected integer; choice integer; v_eliminated integer[];
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501'; end if;
 if s.submitted_at is not null then raise exception 'Session already submitted'; end if;
 if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)>500 then raise exception 'Invalid answers'; end if;
 for a in select value from jsonb_array_elements(p_answers) loop
 if jsonb_typeof(a)<>'object' or exists(select 1 from jsonb_object_keys(a) k where k not in ('id','selected_answer','marked','eliminated')) then raise exception 'Invalid answer fields'; end if;
 choice=(a->>'selected_answer')::integer;
 if jsonb_typeof(coalesce(a->'eliminated','[]'))<>'array' then raise exception 'Invalid eliminated choices'; end if;
 select coalesce(array_agg(value::integer),'{}') into v_eliminated from jsonb_array_elements_text(coalesce(a->'eliminated','[]'));
 if exists(select 1 from unnest(v_eliminated) v where v not between 0 and 3) or choice=any(v_eliminated) then raise exception 'Invalid eliminated choices'; end if;
 update public.book_practice_items set selected_answer=choice,marked=coalesce((a->>'marked')::boolean,false),eliminated=v_eliminated where id=(a->>'id')::uuid and session_id=s.id;
 get diagnostics affected=row_count; if affected<>1 then raise exception 'Question does not belong to session'; end if;
 end loop;
end; $$;
create function public.finish_book_practice(p_session_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions;
begin
 select * into s from public.book_practice_sessions where id=p_session_id for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501'; end if;
 if s.submitted_at is not null then return; end if;
 update public.book_practice_items i set correct=coalesce(i.selected_answer=k.correct_answer,false) from public.book_practice_keys k where i.session_id=s.id and k.item_id=i.id;
 update public.book_practice_sessions set submitted_at=now() where id=s.id;
end; $$;
create function public.review_book_practice(p_session_id uuid) returns table(item_id uuid,correct_answer integer,explanation text) language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session_id and submitted_at is not null and student_id=auth.uid() and public.is_active_user()) then raise exception 'Submit your own session before review' using errcode='42501'; end if;
 return query select k.item_id,k.correct_answer,k.explanation from public.book_practice_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session_id;
end; $$;
revoke all on function public.guard_topic_tree(),public.write_book_question(uuid,jsonb,uuid,integer),public.import_book_topic(uuid,uuid,jsonb,integer,integer),public.save_book_question(uuid,jsonb,uuid),public.import_book_content(jsonb,uuid),public.start_book_practice(uuid),public.save_book_practice(uuid,jsonb),public.finish_book_practice(uuid),public.review_book_practice(uuid) from public,anon,authenticated;
grant execute on function public.save_book_question(uuid,jsonb,uuid),public.import_book_content(jsonb,uuid),public.start_book_practice(uuid),public.save_book_practice(uuid,jsonb),public.finish_book_practice(uuid),public.review_book_practice(uuid) to authenticated;
commit;
