begin;
-- Source-image packages have a validated rendering contract distinct from text imports.
create or replace function public.guard_review_publication() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.content_review_items;
begin
 if tg_table_name='books' then
 if new.published and exists(select 1 from public.import_jobs where book_id=new.id) then
 if not exists(select 1 from public.questions q join public.book_topics t on t.id=q.topic_id where t.book_id=new.id and public.question_approved_for_students(q.id)) then raise exception 'Review imported catalog items before publishing: approve at least one validated question';end if;
 for r in select ri.* from public.content_review_items ri join public.questions q on q.id=ri.entity_id join public.book_topics t on t.id=q.topic_id where t.book_id=new.id and ri.item_type='question' and ri.status='approved' loop
 if not public.book_package_question_ready(r.entity_id) then
 perform public.validate_review_payload('question',public.content_review_payload(r));
 end if;
 if r.source_page is null then raise exception 'Approved question source page is missing';end if;
 end loop;
 end if;
 else
 if new.published and exists(select 1 from public.import_jobs j join public.content_review_items ri on ri.source_id=j.id where j.vocabulary_book_id=new.id and ri.entity_id is not null and ri.status<>'approved') then raise exception 'Review imported catalog items before publishing';end if;
 end if;
 return new;
end;$$;
commit;
