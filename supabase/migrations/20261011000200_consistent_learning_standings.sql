begin;
-- Existing metric: all-time answered questions, not points or number of checks.
-- Qualifying: submitted work OR a persisted Check. Each source question counts
-- once per student across Books, Bank and Homework; latest graded result wins.
create table public.learning_standing_totals (
 student_id uuid primary key references public.profiles on delete cascade,
 questions bigint not null default 0,correct bigint not null default 0,
 study_seconds bigint not null default 0,homework bigint not null default 0
);
alter table public.learning_standing_totals enable row level security;
revoke all on public.learning_standing_totals from public,anon,authenticated;
create index standing_completed_owner_idx on public.book_practice_sessions(student_id,submitted_at,id) where kind in('book','bank','homework');
create function public.refresh_learning_standing(p_student uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 -- Serialize per student: concurrent sessions cannot publish stale totals.
 perform 1 from public.profiles where id=p_student for no key update;
 if not found then return;end if;
 insert into public.learning_standing_totals(student_id,questions,correct,study_seconds,homework)
 select p_student,count(*),count(*)filter(where x.correct),
 (select coalesce(sum(s.elapsed_seconds),0) from public.book_practice_sessions s where s.student_id=p_student and s.kind in('book','bank','homework')),
 (select count(*) from public.book_practice_sessions s where s.student_id=p_student and s.kind='homework' and s.submitted_at is not null)
 from (select distinct on(coalesce(nullif(i.question->>'id',''),i.id::text))
 case when s.submitted_at is not null then i.correct else (select a.correct from public.question_check_attempts a where a.item_id=i.id order by a.created_at desc,a.attempt_order desc limit 1) end correct from public.book_practice_sessions s join public.book_practice_items i on i.session_id=s.id
 where s.student_id=p_student and s.kind in('book','bank','homework')
 and ((s.submitted_at is not null and (i.selected_answer is not null or nullif(btrim(i.selected_response),'')is not null)) or exists(select 1 from public.question_check_attempts a where a.item_id=i.id))
 order by coalesce(nullif(i.question->>'id',''),i.id::text),coalesce(s.submitted_at,(select max(a.created_at)from public.question_check_attempts a where a.item_id=i.id))desc,i.id desc)x
 on conflict(student_id)do update set questions=excluded.questions,correct=excluded.correct,study_seconds=excluded.study_seconds,homework=excluded.homework;
end;$$;
create function public.update_learning_standing() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid; sid uuid;begin
 if tg_table_name='book_practice_sessions' then
 uid:=case when tg_op='DELETE' then old.student_id else new.student_id end;
 if tg_op='UPDATE' and new.submitted_at is not distinct from old.submitted_at then
 update public.learning_standing_totals set study_seconds=(select coalesce(sum(elapsed_seconds),0)from public.book_practice_sessions where student_id=uid and kind in('book','bank','homework'))where student_id=uid;return null;end if;
 else
 if tg_table_name='book_practice_items' then sid:=case when tg_op='DELETE' then old.session_id else new.session_id end;
 else select session_id into sid from public.book_practice_items where id=case when tg_op='DELETE' then old.item_id else new.item_id end;end if;
 select student_id into uid from public.book_practice_sessions where id=sid;
 end if;
 if uid is not null then perform public.refresh_learning_standing(uid);end if;
 return null;end;$$;
create trigger standing_session after insert or delete or update of submitted_at,elapsed_seconds on public.book_practice_sessions for each row execute function public.update_learning_standing();
-- Submission grades many items in one statement: refresh each affected owner
-- once, rather than scanning the owner's history once per graded question.
create function public.update_learning_standing_items() returns trigger language plpgsql security definer set search_path='' as $$declare uid uuid;begin
 for uid in select distinct s.student_id from new_items n join old_items o on o.id=n.id join public.book_practice_sessions s on s.id=n.session_id
 where row(n.correct,n.selected_answer,n.selected_response)is distinct from row(o.correct,o.selected_answer,o.selected_response)
 and(s.submitted_at is not null or exists(select 1 from public.question_check_attempts a where a.item_id=n.id))
 loop perform public.refresh_learning_standing(uid);end loop;
 return null;end;$$;
create trigger standing_item_update after update on public.book_practice_items referencing old table as old_items new table as new_items for each statement execute function public.update_learning_standing_items();
create trigger standing_item_delete after delete on public.book_practice_items for each row execute function public.update_learning_standing();
create trigger standing_check after insert or delete on public.question_check_attempts for each row execute function public.update_learning_standing();
do $$declare uid uuid;begin for uid in select id from public.profiles where role='student' loop perform public.refresh_learning_standing(uid);end loop;end$$;
create or replace function public.learning_standings(p_group boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_active_user() then raise exception 'Active account required';end if;
 return coalesce((select jsonb_agg(to_jsonb(r))from(select p.id,p.display_name,coalesce(t.questions,0)questions,coalesce(t.correct,0)correct,coalesce(t.study_seconds,0)study_seconds,coalesce(t.homework,0)homework
 from public.profiles p left join public.learning_standing_totals t on t.student_id=p.id where p.active and p.role='student'
 and(not p_group or exists(select 1 from public.group_members mine join public.group_members theirs on mine.group_id=theirs.group_id where mine.student_id=auth.uid() and theirs.student_id=p.id))
 order by coalesce(t.questions,0)desc,p.id limit 100)r),'[]');end;$$;
revoke all on function public.refresh_learning_standing(uuid),public.update_learning_standing(),public.update_learning_standing_items() from public,anon,authenticated;
commit;
