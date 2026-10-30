begin;
alter table public.battles drop constraint battles_category_check;
alter table public.battles add constraint battles_category_check check(category in('Math','Reading & Writing','Mixed','Vocabulary'));
create function public.battle_vocabulary_rounds(p_filters jsonb,p_count integer)returns table(question jsonb,correct_answer integer,explanation text)
language plpgsql stable security definer set search_path='' as $$
declare word record;choices jsonb;key integer;reverse boolean:=coalesce(p_filters->>'mode','meaning-rush')='reverse-meaning';answer text;stem text;
begin
 if not public.is_active_user()then raise exception 'Active account required';end if;
 if p_count not between 1 and 50 or coalesce(p_filters->>'mode','meaning-rush')not in('meaning-rush','reverse-meaning')or exists(select 1 from jsonb_object_keys(p_filters)k where k not in('book','set','mode'))then raise exception 'Invalid vocabulary settings';end if;
 for word in select w.* from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id join public.vocabulary_books b on b.id=s.book_id
 where b.published and public.can_read_vocab(s.id)
 and(coalesce(p_filters->>'book','')=''or s.book_id=(p_filters->>'book')::uuid)
 and(coalesce(p_filters->>'set','')=''or s.id=(p_filters->>'set')::uuid)
 and not exists(select 1 from public.content_review_items r where r.entity_id=w.id and r.item_type='word'and r.status<>'approved')
 order by random()limit p_count loop
 answer:=case when reverse then word.word else word.definition end;
 stem:=case when reverse then word.definition else word.word end;
 select jsonb_agg(v order by ordering)into choices from(
 select answer v,random()ordering union all
 select d.v,random()from(select distinct case when reverse then w.word else w.definition end v from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id join public.vocabulary_books b on b.id=s.book_id
 where b.published and public.can_read_vocab(s.id)and(coalesce(p_filters->>'book','')=''or s.book_id=(p_filters->>'book')::uuid)and(coalesce(p_filters->>'set','')=''or s.id=(p_filters->>'set')::uuid)
 and w.id<>word.id and lower(w.word)<>lower(word.word)and lower(w.definition)<>lower(word.definition)
 and not exists(select 1 from public.content_review_items r where r.entity_id=w.id and r.item_type='word'and r.status<>'approved')
 order by v limit 3)d)options;
 if jsonb_array_length(choices)<>4 then continue;end if;
 select n-1 into key from jsonb_array_elements_text(choices)with ordinality a(v,n)where v=answer;
 question:=jsonb_build_object('id',word.id,'question_type','mcq','question_text',stem,'options',choices,'section','Vocabulary','domain',case when reverse then'Reverse Meaning'else'Meaning Rush'end,'passage','');
 correct_answer:=key;explanation:=word.word||': '||word.definition;return next;
 end loop;
end;$$;
revoke all on function public.battle_vocabulary_rounds(jsonb,integer)from public,anon,authenticated;
do $$declare definition text;begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 definition:=replace(definition,' n:=0;'||chr(10)||' for v_question in select',
 ' n:=0;'||chr(10)||' if b.category=''Vocabulary''then'||chr(10)||' for v_question in select * from public.battle_vocabulary_rounds(b.filters,b.question_count)loop n:=n+1;insert into public.battle_rounds(battle_id,round,question,correct_answer,explanation)values(b.id,n,v_question.question,v_question.correct_answer,v_question.explanation);end loop;'||chr(10)||' else'||chr(10)||' for v_question in select');
 definition:=replace(definition,' if n<>b.question_count then',' end if;'||chr(10)||' if n<>b.question_count then');
 execute definition;
end;$$;
commit;
