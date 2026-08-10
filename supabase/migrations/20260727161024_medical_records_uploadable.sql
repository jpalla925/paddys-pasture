drop policy if exists "boarders add own horse records" on public.medical_records;

create policy "boarders add records to unlocked horses"
on public.medical_records for insert
with check (
  horse_id in (
    select id from public.horses
    where owner_id = auth.uid() and boarder_completed = false
  )
);