begin;

-- Review only submitted open responses. Keep the original automatic result and
-- a revision so two administrators cannot silently overwrite one another.
create table public.practice_open_reviews (
 item_id uuid primary key references public.book_practice_items on delete cascade,
 automatic_correct boolean not null,
 review_correct boolean,
 revision bigint not null check (revision > 0),
 reviewed_by uuid references public.profiles on delete set null,
 reviewed_at timestamptz not null default now()
);
alter table public.practice_open_reviews enable row level security;
revoke all on public.practice_open_reviews from public,anon,authenticated;
grant select on public.practice_open_reviews to authenticated;
create policy open_review_read on public.practice_open_reviews for select to authenticated using (
 public.is_active_user() and (public.is_admin() or exists (
 select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id
 where i.id=item_id and s.student_id=auth.uid() and s.submitted_at is not null))
);

-- Repeated submission/automatic grading must not erase an explicit review.
create function public.preserve_open_review_result() returns trigger
language plpgsql security definer set search_path='' as $$declare decision boolean;begin
 select review_correct into decision from public.practice_open_reviews where item_id=new.id;
 if decision is not null then new.correct:=decision;end if;
 return new;
end;$$;
revoke all on function public.preserve_open_review_result() from public,anon,authenticated;
create trigger preserve_open_review_result before update of correct on public.book_practice_items
for each row execute function public.preserve_open_review_result();

create function public.review_open_response(p_session uuid,p_item uuid,p_correct boolean,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions;i public.book_practice_items;r public.practice_open_reviews;begin
 if not public.is_admin() or not public.is_active_user() then raise exception 'Active administrator required' using errcode='42501';end if;
 perform public.lock_homework_session(p_session);
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.submitted_at is null or s.kind not in('book','bank','homework') then raise exception 'Submitted practice required' using errcode='42501';end if;
 select * into i from public.book_practice_items where id=p_item and session_id=s.id;
 if i.id is null or i.question->>'question_type' is distinct from 'open' or nullif(btrim(i.selected_response),'') is null
 or not exists(select 1 from public.book_practice_open_keys where item_id=i.id) then raise exception 'Submitted open response required';end if;
 select * into r from public.practice_open_reviews where item_id=i.id;
 if p_expected_revision is null or p_expected_revision<>coalesce(r.revision,0) then
 raise exception 'Review changed in another tab. Reload the saved review before deciding.' using errcode='40001';end if;
 insert into public.practice_open_reviews(item_id,automatic_correct,review_correct,revision,reviewed_by,reviewed_at)
 values(i.id,coalesce(r.automatic_correct,i.correct,public.package_open_response_correct(i.id,i.selected_response)),p_correct,coalesce(r.revision,0)+1,auth.uid(),now())
 on conflict(item_id) do update set review_correct=excluded.review_correct,revision=excluded.revision,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at
 returning * into r;
 update public.book_practice_items set correct=coalesce(r.review_correct,r.automatic_correct) where id=i.id;
 return to_jsonb(r);
end;$$;
revoke all on function public.review_open_response(uuid,uuid,boolean,bigint) from public,anon;
grant execute on function public.review_open_response(uuid,uuid,boolean,bigint) to authenticated;

create or replace function public.book_practice_open_review(p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session and (student_id=auth.uid() or public.is_admin()) and kind in('book','bank','homework') and submitted_at is not null and public.is_active_user()) then raise exception 'Submitted own practice or administrator review required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',k.item_id,'accepted_answers',case when k.answer_format='numeric-range' and jsonb_array_length(k.accepted_answers)=0 and k.correct_answer is not null then jsonb_build_array(k.correct_answer) else k.accepted_answers end,'correct_answer',k.correct_answer,'answer_format',k.answer_format,'accepted_range',k.accepted_range,
 'automatic_correct',coalesce(r.automatic_correct,i.correct),'review_correct',r.review_correct,'review_revision',coalesce(r.revision,0),'reviewed_at',r.reviewed_at,'reviewed_by',r.reviewed_by)) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id left join public.practice_open_reviews r on r.item_id=i.id where i.session_id=p_session),'[]');
end;$$;
commit;
