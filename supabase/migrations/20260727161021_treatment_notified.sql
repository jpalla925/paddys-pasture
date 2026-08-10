create table public.treatment_notified (
  id         uuid primary key default gen_random_uuid(),
  horse_id   uuid not null references public.horses(id) on delete cascade,
  notify_date date not null default current_date,
  notified_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (horse_id, notify_date)
);

alter table public.treatment_notified enable row level security;

create policy "staff manage notified"
on public.treatment_notified for all
using ( public.current_user_role() in ('admin', 'staff') )
with check ( public.current_user_role() in ('admin', 'staff') );