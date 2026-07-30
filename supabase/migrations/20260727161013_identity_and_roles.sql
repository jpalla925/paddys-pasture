-- Clean slate for identity objects (clears any partial prototype leftovers)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.current_user_role() cascade;
drop function if exists public.protect_role_column() cascade;
drop table if exists public.profiles cascade;
drop type if exists public.user_role cascade;

-- Roles
create type public.user_role as enum ('admin', 'staff', 'boarder');

-- Profiles: one per login
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  phone      text,
  email      text,
  role       public.user_role not null default 'boarder',
  created_at timestamptz not null default now()
);

-- Auto-create a profile when someone signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'boarder');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lock down profiles, then grant access rule by rule
alter table public.profiles enable row level security;

-- Helper: what role is the current user?
create function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Access rules
create policy "read own profile"
on public.profiles for select
using ( id = auth.uid() );

create policy "staff and admin read all"
on public.profiles for select
using ( public.current_user_role() in ('admin', 'staff') );

create policy "update own profile"
on public.profiles for update
using ( id = auth.uid() );

create policy "admin update any"
on public.profiles for update
using ( public.current_user_role() = 'admin' );

-- Stop non-admins from changing roles
create function public.protect_role_column()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and public.current_user_role() <> 'admin' then
    raise exception 'Only admins can change roles';
  end if;
  return new;
end;
$$;

create trigger enforce_role_protection
  before update on public.profiles
  for each row execute function public.protect_role_column();