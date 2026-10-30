begin;
create function public.sat_numeric_response(p_value text)returns text language plpgsql immutable set search_path='' as $$
declare v text;
begin
 v:=btrim(p_value,E' \t\n\r'||chr(160)||chr(8239)||chr(8201));
 if left(v,1)in('−','–','—')and substring(v from 2 for 1)~'[0-9.]'then v:='-'||substring(v from 2);end if;
 if length(v)>(case when left(v,1)='-'then 6 else 5 end) then return null;end if;
 if v!~'^-?([0-9]+(\.[0-9]*)?|\.[0-9]+|[0-9]+/[0-9]+)$'or v~'/0+$'then return null;end if;
 return v;
end;$$;
alter function public.package_open_response_correct(uuid,text)rename to package_open_response_correct_before_sat;
create function public.package_open_response_correct(p_item uuid,p_response text)returns boolean language plpgsql stable security definer set search_path='' as $$
declare v text;format text;begin
 select answer_format into format from public.book_practice_open_keys where item_id=p_item;
 if format in('numeric','numeric-range')then
 v:=public.sat_numeric_response(p_response);if v is null then return false;end if;
 return public.package_open_response_correct_before_sat(p_item,v);
 end if;
 return public.package_open_response_correct_before_sat(p_item,p_response);
end;$$;
revoke all on function public.package_open_response_correct(uuid,text),public.package_open_response_correct_before_sat(uuid,text),public.sat_numeric_response(text)from public,anon,authenticated;
-- Battle grading shares the same syntax/length gate; source keys retain full precision.
do $$declare definition text;begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 definition:=replace(definition,'public.package_numeric_value(response)','public.package_numeric_value(public.sat_numeric_response(response))');
 execute definition;
end;$$;
commit;
-- Explanations unlock after a durable Check (including a wrong answer) or submission.
alter function public.book_practice_explanation(uuid,uuid)rename to book_practice_explanation_before_check_gate;
create function public.book_practice_explanation(p_session uuid,p_item uuid)returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.book_practice_items i join public.book_practice_sessions s on s.id=i.session_id where i.id=p_item and s.id=p_session and s.student_id=auth.uid()and(s.submitted_at is not null or exists(select 1 from public.question_check_attempts a where a.item_id=i.id)))then raise exception 'Check your answer before opening the explanation'using errcode='42501';end if;
 return public.book_practice_explanation_before_check_gate(p_session,p_item);
end;$$;
revoke all on function public.book_practice_explanation_before_check_gate(uuid,uuid),public.book_practice_explanation(uuid,uuid)from public,anon,authenticated;
grant execute on function public.book_practice_explanation(uuid,uuid)to authenticated;
