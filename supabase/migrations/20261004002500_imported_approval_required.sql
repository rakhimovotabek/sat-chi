begin;
-- Imported questions fail closed if their approval record is missing.
-- Authored legacy questions with no import metadata retain existing behavior.
create or replace function public.question_approved_for_students(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.questions q where q.id=p_id
 and public.question_practicable(q.id)
 and (q.import_metadata='{}'::jsonb or exists(select 1 from public.content_review_items r where r.item_type='question' and r.entity_id=q.id and r.status='approved'))
 and not exists(select 1 from public.content_review_items r where r.item_type='question' and r.entity_id=q.id and (r.status<>'approved' or r.warnings @> '["Possible duplicate"]')));
$$;
commit;
