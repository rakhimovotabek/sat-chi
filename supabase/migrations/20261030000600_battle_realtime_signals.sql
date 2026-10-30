begin;
-- Realtime publishes only a room identity and revision signal. Question keys,
-- answer rows, codes and student identities never enter this publication.
create table public.battle_signals (
 battle_id uuid primary key references public.battles on delete restrict,
 revision bigint not null default 1, changed_at timestamptz not null default now()
);
alter table public.battle_signals enable row level security;
revoke all on public.battle_signals from public,anon,authenticated;
grant select on public.battle_signals to authenticated;
grant all on public.battle_signals to service_role;
create function public.is_battle_member(p_battle uuid)returns boolean language sql stable security definer set search_path='' as $$
 select public.is_active_user()and exists(select 1 from public.battle_members m where m.battle_id=p_battle and m.user_id=auth.uid());
$$;
revoke all on function public.is_battle_member(uuid)from public,anon;
grant execute on function public.is_battle_member(uuid)to authenticated,service_role;
create policy battle_signal_members on public.battle_signals for select to authenticated using(public.is_battle_member(battle_id));
create function public.signal_battle_changed()returns trigger language plpgsql security definer set search_path='' as $$
declare bid uuid;begin
 if tg_table_name='battles'then bid:=new.id;elsif tg_op='DELETE'then bid:=old.battle_id;else bid:=new.battle_id;end if;
 insert into public.battle_signals(battle_id)values(bid)on conflict(battle_id)do update set revision=battle_signals.revision+1,changed_at=clock_timestamp();
 return null;
end;$$;
revoke all on function public.signal_battle_changed()from public,anon,authenticated;
create trigger battle_room_signal after insert or update on public.battles for each row execute function public.signal_battle_changed();
create trigger battle_member_signal after insert or update or delete on public.battle_members for each row execute function public.signal_battle_changed();
insert into public.battle_signals(battle_id)select id from public.battles;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')then
 alter publication supabase_realtime add table public.battle_signals;
 end if;
end;$$;
-- Room signals in a full arena can cause more refreshes than ordinary answers.
do $$declare definition text;begin
 select pg_get_functiondef('public.battle_action(text,jsonb)'::regprocedure)into definition;
 definition:=replace(definition, 'when p_action=''join'' then 30 else 120', 'when p_action=''join'' then 30 when p_action=''state'' then 600 else 120');
 execute definition;
end;$$;
commit;
