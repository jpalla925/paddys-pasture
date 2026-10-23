-- SMS consent, part 2: make STOP sticky, and confirm web opt-ins by text.
--
-- 1. sms_opt_out_at becomes a SYSTEM-ONLY field. It records that a phone
--    number texted STOP (written by the sms-inbound Edge Function). No signed-in
--    person -- not the user, not an admin -- may change it through the API,
--    so a recorded STOP can't be undone from the browser console.
--
-- 2. When someone opts in on the web (sms_opt_in_at set), an AFTER UPDATE
--    trigger asks the notify-sms-opt-in Edge Function to send the opt-in
--    confirmation text promised in the A2P campaign. Same mechanism as
--    notify_boarder_message(): pg_net + the db_webhook_secret from Vault.

-- ---------------------------------------------------------------------------
-- 1. Guard for fields only the server may write.
--
-- Separate from protect_admin_profile_fields() because the rule is different:
-- that one says "admins only"; this one says "nobody signed in, admins
-- included".
--
-- How "the server" is told apart from "a person": auth.uid() is the id in the
-- caller's login token. A signed-in user (any role) has one. The SQL Editor and
-- Edge Functions using the service role have none, so auth.uid() is null and
-- the guard lets them through. That's how sms-inbound records a STOP, and how
-- you can fix a row by hand.
--
-- If a self-serve "stop texting me" toggle ships later, it should call a
-- SECURITY DEFINER function rather than loosening this guard.
-- ---------------------------------------------------------------------------
create or replace function public.protect_system_profile_fields()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.sms_opt_out_at is distinct from old.sms_opt_out_at then
      raise exception 'sms_opt_out_at is set only by the system when a STOP text is received';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_system_profile_fields on public.profiles;

create trigger enforce_system_profile_fields
  before update on public.profiles
  for each row execute function public.protect_system_profile_fields();

-- ---------------------------------------------------------------------------
-- 2. Opt-in confirmation text.
-- ---------------------------------------------------------------------------
create or replace function public.notify_sms_opt_in()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  secret text;
  -- Not a secret: the project ref is already public in the browser bundle.
  fn_url text := 'https://vbmsstjykoocnziwkchw.supabase.co/functions/v1/notify-sms-opt-in';
begin
  -- Never block a profile save over a missing secret; warn and skip.
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'db_webhook_secret';

  if secret is null then
    raise warning 'notify_sms_opt_in: db_webhook_secret not set in Vault; skipping confirmation text';
    return new;
  end if;

  -- Queued only; sent after this transaction commits (so the Edge Function
  -- sees receives_sms = true when it re-reads the profile).
  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('profile_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    )
  );

  return new;
end;
$$;

-- Fires only for a NEW opt-in that actually leaves the person able to receive
-- texts:
--   * "update of sms_opt_in_at" skips updates that don't mention the column;
--   * the WHEN clause skips saves that repeat the same value or clear it;
--   * new.receives_sms (the generated column, already computed for an AFTER
--     trigger) skips an opt-in that is older than a recorded STOP.
-- notify-sms-opt-in re-checks consent through sendSms() anyway.
drop trigger if exists sms_opt_in_confirm on public.profiles;

create trigger sms_opt_in_confirm
  after update of sms_opt_in_at on public.profiles
  for each row
  when (
    new.sms_opt_in_at is not null
    and new.sms_opt_in_at is distinct from old.sms_opt_in_at
    and new.receives_sms
  )
  execute function public.notify_sms_opt_in();

notify pgrst, 'reload schema';