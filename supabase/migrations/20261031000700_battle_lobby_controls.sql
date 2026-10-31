begin;
-- Kicks apply to this lobby only. Preserve all existing match/attempt identities.
create table public.battle_exclusions (
 battle_id uuid not null references public.battles on delete restrict,
 user_id uuid not null references public.profiles on delete restrict,
 created_at timestamptz not null default now(), primary key(battle_id,user_id)
);
alter table public.battle_exclusions enable row level security;
revoke all on public.battle_exclusions from public,anon,authenticated;
grant all on public.battle_exclusions to service_role;

create function public.battle_lobby_control(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.battles; first_member public.battle_members; second_member public.battle_members; n integer;
begin
 if auth.uid()is null or not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 if jsonb_typeof(p_data)is distinct from 'object'or octet_length(p_data::text)>1000 then raise exception 'Invalid lobby request';end if;
 select * into b from public.battles where id=(p_data->>'id')::uuid for update;
 if not found then raise exception 'Battle not found';end if;
 if b.host_id<>auth.uid()then raise exception 'Only the host can manage the lobby'using errcode='42501';end if;
 if b.state<>'LOBBY'or b.expires_at<=clock_timestamp()then raise exception 'Lobby is closed';end if;
 -- Reuse the existing authenticated limiter and membership/heartbeat checks.
 perform public.battle_action('state',jsonb_build_object('id',b.id));
 if p_action='swap' then
  if b.team_size=0 then raise exception 'This battle has no teams';end if;
  select * into first_member from public.battle_members where battle_id=b.id and user_id=(p_data->>'first')::uuid;
  select * into second_member from public.battle_members where battle_id=b.id and user_id=(p_data->>'second')::uuid;
  if first_member.user_id is null or second_member.user_id is null or first_member.team=second_member.team then raise exception 'Select two players on different teams';end if;
  update public.battle_members set team=case when user_id=first_member.user_id then second_member.team else first_member.team end
   where battle_id=b.id and user_id in(first_member.user_id,second_member.user_id);
 elsif p_action='kick' then
  select * into first_member from public.battle_members where battle_id=b.id and user_id=(p_data->>'userId')::uuid;
  if first_member.user_id is null or first_member.user_id=b.host_id then raise exception 'Select another lobby member';end if;
  insert into public.battle_exclusions(battle_id,user_id)values(b.id,first_member.user_id)on conflict do nothing;
  delete from public.battle_members where battle_id=b.id and user_id=first_member.user_id;
 elsif p_action='settings' then
  if exists(select 1 from jsonb_object_keys(p_data)k where k not in('id','questionCount','seconds','public'))then raise exception 'Unsupported lobby setting';end if;
  update public.battles set question_count=coalesce((p_data->>'questionCount')::integer,question_count),
   seconds=coalesce((p_data->>'seconds')::integer,seconds),public=coalesce((p_data->>'public')::boolean,public)
   where id=b.id returning * into b;
  if b.category='Vocabulary' then
   select count(*)into n from public.battle_vocabulary_rounds_v2(b.filters,b.question_count);
  else
   select count(*)into n from public.bank_candidates(b.filters||case when b.category='Mixed'then'{}'::jsonb else jsonb_build_object('section',b.category)end)qs
    join public.book_topics topic on topic.id=qs.topic_id join public.books book on book.id=topic.book_id
    join public.question_answers key on key.question_id=qs.id left join public.book_open_answers open_key on open_key.question_id=qs.id
    where book.published and public.question_approved_for_students(qs.id)and(qs.question_type<>'open'or open_key.answer_format='numeric');
  end if;
  if n<b.question_count then raise exception 'Only % eligible questions; requested %',n,b.question_count;end if;
 else raise exception 'Unknown lobby control';end if;
 -- Everyone must acknowledge changed rules/teams/roster before starting.
 update public.battle_members set ready=false where battle_id=b.id;
 update public.battles set revision=revision+1 where id=b.id;
 return public.battle_action('state',jsonb_build_object('id',b.id));
end;$$;
revoke all on function public.battle_lobby_control(text,jsonb)from public,anon;
grant execute on function public.battle_lobby_control(text,jsonb)to authenticated;

do $migration$
declare definition text; original text:=$old$ if p_action='join' then$old$;
begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 if position(original in definition)=0 then raise exception 'Battle join prerequisite changed';end if;
 definition:=replace(definition,original,original||$new$
 if exists(select 1 from public.battle_exclusions where battle_id=b.id and user_id=uid)then raise exception 'The host removed you from this lobby'using errcode='42501';end if;
 $new$);
 if position('else (v_seat-1)%2+1 end' in definition)=0 then raise exception 'Battle team prerequisite changed';end if;
 definition:=replace(definition,'else (v_seat-1)%2+1 end',
  'else case when(select count(*)from public.battle_members where battle_id=b.id and team=1)<=(select count(*)from public.battle_members where battle_id=b.id and team=2)then 1 else 2 end end');
 execute definition;
end;$migration$;

-- Presence heartbeats must not fan out redundant snapshot requests to a room.
create or replace function public.signal_battle_changed()returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid;begin
 if tg_table_name='battle_members'and tg_op='UPDATE'then
  if (to_jsonb(new)-'last_seen')=(to_jsonb(old)-'last_seen')then return null;end if;
 end if;
 if tg_table_name='battles'then bid:=new.id;elsif tg_op='DELETE'then bid:=old.battle_id;else bid:=new.battle_id;end if;
 insert into public.battle_signals(battle_id)values(bid)on conflict(battle_id)do update set revision=battle_signals.revision+1,changed_at=clock_timestamp();
 return null;
end;$$;
revoke all on function public.signal_battle_changed()from public,anon,authenticated;
commit;
