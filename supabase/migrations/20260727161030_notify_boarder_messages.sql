-- Per-person routing flag for boarder-message SMS, plus one consolidated guard
-- for admin-only profile fields.
--
-- notify_boarder_messages = "should this person be texted when a boarder sends
-- a message?" It is the BARN's routing choice, separate from receives_sms,
-- which is the person's own consent. The notify-message Edge Function texts
-- only people where both are true.

-- ---------------------------------------------------------------------------
-- 1. The flag. Off for everyone; admins turn it on deliberately.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notify_boarder_messages boolean not null default false;

-- Only barn people can be routed boarder messages. A boarder with this on
-- would receive texts quoting OTHER boarders' messages. A same-row check
-- constraint makes that impossible, even for an admin by mistake.
-- (Side effect: to demote someone to boarder, turn their flag off first.)
alter table public.profiles
  drop constraint if exists notify_boarder_messages_barn_only;

alter table public.profiles
  add constraint notify_boarder_messages_barn_only
  check (not notify_boarder_messages or role in ('admin', 'staff'));

-- ---------------------------------------------------------------------------
-- 2. One guard for every admin-only profile field.
--
-- Replaces protect_role_column(), mirroring protect_horse_admin_fields():
-- one function holds the list, so the next admin-only field is a one-line add.
--
-- With no logged-in user (SQL Editor, Edge Functions using the service role),
-- current_user_role() is null, "null <> 'admin'" is null (not true), and the
-- guard doesn't fire. That's how roles and this flag are set by hand today.
-- ---------------------------------------------------------------------------
drop trigger if exists enforce_role_protection on public.profiles;
drop function if exists public.protect_role_column();

create or replace function public.protect_admin_profile_fields()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.current_user_role() <> 'admin' then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change roles';
    end if;

    if new.notify_boarder_messages is distinct from old.notify_boarder_messages then
      raise exception 'Only admins can change who is notified of boarder messages';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_admin_profile_fields on public.profiles;

create trigger enforce_admin_profile_fields
  before update on public.profiles
  for each row execute function public.protect_admin_profile_fields();