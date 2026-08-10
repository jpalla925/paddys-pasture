-- Daily treatment checklist log: one row per horse + task + day.

create table public.treatment_log (
  id          uuid primary key default gen_random_uuid(),
  horse_id    uuid not null references public.horses(id) on delete cascade,
  task        text not null,               -- e.g. 'Fed AM'
  log_date    date not null default current_date,
  status      text not null default 'done', -- 'done' or 'na'
  marked_by   uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  unique (horse_id, task, log_date)         -- one record per horse/task/day
);

alter table public.treatment_log enable row level security;

-- Staff and admin can see and manage the checklist
create policy "staff manage treatment log"
on public.treatment_log for all
using ( public.current_user_role() in ('admin', 'staff') )
with check ( public.current_user_role() in ('admin', 'staff') );