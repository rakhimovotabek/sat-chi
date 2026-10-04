begin;
create function public.can_read_question_asset(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_user() and (public.is_admin() or exists(
 select 1 from public.questions q join public.book_topics t on t.id=q.topic_id join public.books b on b.id=t.book_id
 where b.published and q.image_url like '%/storage/v1/object/authenticated/question-assets/'||p_path));
$$;
revoke all on function public.can_read_question_asset(text) from public,anon;
grant execute on function public.can_read_question_asset(text) to authenticated;
do $$begin
 if to_regclass('storage.buckets') is not null then
 insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('question-assets','question-assets',false,1048576,array['image/webp']) on conflict(id) do nothing;
 execute 'create policy question_asset_read on storage.objects for select to authenticated using(bucket_id=''question-assets'' and public.can_read_question_asset(name))';
 execute 'create policy question_asset_admin_insert on storage.objects for insert to authenticated with check(bucket_id=''question-assets'' and public.is_admin())';
 execute 'create policy question_asset_admin_update on storage.objects for update to authenticated using(bucket_id=''question-assets'' and public.is_admin()) with check(bucket_id=''question-assets'' and public.is_admin())';
 execute 'create policy question_asset_admin_delete on storage.objects for delete to authenticated using(bucket_id=''question-assets'' and public.is_admin())';
 end if;
end;$$;
alter function public.validate_review_payload(text,jsonb) rename to validate_review_payload_source;
revoke all on function public.validate_review_payload_source(text,jsonb) from public,anon,authenticated,service_role;
create function public.validate_review_payload(p_type text,p jsonb) returns void language plpgsql set search_path='' as $$
declare asset text; present boolean;
begin
 perform public.validate_review_payload_source(p_type,p);
 if p_type='question' and p->>'imageUrl' like '%/storage/v1/object/authenticated/question-assets/%' then
 asset:=split_part(p->>'imageUrl','/storage/v1/object/authenticated/question-assets/',2);
 if asset !~ '^[a-f0-9]{64}/[a-f0-9]{64}\.webp$' then raise exception 'Invalid preserved question asset';end if;
 if to_regclass('storage.objects') is not null then
 execute 'select exists(select 1 from storage.objects where bucket_id=''question-assets'' and name=$1)' into present using asset;
 if not present then raise exception 'Preserved source image is missing; recover the asset before approval';end if;
 end if;
 end if;
end;$$;
revoke all on function public.validate_review_payload(text,jsonb) from public,anon,authenticated,service_role;
commit;
