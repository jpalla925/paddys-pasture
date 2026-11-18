-- Boarder-level emergency contact and photo consent.
--
-- Both belong to the PERSON, not the horse: a boarder with two horses has one
-- emergency contact and gives one photo answer. Storing them on profiles makes
-- this the single source of truth; horse views read them through the owner.
--
-- The old horse-level columns (horses.emergency_contacts, horses.photo_permission)
-- are dropped in a later cleanup migration, AFTER the UI stops sending them --
-- dropping them now would break the current horse form's saves.

-- ---------------------------------------------------------------------------
-- 1. Emergency contact: three real columns (not one ' · '-joined string), so
--    the phone can be validated and shown as a tap-to-call link later.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists emergency_contact_name         text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists emergency_contact_phone        text;

-- All three or none: a half-entered contact is worse than none, because it
-- looks complete at a glance. Blank strings count as missing.
alter table public.profiles
  drop constraint if exists emergency_contact_all_or_none;
alter table public.profiles
  add constraint emergency_contact_all_or_none
  check (
    num_nonnulls(
      nullif(btrim(emergency_contact_name), ''),
      nullif(btrim(emergency_contact_relationship), ''),
      nullif(btrim(emergency_contact_phone), '')
    ) in (0, 3)
  );

-- Same storage format as profiles.phone: 10 digits, no punctuation.
alter table public.profiles
  drop constraint if exists emergency_contact_phone_digits;
alter table public.profiles
  add constraint emergency_contact_phone_digits
  check (emergency_contact_phone is null or emergency_contact_phone ~ '^[0-9]{10}$');

-- ---------------------------------------------------------------------------
-- 2. Photo consent: an explicit answer, never a default.
--      null  = not answered yet (blocks horse submission -- see 161036)
--      true  = yes, the barn may share photos
--      false = no
--    The boarder can change it at any time (profiles are never locked).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists photo_permission            boolean,
  add column if not exists photo_permission_updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Stamp WHEN consent was given or changed, in the database rather than the
--    browser, so the time can't be faked or forgotten. If a boarder withdraws
--    consent, the barn can see exactly when -- what was posted before that
--    date was posted with permission.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_photo_permission()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.photo_permission is not null then
      new.photo_permission_updated_at := now();
    end if;
  elsif new.photo_permission is distinct from old.photo_permission then
    new.photo_permission_updated_at := now();
  else
    -- Not a consent change: keep the stored time, ignore anything sent.
    new.photo_permission_updated_at := old.photo_permission_updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_photo_permission on public.profiles;

create trigger stamp_photo_permission
  before insert or update on public.profiles
  for each row execute function public.stamp_photo_permission();

notify pgrst, 'reload schema';