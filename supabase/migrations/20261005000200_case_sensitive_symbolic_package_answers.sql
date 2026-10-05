begin;
create or replace function public.package_open_response_correct(p_item uuid, p_response text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k public.book_practice_open_keys; normalized text; response_number numeric; low numeric; high numeric; inclusive boolean;
begin
  select * into k from public.book_practice_open_keys where item_id=p_item;
  if not found or nullif(btrim(p_response), '') is null then return false; end if;
  normalized := regexp_replace(btrim(p_response), '\s+', '', 'g');

  if k.answer_format = 'numeric-range' and k.accepted_range is not null and k.accepted_range<>'null'::jsonb then
    response_number := public.package_numeric_value(p_response);
    if response_number is null then return false; end if;
    low := (k.accepted_range->>'min')::numeric;
    high := (k.accepted_range->>'max')::numeric;
    inclusive := coalesce((k.accepted_range->>'inclusive')::boolean, false);
    return case when inclusive then response_number between low and high
      else response_number > low and response_number < high end;
  end if;

  if exists(select 1 from jsonb_array_elements_text(k.accepted_answers) a
    where regexp_replace(btrim(a), '\s+', '', 'g') = normalized) then
    return true;
  end if;

  if k.answer_format = 'numeric' then
    response_number := public.package_numeric_value(p_response);
    if response_number is null then return false; end if;
    return exists(select 1 from jsonb_array_elements_text(k.accepted_answers) a
      where public.package_numeric_value(a) = response_number);
  end if;
  return false;
end;
$$;
revoke all on function public.package_open_response_correct(uuid,text) from public,anon,authenticated;
commit;
