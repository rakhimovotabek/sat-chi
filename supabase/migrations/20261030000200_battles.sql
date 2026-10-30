begin;
-- Battle keys and answers are never exposed through table SELECT or Realtime.
create table public.battles (
 id uuid primary key default gen_random_uuid(), host_id uuid not null references public.profiles,
 code text unique not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)), public boolean not null default false,
 state text not null default 'LOBBY' check(state in('LOBBY','COUNTDOWN','PLAYING','ROUND_RESULTS','FINISHED','CANCELLED','EXPIRED')),
 category text not null check(category in('Math','Reading & Writing','Mixed')),
 capacity integer not null check(capacity between 2 and 20), team_size integer not null default 0 check(team_size between 0 and 10),
 question_count integer not null check(question_count between 1 and 50), seconds integer not null check(seconds=0 or seconds between 30 and 600),
 filters jsonb not null default '{}', round integer not null default 0, deadline timestamptz,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '2 hours', revision integer not null default 0
);
create table public.battle_members (
 battle_id uuid not null references public.battles on delete restrict, user_id uuid not null references public.profiles,
 seat integer not null check(seat between 1 and 20), team integer not null, ready boolean not null default false,
 last_seen timestamptz not null default now(), score integer not null default 0, primary key(battle_id,user_id),unique(battle_id,seat)
);
create table public.battle_rounds (
 battle_id uuid not null references public.battles on delete restrict, round integer not null,
 question jsonb not null, correct_answer integer, accepted_answers jsonb, explanation text,
 primary key(battle_id,round)
);
create table public.battle_answers (
 battle_id uuid not null, round integer not null, user_id uuid not null, response text not null,
 correct boolean not null, points integer not null, answered_at timestamptz not null default now(),
 primary key(battle_id,round,user_id),foreign key(battle_id,round)references public.battle_rounds,
 foreign key(battle_id,user_id)references public.battle_members
);
create index battle_public_lobbies on public.battles(created_at desc)where public and state='LOBBY';
create index battle_member_history on public.battle_members(user_id,battle_id);
create table public.battle_rate_limits(user_id uuid not null, action text not null, window_start timestamptz not null, hits integer not null,primary key(user_id,action));
do $$declare t text;begin foreach t in array array['battles','battle_members','battle_rounds','battle_answers','battle_rate_limits']loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;end;$$;
-- A single transactional entrypoint locks each room before join/start/answer/advance.
create function public.battle_action(p_action text,p_data jsonb default '{}')returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); b public.battles; m public.battle_members; v_round public.battle_rounds;
 bid uuid; v_question record; n integer; v_seat integer; correct boolean; points integer; response text; v_now timestamptz:=clock_timestamp(); hits integer;
begin
 if uid is null or not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 if octet_length(p_data::text)>8000 then raise exception 'Request too large';end if;
 insert into public.battle_rate_limits values(uid,p_action,date_trunc('minute',v_now),1)on conflict(user_id,action)do update set window_start=excluded.window_start,hits=case when battle_rate_limits.window_start=excluded.window_start then battle_rate_limits.hits+1 else 1 end returning battle_rate_limits.hits into hits;
 if hits>(case when p_action='create' then 5 when p_action='join' then 30 else 120 end) then raise exception 'Too many requests; wait a minute';end if;
 if p_action='list' then return jsonb_build_object('lobbies',coalesce((select jsonb_agg(to_jsonb(l))from(select id,category,capacity,question_count,seconds,created_at,(select count(*)from public.battle_members where battle_id=lobby.id)players from public.battles lobby where lobby.public and lobby.state='LOBBY'and lobby.expires_at>v_now order by created_at desc limit 30)l),'[]'),'history',coalesce((select jsonb_agg(to_jsonb(h))from(select lobby.id,lobby.category,lobby.state,bm.score,lobby.created_at from public.battles lobby join public.battle_members bm on bm.battle_id=lobby.id where bm.user_id=uid order by lobby.created_at desc limit 30)h),'[]'));end if;
 if p_action='create' then
 insert into public.battles(host_id,public,category,capacity,team_size,question_count,seconds,filters)values(uid,coalesce((p_data->>'public')::boolean,false),p_data->>'category',(p_data->>'capacity')::integer,coalesce((p_data->>'teamSize')::integer,0),(p_data->>'questionCount')::integer,(p_data->>'seconds')::integer,coalesce(p_data->'filters','{}'))returning * into b;
 if b.team_size>0 and b.capacity<>b.team_size*2 then raise exception 'Team games require two equally sized teams';end if;
 insert into public.battle_members(battle_id,user_id,seat,team)values(b.id,uid,1,case when b.team_size=0 then 1 else 1 end);
 else
 if p_data ? 'code' then select id into bid from public.battles where code=upper(p_data->>'code');else bid:=(p_data->>'id')::uuid;end if;
 select * into b from public.battles where id=bid for update;
 if not found then raise exception 'Battle not found';end if;
 v_now:=clock_timestamp();
 select * into m from public.battle_members where battle_id=b.id and user_id=uid;
 if p_action='join' then
 if m.user_id is null then
 if not b.public and b.code is distinct from upper(p_data->>'code')then raise exception 'Invitation code required';end if;
 if b.state<>'LOBBY'or b.expires_at<=v_now then raise exception 'Lobby is closed';end if;
 select s into v_seat from generate_series(1,b.capacity)s where not exists(select 1 from public.battle_members where battle_id=b.id and seat=s)order by s limit 1;
 if v_seat is null then raise exception 'Lobby is full';end if;
 insert into public.battle_members(battle_id,user_id,seat,team)values(b.id,uid,v_seat,case when b.team_size=0 then v_seat else (v_seat-1)%2+1 end);
 end if;
 elsif m.user_id is null then raise exception 'Join this battle first'using errcode='42501';end if;
 end if;
 if b.expires_at<=v_now and b.state not in('FINISHED','CANCELLED')then update public.battles set state='EXPIRED',revision=revision+1 where id=b.id returning * into b;end if;
 update public.battle_members set last_seen=v_now where battle_id=b.id and user_id=uid and last_seen<v_now-interval '15 seconds';
 if p_action='ready' then
 if b.state<>'LOBBY'then raise exception 'Battle already started';end if;
 update public.battle_members set ready=coalesce((p_data->>'ready')::boolean,true)where battle_id=b.id and user_id=uid;
 elsif p_action='leave' then
 if b.state='LOBBY'then
 delete from public.battle_members where battle_id=b.id and user_id=uid;
 if b.host_id=uid then
 update public.battles set host_id=coalesce((select user_id from public.battle_members where battle_id=b.id order by seat limit 1),uid),state=case when exists(select 1 from public.battle_members where battle_id=b.id)then'LOBBY'else'CANCELLED'end where id=b.id;
 end if;
 return jsonb_build_object('left',true);
 else raise exception 'Battle in progress; reconnect to resume';end if;
 elsif p_action='cancel' then
 if b.host_id<>uid or b.state<>'LOBBY'then raise exception 'Only the host can cancel a lobby';end if;
 update public.battles set state='CANCELLED'where id=b.id returning * into b;
 elsif p_action='start' then
 if b.host_id<>uid or b.state<>'LOBBY'then raise exception 'Only the host can start a lobby';end if;
 select count(*)into n from public.battle_members where battle_id=b.id;
 if n<2 or exists(select 1 from public.battle_members where battle_id=b.id and not ready)or(b.team_size>0 and n<>b.capacity)then raise exception 'All players must be ready; team games require full teams';end if;
 n:=0;
 for v_question in select qs.*,a.correct_answer,a.explanation,o.accepted_answers from public.bank_candidates(b.filters||case when b.category='Mixed'then'{}'::jsonb else jsonb_build_object('section',b.category)end)qs join public.question_answers a on a.question_id=qs.id left join public.book_open_answers o on o.question_id=qs.id order by random()limit b.question_count loop
 n:=n+1;
 insert into public.battle_rounds values(b.id,n,to_jsonb(v_question)-'correct_answer'-'explanation'-'accepted_answers',v_question.correct_answer,v_question.accepted_answers,v_question.explanation);
 end loop;
 if n<>b.question_count then raise exception 'Not enough eligible published questions for these settings';end if;
 -- Even admins hosting a battle cannot introduce unpublished content.
 if exists(select 1 from public.battle_rounds r join public.questions q on q.id=(r.question->>'id')::uuid join public.book_topics t on t.id=q.topic_id join public.books bk on bk.id=t.book_id where r.battle_id=b.id and (not bk.published or not public.question_approved_for_students(q.id)))then raise exception 'Published content required';end if;
 update public.battles set state='COUNTDOWN',round=1,deadline=v_now+interval '5 seconds'where id=b.id returning * into b;
 end if;
 -- Every client refresh repairs elapsed transitions, using only server time.
 if b.state='COUNTDOWN'and b.deadline<=v_now then update public.battles set state='PLAYING',deadline=case when seconds=0 then null else v_now+make_interval(secs=>seconds)end where id=b.id returning * into b;end if;
 if p_action='answer' then
 if exists(select 1 from public.battle_answers where battle_id=b.id and round=(p_data->>'round')::integer and user_id=uid)then null;
 else
 if b.state<>'PLAYING'or b.round<>(p_data->>'round')::integer or(b.deadline is not null and b.deadline<=v_now)then raise exception 'Round is closed';end if;
 response:=p_data->>'response';if response is null or length(response)>200 then raise exception 'Invalid response';end if;
 select * into v_round from public.battle_rounds where battle_id=b.id and round=b.round;
 if v_round.question->>'question_type'='open'then correct:=exists(select 1 from jsonb_array_elements_text(v_round.accepted_answers)a where public.package_numeric_value(a)=public.package_numeric_value(response));
 else correct:=response=v_round.correct_answer::text;end if;
 points:=case when correct then 100 else 0 end;
 insert into public.battle_answers(battle_id,round,user_id,response,correct,points)values(b.id,b.round,uid,response,coalesce(correct,false),points);
 update public.battle_members set score=score+points where battle_id=b.id and user_id=uid;
 end if;
 end if;
 if b.state='PLAYING'and((b.deadline is not null and b.deadline<=v_now)or(select count(*)from public.battle_answers where battle_id=b.id and round=b.round)=(select count(*)from public.battle_members where battle_id=b.id))then
 update public.battles set state='ROUND_RESULTS',deadline=v_now+interval '5 seconds'where id=b.id returning * into b;
 elsif b.state='ROUND_RESULTS'and b.deadline<=v_now then
 update public.battles set state=case when round=question_count then'FINISHED'else'PLAYING'end,round=case when round=question_count then round else round+1 end,deadline=case when round=question_count or seconds=0 then null else v_now+make_interval(secs=>seconds)end where id=b.id returning * into b;
 end if;
 if p_action not in('state','list','create','join','leave','cancel','start','ready','answer')then raise exception 'Unknown battle action';end if;
 update public.battles set revision=revision+1 where id=b.id and p_action<>'state';
 select * into v_round from public.battle_rounds where battle_id=b.id and round=b.round;
 return (to_jsonb(b)-'filters')||jsonb_build_object('serverNow',v_now,'me',uid,
 'members',(select jsonb_agg(jsonb_build_object('user_id',user_id,'seat',seat,'team',team,'ready',ready,'score',score,'last_seen',last_seen)order by score desc,seat)from public.battle_members where battle_id=b.id),
 'question',case when b.state in('PLAYING','ROUND_RESULTS','FINISHED')then v_round.question else null end,
 'submitted',exists(select 1 from public.battle_answers where battle_id=b.id and round=b.round and user_id=uid),
 'review',case when b.state in('ROUND_RESULTS','FINISHED')then jsonb_build_object('answer',v_round.correct_answer,'acceptedAnswers',v_round.accepted_answers,'explanation',v_round.explanation)else null end,
 'history',case when b.state='FINISHED'then(select jsonb_agg(jsonb_build_object('round',r.round,'question',r.question,'answer',r.correct_answer,'acceptedAnswers',r.accepted_answers,'explanation',r.explanation,'response',a.response,'correct',coalesce(a.correct,false),'points',coalesce(a.points,0))order by r.round)from public.battle_rounds r left join public.battle_answers a on a.battle_id=r.battle_id and a.round=r.round and a.user_id=uid where r.battle_id=b.id)else null end);
end;$$;
revoke all on function public.battle_action(text,jsonb)from public,anon;
grant execute on function public.battle_action(text,jsonb)to authenticated;
commit;
