begin;
create function public.battle_quick_filters(p_category text,p_filters jsonb)returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(e.key,case when jsonb_typeof(e.value)='array'then
  (select jsonb_agg(item order by item::text)from(select distinct item from jsonb_array_elements(e.value)a(item))items)
  else e.value end),'{}')||case when p_category='Vocabulary'then jsonb_build_object('mode',coalesce(nullif(p_filters->>'mode',''),'meaning-rush'))else '{}'::jsonb end
 from jsonb_each(p_filters)e where e.value not in('null'::jsonb,'""'::jsonb,'[]'::jsonb);
$$;
revoke all on function public.battle_quick_filters(text,jsonb)from public,anon,authenticated;

create function public.battle_quick_match(p_data jsonb)returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); configuration jsonb; v_filters jsonb; room public.battles; v_now timestamptz:=clock_timestamp(); hits integer;
begin
 if uid is null or not public.is_active_user()then raise exception 'Active account required'using errcode='42501';end if;
 if jsonb_typeof(p_data)is distinct from 'object'or octet_length(p_data::text)>8000 or exists(select 1 from jsonb_object_keys(p_data)k where k not in('category','capacity','teamSize','questionCount','seconds','totalSeconds','public','filters'))then raise exception 'Invalid Quick Match settings';end if;
 if coalesce((p_data->>'capacity')::integer,2)<>2 or coalesce((p_data->>'teamSize')::integer,0)<>0 then raise exception 'Quick Match supports 1 vs 1';end if;
 if jsonb_typeof(coalesce(p_data->'filters','{}'))is distinct from 'object'then raise exception 'Invalid Quick Match filters';end if;
 v_filters:=public.battle_quick_filters(p_data->>'category',coalesce(p_data->'filters','{}'));
 configuration:=jsonb_build_object('category',p_data->>'category','capacity',2,'teamSize',0,'public',true,
  'questionCount',(p_data->>'questionCount')::integer,'seconds',(p_data->>'seconds')::integer,
  'totalSeconds',coalesce((p_data->>'totalSeconds')::integer,0),'filters',v_filters);
 insert into public.battle_rate_limits values(uid,'quick_match',date_trunc('minute',v_now),1)
 on conflict(user_id,action)do update set window_start=excluded.window_start,hits=case when battle_rate_limits.window_start=excluded.window_start then battle_rate_limits.hits+1 else 1 end returning battle_rate_limits.hits into hits;
 if hits>30 then raise exception 'Too many Quick Match requests; wait a minute';end if;
 -- Same configuration shares one admission lock: simultaneous requests cannot
 -- both miss the waiting lobby and create separate rooms unnecessarily.
 perform pg_advisory_xact_lock(hashtextextended('battle-quick:'||configuration::text,0));
 select b.* into room from public.battles b where b.public and b.state='LOBBY'and b.expires_at>v_now
  and b.capacity=2 and b.team_size=0 and b.category=configuration->>'category'
  and b.question_count=(configuration->>'questionCount')::integer and b.seconds=(configuration->>'seconds')::integer
  and b.total_seconds=(configuration->>'totalSeconds')::integer and public.battle_quick_filters(b.category,b.filters)=v_filters
  and exists(select 1 from public.battle_members m where m.battle_id=b.id and m.user_id=uid)
  order by b.created_at desc limit 1 for update of b;
 if found then return public.battle_action('state',jsonb_build_object('id',room.id));end if;
 select b.* into room from public.battles b where b.public and b.state='LOBBY'and b.expires_at>v_now
  and b.capacity=2 and b.team_size=0 and b.category=configuration->>'category'
  and b.question_count=(configuration->>'questionCount')::integer and b.seconds=(configuration->>'seconds')::integer
  and b.total_seconds=(configuration->>'totalSeconds')::integer and public.battle_quick_filters(b.category,b.filters)=v_filters
  and(select count(*)from public.battle_members m where m.battle_id=b.id)<2
  and not exists(select 1 from public.battle_exclusions x where x.battle_id=b.id and x.user_id=uid)
  order by b.created_at limit 1 for update of b skip locked;
 if found then return public.battle_action('join',jsonb_build_object('id',room.id));end if;
 return public.battle_action('create',configuration);
end;$$;
revoke all on function public.battle_quick_match(jsonb)from public,anon;
grant execute on function public.battle_quick_match(jsonb)to authenticated;
commit;
