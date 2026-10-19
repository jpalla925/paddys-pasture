-- Reply-by-link: the only way into message_reply_tokens.
--
-- The public /r/:token page calls these over RPC with NO login (role anon).
-- anon can't read messages or tokens directly; these SECURITY DEFINER functions
-- run with the owner's rights, so each function body IS the security rule:
-- validate the token, then do exactly one narrow thing.
--
--   thread_via_token(token)        -> what the reply page shows
--   reply_via_token(token, body)   -> posts a reply into the boarder's thread
--
-- Both share one validator, resolve_reply_token(), so the "is this link valid?"
-- rule lives in exactly one place.

-- ---------------------------------------------------------------------------
-- 1. Shared validator (internal -- NOT callable over the API).
--
-- Security INVOKER on purpose: it only works when called from inside the
-- definer functions below (which run as the owner). Called directly by anyone
-- else it has neither execute permission nor table access.
--
-- Every failure raises the same message, so a caller can't tell an expired
-- link from a revoked one from one that never existed.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_reply_token(p_token text)
returns public.message_reply_tokens
language plpgsql
stable
set search_path = ''
as $$
declare
  t public.message_reply_tokens;
begin
  -- Real tokens are ~43 chars; refuse junk before hashing.
  if p_token is null or length(p_token) > 200 then
    raise exception 'This link is invalid or has expired.';
  end if;

  -- sha256() is built into Postgres (no pgcrypto needed). Must match how the
  -- Edge Function hashes: SHA-256 of the UTF-8 token, as lowercase hex.
  select rt.* into t
  from public.message_reply_tokens rt
  join public.profiles p on p.id = rt.recipient_id
  where rt.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and rt.revoked_at is null
    and rt.expires_at > now()
    and p.role in ('admin', 'staff');   -- demoted recipient = dead link

  if not found then
    raise exception 'This link is invalid or has expired.';
  end if;

  return t;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. thread_via_token: data for the reply page.
--
-- Returns only what the page renders -- no ids, emails, or phone numbers:
--   { boarder_name, recipient_first_name, expires_at,
--     messages: [ { body, created_at, from_boarder }, ... ]  -- last 10, oldest first }
-- ---------------------------------------------------------------------------
create or replace function public.thread_via_token(p_token text)
returns jsonb
language plpgsql
stable
security definer set search_path = ''
as $$
declare
  t                    public.message_reply_tokens;
  v_boarder_name       text;
  v_recipient_first    text;
  v_messages           jsonb;
begin
  t := public.resolve_reply_token(p_token);

  select full_name into v_boarder_name
  from public.profiles where id = t.boarder_id;

  select nullif(split_part(full_name, ' ', 1), '') into v_recipient_first
  from public.profiles where id = t.recipient_id;

  -- Newest 10, then re-sorted oldest-first for display.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'body',         m.body,
               'created_at',   m.created_at,
               'from_boarder', m.sender_id = m.boarder_id
             )
             order by m.created_at
           ),
           '[]'::jsonb
         )
  into v_messages
  from (
    select body, created_at, sender_id, boarder_id
    from public.messages
    where boarder_id = t.boarder_id
    order by created_at desc
    limit 10
  ) m;

  return jsonb_build_object(
    'boarder_name',         v_boarder_name,
    'recipient_first_name', v_recipient_first,
    'expires_at',           t.expires_at,
    'messages',             v_messages
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. reply_via_token: post a reply as the token's recipient.
--
-- The insert looks exactly like an in-app staff reply (sender_id = the admin,
-- boarder_id = the thread), so it shows up live in the boarder's chat and the
-- staff inbox via Realtime. It will NOT trigger more texts: the step-6 trigger
-- fires only when sender_id = boarder_id.
-- ---------------------------------------------------------------------------
create or replace function public.reply_via_token(p_token text, p_body text)
returns uuid
language plpgsql
volatile
security definer set search_path = ''
as $$
declare
  t      public.message_reply_tokens;
  v_body text := btrim(coalesce(p_body, ''));
  v_id   uuid;
begin
  t := public.resolve_reply_token(p_token);

  if v_body = '' then
    raise exception 'Reply can''t be empty.';
  end if;

  if length(v_body) > 2000 then
    raise exception 'Reply is too long (2,000 characters max).';
  end if;

  insert into public.messages (boarder_id, sender_id, body)
  values (t.boarder_id, t.recipient_id, v_body)
  returning id into v_id;

  update public.message_reply_tokens
  set last_used_at = now()
  where id = t.id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Who may call what.
--
-- Postgres grants EXECUTE on new functions to PUBLIC, and Supabase's default
-- privileges also grant it to anon/authenticated directly. Revoke from all of
-- them, then grant back only what's intended -- so access is a decision
-- written here, not an accident of defaults.
-- ---------------------------------------------------------------------------
revoke execute on function public.resolve_reply_token(text)       from public, anon, authenticated;

revoke execute on function public.thread_via_token(text)          from public, anon, authenticated;
revoke execute on function public.reply_via_token(text, text)     from public, anon, authenticated;

grant  execute on function public.thread_via_token(text)          to anon, authenticated;
grant  execute on function public.reply_via_token(text, text)     to anon, authenticated;