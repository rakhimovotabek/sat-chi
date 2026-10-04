begin;
alter function public.validate_review_payload(text,jsonb) rename to validate_review_payload_core;
revoke all on function public.validate_review_payload_core(text,jsonb) from public,anon,authenticated,service_role;
create function public.validate_review_payload(p_type text,p jsonb)returns void language plpgsql set search_path='' as $$
declare field text;
begin
 perform public.validate_review_payload_core(p_type,p);
 if p_type in ('question','exercise') then
 if char_length(p->>'question')>20000 then raise exception 'Question prompt too long';end if;
 foreach field in array array['question','passage','stimulus','explanation']loop
 if p?field and (jsonb_typeof(p->field)<>'string' or char_length(p->>field)>60000 or p->>field~'�')then raise exception 'Invalid or corrupt source text';end if;
 end loop;
 if p_type='question' and p->>'question'~*'\m(graph|figure|chart|table)\M' and coalesce(p->>'imageUrl','')='' and coalesce(p->'table','null')='null'::jsonb then raise exception 'Preserve the essential source image or table before approval';end if;
 if p_type='question' and p->>'question'~*'underlin' and coalesce(p->>'imageUrl','')='' then raise exception 'Preserve source underlining in an image before approval';end if;
 if p_type='question' and p->>'question'~*'(both texts|Text 1.*Text 2|Text 2.*Text 1)' and (coalesce(p->>'passage','')!~*'Text 1' or coalesce(p->>'passage','')!~*'Text 2') then raise exception 'Both labeled source passages are required';end if;
 elsif p_type='word' then
 if char_length(p->>'word')>100 or char_length(p->>'definition')>2000 then raise exception 'Word or definition too long';end if;
 end if;
end;$$;
revoke all on function public.validate_review_payload(text,jsonb) from public,anon,authenticated,service_role;
commit;
