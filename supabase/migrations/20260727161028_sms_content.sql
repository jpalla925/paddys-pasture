-- SMS consent tracking.
-- The timestamps are the source of truth; receives_sms is derived from them
-- so the boolean and the audit trail can never disagree.

alter table public.profiles
  add column if not exists sms_opt_in_at       timestamptz,
  add column if not exists sms_opt_out_at      timestamptz,
  add column if not exists sms_consent_version text;

-- Opted in when there is an opt-in and no later opt-out.
alter table public.profiles
  add column if not exists receives_sms boolean
  generated always as (
    sms_opt_in_at is not null
    and (sms_opt_out_at is null or sms_opt_out_at < sms_opt_in_at)
  ) stored;