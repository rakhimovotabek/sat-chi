begin;
-- One published, approved vocabulary pool for selection and admission checks.
create function public.battle_vocab_pool(p_filters jsonb) returns setof public.vocabulary_words
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or coalesce(p_filters->>'mode','meaning-rush')not in('meaning-rush','reverse-meaning','typed-word')or exists(select 1 from jsonb_object_keys(p_filters)k where k not in('book','set','sets','mode'))then raise exception 'Invalid vocabulary settings';end if;
 if p_filters ? 'sets' and (jsonb_typeof(p_filters->'sets') is distinct from 'array' or jsonb_array_length(p_filters->'sets')>32)then raise exception 'Select at most 32 vocabulary sets';end if;
 return query select w.* from public.vocabulary_words w join public.vocabulary_sets s on s.id=w.set_id join public.vocabulary_books b on b.id=s.book_id
 where b.published and public.can_read_vocab(s.id) and btrim(w.word)<>'' and btrim(w.definition)<>''
 and(coalesce(p_filters->>'book','')=''or s.book_id=(p_filters->>'book')::uuid)
 and(coalesce(p_filters->>'set','')=''or s.id=(p_filters->>'set')::uuid)
 and(coalesce(jsonb_array_length(p_filters->'sets'),0)=0 or s.id in(select value::uuid from jsonb_array_elements_text(p_filters->'sets')))
 and not exists(select 1 from public.content_review_items r where r.entity_id=w.id and r.item_type='word'and r.status<>'approved');
end;$$;
create function public.battle_vocabulary_rounds_v2(p_filters jsonb,p_count integer)
returns table(question jsonb,correct_answer integer,accepted_answers jsonb,explanation text)
language plpgsql stable security definer set search_path='' as $$
declare word public.vocabulary_words; choices jsonb; key integer; mode text:=coalesce(p_filters->>'mode','meaning-rush'); answer text; stem text; produced integer:=0;
begin
 if p_count is null or p_count not between 1 and 50 then raise exception 'Invalid vocabulary count';end if;
 for word in select * from public.battle_vocab_pool(p_filters)order by random() loop
 if mode='typed-word' then
 question:=jsonb_build_object('id',word.id,'question_type','vocabulary-typed','question_text',word.definition,'options','[]'::jsonb,'section','Vocabulary','domain','Typed Word Challenge','passage','');
 correct_answer:=null;accepted_answers:=jsonb_build_array(word.word);explanation:=word.word||': '||word.definition;return next;produced:=produced+1;if produced=p_count then return;end if;continue;
 end if;
 answer:=case when mode='reverse-meaning' then word.word else word.definition end;
 stem:=case when mode='reverse-meaning' then word.definition else word.word end;
 select jsonb_agg(v order by ordering)into choices from(
 select answer v,random()ordering union all
 select d.v,random()from(select distinct case when mode='reverse-meaning' then w.word else w.definition end v
 from public.battle_vocab_pool(p_filters)w where lower(w.word)<>lower(word.word)and lower(w.definition)<>lower(word.definition)
 order by v limit 3)d)options;
 if jsonb_array_length(choices)<>4 then continue;end if;
 select n-1 into key from jsonb_array_elements_text(choices)with ordinality a(v,n)where v=answer;
 question:=jsonb_build_object('id',word.id,'question_type','mcq','question_text',stem,'options',choices,'section','Vocabulary','domain',case when mode='reverse-meaning'then'Reverse Meaning'else'Meaning Rush'end,'passage','');
 correct_answer:=key;accepted_answers:=null;explanation:=word.word||': '||word.definition;return next;produced:=produced+1;if produced=p_count then return;end if;
 end loop;
end;$$;
revoke all on function public.battle_vocab_pool(jsonb),public.battle_vocabulary_rounds_v2(jsonb,integer)from public,anon,authenticated;
do $migration$
declare definition text; original text; replacement text;
begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 original:='for v_question in select * from public.battle_vocabulary_rounds(b.filters,b.question_count)loop n:=n+1;insert into public.battle_rounds(battle_id,round,question,correct_answer,explanation)values(b.id,n,v_question.question,v_question.correct_answer,v_question.explanation);end loop;';
 replacement:='for v_question in select * from public.battle_vocabulary_rounds_v2(b.filters,b.question_count)loop n:=n+1;insert into public.battle_rounds(battle_id,round,question,correct_answer,accepted_answers,explanation)values(b.id,n,v_question.question,v_question.correct_answer,v_question.accepted_answers,v_question.explanation);end loop;';
 if position(original in definition)=0 then raise exception 'Vocabulary round prerequisite changed';end if;
 definition:=replace(definition,original,replacement);
 -- Typed words use trusted private keys, never numerical parsing or fuzzy matching.
 definition:=replace(definition,'if v_round.question->>''question_type''=''open''then',
 'if v_round.question->>''question_type''=''vocabulary-typed''then correct:=exists(select 1 from jsonb_array_elements_text(v_round.accepted_answers)a where lower(btrim(regexp_replace(normalize(a,NFKC),''\s+'','' '',''g'')))=lower(btrim(regexp_replace(normalize(response,NFKC),''\s+'','' '',''g'')))); elsif v_round.question->>''question_type''=''open''then');
 -- Same pool, same eligibility: reject an impossible lobby before it is admitted.
 definition:=replace(definition,'if b.category<>''Vocabulary'' then',
 'if b.category=''Vocabulary'' then select count(*)into n from public.battle_vocabulary_rounds_v2(b.filters,b.question_count);if n<b.question_count then raise exception ''Only % eligible vocabulary questions; requested %. Change count, mode or sets.'',n,b.question_count;end if;else');
 execute definition;
end;$migration$;
commit;
