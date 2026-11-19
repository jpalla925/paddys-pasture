-- Cleanup: retire the horse-level copies of the owner's details.
--
-- Emergency contact and photo consent now live on profiles (161035) -- one per
-- person, so a boarder with two horses never enters the same contact twice.
-- RUN ONLY AFTER the release that stops reading/writing these columns is live
-- (BoarderHorseView, HorseGrid, HorsePrintPage); the old screens send them on
-- every save and would fail once they're gone.
--
-- Data: checked Nov 18, 2026 -- 2 test horses had emergency_contacts set, OK'd
-- to drop. photo_permission was only ever the unchecked default.

alter table public.horses drop column if exists emergency_contacts;
alter table public.horses drop column if exists photo_permission;

notify pgrst, 'reload schema';