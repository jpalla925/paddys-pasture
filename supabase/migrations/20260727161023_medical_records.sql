create table public.medical_records (
  id         uuid primary key default gen_random_uuid(),
  horse_id   uuid not null references public.horses(id) on delete cascade,
  file_path  text not null,
  file_name  text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.medical_records enable row level security;

-- Boarders see their own horse's records; staff/admin see all
create policy "view medical record rows"
on public.medical_records for select
using (
  public.current_user_role() in ('admin', 'staff')
  or horse_id in (select id from public.horses where owner_id = auth.uid())
);

create policy "boarders add own horse records"
on public.medical_records for insert
with check (
  horse_id in (select id from public.horses where owner_id = auth.uid())
);