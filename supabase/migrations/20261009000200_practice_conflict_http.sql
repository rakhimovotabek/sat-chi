begin;
-- 40001 is a real PostgreSQL serialization failure and can cause unbounded
-- transaction retries in managed PostgREST14. Application revision conflicts
-- are permanent for the supplied payload: return HTTP409, retaining all guards.
do $$
declare signature text;definition text;needle text:='errcode=''40001''';
begin
 foreach signature in array array[
  'persist_practice_changes(uuid,jsonb)',
  'check_bank_answer(uuid,uuid,integer,uuid)',
  'check_book_practice_answer(uuid,uuid,integer,uuid)',
  'check_bank_response(uuid,uuid,text,uuid)',
  'check_book_practice_response(uuid,uuid,text,uuid)',
  'review_open_response(uuid,uuid,boolean,bigint)'
 ] loop
  definition:=pg_get_functiondef(('public.'||signature)::regprocedure);
  if position(needle in definition)=0 then
   raise exception 'Expected application conflict guard missing in %. Review before applying.',signature;
  end if;
  execute replace(definition,needle,'errcode=''PT409''');
 end loop;
end;$$;
commit;
