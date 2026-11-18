-- Coggins-aware medical records + upload rights for admins.
--
-- A Coggins is just a medical record with a test date, so it lives in
-- medical_records (one table, one bucket, one component) rather than a table
-- of its own. Whether a horse's Coggins is "pending" is DERIVED from whether a
-- coggins row exists (migration 161037) -- nobody sets or clears a flag by hand.
--
-- Who can add records:
--   * Boarders: any record to their own UNLOCKED horse, and a Coggins to their
--     own horse at any time (next year's test shouldn't need a barn request).
--   * Admins: any record to any horse.
--   * Staff: none (read-only, as before).

-- ---------------------------------------------------------------------------
-- 1. Record type and Coggins test date
-- ---------------------------------------------------------------------------
alter table public.medical_records
  add column if not exists record_type text not null default 'other',
  add column if not exists test_date   date;

alter table public.medical_records
  drop constraint if exists medical_records_record_type_check;
alter table public.medical_records
  add constraint medical_records_record_type_check
  check (record_type in ('coggins', 'other'));

-- A Coggins without a test date is useless for the 12-month rule.
alter table public.medical_records
  drop constraint if exists medical_records_coggins_needs_test_date;
alter table public.medical_records
  add constraint medical_records_coggins_needs_test_date
  check (record_type <> 'coggins' or test_date is not null);

-- ---------------------------------------------------------------------------
-- 2. uploaded_by is the person who actually uploaded, not the horse's owner.
--    Default it from the session; the insert policies below refuse any other
--    value, so it can't be spoofed from the browser.
-- ---------------------------------------------------------------------------
alter table public.medical_records
  alter column uploaded_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- 3. Table insert policies
-- ---------------------------------------------------------------------------
drop policy if exists "boarders add records to unlocked horses" on public.medical_records;
drop policy if exists "boarders add records to own horses"      on public.medical_records;
drop policy if exists "admin add records"                       on public.medical_records;

create policy "boarders add records to own horses"
on public.medical_records for insert
to authenticated
with check (
  medical_records.uploaded_by = auth.uid()
  and exists (
    select 1 from public.horses h
    where h.id = medical_records.horse_id
      and h.owner_id = auth.uid()
      and (not h.boarder_completed or medical_records.record_type = 'coggins')
  )
);

create policy "admin add records"
on public.medical_records for insert
to authenticated
with check (
  public.current_user_role() = 'admin'
  and medical_records.uploaded_by = auth.uid()
);

-- ---------------------------------------------------------------------------
-- 4. Storage policies for the private medical-records bucket.
--    These were created in the dashboard; recreating them here puts them in
--    version control. Path convention: {owner_id}/{horse_id}/{timestamp-name}.
--    Admins upload into the OWNER's folder too, so the boarder's folder-based
--    read rule lets them see a Coggins the barn attached.
-- ---------------------------------------------------------------------------
drop policy if exists "read own or staff medical records 1rvl8ue_0" on storage.objects;
drop policy if exists "users upload own medical records 1rvl8ue_0"  on storage.objects;
drop policy if exists "read medical record files"                   on storage.objects;
drop policy if exists "upload medical record files"                 on storage.objects;

create policy "read medical record files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'medical-records'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.current_user_role() in ('admin', 'staff')
  )
);

-- Folder 1 must be the horse's owner and folder 2 that owner's horse, for
-- everyone. Boarders can only write under their own id; admins under any.
create policy "upload medical record files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'medical-records'
  and exists (
    select 1 from public.horses h
    where h.id::text       = (storage.foldername(name))[2]
      and h.owner_id::text = (storage.foldername(name))[1]
  )
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.current_user_role() = 'admin'
  )
);

-- ---------------------------------------------------------------------------
-- 5. Admins can delete a wrong Coggins.
--    The ROW is the source of truth for Coggins status, so the app deletes the
--    row first, then the file. If the file delete then fails, all that's left
--    is an unreferenced private file -- never a status pointing at nothing.
-- ---------------------------------------------------------------------------
drop policy if exists "admin delete coggins records" on public.medical_records;

create policy "admin delete coggins records"
on public.medical_records for delete
to authenticated
using (
  public.current_user_role() = 'admin'
  and medical_records.record_type = 'coggins'
);

drop policy if exists "admin delete medical record files" on storage.objects;

create policy "admin delete medical record files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'medical-records'
  and public.current_user_role() = 'admin'
);

notify pgrst, 'reload schema';