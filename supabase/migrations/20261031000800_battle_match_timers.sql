begin;
alter table public.battles add column total_seconds integer not null default 0
 check(total_seconds=0 or total_seconds between 30 and 3600);
alter table public.battles add column match_deadline timestamptz;

do $migration$
declare definition text; original text; replacement text;
begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 original:=' if b.team_size>0 and b.capacity<>b.team_size*2';
 if position(original in definition)=0 then raise exception 'Battle creation prerequisite changed';end if;
 definition:=replace(definition,original,' update public.battles set total_seconds=coalesce((p_data->>''totalSeconds'')::integer,0)where id=b.id returning * into b;'||chr(10)||original);
 original:='set state=''COUNTDOWN'',round=1,deadline=v_now+interval ''5 seconds''where id=b.id';
 replacement:='set state=''COUNTDOWN'',round=1,deadline=v_now+interval ''5 seconds'',match_deadline=case when total_seconds=0 then null else v_now+interval ''5 seconds''+make_interval(secs=>total_seconds)end where id=b.id';
 if position(original in definition)=0 then raise exception 'Battle countdown prerequisite changed';end if;
 definition:=replace(definition,original,replacement);
 -- An offline countdown cannot grant a new full round when someone reconnects.
 original:='deadline=case when seconds=0 then null else v_now+make_interval(secs=>seconds)end where id=b.id';
 replacement:='deadline=case when seconds=0 then null else b.deadline+make_interval(secs=>seconds)end where id=b.id';
 if position(original in definition)=0 then raise exception 'Battle round timer prerequisite changed';end if;
 definition:=replace(definition,original,replacement);
 original:=' if p_action=''answer'' then';
 replacement:=$expiry$
 if b.state in('PLAYING','ROUND_RESULTS')and b.match_deadline is not null then
  if b.match_deadline<=v_now then
   update public.battles set state='FINISHED',round=question_count,deadline=null,revision=revision+1 where id=b.id returning * into b;
  elsif b.state='PLAYING'and(b.deadline is null or b.deadline>b.match_deadline)then
   update public.battles set deadline=match_deadline where id=b.id returning * into b;
  end if;
 end if;
 if p_action='answer' then$expiry$;
 if position(original in definition)=0 then raise exception 'Battle answer prerequisite changed';end if;
 definition:=replace(definition,original,replacement);
 -- Clamp transitions to the whole-match budget as well. Untimed questions can
 -- still have a total budget. Existing matches retain total_seconds=0.
 original:='deadline=case when round=question_count or seconds=0 then null else v_now+make_interval(secs=>seconds)end';
 replacement:='deadline=case when round=question_count then null when seconds=0 then match_deadline else least(v_now+make_interval(secs=>seconds),match_deadline)end';
 if position(original in definition)=0 then raise exception 'Battle next round prerequisite changed';end if;
 definition:=replace(definition,original,replacement);
 execute definition;

 select pg_get_functiondef('public.battle_lobby_control(text,jsonb)'::regprocedure)into definition;
 original:='k not in(''id'',''questionCount'',''seconds'',''public'')';
 if position(original in definition)=0 then raise exception 'Battle settings prerequisite changed';end if;
 definition:=replace(definition,original,'k not in(''id'',''questionCount'',''seconds'',''public'',''totalSeconds'')');
 original:='seconds=coalesce((p_data->>''seconds'')::integer,seconds),public=';
 if position(original in definition)=0 then raise exception 'Battle settings update prerequisite changed';end if;
 definition:=replace(definition,original,'seconds=coalesce((p_data->>''seconds'')::integer,seconds),total_seconds=coalesce((p_data->>''totalSeconds'')::integer,total_seconds),public=');
 execute definition;
end;$migration$;
commit;
