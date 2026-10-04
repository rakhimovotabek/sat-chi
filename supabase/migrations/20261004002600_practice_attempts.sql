begin;
alter table public.book_practice_items add column active_seconds integer not null default 0 check(active_seconds>=0), add column solved_at timestamptz;
create table public.question_check_attempts(
 id uuid primary key, item_id uuid not null references public.book_practice_items on delete cascade,
 attempt_order integer not null check(attempt_order>0), selected_answer integer not null check(selected_answer between 0 and 3),
 correct boolean not null, active_seconds integer not null check(active_seconds>=0), between_seconds integer not null check(between_seconds>=0),
 eliminated integer[] not null, marked boolean not null, created_at timestamptz not null default now(), unique(item_id,attempt_order));
create index question_attempt_item_idx on public.question_check_attempts(item_id,created_at);
alter table public.question_check_attempts enable row level security;
revoke all on public.question_check_attempts from public,anon,authenticated;
grant select on public.question_check_attempts to authenticated;
grant all on public.question_check_attempts to service_role;
create policy checks_read on public.question_check_attempts for select to authenticated using(public.is_admin() or (public.is_active_user() and exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where i.id=item_id and s.student_id=auth.uid())));
create or replace function public.practice_heartbeat(p_session uuid,p_position integer,p_seconds integer default 0) returns integer language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; credited integer;
begin
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() then raise exception 'Session unavailable' using errcode='42501';end if;
 if s.submitted_at is not null then return s.elapsed_seconds;end if;
 if p_position is null or not exists(select 1 from public.book_practice_items where session_id=s.id and position=p_position) or p_seconds is null or p_seconds<0 then raise exception 'Invalid heartbeat';end if;
 credited=least(p_seconds,120,greatest(0,floor(extract(epoch from clock_timestamp()-s.last_heartbeat))::int));
 update public.book_practice_items set active_seconds=active_seconds+credited where session_id=s.id and position=p_position and solved_at is null;
 if not found then credited=0;end if;
 update public.book_practice_sessions set current_position=p_position,elapsed_seconds=elapsed_seconds+credited,last_heartbeat=case when p_seconds>0 then clock_timestamp() else last_heartbeat end where id=s.id;
 return s.elapsed_seconds+credited;
end;$$;
create function public.check_bank_answer(p_session uuid,p_item uuid,p_choice integer,p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; i public.book_practice_items; a public.question_check_attempts; answer integer; n integer; previous integer;
begin
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() or s.kind<>'bank' then raise exception 'Own bank session required' using errcode='42501';end if;
 select * into i from public.book_practice_items where id=p_item and session_id=s.id;
 if i.id is null or p_choice is null or p_choice not between 0 and 3 or p_event is null then raise exception 'Invalid attempt';end if;
 select * into a from public.question_check_attempts where id=p_event;
 if a.id is not null then
 if a.item_id<>i.id or a.selected_answer<>p_choice then raise exception 'Attempt event conflict';end if;
 return to_jsonb(a);
 end if;
 if s.submitted_at is not null or i.solved_at is not null then raise exception 'Question already completed';end if;
 if p_choice=any(i.eliminated) then raise exception 'Restore this choice first';end if;
 select correct_answer into answer from public.book_practice_keys where item_id=i.id;
 select count(*)+1,coalesce(max(active_seconds),0) into n,previous from public.question_check_attempts where item_id=i.id;
 insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,correct,active_seconds,between_seconds,eliminated,marked)
 values(p_event,i.id,n,p_choice,p_choice=answer,i.active_seconds,i.active_seconds-previous,i.eliminated,i.marked) returning * into a;
 update public.book_practice_items set selected_answer=p_choice,correct=a.correct,solved_at=case when a.correct then now() end where id=i.id;
 insert into public.student_activity(student_id,session_id,kind,title) values(s.student_id,s.id,s.kind,s.title) on conflict(session_id) do nothing;
 if not exists(select 1 from public.book_practice_items where session_id=s.id and solved_at is null) then update public.book_practice_sessions set submitted_at=now() where id=s.id;end if;
 return to_jsonb(a);
end;$$;
alter function public.save_book_practice_internal(uuid,jsonb) rename to save_book_practice_before_checks;
revoke all on function public.save_book_practice_before_checks(uuid,jsonb) from public,anon,authenticated;
create function public.save_book_practice_internal(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from jsonb_array_elements(p_answers) a join public.book_practice_items i on i.id=(a->>'id')::uuid where i.session_id=p_session_id and i.solved_at is not null and i.selected_answer is distinct from (a->>'selected_answer')::integer) then raise exception 'Solved answers cannot change';end if;
 perform public.save_book_practice_before_checks(p_session_id,p_answers);
end;$$;
revoke all on function public.save_book_practice_internal(uuid,jsonb),public.check_bank_answer(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.check_bank_answer(uuid,uuid,integer,uuid) to authenticated;
create or replace function public.save_book_practice(p_session_id uuid,p_answers jsonb) returns void language plpgsql security definer set search_path='' as $$declare s public.book_practice_sessions;begin
 select * into s from public.book_practice_sessions where id=p_session_id and student_id=auth.uid() for update;
 if s.kind<>'bank' and s.timed and s.time_limit is not null and clock_timestamp()>=s.started_at+make_interval(secs=>s.time_limit) then raise exception 'Time limit reached. Submit saved answers.';end if;
 perform public.save_book_practice_internal(p_session_id,p_answers);end;$$;
commit;
