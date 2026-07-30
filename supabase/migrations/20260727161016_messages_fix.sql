drop table if exists public.messages cascade;

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  boarder_id uuid not null references public.profiles(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "boarders read own messages"
on public.messages for select
using ( boarder_id = auth.uid() );

create policy "boarders send own messages"
on public.messages for insert
with check ( boarder_id = auth.uid() and sender_id = auth.uid() );

create policy "staff read all messages"
on public.messages for select
using ( public.current_user_role() in ('admin', 'staff') );

create policy "staff send messages"
on public.messages for insert
with check ( public.current_user_role() in ('admin', 'staff') and sender_id = auth.uid() );