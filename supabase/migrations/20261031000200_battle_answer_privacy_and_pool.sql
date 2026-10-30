begin;
-- Forward-only patch of the established state machine. Preserve room identities,
-- answers, canonical question snapshots and all previously earned scores.
do $migration$
declare definition text; old_snapshot text; new_snapshot text; insertion text;
begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure) into definition;
 old_snapshot := $old$(select jsonb_agg(jsonb_build_object('user_id',user_id,'seat',seat,'team',team,'ready',ready,'score',score,'last_seen',last_seen)order by score desc,seat)from public.battle_members where battle_id=b.id)$old$;
 new_snapshot := $new$(select jsonb_agg(jsonb_build_object('user_id',visible.user_id,'seat',visible.seat,'team',visible.team,'ready',visible.ready,'score',visible.score,'last_seen',visible.last_seen)order by visible.score desc,visible.seat)from (
 select member.user_id,member.seat,member.team,member.ready,member.last_seen,
 member.score-case when b.state='PLAYING' then coalesce(answer.points,0) else 0 end score
 from public.battle_members member left join public.battle_answers answer
 on answer.battle_id=member.battle_id and answer.user_id=member.user_id and answer.round=b.round
 where member.battle_id=b.id)visible)$new$;
 if position(old_snapshot in definition)=0 then raise exception 'Battle snapshot prerequisite changed'; end if;
 definition:=replace(definition,old_snapshot,new_snapshot);
 -- Fail at room creation rather than admitting a lobby that can never start.
 -- Count only published, approved canonical rows even for an admin host.
 insertion := $pool$
 if b.category<>'Vocabulary' then
 if jsonb_typeof(b.filters) is distinct from 'object' then raise exception 'Invalid battle filters';end if;
 if exists(select 1 from jsonb_object_keys(b.filters) k where k not in('domain','skill','difficulty','book','topic','domains','skills'))then raise exception 'Invalid battle filters';end if;
 select count(*) into n from public.bank_candidates(b.filters||case when b.category='Mixed'then'{}'::jsonb else jsonb_build_object('section',b.category)end) qs
 join public.book_topics topic on topic.id=qs.topic_id join public.books book on book.id=topic.book_id
 join public.question_answers key on key.question_id=qs.id
 left join public.book_open_answers open_key on open_key.question_id=qs.id
 where book.published and public.question_approved_for_students(qs.id)
 and (qs.question_type<>'open' or open_key.answer_format='numeric');
 if n<b.question_count then raise exception 'Only % eligible published questions; requested %. Change count or filters.',n,b.question_count;end if;
 end if;
 $pool$;
 if position(' insert into public.battle_members(battle_id,user_id,seat,team)values(b.id,uid,1,' in definition)=0 then raise exception 'Battle creation prerequisite changed';end if;
 definition:=replace(definition,' insert into public.battle_members(battle_id,user_id,seat,team)values(b.id,uid,1,',insertion||' insert into public.battle_members(battle_id,user_id,seat,team)values(b.id,uid,1,');
 execute definition;
end;
$migration$;
commit;
