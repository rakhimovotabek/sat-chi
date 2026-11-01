begin;
-- Preserve historical scores. Only newly created rooms receive the new rule.
alter table public.battles add column scoring_version integer not null default 1 check(scoring_version in(1,2));
alter table public.battles alter column scoring_version set default 2;
create function public.battle_points(p_correct boolean,p_seconds integer,p_deadline timestamptz,p_accepted_at timestamptz) returns integer
language sql immutable set search_path='' as $$
 select case when not coalesce(p_correct,false) then 0 else 100 + case when p_seconds>0 and p_deadline is not null then
 greatest(0,least(50,floor(50*extract(epoch from(p_deadline-p_accepted_at))/p_seconds)::integer)) else 0 end end
$$;
revoke all on function public.battle_points(boolean,integer,timestamptz,timestamptz)from public,anon,authenticated;
do $migration$
declare definition text; original text:='points:=case when correct then 100 else 0 end;';
begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 if position(original in definition)=0 then raise exception 'Battle scoring prerequisite changed';end if;
 definition:=replace(definition,original,'points:=case when b.scoring_version=1 then case when correct then 100 else 0 end else public.battle_points(correct,b.seconds,b.deadline,v_now) end;');
 if position('insert into public.battle_answers(battle_id,round,user_id,response,correct,points)values(b.id,b.round,uid,response,coalesce(correct,false),points);' in definition)=0 then raise exception 'Battle acceptance prerequisite changed';end if;
 definition:=replace(definition,'insert into public.battle_answers(battle_id,round,user_id,response,correct,points)values(b.id,b.round,uid,response,coalesce(correct,false),points);','insert into public.battle_answers(battle_id,round,user_id,response,correct,points,answered_at)values(b.id,b.round,uid,response,coalesce(correct,false),points,v_now);');
 execute definition;
end;$migration$;
-- Keep the existing locked, authenticated state machine and its privacy policy.
alter function public.battle_action(text,jsonb) rename to battle_action_core;
revoke all on function public.battle_action_core(text,jsonb)from public,anon,authenticated;
create function public.battle_display_name(p_id uuid)returns text language sql stable security definer set search_path='' as $$
 select coalesce((select nullif(left(trim(coalesce(nullif(p.display_name,''),p.username)),64),'') from public.profiles p where p.id=p_id and coalesce(nullif(p.display_name,''),p.username,'')not like '%@%'),'Player '||left(replace(p_id::text,'-',''),8))
$$;
revoke all on function public.battle_display_name(uuid)from public,anon,authenticated;
create function public.battle_action(p_action text,p_data jsonb default '{}')returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; member jsonb; members jsonb:='[]';
begin
 result:=public.battle_action_core(p_action,p_data);
 if result ? 'members' then
  for member in select value from jsonb_array_elements(result->'members')loop
   members:=members||jsonb_build_array(member||jsonb_build_object('display_name',public.battle_display_name((member->>'user_id')::uuid))||case when result->>'state'='FINISHED' then jsonb_build_object('correct',(select count(*)from public.battle_answers a where a.battle_id=(result->>'id')::uuid and a.user_id=(member->>'user_id')::uuid and a.correct),'speed_bonus',(select coalesce(sum(greatest(0,a.points-100)),0)from public.battle_answers a where a.battle_id=(result->>'id')::uuid and a.user_id=(member->>'user_id')::uuid))else '{}'::jsonb end);
  end loop;
  result:=jsonb_set(result,'{members}',members);
 end if;
 if jsonb_typeof(result->'review')='object' then
  result:=jsonb_set(result,'{review,points}',to_jsonb(coalesce((select a.points from public.battle_answers a where a.battle_id=(result->>'id')::uuid and a.round=(result->>'round')::integer and a.user_id=auth.uid()),0)));
 end if;
 return result;
end;$$;
revoke all on function public.battle_action(text,jsonb)from public,anon;
grant execute on function public.battle_action(text,jsonb)to authenticated;
-- Read-only standings; no client result-submission endpoint or extra score store.
-- Ranking uses completed competitive matches, points descending; ties share rank.
-- Both/all participants must submit the final round: abandoned matches are excluded.
create function public.battle_leaderboard(p_period text default 'all') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz;
begin
 if auth.uid()is null or not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 if p_period not in('all','week','month')then raise exception 'Invalid leaderboard period';end if;
 since:=case p_period when 'week' then date_trunc('week',now()at time zone 'UTC')at time zone 'UTC' when 'month' then date_trunc('month',now()at time zone 'UTC')at time zone 'UTC' else '-infinity'::timestamptz end;
 return jsonb_build_object('period',p_period,'me',auth.uid(),'ranking','Total Battle points; equal points share rank','rows',coalesce((
 with eligible as (
 select b.* from public.battles b where b.state='FINISHED' and b.created_at>=since
 and (select count(*)from public.battle_members m where m.battle_id=b.id)>=2
 and not exists(select 1 from public.battle_members m where m.battle_id=b.id and not exists(select 1 from public.battle_answers a where a.battle_id=b.id and a.user_id=m.user_id and a.round=b.question_count))
 ), teams as (
 select b.id,m.team,sum(m.score)score from eligible b join public.battle_members m on m.battle_id=b.id group by b.id,m.team
 ), results as (
 select m.user_id,m.score,b.question_count,
 case when b.team_size>0 then t.score else m.score end contest_score,
 (select max(case when b.team_size>0 then t2.score else m2.score end)from public.battle_members m2 join teams t2 on t2.id=b.id and t2.team=m2.team where m2.battle_id=b.id)best,
 (select count(distinct case when b.team_size>0 then m2.team::text else m2.user_id::text end)from public.battle_members m2 join teams t2 on t2.id=b.id and t2.team=m2.team where m2.battle_id=b.id and (case when b.team_size>0 then t2.score else m2.score end)>(case when b.team_size>0 then t.score else m.score end))higher,
 (select count(*)from public.battle_answers a where a.battle_id=b.id and a.user_id=m.user_id and a.correct)correct,
 b.id,b.team_size,m.team
 from eligible b join public.battle_members m on m.battle_id=b.id join teams t on t.id=b.id and t.team=m.team
 ), marked as (select *,count(*)over(partition by id,contest_score)tied_players from results), aggregated as (
 select user_id,count(*)matches,sum(score)points,
 count(*)filter(where higher=0 and tied_players=case when team_size>0 then team_size else 1 end)wins,
 count(*)filter(where higher>0)losses,sum(correct)correct,sum(question_count)questions from marked group by user_id
 ), ranked as (
 select *,dense_rank()over(order by points desc)rank from aggregated
 )select jsonb_agg(jsonb_build_object('user_id',user_id,'display_name',public.battle_display_name(user_id),'rank',rank,'matches',matches,'wins',wins,'losses',losses,'draws',matches-wins-losses,'points',points,'win_rate',round(100.0*wins/matches,1),'accuracy',round(100.0*correct/questions,1))order by rank,user_id)from(select * from ranked order by rank,user_id limit 100)r),'[]'::jsonb));
end;$$;
revoke all on function public.battle_leaderboard(text)from public,anon;
grant execute on function public.battle_leaderboard(text)to authenticated;
create index battle_finished_competition on public.battles(created_at desc)where state='FINISHED';
notify pgrst,'reload schema';
commit;
