begin;
-- Resume the same durable snapshot rather than starting over on every visit.
alter function public.start_book_practice(uuid) rename to start_book_practice_new_snapshot;
revoke all on function public.start_book_practice_new_snapshot(uuid) from public,anon,authenticated;
create function public.start_book_practice(p_topic_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare sid uuid; topic_title text;
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 select t.title into topic_title from public.book_topics t join public.books b on b.id=t.book_id
 where t.id=p_topic_id and (b.published or public.is_admin());
 if topic_title is null then raise exception 'Topic unavailable' using errcode='42501';end if;
 -- Serialize concurrent starts for this student's topic.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_topic_id::text,0));
 select s.id into sid from public.book_practice_sessions s
 where s.student_id=auth.uid() and s.kind='book' and
 (s.source_id=p_topic_id or (s.source_id is null and s.title=topic_title
 and exists(select 1 from public.book_practice_items i where i.session_id=s.id)
 and not exists(select 1 from public.book_practice_items i where i.session_id=s.id
 and (i.question->>'topic_id')::uuid not in
 (with recursive tree as(select id from public.book_topics where id=p_topic_id
 union all select t.id from public.book_topics t join tree p on t.parent_id=p.id) select id from tree))))
 order by (select count(*) from public.book_practice_items i where i.session_id=s.id and (i.correct is not null or i.selected_answer is not null or i.marked)) desc,s.started_at desc,s.id
 limit 1;
 if sid is null then sid:=public.start_book_practice_new_snapshot(p_topic_id);end if;
 update public.book_practice_sessions set source_id=p_topic_id where id=sid;
 return sid;
end;$$;
revoke all on function public.start_book_practice(uuid) from public,anon;
grant execute on function public.start_book_practice(uuid) to authenticated;
create index book_practice_resume_idx on public.book_practice_sessions(student_id,source_id) where kind='book';

-- Topic counts include checked questions in unfinished sessions, once per question.
create function public.book_practice_progress(p_book uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_active_user() then raise exception 'Active account required' using errcode='42501';end if;
 return coalesce((with recursive tree as(
 select id root,id from public.book_topics where book_id=p_book
 union all select p.root,t.id from tree p join public.book_topics t on t.parent_id=p.id
 ), status as(
 select q.id,q.topic_id,
 coalesce(bool_or(i.correct=true and (i.solved_at is not null or s.submitted_at is not null)),false) solved,
 coalesce(bool_or(i.correct is not null and i.selected_answer is not null),false) checked
 from public.questions q join public.book_topics t on t.id=q.topic_id
 left join public.book_practice_sessions s on s.student_id=auth.uid() and s.kind='book'
 left join public.book_practice_items i on i.session_id=s.id and i.question->>'id'=q.id::text
 where t.book_id=p_book and exists(select 1 from public.books b where b.id=t.book_id and (b.published or public.is_admin()))
 and (public.question_practicable(q.id) or public.book_package_question_ready(q.id))
 and (public.is_admin() or public.question_approved_for_students(q.id))
 group by q.id,q.topic_id
 ), counts as(
 select tree.root topic_id,count(status.id) total,count(status.id) filter(where solved) solved,
 count(status.id) filter(where checked) checked from tree left join status on status.topic_id=tree.id group by tree.root
 ) select jsonb_agg(to_jsonb(counts)) from counts),'[]'::jsonb);
end;$$;
revoke all on function public.book_practice_progress(uuid) from public,anon;
grant execute on function public.book_practice_progress(uuid) to authenticated;

-- Keep the existing visibility, topic, domain, source and status filters intact.
alter function public.bank_candidates(jsonb) rename to bank_candidates_before_difficulties;
revoke all on function public.bank_candidates_before_difficulties(jsonb) from public,anon,authenticated;
create function public.bank_candidates(p_filters jsonb) returns setof public.questions
language plpgsql stable security definer set search_path='' as $$
declare choices jsonb;
begin
 if p_filters ? 'difficulties' then
 choices:=p_filters->'difficulties';
 if jsonb_typeof(choices) is distinct from 'array' then raise exception 'Invalid difficulties';end if;
 if jsonb_array_length(choices)>4 or exists(select 1 from jsonb_array_elements(choices) v where jsonb_typeof(v)<>'string' or v#>>'{}' not in ('easy','medium','hard','unclassified')) then raise exception 'Invalid difficulties';end if;
 return query select q.* from public.bank_candidates_before_difficulties(p_filters-'difficulties'-'difficulty') q
 where jsonb_array_length(choices)=0 or q.difficulty in(select jsonb_array_elements_text(choices));
 else
 return query select * from public.bank_candidates_before_difficulties(p_filters);
 end if;
end;$$;
revoke all on function public.bank_candidates(jsonb) from public,anon;
grant execute on function public.bank_candidates(jsonb) to authenticated;
commit;
