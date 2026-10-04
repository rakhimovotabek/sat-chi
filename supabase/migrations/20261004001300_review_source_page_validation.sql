begin;
alter function public.update_content_review(uuid,text,jsonb,text,timestamptz) rename to update_content_review_core;
revoke all on function public.update_content_review_core(uuid,text,jsonb,text,timestamptz) from public,anon,authenticated,service_role;
create function public.update_content_review(p_id uuid,p_action text,p_payload jsonb default null,p_note text default '',p_version timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.content_review_items;
begin
 if not public.is_admin() then raise exception 'Administrator access required';end if;
 select * into r from public.content_review_items where id=p_id for update;
 if p_action='approve' and r.item_type='question' and r.source_page is null then raise exception 'Verify and save the physical source page before approval';end if;
 return public.update_content_review_core(p_id,p_action,p_payload,p_note,p_version);
end;$$;
revoke all on function public.update_content_review(uuid,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.update_content_review(uuid,text,jsonb,text,timestamptz) to authenticated;
update public.content_review_items set warnings=warnings||'["Physical source page requires verification"]'::jsonb where item_type='question' and entity_id is not null and source_page is null and status<>'approved';
commit;
