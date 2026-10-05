begin;
-- Policies bind function OIDs. Renaming the pre-package helper in migration 034
-- left this policy bound to the old eligibility rules; bind the current helper.
drop policy student_questions on public.questions;
create policy student_questions on public.questions for select to authenticated
using ((select public.is_active_user()) and public.question_approved_for_students(id)
 and exists(select 1 from public.book_topics t join public.books b on b.id=t.book_id
 where t.id=questions.topic_id and b.published));

-- Promote the populated child instead of moving/recreating questions. Preserve
-- leaf topic IDs, question topic IDs, snapshots, answer keys and asset references.
create function public.collapse_book_package_topics(p_book uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pair record; mappings jsonb:='[]'; before_questions integer; after_questions integer;
begin
 if not exists(select 1 from public.book_import_packages where book_id=p_book) then raise exception 'Structured package book required';end if;
 perform pg_advisory_xact_lock(hashtextextended('book-topic-collapse:'||p_book::text,0));
 perform 1 from public.books where id=p_book for update;
 select count(*) into before_questions from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=p_book;
 for pair in select parent.id parent_id,child.id child_id,parent.position,parent.title
 from public.book_topics parent join public.book_topics child on child.parent_id=parent.id and child.book_id=parent.book_id
 where parent.book_id=p_book and parent.parent_id is null and parent.title=child.title
 and not exists(select 1 from public.questions where topic_id=parent.id)
 and (select count(*) from public.book_topics where parent_id=parent.id)=1
 order by parent.position,parent.id for update of parent,child loop
 update public.book_topics set parent_id=null,position=pair.position where id=pair.child_id;
 update public.content_imports set topic_id=pair.child_id where topic_id=pair.parent_id;
 delete from public.book_topics where id=pair.parent_id;
 mappings:=mappings||jsonb_build_array(jsonb_build_object('removed_empty_parent',pair.parent_id,'retained_topic',pair.child_id,'title',pair.title));
 end loop;
 select count(*) into after_questions from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=p_book;
 if before_questions<>after_questions then raise exception 'Question count changed while collapsing hierarchy';end if;
 return jsonb_build_object('questions_before',before_questions,'questions_after',after_questions,'collapsed',mappings);
end;$$;
revoke all on function public.collapse_book_package_topics(uuid) from public,anon,authenticated;
grant execute on function public.collapse_book_package_topics(uuid) to service_role;
commit;
