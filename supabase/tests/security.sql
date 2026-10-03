-- Run against a disposable LOCAL Supabase database with ON_ERROR_STOP enabled.
-- Fixtures and mutations are rolled back. No pgTAP dependency is required.
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-0000-0000-000000000001', 'rls-admin@example.test', '{"role":"admin"}'),
  ('c0000000-0000-0000-0000-000000000002', 'rls-student@example.test', '{"role":"admin","active":false,"username":"injected"}'),
  ('c0000000-0000-0000-0000-000000000003', 'rls-other@example.test', '{}'),
  ('c0000000-0000-0000-0000-000000000004', 'rls-inactive-admin@example.test', '{}');

do $$ begin
  if not exists (select 1 from public.profiles where id = 'c0000000-0000-0000-0000-000000000002'
    and role = 'student' and active and username is null) then
    raise exception 'Untrusted metadata changed protected profile fields';
  end if;
end $$;

update public.profiles set role = 'admin' where id in ('c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004');
update public.profiles set active = false where id = 'c0000000-0000-0000-0000-000000000004';
insert into public.groups (id, name) values
  ('d0000000-0000-0000-0000-000000000001', 'Security test group one'),
  ('d0000000-0000-0000-0000-000000000002', 'Security test group two');
insert into public.group_members (group_id, student_id) values
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);

do $$ declare changed integer; begin
  if public.is_admin() then raise exception 'Student reported as admin'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Student can read other profiles'; end if;
  if (select count(*) from public.groups) <> 1 then raise exception 'Group reads are not membership-scoped'; end if;
  if (select count(*) from public.group_members) <> 1 then raise exception 'Student can read other memberships'; end if;
  update public.profiles set display_name = 'Safe edit', username = 'rls_safe_edit' where id = auth.uid();
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Safe profile edit failed'; end if;
  begin
    update public.profiles set role = 'admin' where id = auth.uid();
    raise exception 'Role escalation was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set active = false where id = auth.uid();
    raise exception 'Account status edit was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set id = 'c0000000-0000-0000-0000-000000000099' where id = auth.uid();
    raise exception 'Identity edit was allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.profiles set created_at = now() where id = auth.uid();
    raise exception 'Timestamp edit was allowed';
  exception when insufficient_privilege then null; end;
  update public.profiles set display_name = 'Intrusion' where id = 'c0000000-0000-0000-0000-000000000003';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Student edited another profile'; end if;
  begin
    insert into public.profiles (id) values ('c0000000-0000-0000-0000-000000000099');
    raise exception 'Student inserted a profile';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.profiles where id = auth.uid();
    raise exception 'Student deleted a profile';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.groups (name) values ('Unauthorized');
    raise exception 'Student created a group';
  exception when insufficient_privilege then null; end;
  update public.groups set name = 'Unauthorized';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Student edited groups'; end if;
  delete from public.groups;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Student deleted groups'; end if;
  begin
    insert into public.group_members (group_id, student_id)
    values ('d0000000-0000-0000-0000-000000000002', auth.uid());
    raise exception 'Student added a membership';
  exception when insufficient_privilege then null; end;
  update public.group_members set group_id = 'd0000000-0000-0000-0000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Student edited memberships'; end if;
  delete from public.group_members;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Student deleted memberships'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000001', true);
do $$ declare changed integer; test_group uuid; begin
  if not public.is_admin() then raise exception 'Active admin check failed'; end if;
  if (select count(*) from public.profiles where id::text like 'c0000000-%') <> 4 then raise exception 'Admin cannot read all test profiles'; end if;
  if (select count(*) from public.group_members where student_id::text like 'c0000000-%') <> 3 then raise exception 'Admin cannot read memberships'; end if;
  insert into public.groups (name) values ('Admin-created group') returning id into test_group;
  update public.groups set name = 'Admin-edited group' where id = test_group;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Admin group update failed'; end if;
  insert into public.group_members (group_id, student_id) values (test_group, 'c0000000-0000-0000-0000-000000000002');
  begin
    insert into public.group_members (group_id, student_id) values (test_group, 'c0000000-0000-0000-0000-000000000002');
    raise exception 'Duplicate membership was allowed';
  exception when unique_violation then null; end;
  begin
    insert into public.group_members (group_id, student_id) values (test_group, auth.uid());
    raise exception 'Admin profile accepted as student membership';
  exception when check_violation then null; end;
  delete from public.group_members where group_id = test_group;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Admin membership deletion failed'; end if;
  delete from public.groups where id = test_group;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Admin group deletion failed'; end if;
  begin
    update public.profiles set role = 'admin' where id = 'c0000000-0000-0000-0000-000000000002';
    raise exception 'Browser admin changed protected role';
  exception when insufficient_privilege then null; end;
  update public.profiles set active = false where id = 'c0000000-0000-0000-0000-000000000002';
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Admin cannot manage student status'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000002', true);
do $$ declare changed integer; begin
  if (select count(*) from public.profiles) <> 1 then raise exception 'Inactive student cannot read own status'; end if;
  if exists(select 1 from public.groups) or exists(select 1 from public.group_members) then raise exception 'Inactive student has group access'; end if;
  update public.profiles set display_name = 'Inactive edit' where id = auth.uid();
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Inactive student edited profile'; end if;
end $$;

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-000000000004', true);
do $$ begin
  if public.is_admin() then raise exception 'Inactive admin retained privileges'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'Inactive admin can read other profiles'; end if;
  begin
    insert into public.groups (name) values ('Inactive admin group');
    raise exception 'Inactive admin created a group';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$ begin
  begin perform 1 from public.profiles; raise exception 'Anonymous profile access';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.groups; raise exception 'Anonymous group access';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.group_members; raise exception 'Anonymous membership access';
  exception when insufficient_privilege then null; end;
  begin perform public.is_admin(); raise exception 'Anonymous helper execution';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
delete from auth.users where id = 'c0000000-0000-0000-0000-000000000002';
do $$ begin
  if exists(select 1 from public.profiles where id = 'c0000000-0000-0000-0000-000000000002')
    or exists(select 1 from public.group_members where student_id = 'c0000000-0000-0000-0000-000000000002') then
    raise exception 'Auth deletion did not cascade';
  end if;
end $$;

rollback;
