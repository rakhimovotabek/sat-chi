begin;
create or replace function public.start_bank_practice(p_filters jsonb,p_count integer default 20,p_timed boolean default false) returns uuid language plpgsql security definer set search_path='' as $$declare sid uuid; q record; iid uuid; n integer:=0;begin
 if p_count is null or p_count not between 1 and 500 then raise exception 'Select 1 to 500 questions'; end if;
 insert into public.book_practice_sessions(student_id,title,kind,filters,timed,time_limit) values(auth.uid(),'Question Bank practice','bank',p_filters,p_timed,case when p_timed then least(21600,p_count*90) end) returning id into sid;
 for q in select c.*,a.correct_answer,a.explanation from public.bank_candidates(p_filters) c join public.question_answers a on a.question_id=c.id order by random() limit p_count loop
 insert into public.book_practice_items(session_id,position,question) values(sid,n,to_jsonb(q)-'correct_answer'-'explanation') returning id into iid;
 insert into public.book_practice_keys values(iid,q.correct_answer,q.explanation); insert into public.book_practice_open_keys select iid,accepted_answers from public.book_open_answers where question_id=q.id; n=n+1; end loop;
 if n=0 then raise exception 'No matching questions'; end if;
 if p_timed then update public.book_practice_sessions set time_limit=least(21600,greatest(60,n*90)) where id=sid; end if;
 return sid;end;$$;
create or replace function public.check_bank_response(p_session uuid,p_item uuid,p_response text,p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; i public.book_practice_items; a public.question_check_attempts; is_correct boolean; n integer; previous integer;
begin
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() or s.kind<>'bank' then raise exception 'Own bank session required' using errcode='42501';end if;
 select * into i from public.book_practice_items where id=p_item and session_id=s.id;
 if i.id is null or i.question->>'question_type' is distinct from 'open' or nullif(btrim(p_response),'') is null or length(p_response)>200 or p_event is null then raise exception 'Invalid attempt';end if;
 select * into a from public.question_check_attempts where id=p_event;
 if a.id is not null then
 if a.item_id<>i.id or a.selected_response is distinct from p_response then raise exception 'Attempt event conflict';end if;
 return to_jsonb(a);
 end if;
 if s.submitted_at is not null or i.solved_at is not null then raise exception 'Question already completed';end if;
 select exists(select 1 from public.book_practice_open_keys k, jsonb_array_elements_text(k.accepted_answers) v where k.item_id=i.id and btrim(v)=btrim(p_response)) into is_correct;
 select count(*)+1,coalesce(max(active_seconds),0) into n,previous from public.question_check_attempts where item_id=i.id;
 insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,selected_response,correct,active_seconds,between_seconds,eliminated,marked)
 values(p_event,i.id,n,0,p_response,is_correct,i.active_seconds,i.active_seconds-previous,i.eliminated,i.marked) returning * into a;
 update public.book_practice_items set selected_answer=0,selected_response=p_response,has_answered=true,correct=a.correct,solved_at=case when a.correct then now() end where id=i.id;
 insert into public.student_activity(student_id,session_id,kind,title) values(s.student_id,s.id,s.kind,s.title) on conflict(session_id) do nothing;
 if not exists(select 1 from public.book_practice_items where session_id=s.id and solved_at is null) then update public.book_practice_sessions set submitted_at=now() where id=s.id;end if;
 return to_jsonb(a);
end;$$;

-- Retained bank/homework snapshots still reference some legacy private images.
-- Removing their original book must not deny their owner access to saved work.
create or replace function public.can_read_question_asset(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select p_path ~ '^[a-f0-9]{64}/[a-f0-9]{64}\.webp$' and public.is_active_user() and (public.is_admin() or exists(
 select 1 from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 where b.published and q.image_url like '%/storage/v1/object/authenticated/question-assets/'||p_path)
 or exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
 where s.student_id=auth.uid() and s.kind in ('bank','homework') and i.question->>'image_url' like '%/storage/v1/object/authenticated/question-assets/'||p_path));
$$;
commit;
