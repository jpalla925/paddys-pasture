drop table if exists public.horses cascade;

create table public.horses (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,

  -- Admin fills these (the barn's operational facts)
  name          text not null,
  stall_number  text,
  hay           text,
  grain         text,
  pasture       text,
  turnout       text,

  -- Boarder fills these (what only the owner knows)
  photo_url     text,
  sex           text,
  age           text,
  color         text,
  supplements   text,
  medications   text,
  vet_info      text,
  farrier_info  text,
  emergency_contacts text,
  behavior_notes     text,
  boarding_date      date,

  created_at    timestamptz not null default now()
);

alter table public.horses enable row level security;

-- Admin and staff can see every horse
create policy "staff and admin read all horses"
on public.horses for select
using ( public.current_user_role() in ('admin', 'staff') );

-- Boarders can see only their own horses
create policy "boarders read own horses"
on public.horses for select
using ( owner_id = auth.uid() );

-- Admin can create and fully edit any horse
create policy "admin insert horses"
on public.horses for insert
with check ( public.current_user_role() = 'admin' );

create policy "admin update horses"
on public.horses for update
using ( public.current_user_role() = 'admin' );

-- Staff can update horses (for care info), but not create or delete
create policy "staff update horses"
on public.horses for update
using ( public.current_user_role() = 'staff' );

-- Boarders can update only their own horse
create policy "boarders update own horses"
on public.horses for update
using ( owner_id = auth.uid() );