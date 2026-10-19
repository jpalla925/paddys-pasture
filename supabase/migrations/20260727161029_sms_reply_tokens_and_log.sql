-- SMS plumbing, part 1: reply-link tokens and an outbound SMS audit log.
--
-- When a boarder messages the barn, the notify-message Edge Function texts each
-- opted-in admin a link like https://app.paddyspastures.com/r/<token>. Tapping it
-- lets that admin reply into the boarder's thread without logging in.
--
-- Neither table is touched by the browser directly:
--   * the Edge Function (service role, bypasses RLS) inserts rows;
--   * reply_via_token() / thread_via_token() (SECURITY DEFINER, next migration)
--     validate tokens.

-- ---------------------------------------------------------------------------
-- 1. message_reply_tokens
--
-- The raw token exists only inside the SMS. We store its SHA-256 hash (hex), so
-- a leaked database or backup contains no working links. No salt / slow hash is
-- needed: the token is 32 random bytes, not something a person chose.
--
-- A token is scoped to ONE recipient and ONE thread, and is reusable until it
-- expires (72h) or an admin revokes it -- so Kevin can send a follow-up reply
-- from the same text.
-- ---------------------------------------------------------------------------
create table public.message_reply_tokens (
  id                uuid primary key default gen_random_uuid(),
  token_hash        text not null unique
                      check (token_hash ~ '^[0-9a-f]{64}$'),  -- sha256 as hex
  recipient_id      uuid not null references public.profiles(id) on delete cascade,  -- replies post as this person
  boarder_id        uuid not null references public.profiles(id) on delete cascade,  -- the thread (messages are keyed by boarder_id)
  source_message_id uuid references public.messages(id) on delete cascade,           -- the boarder message that triggered the text
  expires_at        timestamptz not null default now() + interval '72 hours',
  last_used_at      timestamptz,
  revoked_at        timestamptz,
  created_at        timestamptz not null default now()
);

-- RLS on with ZERO policies = deny-all for anon and authenticated users.
alter table public.message_reply_tokens enable row level security;

-- Belt and braces: Supabase grants table privileges to anon/authenticated by
-- default and relies on RLS to block them. Revoking means even a future
-- accidental policy couldn't expose tokens through the API.
revoke all on public.message_reply_tokens from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. sms_log
--
-- One row per outbound text. Deliberately NO message body: boarder-message
-- texts contain the raw reply link, and storing it would undo the hashing
-- above. kind + message_id is enough to know what was sent; the content's
-- single source of truth is public.messages.
-- ---------------------------------------------------------------------------
create table public.sms_log (
  id            uuid primary key default gen_random_uuid(),
  recipient_id  uuid references public.profiles(id) on delete set null,  -- keep the audit row if a user is removed
  to_phone      text not null,                                            -- number actually sent to (E.164), snapshot at send time
  kind          text not null
                  check (kind in ('boarder_message', 'opt_in_confirmation')),
  message_id    uuid references public.messages(id) on delete set null,
  twilio_sid    text unique,                                              -- null if Twilio rejected the request outright
  status        text not null default 'queued',                           -- Twilio status, or 'failed' if our call errored
  error_code    text,
  error_message text,
  created_at    timestamptz not null default now()
);

alter table public.sms_log enable row level security;

-- Admins can read the log (troubleshooting "did Kevin get the text?").
create policy "admin read sms log"
on public.sms_log for select
using ( public.current_user_role() = 'admin' );

-- Only the Edge Function writes; nobody else can insert/update/delete via the API.
revoke all on public.sms_log from anon;
revoke insert, update, delete on public.sms_log from authenticated;