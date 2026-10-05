begin;

alter table public.book_open_answers
  add column correct_answer text,
  add column answer_format text,
  add column accepted_range jsonb;
alter table public.book_practice_open_keys
  add column correct_answer text,
  add column answer_format text,
  add column accepted_range jsonb;
alter table public.book_open_answers
  drop constraint book_open_answers_accepted_answers_check,
  add constraint book_open_answers_answer_key_check check (
    jsonb_typeof(accepted_answers)='array' and
    (jsonb_array_length(accepted_answers)>0 or (accepted_range is not null and accepted_range<>'null'::jsonb))
  );

create function public.package_numeric_value(p_value text) returns numeric
language plpgsql immutable set search_path='' as $$
declare cleaned text; numerator text; denominator text;
begin
  cleaned := regexp_replace(lower(btrim(p_value)), '\s+', '', 'g');
  if cleaned ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([e][+-]?[0-9]+)?$' then
    return cleaned::numeric;
  end if;
  if cleaned ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)/[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$' then
    numerator := split_part(cleaned, '/', 1);
    denominator := split_part(cleaned, '/', 2);
    if denominator::numeric = 0 then return null; end if;
    return numerator::numeric / denominator::numeric;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create function public.package_open_response_correct(p_item uuid, p_response text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare k public.book_practice_open_keys; normalized text; response_number numeric; answer_number numeric; low numeric; high numeric; inclusive boolean;
begin
  select * into k from public.book_practice_open_keys where item_id=p_item;
  if not found or nullif(btrim(p_response), '') is null then return false; end if;
  normalized := lower(regexp_replace(btrim(p_response), '\s+', '', 'g'));

  if k.answer_format = 'numeric-range' and k.accepted_range is not null then
    response_number := public.package_numeric_value(p_response);
    if response_number is null then return false; end if;
    low := (k.accepted_range->>'min')::numeric;
    high := (k.accepted_range->>'max')::numeric;
    inclusive := coalesce((k.accepted_range->>'inclusive')::boolean, false);
    return case when inclusive then response_number between low and high
      else response_number > low and response_number < high end;
  end if;

  if exists(select 1 from jsonb_array_elements_text(k.accepted_answers) a
    where lower(regexp_replace(btrim(a), '\s+', '', 'g')) = normalized) then
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

create function public.fill_package_open_practice_key() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  select a.correct_answer,a.answer_format,a.accepted_range
    into new.correct_answer,new.answer_format,new.accepted_range
    from public.book_practice_items i
    join public.book_open_answers a on a.question_id=(i.question->>'id')::uuid
    where i.id=new.item_id;
  return new;
end;
$$;
create trigger fill_package_open_practice_key
  before insert on public.book_practice_open_keys
  for each row execute function public.fill_package_open_practice_key();

create or replace function public.check_bank_response(p_session uuid,p_item uuid,p_response text,p_event uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.book_practice_sessions; i public.book_practice_items; a public.question_check_attempts; is_correct boolean; n integer; previous integer;
begin
 select * into s from public.book_practice_sessions where id=p_session for update;
 if s.id is null or s.student_id<>auth.uid() or not public.is_active_user() or s.kind<>'bank' then raise exception 'Own bank session required' using errcode='42501';end if;
 select * into i from public.book_practice_items where id=p_item and session_id=s.id;
 if i.id is null or i.question->>'question_type'<>'open' or nullif(btrim(p_response),'') is null or length(p_response)>200 or p_event is null then raise exception 'Invalid attempt';end if;
 select * into a from public.question_check_attempts where id=p_event;
 if a.id is not null then
   if a.item_id<>i.id or a.selected_response is distinct from p_response then raise exception 'Attempt event conflict';end if;
   return to_jsonb(a);
 end if;
 if s.submitted_at is not null or i.solved_at is not null then raise exception 'Question already completed';end if;
 is_correct := public.package_open_response_correct(i.id,p_response);
 select count(*)+1,coalesce(max(active_seconds),0) into n,previous from public.question_check_attempts where item_id=i.id;
 insert into public.question_check_attempts(id,item_id,attempt_order,selected_answer,selected_response,correct,active_seconds,between_seconds,eliminated,marked)
 values(p_event,i.id,n,0,p_response,is_correct,i.active_seconds,i.active_seconds-previous,i.eliminated,i.marked) returning * into a;
 update public.book_practice_items set selected_answer=0,selected_response=p_response,has_answered=true,correct=a.correct,solved_at=case when a.correct then now() end where id=i.id;
 insert into public.student_activity(student_id,session_id,kind,title) values(s.student_id,s.id,s.kind,s.title) on conflict(session_id) do nothing;
 if not exists(select 1 from public.book_practice_items where session_id=s.id and solved_at is null) then update public.book_practice_sessions set submitted_at=now() where id=s.id;end if;
 return to_jsonb(a);
end;
$$;

create or replace function public.finish_book_practice(p_session_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform public.finish_book_practice_before_packages(p_session_id);
  update public.book_practice_items i
    set correct=public.package_open_response_correct(i.id,i.selected_response)
    from public.book_practice_open_keys k,public.book_practice_sessions s
    where k.item_id=i.id and s.id=i.session_id and s.id=p_session_id
      and s.kind in ('book','bank') and s.student_id=auth.uid();
end;
$$;

create or replace function public.book_practice_open_review(p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_sessions where id=p_session and student_id=auth.uid() and kind in ('book','bank') and submitted_at is not null and public.is_active_user()) then raise exception 'Submit your own book practice first' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('item_id',k.item_id,'accepted_answers',k.accepted_answers,'correct_answer',k.correct_answer,'answer_format',k.answer_format,'accepted_range',k.accepted_range)) from public.book_practice_open_keys k join public.book_practice_items i on i.id=k.item_id where i.session_id=p_session),'[]');
end;$$;

revoke all on function public.package_numeric_value(text) from public,anon,authenticated;
revoke all on function public.package_open_response_correct(uuid,text) from public,anon,authenticated;
grant execute on function public.check_bank_response(uuid,uuid,text,uuid) to authenticated;
commit;
