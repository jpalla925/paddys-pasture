create function public.protect_horse_admin_fields()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Admins and staff can change anything; skip the checks for them.
  if public.current_user_role() in ('admin', 'staff') then
    return new;
  end if;

  -- For everyone else (boarders), block changes to barn-controlled fields.
  if new.name         is distinct from old.name
     or new.stall_number is distinct from old.stall_number
     or new.hay          is distinct from old.hay
     or new.grain        is distinct from old.grain
     or new.pasture      is distinct from old.pasture
     or new.turnout      is distinct from old.turnout then
    raise exception 'Boarders cannot change barn-managed fields (stall, feeding, pasture, turnout, name).';
  end if;

  return new;
end;
$$;

create trigger enforce_horse_admin_fields
  before update on public.horses
  for each row execute function public.protect_horse_admin_fields();