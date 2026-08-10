-- Onboarding flip: boarders create & complete their own horses, then it locks.

-- 1. Lock flag: true once the boarder has finished their part.
alter table public.horses
  add column if not exists boarder_completed boolean not null default false;

-- 2. Allow boarders to create their own horses (was admin-only).
create policy "boarders create own horses"
on public.horses for insert
with check ( owner_id = auth.uid() and public.current_user_role() = 'boarder' );

-- 3. Rework the protection trigger for the new ownership + lock rules.
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

  -- Barn-managed fields are admin-only.
  if new.stall_number is distinct from old.stall_number
     or new.hay     is distinct from old.hay
     or new.grain   is distinct from old.grain
     or new.pasture is distinct from old.pasture
     or new.turnout is distinct from old.turnout then
    raise exception 'Only admins can change barn-managed fields (stall, feeding, pasture, turnout).';
  end if;

  -- Once a boarder has completed their horse, it locks for them.
  if caller_role = 'boarder' and old.boarder_completed then
    raise exception 'This horse profile is locked. Please contact the barn to make changes.';
  end if;

  return new;
end;
$$;