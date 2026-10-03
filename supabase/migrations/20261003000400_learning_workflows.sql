begin;
alter table public.questions drop constraint questions_difficulty_check;
alter table public.questions add constraint questions_difficulty_check check(difficulty in ('easy','medium','hard','unclassified'));
alter table public.questions add column section text not null default 'Reading & Writing' check(section in ('Math','Reading & Writing'));
update public.questions q set section=case when b.category='Math' then 'Math' else 'Reading & Writing' end from public.book_topics t join public.books b on b.id=t.book_id where q.topic_id=t.id;
create function public.set_question_section() returns trigger language plpgsql security definer set search_path='' as $$begin
 select case when b.category='Math' then 'Math' else 'Reading & Writing' end into new.section from public.book_topics t join public.books b on b.id=t.book_id where t.id=new.topic_id; return new; end;$$;
create trigger question_section before insert or update of topic_id on public.questions for each row execute function public.set_question_section();
create index questions_filter_idx on public.questions(section,domain,difficulty,skill);
alter table public.book_practice_sessions add column kind text not null default 'book' check(kind in ('book','bank','homework','vocabulary')),
 add column source_id uuid, add column filters jsonb not null default '{}', add column timed boolean not null default false,
 add column time_limit integer check(time_limit between 60 and 21600), add column elapsed_seconds integer not null default 0 check(elapsed_seconds>=0),
 add column current_position integer not null default 0 check(current_position>=0), add column last_heartbeat timestamptz not null default now();
create index practice_items_question_idx on public.book_practice_items((question->>'id'),session_id);
create table public.import_jobs(id uuid primary key default gen_random_uuid(),fingerprint text not null unique check(length(fingerprint)=64),source_file text not null check(length(source_file)<=255),title text not null,status text not null check(status in ('review','validated','imported','failed')),detected_topics integer not null default 0,detected_questions integer not null default 0,imported_count integer not null default 0,skipped_count integer not null default 0,warnings jsonb not null default '[]',errors jsonb not null default '[]',book_id uuid references public.books on delete set null,created_at timestamptz not null default now());
create table public.homeworks(id uuid primary key default gen_random_uuid(),title text not null check(length(btrim(title)) between 1 and 160),instructions text not null default '' check(length(instructions)<=10000),due_at timestamptz not null,timed boolean not null default false,time_limit integer check(time_limit between 60 and 21600),created_at timestamptz not null default now());
create table public.homework_sections(id uuid primary key default gen_random_uuid(),homework_id uuid not null references public.homeworks on delete cascade,title text not null,position integer not null,unique(homework_id,position));
-- Definition snapshots are admin-only: keys never appear in student queries.
create table public.homework_questions(id uuid primary key default gen_random_uuid(),section_id uuid not null references public.homework_sections on delete cascade,position integer not null,question jsonb not null,correct_answer integer not null check(correct_answer between 0 and 3),explanation text not null,unique(section_id,position));
create table public.homework_assignments(id uuid primary key default gen_random_uuid(),homework_id uuid not null references public.homeworks on delete cascade,student_id uuid not null references public.profiles on delete cascade,unique(homework_id,student_id));
create table public.homework_attempts(id uuid primary key default gen_random_uuid(),assignment_id uuid not null unique references public.homework_assignments on delete cascade,session_id uuid not null unique references public.book_practice_sessions on delete cascade);
create index homework_assignee_idx on public.homework_assignments(student_id,homework_id);
create index homework_due_idx on public.homeworks(due_at);
create table public.student_activity(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles on delete cascade,session_id uuid unique references public.book_practice_sessions on delete cascade,kind text not null,title text not null,created_at timestamptz not null default now());
create index student_activity_owner_idx on public.student_activity(student_id,created_at desc);
create table public.vocabulary_books(id uuid primary key default gen_random_uuid(),title text not null check(length(btrim(title)) between 1 and 160),description text not null default '',source text not null default '',published boolean not null default false,created_at timestamptz not null default now());
create table public.vocabulary_sets(id uuid primary key default gen_random_uuid(),book_id uuid not null references public.vocabulary_books on delete cascade,title text not null check(length(btrim(title)) between 1 and 160),position integer not null default 0);
create index vocabulary_sets_order_idx on public.vocabulary_sets(book_id,position);
create table public.vocabulary_words(id uuid primary key default gen_random_uuid(),set_id uuid not null references public.vocabulary_sets on delete cascade,word text not null check(length(btrim(word)) between 1 and 100),definition text not null check(length(btrim(definition)) between 1 and 2000),example text not null default '',synonym text not null default '',translation text not null default '',position integer not null default 0,unique(set_id,word));
create index vocabulary_words_set_idx on public.vocabulary_words(set_id,position);
create table public.vocabulary_passages(id uuid primary key default gen_random_uuid(),set_id uuid not null references public.vocabulary_sets on delete cascade,title text not null default '',passage text not null check(length(passage)<=60000));
create table public.vocabulary_questions(id uuid primary key default gen_random_uuid(),set_id uuid not null references public.vocabulary_sets on delete cascade,payload jsonb not null);
create table public.vocabulary_progress(student_id uuid not null references public.profiles on delete cascade,word_id uuid not null references public.vocabulary_words on delete cascade,status text not null check(status in ('known','review')),updated_at timestamptz not null default now(),primary key(student_id,word_id));
create table public.vocabulary_attempts(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles on delete cascade,set_id uuid references public.vocabulary_sets on delete set null,session_id uuid not null unique references public.book_practice_sessions on delete cascade);

do $$declare t text;begin
 foreach t in array array['import_jobs','homeworks','homework_sections','homework_questions','homework_assignments','homework_attempts','student_activity','vocabulary_books','vocabulary_sets','vocabulary_words','vocabulary_passages','vocabulary_questions','vocabulary_progress','vocabulary_attempts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy admin_read on public.%I for select to authenticated using ((select public.is_admin()))',t);
 end loop;
 foreach t in array array['import_jobs','vocabulary_books','vocabulary_sets','vocabulary_words','vocabulary_passages','vocabulary_questions'] loop
 execute format('grant insert,update,delete on public.%I to authenticated',t);
 execute format('create policy admin_write on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',t);
 end loop;
end $$;
create policy assignment_self on public.homework_assignments for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create policy homework_self on public.homeworks for select to authenticated using((select public.is_active_user()) and exists(select 1 from public.homework_assignments a where a.homework_id=homeworks.id and a.student_id=(select auth.uid())));
create policy sections_self on public.homework_sections for select to authenticated using((select public.is_active_user()) and exists(select 1 from public.homework_assignments a where a.homework_id=homework_sections.homework_id and a.student_id=(select auth.uid())));
create policy homework_attempt_self on public.homework_attempts for select to authenticated using(exists(select 1 from public.homework_assignments a where a.id=assignment_id and a.student_id=(select auth.uid()) and (select public.is_active_user())));
create policy activity_self on public.student_activity for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create policy vocab_book_read on public.vocabulary_books for select to authenticated using(published and (select public.is_active_user()));
create policy vocab_set_read on public.vocabulary_sets for select to authenticated using((select public.is_active_user()) and exists(select 1 from public.vocabulary_books b where b.id=book_id and b.published));
create function public.can_read_vocab(p_set uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_active_user() and exists(select 1 from public.vocabulary_sets s join public.vocabulary_books b on b.id=s.book_id where s.id=p_set and (b.published or public.is_admin()))$$;
create policy vocab_word_read on public.vocabulary_words for select to authenticated using(public.can_read_vocab(set_id));
create policy vocab_passage_read on public.vocabulary_passages for select to authenticated using(public.can_read_vocab(set_id));
grant insert,update on public.vocabulary_progress to authenticated;
create policy vocab_progress_self on public.vocabulary_progress for all to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user())) with check(student_id=(select auth.uid()) and exists(select 1 from public.vocabulary_words w where w.id=word_id and public.can_read_vocab(w.set_id)));
create policy vocab_attempt_self on public.vocabulary_attempts for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));

create function public.bank_candidates(p_filters jsonb) returns setof public.questions language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501'; end if;
 if jsonb_typeof(p_filters)<>'object' or exists(select 1 from jsonb_object_keys(p_filters) k where k not in ('section','domain','skill','book','topic','difficulty','status')) then raise exception 'Invalid filters'; end if;
 if coalesce(p_filters->>'status','') not in ('','unanswered','correct','incorrect','marked') then raise exception 'Invalid status'; end if;
 return query select q.* from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id where (b.published or public.is_admin())
 and (coalesce(p_filters->>'section','')='' or q.section=p_filters->>'section')
 and (coalesce(p_filters->>'domain','')='' or q.domain=p_filters->>'domain')
 and (coalesce(p_filters->>'skill','')='' or q.skill=p_filters->>'skill')
 and (coalesce(p_filters->>'book','')='' or b.id=(p_filters->>'book')::uuid)
 and (coalesce(p_filters->>'topic','')='' or t.id=(p_filters->>'topic')::uuid)
 and (coalesce(p_filters->>'difficulty','')='' or q.difficulty=p_filters->>'difficulty')
 and (coalesce(p_filters->>'status','')='' or
 case p_filters->>'status'
 when 'unanswered' then not exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.question->>'id'=q.id::text)
 when 'marked' then exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and i.marked and i.question->>'id'=q.id::text)
 else exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=auth.uid() and s.submitted_at is not null and i.selected_answer is not null and i.correct=(p_filters->>'status'='correct') and i.question->>'id'=q.id::text) end);
end;$$;
create function public.question_bank(p_filters jsonb default '{}',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb; n integer;begin
 if p_page not between 0 and 100000 then raise exception 'Invalid page'; end if;
 select count(*) into n from public.bank_candidates(p_filters);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select q.id,q.question_text,q.section,q.domain,q.skill,q.difficulty,b.title book_title,t.title topic_title from public.bank_candidates(p_filters) q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id order by q.id limit 25 offset p_page*25) x;
 return jsonb_build_object('count',n,'rows',result);
end;$$;
create function public.start_bank_practice(p_filters jsonb,p_count integer default 20,p_timed boolean default false) returns uuid language plpgsql security definer set search_path='' as $$declare sid uuid; q record; iid uuid; n integer:=0;begin
 if p_count not between 1 and 500 then raise exception 'Select 1 to 500 questions'; end if;
 insert into public.book_practice_sessions(student_id,title,kind,filters,timed,time_limit) values(auth.uid(),'Question Bank practice','bank',p_filters,p_timed,case when p_timed then least(21600,p_count*90) end) returning id into sid;
 for q in select c.*,a.correct_answer,a.explanation from public.bank_candidates(p_filters) c join public.question_answers a on a.question_id=c.id order by random() limit p_count loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation); n=n+1; end loop;
 if n=0 then raise exception 'No matching questions'; end if;
 if p_timed then update public.book_practice_sessions set time_limit=least(21600,greatest(60,n*90)) where id=sid; end if;
 return sid;end;$$;
create function public.create_homework(p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare hid uuid; sec jsonb; sid uuid; q record; n integer; pos integer:=0; iid uuid; students uuid[]; groups_ids uuid[]; total integer:=0;begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
 if jsonb_typeof(p_data->'sections') is distinct from 'array' or jsonb_array_length(p_data->'sections') not between 1 and 20 then raise exception 'Provide 1 to 20 sections'; end if;
 select coalesce(array_agg(value::uuid),'{}') into students from jsonb_array_elements_text(coalesce(p_data->'students','[]'));
 select coalesce(array_agg(value::uuid),'{}') into groups_ids from jsonb_array_elements_text(coalesce(p_data->'groups','[]'));
 if exists(select 1 from unnest(students) id where not exists(select 1 from public.profiles p where p.id=id and p.role='student' and p.active)) or exists(select 1 from unnest(groups_ids) id where not exists(select 1 from public.groups g where g.id=id)) then raise exception 'Invalid assignees'; end if;
 insert into public.homeworks(title,instructions,due_at,timed,time_limit) values(p_data->>'title',coalesce(p_data->>'instructions',''),(p_data->>'dueAt')::timestamptz,coalesce((p_data->>'timed')::boolean,false),(p_data->>'timeLimit')::integer) returning id into hid;
 for sec in select value from jsonb_array_elements(p_data->'sections') loop
 insert into public.homework_sections(homework_id,title,position) values(hid,sec->>'title',pos) returning id into sid;pos=pos+1;n=0;
 if coalesce((sec->>'count')::integer,0) not between 1 and 500 then raise exception 'Section count must be 1 to 500';end if;
 for q in select c.*,a.correct_answer,a.explanation from public.bank_candidates(coalesce(sec->'filters','{}')) c join public.question_answers a on a.question_id=c.id where sec->'questionIds' is null or c.id::text in(select jsonb_array_elements_text(sec->'questionIds')) order by random() limit (sec->>'count')::integer loop
 insert into public.homework_questions(section_id,position,question,correct_answer,explanation) values(sid,n,to_jsonb(q)-'correct_answer'-'explanation',q.correct_answer,q.explanation);n=n+1;end loop;
 if n<>(sec->>'count')::integer then raise exception 'Not enough eligible questions for section %',sec->>'title'; end if;total=total+n;
 end loop;
 if total>500 then raise exception 'Homework supports at most 500 questions'; end if;
 insert into public.homework_assignments(homework_id,student_id) select hid,p.id from public.profiles p where p.role='student' and p.active and (coalesce((p_data->>'allStudents')::boolean,false) or p.id=any(students) or exists(select 1 from public.group_members m where m.student_id=p.id and m.group_id=any(groups_ids)));
 if not found then raise exception 'Choose at least one active student'; end if;
 return hid;end;$$;
create function public.start_homework(p_assignment uuid) returns uuid language plpgsql security definer set search_path='' as $$declare a public.homework_assignments; h public.homeworks; sid uuid; q record; iid uuid; n integer:=0;begin
 select * into a from public.homework_assignments where id=p_assignment for update;
 if a.id is null or a.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Assignment unavailable' using errcode='42501'; end if;
 select session_id into sid from public.homework_attempts where assignment_id=a.id;
 if sid is not null then return sid;end if;
 select * into h from public.homeworks where id=a.homework_id;
 insert into public.book_practice_sessions(student_id,title,kind,source_id,timed,time_limit) values(auth.uid(),h.title,'homework',h.id,h.timed,h.time_limit) returning id into sid;
 for q in select qs.*,s.title section_title from public.homework_questions qs join public.homework_sections s on s.id=qs.section_id where s.homework_id=h.id order by s.position,qs.position loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,q.question||jsonb_build_object('homework_section',q.section_title)) returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation);n=n+1;end loop;
 insert into public.homework_attempts(assignment_id,session_id) values(a.id,sid);return sid;end;$$;
create function public.homework_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required';end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at) from(select h.*,a.id assignment_id,a.student_id,p.display_name,s.id session_id,s.submitted_at,s.elapsed_seconds,(select jsonb_agg(jsonb_build_object('title',sec.title,'count',(select count(*) from public.homework_questions qs where qs.section_id=sec.id)) order by sec.position) from public.homework_sections sec where sec.homework_id=h.id) sections from public.homework_assignments a join public.homeworks h on h.id=a.homework_id join public.profiles p on p.id=a.student_id left join public.homework_attempts ha on ha.assignment_id=a.id left join public.book_practice_sessions s on s.id=ha.session_id where public.is_admin() or a.student_id=auth.uid() order by h.due_at desc limit 200) x),'[]');end;$$;
create function public.practice_heartbeat(p_session uuid,p_position integer,p_seconds integer default 0) returns integer language plpgsql security definer set search_path='' as $$declare s public.book_practice_sessions; credited integer;begin
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501';end if;
 if s.submitted_at is not null then return s.elapsed_seconds;end if;
 if p_position<0 or p_position>=(select count(*) from public.book_practice_items where session_id=s.id) then raise exception 'Invalid position'; end if;
 credited=least(greatest(p_seconds,0),30,greatest(0,floor(extract(epoch from clock_timestamp()-s.last_heartbeat))::int));
 update public.book_practice_sessions set current_position=p_position,elapsed_seconds=elapsed_seconds+credited,last_heartbeat=clock_timestamp() where id=s.id;
 return s.elapsed_seconds+credited;end;$$;
create function public.log_practice_completion() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.submitted_at is null and new.submitted_at is not null then insert into public.student_activity(student_id,session_id,kind,title) values(new.student_id,new.id,new.kind,new.title) on conflict(session_id) do nothing;end if;return new;end;$$;
create trigger practice_completion after update on public.book_practice_sessions for each row execute function public.log_practice_completion();
create function public.learning_metrics(p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare uid uuid:=coalesce(p_student,auth.uid()); result jsonb;begin
 if not public.is_active_user() or (uid<>auth.uid() and not public.is_admin()) then raise exception 'Account unavailable' using errcode='42501';end if;
 select jsonb_build_object('attempted',count(*) filter(where i.selected_answer is not null),'correct',count(*) filter(where i.correct and i.selected_answer is not null),'incorrect',count(*) filter(where i.correct=false and i.selected_answer is not null),'today',count(*) filter(where i.selected_answer is not null and s.submitted_at::date=current_date),'study_seconds',(select coalesce(sum(elapsed_seconds),0) from public.book_practice_sessions where student_id=uid),'homework_total',(select count(*) from public.homework_assignments where student_id=uid),'homework_completed',(select count(*) from public.homework_attempts a join public.homework_assignments h on h.id=a.assignment_id join public.book_practice_sessions ps on ps.id=a.session_id where h.student_id=uid and ps.submitted_at is not null),'vocabulary_known',(select count(*) from public.vocabulary_progress where student_id=uid and status='known'),'activity',coalesce((select jsonb_agg(to_jsonb(a)) from(select kind,title,created_at from public.student_activity where student_id=uid order by created_at desc limit 20)a),'[]'),'breakdowns',coalesce((select jsonb_agg(to_jsonb(b)) from(select pi.question->>'section' section,pi.question->>'domain' domain,pi.question->>'skill' skill,pi.question->>'difficulty' difficulty,pi.question->>'source' source,count(*) attempted,count(*) filter(where pi.correct) correct from public.book_practice_items pi join public.book_practice_sessions ps on ps.id=pi.session_id where ps.student_id=uid and ps.submitted_at is not null and pi.selected_answer is not null group by 1,2,3,4,5)b),'[]'),'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name)) from public.groups g join public.group_members gm on gm.group_id=g.id where gm.student_id=uid),'[]')) into result from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=uid and s.submitted_at is not null;
 return result;end;$$;
create function public.learning_standings(p_group boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required';end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from(select p.id,p.display_name, count(i.id) filter(where i.selected_answer is not null) questions,count(i.id) filter(where i.correct and i.selected_answer is not null) correct,(select coalesce(sum(elapsed_seconds),0) from public.book_practice_sessions where student_id=p.id) study_seconds,(select count(*) from public.homework_attempts ha join public.homework_assignments a on a.id=ha.assignment_id join public.book_practice_sessions hs on hs.id=ha.session_id where a.student_id=p.id and hs.submitted_at is not null) homework from public.profiles p left join public.book_practice_sessions s on s.student_id=p.id and s.submitted_at is not null left join public.book_practice_items i on i.session_id=s.id where p.active and p.role='student' and (not p_group or exists(select 1 from public.group_members mine join public.group_members theirs on mine.group_id=theirs.group_id where mine.student_id=auth.uid() and theirs.student_id=p.id)) group by p.id,p.display_name order by count(i.id) filter(where i.selected_answer is not null) desc,p.id limit 100)r),'[]');end;$$;
create function public.admin_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin() then raise exception 'Admin required' using errcode='42501';end if;
 return jsonb_build_object('students',(select count(*) from public.profiles where role='student' and active),'groups',(select count(*) from public.groups),'assignments',(select count(*) from public.homework_assignments),'completed',(select count(*) from public.homework_attempts a join public.book_practice_sessions s on s.id=a.session_id where s.submitted_at is not null),'questions',(select count(*) from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.submitted_at is not null and i.selected_answer is not null),'activity',coalesce((select jsonb_agg(to_jsonb(a)) from(select sa.*,p.display_name from public.student_activity sa join public.profiles p on p.id=sa.student_id order by sa.created_at desc limit 25)a),'[]'));end;$$;
-- RPC execution is explicit. Internal selectors and trigger functions cannot be called by browsers.
revoke all on function public.set_question_section(),public.bank_candidates(jsonb),public.log_practice_completion() from public,anon,authenticated;
revoke all on function public.can_read_vocab(uuid),public.question_bank(jsonb,integer),public.start_bank_practice(jsonb,integer,boolean),public.create_homework(jsonb),public.start_homework(uuid),public.homework_directory(),public.practice_heartbeat(uuid,integer,integer),public.learning_metrics(uuid),public.learning_standings(boolean),public.admin_overview() from public,anon,authenticated;
grant execute on function public.can_read_vocab(uuid),public.question_bank(jsonb,integer),public.start_bank_practice(jsonb,integer,boolean),public.create_homework(jsonb),public.start_homework(uuid),public.homework_directory(),public.practice_heartbeat(uuid,integer,integer),public.learning_metrics(uuid),public.learning_standings(boolean),public.admin_overview() to authenticated;
commit;
