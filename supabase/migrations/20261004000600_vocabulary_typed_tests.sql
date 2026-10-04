begin;
-- Frozen, student-owned tests; answer keys are only exposed after an answer or submission.
create table public.vocabulary_typed_sessions (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references public.profiles on delete cascade,
 set_ids uuid[] not null,
 title text not null default 'Typed vocabulary recall',
 item_count integer not null check(item_count between 1 and 10000),
 study_seconds integer not null default 0 check(study_seconds>=0),
 created_at timestamptz not null default now(),
 submitted_at timestamptz
);
create table public.vocabulary_typed_items (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.vocabulary_typed_sessions on delete cascade,
 word_id uuid references public.vocabulary_words on delete set null,
 position integer not null check(position>=0),
 question jsonb not null,
 selected_text text,
 study_seconds integer not null default 0 check(study_seconds between 0 and 300),
 correct boolean,
 answered_at timestamptz,
 unique(session_id,position)
);
create table public.vocabulary_typed_keys (
 item_id uuid primary key references public.vocabulary_typed_items on delete cascade,
 expected_word text not null,
 example text
);
alter table public.vocabulary_typed_sessions enable row level security;
alter table public.vocabulary_typed_items enable row level security;
alter table public.vocabulary_typed_keys enable row level security;
revoke all on public.vocabulary_typed_sessions,public.vocabulary_typed_items,public.vocabulary_typed_keys from public,anon,authenticated;
grant select on public.vocabulary_typed_sessions,public.vocabulary_typed_items to authenticated;
create policy typed_sessions_self on public.vocabulary_typed_sessions for select to authenticated using(student_id=(select auth.uid()) and (select public.is_active_user()));
create policy typed_items_self on public.vocabulary_typed_items for select to authenticated using(exists(select 1 from public.vocabulary_typed_sessions s where s.id=session_id and s.student_id=(select auth.uid())) and (select public.is_active_user()));
create index typed_sessions_owner_idx on public.vocabulary_typed_sessions(student_id,created_at desc);

create function public.start_vocabulary_typed_test(p_sets uuid[] default '{}',p_count integer default 20,p_filter text default 'all',p_retry uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid; n integer; row record; iid uuid; pos integer:=0;
begin
 if not public.is_active_user() or not exists(select 1 from public.profiles where id=auth.uid() and role='student') then raise exception 'Active student required' using errcode='42501';end if;
 if p_sets is null or cardinality(p_sets)>100 or p_count is null or p_count not in (0,10,20,25,50) or p_filter is null or p_filter not in ('all','new','learning','review','mastered','starred','due','weak') then raise exception 'Invalid typed test settings';end if;
 if p_retry is not null then
  select set_ids into p_sets from public.vocabulary_typed_sessions where id=p_retry and student_id=auth.uid() and submitted_at is not null;
  if not found then raise exception 'Own submitted test required' using errcode='42501';end if;
  select count(*) into n from public.vocabulary_typed_items where session_id=p_retry and correct=false;
 else
  select count(*) into n from (select distinct lower(btrim(w.word)),lower(btrim(w.definition)) from public.vocabulary_words w left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid() where public.can_read_vocab(w.set_id) and(cardinality(p_sets)=0 or w.set_id=any(p_sets)) and case p_filter when 'all' then true when 'starred' then coalesce(p.starred,false) when 'due' then p.next_review<=now() when 'weak' then p.failed_recalls>=2 and p.mastery_state<>'mastered' else coalesce(p.mastery_state,'new')=p_filter end) d;
 end if;
 if n=0 then raise exception 'No words available for this test';end if;
 n=case when p_count=0 then n else least(n,p_count) end;
 if n>10000 then raise exception 'Select fewer sets (maximum 10000 words per test)';end if;
 insert into public.vocabulary_typed_sessions(student_id,set_ids,item_count,title) values(auth.uid(),p_sets,n,case when p_retry is null then 'Typed vocabulary recall' else 'Typed recall · Mistake practice' end) returning id into sid;
 if p_retry is not null then
  for row in select i.word_id,i.question,k.expected_word,k.example from public.vocabulary_typed_items i join public.vocabulary_typed_keys k on k.item_id=i.id where i.session_id=p_retry and i.correct=false order by random() limit n loop
   insert into public.vocabulary_typed_items(session_id,word_id,position,question) values(sid,row.word_id,pos,row.question) returning id into iid;
   insert into public.vocabulary_typed_keys values(iid,row.expected_word,row.example);pos=pos+1;
  end loop;
 else
  for row in with eligible as(select w.*,s.title set_title,array_agg(w.set_id)over(partition by lower(btrim(w.word)),lower(btrim(w.definition))) source_sets,row_number()over(partition by lower(btrim(w.word)),lower(btrim(w.definition))order by s.position,w.position,w.id) occurrence from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid() where public.can_read_vocab(w.set_id) and(cardinality(p_sets)=0 or w.set_id=any(p_sets)) and case p_filter when 'all' then true when 'starred' then coalesce(p.starred,false) when 'due' then p.next_review<=now() when 'weak' then p.failed_recalls>=2 and p.mastery_state<>'mastered' else coalesce(p.mastery_state,'new')=p_filter end) select * from eligible where occurrence=1 order by random() limit n loop
   insert into public.vocabulary_typed_items(session_id,word_id,position,question) values(sid,row.id,pos,jsonb_build_object('definition',row.definition,'part_of_speech',row.part_of_speech,'set_title',row.set_title,'source_sets',row.source_sets,'source_page',row.source_page)) returning id into iid;
   insert into public.vocabulary_typed_keys values(iid,row.word,row.example);pos=pos+1;
  end loop;
 end if;
 if pos<>n then raise exception 'Vocabulary changed during test creation; try again';end if;
 return sid;
end;$$;

create function public.vocabulary_typed_test(p_session uuid,p_page integer default 0,p_mistakes boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.vocabulary_typed_sessions; result jsonb;
begin
 if not public.is_active_user() or p_page is null or p_page not between 0 and 100 or p_mistakes is null then raise exception 'Invalid test request' using errcode='42501';end if;
 select * into s from public.vocabulary_typed_sessions where id=p_session and student_id=auth.uid();
 if s.id is null then raise exception 'Own test required' using errcode='42501';end if;
 with items as(select i.*,case when i.answered_at is not null or s.submitted_at is not null then jsonb_build_object('word',k.expected_word,'example',k.example) else '{}'::jsonb end feedback from public.vocabulary_typed_items i join public.vocabulary_typed_keys k on k.item_id=i.id where i.session_id=s.id),paged as(select * from items where not p_mistakes or correct=false order by position limit 100 offset p_page*100)
 select jsonb_build_object('session',to_jsonb(s),'next_position',(select min(position)from items where answered_at is null),'answered',(select count(*)from items where answered_at is not null),'correct',(select count(*)from items where correct),'incorrect',(select count(*)from items where correct=false),'total',(select count(*)from items where not p_mistakes or correct=false),'mastered',(select count(*)from items i join public.vocabulary_progress p on p.word_id=i.word_id and p.student_id=auth.uid() where p.mastery_state='mastered'),'items',coalesce(jsonb_agg(to_jsonb(paged)),'[]')) into result from paged;
 return result;
end;$$;

create function public.answer_vocabulary_typed_test(p_session uuid,p_item uuid,p_answer text,p_seconds integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.vocabulary_typed_sessions; i public.vocabulary_typed_items; k public.vocabulary_typed_keys; success boolean;progress jsonb;
begin
 if not public.is_active_user() or p_answer is null or length(p_answer)>200 or p_seconds is null or p_seconds not between 0 and 300 then raise exception 'Invalid answer';end if;
 select * into s from public.vocabulary_typed_sessions where id=p_session and student_id=auth.uid() for update;
 if s.id is null then raise exception 'Own test required' using errcode='42501';end if;
 select * into i from public.vocabulary_typed_items where id=p_item and session_id=s.id;
 if i.id is null then raise exception 'Item unavailable';end if;
 select * into k from public.vocabulary_typed_keys where item_id=i.id;
 if i.answered_at is not null then return jsonb_build_object('correct',i.correct,'word',k.expected_word,'example',k.example);end if;
 if s.submitted_at is not null then raise exception 'Test already submitted';end if;
 success=lower(normalize(regexp_replace(btrim(p_answer),'\s+',' ','g'),NFKC))=lower(normalize(regexp_replace(btrim(k.expected_word),'\s+',' ','g'),NFKC));
 update public.vocabulary_typed_items set selected_text=p_answer,correct=success,answered_at=now(),study_seconds=p_seconds where id=i.id;
 update public.vocabulary_typed_sessions set study_seconds=study_seconds+p_seconds where id=s.id;
 -- A removed/edited source cannot invalidate the student's frozen test.
 if exists(select 1 from public.vocabulary_words w where w.id=i.word_id and public.can_read_vocab(w.set_id) and w.word=k.expected_word) then
  progress=public.review_vocabulary(i.word_id,case when success then 'good' else 'again' end,0,i.id,'typed',p_answer);
 end if;
 return jsonb_build_object('correct',success,'word',k.expected_word,'example',k.example,'progress',progress->'progress');
end;$$;

create function public.finish_vocabulary_typed_test(p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active student required' using errcode='42501';end if;
 update public.vocabulary_typed_sessions set submitted_at=coalesce(submitted_at,now()) where id=p_session and student_id=auth.uid();
 if not found then raise exception 'Own test required' using errcode='42501';end if;
 return public.vocabulary_typed_test(p_session);
end;$$;
create function public.vocabulary_typed_history(p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_active_user() or p_page is null or p_page not between 0 and 10000 then raise exception 'Invalid history request';end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]')into result from(select s.*,(select count(*)from public.vocabulary_typed_items i where i.session_id=s.id and i.answered_at is not null) answered,(select count(*)from public.vocabulary_typed_items i where i.session_id=s.id and i.correct) correct from public.vocabulary_typed_sessions s where student_id=auth.uid() order by created_at desc,id limit 20 offset p_page*20)t;
 return result;
end;$$;
revoke all on function public.start_vocabulary_typed_test(uuid[],integer,text,uuid),public.vocabulary_typed_test(uuid,integer,boolean),public.answer_vocabulary_typed_test(uuid,uuid,text,integer),public.finish_vocabulary_typed_test(uuid),public.vocabulary_typed_history(integer) from public,anon,authenticated;
grant execute on function public.start_vocabulary_typed_test(uuid[],integer,text,uuid),public.vocabulary_typed_test(uuid,integer,boolean),public.answer_vocabulary_typed_test(uuid,uuid,text,integer),public.finish_vocabulary_typed_test(uuid),public.vocabulary_typed_history(integer) to authenticated;
create or replace function public.learning_metrics(p_student uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=coalesce(p_student,auth.uid());result jsonb; zone text; today date; cursor_day date; day date; streak integer:=0; longest integer:=0; days date[];sat jsonb;attention jsonb;
begin
 result=public.learning_metrics_internal(uid); -- Existing active-user/admin ownership boundary stays authoritative.
 select coalesce((select timezone from public.study_preferences where student_id=uid),'UTC') into zone;today=timezone(zone,now())::date;
 with study_days as(
 select distinct timezone(zone,s.submitted_at)::date as study_day from public.book_practice_sessions s where s.student_id=uid and s.submitted_at is not null and exists(select 1 from public.book_practice_items i where i.session_id=s.id and i.selected_answer is not null)
 union select timezone(zone,r.created_at)::date from public.vocabulary_reviews r where r.student_id=uid group by 1 having count(distinct word_id)>=3 or sum(study_seconds)>=60
 union select timezone(zone,i.answered_at)::date from public.vocabulary_typed_items i join public.vocabulary_typed_sessions s on s.id=i.session_id where s.student_id=uid and i.answered_at is not null group by 1 having count(distinct i.word_id)>=3 or sum(i.study_seconds)>=60
 union select study_date from public.study_plan_tasks where student_id=uid and completed_at is not null
 ),ranked as(select study_day,study_day-row_number()over(order by study_day)::int group_key from study_days),runs as(select count(*)::int length from ranked group by group_key)
 select coalesce(array_agg(study_day order by study_day desc),'{}'::date[]),coalesce((select max(length)from runs),0)into days,longest from study_days;
 cursor_day=case when today=any(days)then today else today-1 end;
 foreach day in array days loop
  if day=cursor_day then streak=streak+1;cursor_day=cursor_day-1;elsif day<cursor_day then exit;end if;
 end loop;
 select jsonb_build_object('attempted',count(*)filter(where i.selected_answer is not null),'correct',count(*)filter(where i.correct and i.selected_answer is not null),'incorrect',count(*)filter(where i.correct=false and i.selected_answer is not null),'today',count(*)filter(where i.selected_answer is not null and timezone(zone,s.submitted_at)::date=today),'recent_attempted',count(*)filter(where i.selected_answer is not null and s.submitted_at>=now()-interval '14 days'),'recent_correct',count(*)filter(where i.correct and i.selected_answer is not null and s.submitted_at>=now()-interval '14 days'))into sat from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=uid and s.submitted_at is not null and s.kind<>'vocabulary';
 select coalesce(jsonb_agg(to_jsonb(a)),'[]')into attention from(select i.question->>'section' section,i.question->>'domain' domain,count(*) attempted,count(*)filter(where i.correct)correct from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where s.student_id=uid and s.submitted_at>=now()-interval '30 days' and s.kind<>'vocabulary' and i.selected_answer is not null and nullif(i.question->>'domain','')is not null group by 1,2 having count(*)>=10)a;
 return result||sat||jsonb_build_object('study_seconds',coalesce((result->>'study_seconds')::bigint,0)+(select coalesce(sum(study_seconds),0)from public.vocabulary_reviews where student_id=uid)+(select coalesce(sum(study_seconds),0)from public.vocabulary_typed_sessions where student_id=uid),'streak',streak,'longest_streak',longest,'attention',attention);
end;$$;
create or replace function public.vocabulary_summary(p_book uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_active_user() then raise exception 'Active user required' using errcode='42501';end if;
 with words as(select w.id,w.set_id,coalesce(p.mastery_state,'new') state,p.* from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id left join public.vocabulary_progress p on p.word_id=w.id and p.student_id=auth.uid() where public.can_read_vocab(w.set_id) and (p_book is null or s.book_id=p_book)), per_set as(
 select set_id,count(*) total,count(*)filter(where state<>'new') learned,count(*)filter(where state='mastered') mastered,count(*)filter(where state='review') reviewing,count(*)filter(where state='new') new,count(*)filter(where next_review<=now()) due from words group by set_id
 )select jsonb_build_object('total',count(*),'learned',count(*)filter(where state<>'new'),'mastered',count(*)filter(where state='mastered'),'due',count(*)filter(where next_review<=now()),'starred',count(*)filter(where starred),'weak',count(*)filter(where failed_recalls>=2 and state<>'mastered'),'successful',coalesce(sum(successful_recalls),0),'failed',coalesce(sum(failed_recalls),0),'study_seconds',coalesce(sum(study_seconds),0),'sets',coalesce((select jsonb_agg(to_jsonb(per_set))from per_set),'[]'))into result from words;
 return result||jsonb_build_object('study_seconds',coalesce((result->>'study_seconds')::bigint,0)+(select coalesce(sum(i.study_seconds),0)from public.vocabulary_typed_items i join public.vocabulary_typed_sessions t on t.id=i.session_id where t.student_id=auth.uid() and (p_book is null or exists(select 1 from public.vocabulary_sets vs where vs.book_id=p_book and vs.id::text in(select jsonb_array_elements_text(i.question->'source_sets'))))));
end;$$;
commit;
