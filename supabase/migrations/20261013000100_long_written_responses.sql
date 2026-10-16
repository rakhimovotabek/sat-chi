begin;

-- Source editing worksheets contain full-sentence responses longer than 200
-- characters. Preserve the existing authorization, revision and grading logic.
alter table public.book_practice_items
  drop constraint book_practice_items_selected_response_check,
  add constraint book_practice_items_selected_response_check
    check (length(selected_response) <= 2000);
alter table public.question_check_attempts
  drop constraint question_check_attempts_selected_response_check,
  add constraint question_check_attempts_selected_response_check
    check (length(selected_response) <= 2000);

do $$
declare signature text; definition text; updated text;
begin
  foreach signature in array array[
    'save_book_practice_before_homework_access(uuid,jsonb)',
    'check_bank_response(uuid,uuid,text,uuid)',
    'check_book_practice_response(uuid,uuid,text,uuid)'
  ] loop
    definition := pg_get_functiondef(('public.' || signature)::regprocedure);
    updated := replace(replace(definition,
      'length(response)>200', 'length(response)>2000'),
      'length(p_response)>200', 'length(p_response)>2000');
    if updated = definition then
      raise exception 'Expected response limit missing from %', signature;
    end if;
    execute updated;
  end loop;
end;
$$;

commit;
