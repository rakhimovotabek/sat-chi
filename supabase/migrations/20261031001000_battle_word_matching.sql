begin;
-- Four distinct stored word/definition pairs constitute one matching round.
-- Deduplicate normalized word/definition text conservatively before grouping;
-- never fabricate pairs or expose their private correspondence in active keys.
create function public.battle_matching_rounds(p_filters jsonb,p_count integer)
returns table(question jsonb,correct_answer integer,accepted_answers jsonb,explanation text)
language plpgsql stable security definer set search_path='' as $$
declare word record; pairs jsonb:='[]'; definitions jsonb; mapping jsonb; produced integer:=0;
begin
 if p_count is null or p_count not between 1 and 50 then raise exception 'Invalid matching round count';end if;
 for word in select * from(
  select w.*,row_number()over(partition by lower(btrim(normalize(w.word,NFKC)))order by w.id)word_rank,
   row_number()over(partition by lower(btrim(normalize(w.definition,NFKC)))order by w.id)definition_rank
   from public.battle_vocab_pool(p_filters)w
 )unique_pairs where word_rank=1 and definition_rank=1 order by random()limit p_count*4 loop
  pairs:=pairs||jsonb_build_array(jsonb_build_object('id',word.id,'word',word.word,'definition',word.definition));
  if jsonb_array_length(pairs)=4 then
   select jsonb_agg(pair->>'definition'order by random())into definitions from jsonb_array_elements(pairs)pair;
   select jsonb_agg((select index-1 from jsonb_array_elements_text(definitions)with ordinality d(value,index)where d.value=pair->>'definition')order by position)
    into mapping from jsonb_array_elements(pairs)with ordinality p(pair,position);
   question:=jsonb_build_object('id',pairs->0->>'id','question_type','vocabulary-matching','question_text','Match each word to its definition.','options','[]'::jsonb,
    'matching_words',(select jsonb_agg(pair-'definition'order by position)from jsonb_array_elements(pairs)with ordinality p(pair,position)),
    'matching_definitions',definitions,'section','Vocabulary','domain','Word Matching','passage','');
   correct_answer:=null;accepted_answers:=mapping;
   select string_agg((pair->>'word')||': '||(pair->>'definition'),E'\n'order by position)into explanation from jsonb_array_elements(pairs)with ordinality p(pair,position);
   return next;produced:=produced+1;pairs:='[]';if produced=p_count then return;end if;
  end if;
 end loop;
end;$$;
create function public.battle_matching_correct(p_response text,p_key jsonb)returns boolean
language plpgsql immutable set search_path='' as $$
declare proposed jsonb;
begin
 proposed:=p_response::jsonb;
 if jsonb_typeof(proposed)is distinct from 'array'then raise exception 'Submit four distinct definition choices';end if;
 if jsonb_array_length(proposed)<>4 then raise exception 'Submit four distinct definition choices';end if;
 if exists(select 1 from jsonb_array_elements(proposed)v where jsonb_typeof(v)<>'number'or v not in('0'::jsonb,'1'::jsonb,'2'::jsonb,'3'::jsonb))or(select count(distinct v)from jsonb_array_elements(proposed)v)<>4 then raise exception 'Submit four distinct definition choices';end if;
 return proposed=p_key;
end;$$;
revoke all on function public.battle_matching_rounds(jsonb,integer),public.battle_matching_correct(text,jsonb)from public,anon,authenticated;

do $migration$
declare definition text; original text;
begin
 select pg_get_functiondef('public.battle_vocab_pool(jsonb)'::regprocedure)into definition;
 original:='not in(''meaning-rush'',''reverse-meaning'',''typed-word'')';
 if position(original in definition)=0 then raise exception 'Vocabulary pool prerequisite changed';end if;
 execute replace(definition,original,'not in(''meaning-rush'',''reverse-meaning'',''typed-word'',''word-matching'')');

 select pg_get_functiondef('public.battle_vocabulary_rounds_v2(jsonb,integer)'::regprocedure)into definition;
 original:=' if p_count is null or p_count not between 1 and 50';
 if position(original in definition)=0 then raise exception 'Vocabulary generator prerequisite changed';end if;
 execute replace(definition,original,' if coalesce(p_filters->>''mode'',''meaning-rush'')=''word-matching''then return query select * from public.battle_matching_rounds(p_filters,p_count);return;end if;'||chr(10)||original);

 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 original:='if v_round.question->>''question_type''=''vocabulary-typed''then';
 if position(original in definition)=0 then raise exception 'Vocabulary grading prerequisite changed';end if;
 execute replace(definition,original,'if v_round.question->>''question_type''=''vocabulary-matching''then correct:=public.battle_matching_correct(response,v_round.accepted_answers);elsif v_round.question->>''question_type''=''vocabulary-typed''then');
end;$migration$;
commit;
