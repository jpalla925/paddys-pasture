-- Text the barn when a boarder sends a message, and move both database
-- webhooks onto one renamed, rotated Vault secret.
--
-- Mechanism (same as notify_horse_submitted): an AFTER INSERT trigger calls
-- pg_net's net.http_post to POST the message id to the notify-message Edge
-- Function, which mints reply-link tokens and sends the texts.
--
-- pg_net is asynchronous: http_post only QUEUES the request; a background
-- worker sends it after this transaction commits. So the boarder's "Send"
-- never waits on Twilio, and if the insert rolls back, the queued request is
-- discarded with it -- no text about a message that doesn't exist.
--
-- The secret is read from Vault so it never appears in this file (the repo
-- is public). See the one-time setup note at the bottom.

-- ---------------------------------------------------------------------------
-- 1. Trigger function for new boarder messages.
-- ---------------------------------------------------------------------------
create or replace function public.notify_boarder_message()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  secret text;
  -- Not a secret: the project ref is already public in the browser bundle.
  fn_url text := 'https://vbmsstjykoocnziwkchw.supabase.co/functions/v1/notify-message';
begin
  -- If the secret is missing, skip the call -- never block a boarder's
  -- message -- but leave a warning in the logs so the gap is visible.
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'db_webhook_secret';

  if secret is null then
    raise warning 'notify_boarder_message: db_webhook_secret not set in Vault; skipping SMS';
    return new;
  end if;

  perform net.http_post(
    url := fn_url,
    body := jsonb_build_object('message_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    )
  );

  return new;
end;
$$;

-- Only boarder-sent messages. Staff replies from the inbox and replies sent
-- through a reply link both have sender_id <> boarder_id, so they never fire
-- this. (notify-message re-checks the same condition.)
drop trigger if exists boarder_message_notify on public.messages;

create trigger boarder_message_notify
  after insert on public.messages
  for each row
  when (new.sender_id = new.boarder_id)
  execute function public.notify_boarder_message();

-- ---------------------------------------------------------------------------
-- 2. Point the horse-submission webhook at the same renamed secret.
--    Identical to 20260727161027 except the Vault secret name.
-- ---------------------------------------------------------------------------
create or replace function public.notify_horse_submitted()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  secret text;
  -- Not a secret: the project ref is already public in the browser bundle.
  fn_url text := 'https://vbmsstjykoocnziwkchw.supabase.co/functions/v1/notify-submission';
begin
  -- The trigger's WHEN clause already guarantees new.boarder_completed is true.
  -- The only case left to rule out is an update to a horse that was ALREADY
  -- submitted (e.g. an admin filling in barn-managed fields afterward).
  if tg_op = 'UPDATE' and old.boarder_completed then
    return new;
  end if;

  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'db_webhook_secret';

  if secret is null then
    raise warning 'notify_horse_submitted: db_webhook_secret not set in Vault; skipping email';
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