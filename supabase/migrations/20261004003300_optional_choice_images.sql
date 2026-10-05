begin;
-- Keep the existing text choices and zero-based answer indices unchanged.
-- Future manual importers can attach an optional image to each choice by index.
create function public.valid_option_image_urls(p_urls jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(p_urls)='array' and jsonb_array_length(p_urls)=4
 and not exists(select 1 from jsonb_array_elements(p_urls) u
 where u<>'null'::jsonb and (jsonb_typeof(u)<>'string'
 or length(u#>>'{}')>2048 or (u#>>'{}') !~ '^https://[^[:space:]]+$'));
$$;
revoke all on function public.valid_option_image_urls(jsonb) from public,anon;
grant execute on function public.valid_option_image_urls(jsonb) to authenticated,service_role;
alter table public.questions add column option_image_urls jsonb not null default '[null,null,null,null]'::jsonb
 check(public.valid_option_image_urls(option_image_urls));
commit;
