-- Email the barn (howdy@) the moment a boarder submits a horse.
--
-- "Submitting" = boarder_completed going false -> true. That happens either on
-- a fresh insert (boarder fills everything and submits at once) or on a later
-- update (they saved a draft first, then came back). We fire on that
-- transition ONLY, so an admin later editing barn-managed fields (stall, hay,
-- grain, ...) on an already-submitted horse does NOT re-trigger the email.
--
-- Mechanism: a trigger calls pg_net's net.http_post to POST the horse id to
-- the notify-submission Edge Function. The function verifies a shared secret
-- header and sends the email. That secret lives in Supabase Vault (see the
-- one-time setup note at the bottom) so it never appears in this file --
-- this repo is public.

-- 1. pg_net lets Postgres make outbound HTTP calls (functions live in schema `net`).
create extension if not exists pg_net;

-- 2. Trigger function: enqueue an HTTP POST to the Edge Function.
create or replace function public.notify_horse_submitted()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  secret text;
  -- Not a secret: the project ref is already public in the browser bundle.
  -- Replace YOUR-PROJECT-REF with your project's ref before applying.
  fn_url text := 'https://vbmsstjykoocnziwkchw.supabase.co/functions/v1/notify-submission';
begin
  -- The trigger's WHEN clause already guarantees new.boarder_completed is true.
  -- The only case left to rule out is an update to a horse that was ALREADY
  -- submitted (e.g. an admin filling in barn-managed fields afterward).
  if tg_op = 'UPDATE' and old.boarder_completed then
    return new;
  end if;

  -- Shared secret from Vault. If it's missing, skip the call -- never block the
  -- boarder's submit -- but leave a warning in the logs so the gap is visible.
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'notify_submission_secret';

  if secret is null then
    raise warning 'notify_horse_submitted: notify_submission_secret not set in Vault; skipping email';
    return new;
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('horse_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    )
  );

  return new;
end;
$$;

-- 3. The trigger. WHEN (new.boarder_completed) references NEW only, which is
--    required for a combined insert/update trigger (OLD isn't available on
--    insert). Drop-then-create keeps this migration re-runnable.
drop trigger if exists horse_submitted_notify on public.horses;

create trigger horse_submitted_notify
  after insert or update on public.horses
  for each row
  when (new.boarder_completed is true)
  execute function public.notify_horse_submitted();

-- ---------------------------------------------------------------------------
-- ONE-TIME SETUP (do NOT commit the secret value; run these out of band):
--
--   1. Generate a strong random value, e.g.:  openssl rand -hex 32
--
--   2. Store it in Vault (SQL editor), same value as step 3:
--        select vault.create_secret('<THE-RANDOM-VALUE>', 'notify_submission_secret');
--
--   3. Give the Edge Function the SAME value:
--        supabase secrets set WEBHOOK_SECRET=<THE-RANDOM-VALUE>
--
--   4. Replace YOUR-PROJECT-REF above with your project's ref.
-- ---------------------------------------------------------------------------