-- Profile fields
alter table public.profiles add column if not exists heard_about text;
alter table public.profiles add column if not exists payment_preference text;

-- Horse fields
alter table public.horses add column if not exists breed text;
alter table public.horses add column if not exists coggins_date date;
alter table public.horses add column if not exists photo_permission boolean not null default false;
alter table public.horses add column if not exists intro_story text;