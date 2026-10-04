begin;
-- Avoid phantom empty topics when a changed parser payload consists of repeats.
create function public.local_topic_has_new(p_data jsonb,p_depth integer default 0) returns boolean language plpgsql set search_path='' as $$
declare q jsonb;child jsonb;answer integer;has_new boolean:=false;
begin
 if p_depth>8 then raise exception 'Topic depth limit';end if;
 for q in select value from jsonb_array_elements(coalesce(p_data->'questions','[]'))loop
 select a.correct_answer into answer from public.local_question_imports l join public.question_answers a on a.question_id=l.question_id where l.fingerprint=public.local_question_fingerprint(q);
 if answer is null then has_new:=true;elsif answer<>(q->>'correctAnswer')::int then raise exception 'NEEDS_REVIEW: duplicate content has conflicting answer keys';end if;
 end loop;
 for child in select value from jsonb_array_elements(coalesce(p_data->'children','[]'))loop
 if public.local_topic_has_new(child,p_depth+1)then has_new:=true;end if;
 end loop;return has_new;
end;$$;
revoke all on function public.local_topic_has_new(jsonb,integer) from public,anon,authenticated,service_role;
alter function public.import_local_topic(uuid,uuid,jsonb,integer,integer) rename to import_local_topic_core;
revoke all on function public.import_local_topic_core(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated,service_role;
create function public.import_local_topic(p_book uuid,p_parent uuid,p_data jsonb,p_position integer,p_depth integer) returns integer language plpgsql set search_path='' as $$
begin
 if not public.local_topic_has_new(p_data,p_depth)then return 0;end if;
 return public.import_local_topic_core(p_book,p_parent,p_data,p_position,p_depth);
end;$$;
revoke all on function public.import_local_topic(uuid,uuid,jsonb,integer,integer) from public,anon,authenticated,service_role;
commit;
