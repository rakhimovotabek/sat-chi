begin;
create or replace function public.invalidate_content_review() returns trigger language plpgsql security definer set search_path='' as $$
declare kind text; eid uuid; r public.content_review_items;
begin
 if to_jsonb(new)=to_jsonb(old) then return new;end if;
 kind:=case tg_table_name when 'questions' then 'question' when 'question_answers' then 'question' when 'vocabulary_words' then 'word' when 'vocabulary_passages' then 'passage' else 'exercise' end;
 eid:=case when tg_table_name='question_answers' then (to_jsonb(new)->>'question_id')::uuid else (to_jsonb(new)->>'id')::uuid end;
 select * into r from public.content_review_items where item_type=kind and entity_id=eid;
 if r.id is not null then
 update public.vocabulary_books set published=false where id=(select vocabulary_book_id from public.import_jobs where id=r.source_id) and published;
 update public.content_review_items set source_page=coalesce(nullif(to_jsonb(new)->>'source_page','')::int,r.source_page),extraction_method=coalesce(nullif(to_jsonb(new)->'import_metadata'->>'extraction_method',''),r.extraction_method),status='pending',updated_at=clock_timestamp() where id=r.id;
 insert into public.content_review_audit(item_id,source_id,action,actor,before_data,after_data)values(r.id,r.source_id,'catalog_edit',auth.uid(),to_jsonb(old),to_jsonb(new));
 end if;return new;
end;$$;
commit;
