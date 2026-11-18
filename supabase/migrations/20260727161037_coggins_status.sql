-- Coggins status, DERIVED from medical_records -- never stored.
--
-- These are PostgREST "computed columns": a function that takes a horses row
-- can be selected as if it were a column:
--   supabase.from('horses').select('*, coggins_test_date, coggins_expires_on, coggins_status')
-- Nothing is saved on the horse, so nothing can drift out of date and nobody
-- has to clear a flag. Attach or delete a Coggins and the status follows.
--
-- They run as the CALLER (not security definer), so medical_records RLS still
-- applies: boarders only ever see status derived from their own horses' rows.
--
-- Rule (barn, Nov 2026): a Coggins is valid for 12 months from the test date.
-- An expired Coggins does NOT make a horse "pending" again (may change after
-- checking with Theresa -- if so, it's a one-line change in coggins_status).

-- ---------------------------------------------------------------------------
-- 1. Latest Coggins test date on record (null = none on file).
-- ---------------------------------------------------------------------------
create or replace function public.coggins_test_date(h public.horses)
returns date
language sql
stable
set search_path = ''
as $$
  select max(r.test_date)
  from public.medical_records r
  where r.horse_id = h.id and r.record_type = 'coggins';
$$;

-- ---------------------------------------------------------------------------
-- 2. When that Coggins expires. The ONLY place the 12-month rule lives.
-- ---------------------------------------------------------------------------
create or replace function public.coggins_expires_on(h public.horses)
returns date
language sql
stable
set search_path = ''
as $$
  select (public.coggins_test_date(h) + interval '12 months')::date;
$$;

-- ---------------------------------------------------------------------------
-- 3. One status word for badges and filters:
--      'missing'  no Coggins on file  (shown to admins as "Coggins pending")
--      'expired'  latest test is more than 12 months old
--      'current'  on file and in date
-- ---------------------------------------------------------------------------
create or replace function public.coggins_status(h public.horses)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when public.coggins_test_date(h) is null        then 'missing'
    when public.coggins_expires_on(h) < current_date then 'expired'
    else 'current'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Retire the old manual date. It was never editable in the UI (it isn't in
--    HorseGrid's field lists) and holds no data (checked Nov 18, 2026). The
--    date now comes from the Coggins record itself -- one source of truth.
-- ---------------------------------------------------------------------------
alter table public.horses drop column if exists coggins_date;

notify pgrst, 'reload schema';