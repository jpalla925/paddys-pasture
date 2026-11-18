-- What it takes to SUBMIT a horse (boarder_completed false -> true), enforced
-- in the database for every role, plus closing an insert-time gap in the
-- barn-field / lock protection.
--
-- Two triggers, two jobs:
--   enforce_horse_admin_fields  WHO may change WHAT   (existing, now also on insert)
--   enforce_horse_submission    WHEN a horse counts as complete   (new)
-- Postgres runs same-timing triggers in name order, so the permission check
-- runs first and the completeness check second.

-- ---------------------------------------------------------------------------
-- 1. The boarder's alternative to uploading: "I'll give my Coggins to the barn."
--    This is only a permission to submit without a file. Whether a Coggins is
--    pending is still derived from medical_records (161037), so when an admin
--    attaches the file, the horse stops being pending with nothing to clear.
-- ---------------------------------------------------------------------------
alter table public.horses
  add column if not exists coggins_to_barn boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Permission trigger, now on INSERT as well as UPDATE.
--    The gap: it used to run on update only, so a boarder could INSERT a horse
--    with a stall, feed and boarder_completed = true already set. That horse
--    would skip the lock's intent and never appear in the "New boarded horses"
--    queue (which looks for stall_number is null).
--    Also adds boarding_date to the barn-managed list: the barn sets it in the
--    intake queue, and the boarder form never sends it.
-- ---------------------------------------------------------------------------
create or replace function public.protect_horse_admin_fields()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  caller_role public.user_role;
begin
  caller_role := public.current_user_role();

  -- Admins can change anything, anytime.
  if caller_role = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A new horse from a non-admin starts with the barn's fields empty.
    if new.stall_number is not null
       or new.hay          is not null
       or new.grain        is not null
       or new.pasture      is not null
       or new.turnout      is not null
       or new.boarding_date is not null then
      raise exception 'Only admins can set barn-managed fields (boarding date, stall, feeding, pasture, turnout).';
    end if;
    return new;
  end if;

  -- UPDATE: barn-managed fields are admin-only.
  if new.stall_number  is distinct from old.stall_number
     or new.hay           is distinct from old.hay
     or new.grain         is distinct from old.grain
     or new.pasture       is distinct from old.pasture
     or new.turnout       is distinct from old.turnout
     or new.boarding_date is distinct from old.boarding_date then
    raise exception 'Only admins can change barn-managed fields (boarding date, stall, feeding, pasture, turnout).';
  end if;

  -- Once a boarder has completed their horse, it locks for them.
  -- (Photo consent lives on profiles, which never lock. New Coggins files go
  -- into medical_records, which has its own rule -- see 161034.)
  if caller_role = 'boarder' and old.boarder_completed then
    raise exception 'This horse profile is locked. Please contact the barn to make changes.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_horse_admin_fields on public.horses;

create trigger enforce_horse_admin_fields
  before insert or update on public.horses
  for each row execute function public.protect_horse_admin_fields();

-- ---------------------------------------------------------------------------
-- 3. Completeness: the one definition of "a submittable horse".
--    Checked only at the moment of submission (insert as complete, or the
--    false -> true flip), for EVERY role. Admins can still correct a field on
--    an already-submitted horse afterward; if an admin un-submits a horse,
--    re-submitting checks again.
--    The error lists everything missing at once, so the app can show it as-is.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_horse_submission()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  missing text[] := '{}';
  owner   public.profiles%rowtype;
begin
  -- Only act on submission.
  if not new.boarder_completed then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.boarder_completed then
    return new;
  end if;

  -- Horse fields (blank text counts as missing).
  if nullif(btrim(new.name), '')           is null then missing := array_append(missing, 'Horse name'); end if;
  if nullif(btrim(new.breed), '')          is null then missing := array_append(missing, 'Breed'); end if;
  if nullif(btrim(new.sex), '')            is null then missing := array_append(missing, 'Sex'); end if;
  if nullif(btrim(new.age), '')            is null then missing := array_append(missing, 'Age'); end if;
  if nullif(btrim(new.color), '')          is null then missing := array_append(missing, 'Color'); end if;
  if nullif(btrim(new.supplements), '')    is null then missing := array_append(missing, 'Supplements'); end if;
  if nullif(btrim(new.medications), '')    is null then missing := array_append(missing, 'Medications'); end if;
  if nullif(btrim(new.vet_info), '')       is null then missing := array_append(missing, 'Veterinarian'); end if;
  if nullif(btrim(new.farrier_info), '')   is null then missing := array_append(missing, 'Farrier'); end if;
  if nullif(btrim(new.behavior_notes), '') is null then missing := array_append(missing, 'Behavior & handling notes'); end if;

  -- Coggins: a file on record, or the boarder's promise to bring it.
  -- (On a brand-new insert there can't be a file yet -- the record needs the
  -- horse's id -- so the app saves a draft first, uploads, then submits.)
  if not new.coggins_to_barn and not exists (
    select 1 from public.medical_records r
    where r.horse_id = new.id and r.record_type = 'coggins'
  ) then
    missing := array_append(missing, 'Coggins (upload it, or choose to give it to the barn)');
  end if;

  -- The owner's own details, which live on their profile.
  select * into owner from public.profiles where id = new.owner_id;
  if owner.emergency_contact_phone is null then   -- all-or-none constraint covers the other two
    missing := array_append(missing, 'Your emergency contact (account details)');
  end if;
  if owner.photo_permission is null then
    missing := array_append(missing, 'Your photo sharing answer (account details)');
  end if;

  if array_length(missing, 1) > 0 then
    raise exception 'This horse can''t be submitted yet. Missing: %', array_to_string(missing, ', ')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_horse_submission on public.horses;

create trigger enforce_horse_submission
  before insert or update on public.horses
  for each row execute function public.enforce_horse_submission();

notify pgrst, 'reload schema';