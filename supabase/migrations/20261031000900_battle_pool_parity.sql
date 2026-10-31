begin;
-- Admins may inspect drafts in Question Bank, but Battle selection must use the
-- same published/approved pool counted at admission, before random sampling.
do $migration$
declare definition text; original text;
begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 original:='where qs.question_type<>''open'' or o.answer_format=''numeric'' order by random()limit b.question_count';
 if position(original in definition)=0 then raise exception 'Battle selection prerequisite changed';end if;
 definition:=replace(definition,original,
  'where (qs.question_type<>''open'' or o.answer_format=''numeric'')and public.question_approved_for_students(qs.id)and exists(select 1 from public.book_topics bt join public.books bk on bk.id=bt.book_id where bt.id=qs.topic_id and bk.published)order by random()limit b.question_count');
 execute definition;
end;$migration$;
commit;
