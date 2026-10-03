begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('admin', 'student')),
  display_name text check (char_length(display_name) <= 120),
  username text unique check (username ~ '^[a-z0-9_]{3,32}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint group_members_group_student_key unique (group_id, student_id)
);

create index group_members_student_id_idx on public.group_members(student_id);
create index profiles_role_idx on public.profiles(role);

-- Fixed search paths and a trusted owner prevent object shadowing and RLS recursion.
create function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;

create function public.is_active_user()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and active
  );
$$;

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- User-editable metadata is never a source of role, active, id, or username.
  insert into public.profiles (id, role, display_name, active)
  values (
    new.id, 'student',
    nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 120), ''),
    true
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Include Auth accounts created before the migration. No automatic admin assignment.
insert into public.profiles (id, role, display_name, active)
select id, 'student', nullif(left(btrim(raw_user_meta_data ->> 'display_name'), 120), ''), true
from auth.users
on conflict (id) do nothing;

-- Column privileges block identity/role changes, including for browser admins.
-- This invoker trigger adds field-level protection for active even on an own-row update.
create function public.guard_profile_update()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.id is distinct from old.id
      or new.role is distinct from old.role
      or new.created_at is distinct from old.created_at then
      raise exception 'Profile identity and role are server-managed' using errcode = '42501';
    end if;
    if new.active is distinct from old.active and not public.is_admin() then
      raise exception 'Only active admins may change account status' using errcode = '42501';
    end if;
    if old.role = 'admin' and new.active is distinct from old.active then
      raise exception 'Admin account status is server-managed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_profile_fields before update on public.profiles
for each row execute function public.guard_profile_update();

create function public.require_student_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = new.student_id and role = 'student'
  ) then
    raise exception 'Only student profiles can join groups' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_student_membership
before insert or update on public.group_members
for each row execute function public.require_student_membership();

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- Reset Supabase default grants explicitly. There is no anonymous data access.
revoke all on public.profiles, public.groups, public.group_members from public, anon, authenticated;
grant usage on schema public to authenticated, service_role;
grant select on public.profiles to authenticated;
grant update (display_name, username, active) on public.profiles to authenticated;
grant select, insert, update, delete on public.groups, public.group_members to authenticated;
grant all on public.profiles, public.groups, public.group_members to service_role;

revoke all on function public.is_admin(), public.is_active_user(),
  public.handle_new_user(), public.guard_profile_update(), public.require_student_membership() from public, anon, authenticated;
grant execute on function public.is_admin(), public.is_active_user() to authenticated, service_role;

-- Inactive users can read their own profile to explain why access is disabled.
create policy profiles_read on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_update on public.profiles for update to authenticated
using (
  (id = (select auth.uid()) and active)
  or ((select public.is_admin()) and role = 'student')
)
with check (
  (id = (select auth.uid()) and active)
  or ((select public.is_admin()) and role = 'student')
);

-- Profile insertion/deletion is exclusively through Auth and the server-side function.
create policy groups_read on public.groups for select to authenticated
using (
  (select public.is_admin())
  or ((select public.is_active_user()) and exists (
    select 1 from public.group_members
    where group_id = groups.id and student_id = (select auth.uid())
  ))
);
create policy groups_admin_insert on public.groups for insert to authenticated
with check ((select public.is_admin()));
create policy groups_admin_update on public.groups for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy groups_admin_delete on public.groups for delete to authenticated
using ((select public.is_admin()));

create policy group_members_read on public.group_members for select to authenticated
using (
  (select public.is_admin())
  or (student_id = (select auth.uid()) and (select public.is_active_user()))
);
create policy group_members_admin_insert on public.group_members for insert to authenticated
with check ((select public.is_admin()));
create policy group_members_admin_update on public.group_members for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy group_members_admin_delete on public.group_members for delete to authenticated
using ((select public.is_admin()));

commit;
