-- Run this file in Supabase Dashboard > SQL Editor as the project owner.
-- Create user accounts in Authentication, then add their IDs to the allow-list below.

create table if not exists public.puc_authorized_users (
  user_id uuid primary key references auth.users (id) on delete cascade
);

create table if not exists public.puc_customers (
  id text not null,
  center_id uuid not null default '00000000-0000-0000-0000-000000000001',
  name text not null,
  mobile text not null,
  vehicle_number text not null,
  vehicle_type text not null default 'Other',
  puc_expiry_date date not null,
  email text not null default '',
  address text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (center_id, id)
);

create unique index if not exists puc_customers_center_vehicle_key
  on public.puc_customers (center_id, (regexp_replace(upper(vehicle_number), '[^A-Z0-9]', '', 'g')));

create table if not exists public.puc_reminders (
  id text not null,
  center_id uuid not null default '00000000-0000-0000-0000-000000000001',
  customer_id text not null,
  vehicle_number text not null,
  cycle_expiry date not null,
  interval_days integer not null,
  scheduled_date date not null,
  status text not null check (status in ('pending', 'sent', 'skipped', 'cancelled')),
  opened_at timestamptz,
  confirmed_at timestamptz,
  message text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  primary key (center_id, id)
);

create table if not exists public.puc_activity (
  id text not null,
  center_id uuid not null default '00000000-0000-0000-0000-000000000001',
  type text not null,
  text text not null,
  at timestamptz not null default now(),
  primary key (center_id, id)
);

create table if not exists public.puc_center_settings (
  center_id uuid primary key default '00000000-0000-0000-0000-000000000001',
  settings jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.puc_center_settings add column if not exists revision bigint not null default 0;

create or replace function public.is_authorized_puc_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.puc_authorized_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_authorized_puc_user() from public, anon;
grant execute on function public.is_authorized_puc_user() to authenticated;

alter table public.puc_authorized_users enable row level security;
alter table public.puc_customers enable row level security;
alter table public.puc_reminders enable row level security;
alter table public.puc_activity enable row level security;
alter table public.puc_center_settings enable row level security;

drop policy if exists puc_authorized_users_read_self on public.puc_authorized_users;
create policy puc_authorized_users_read_self on public.puc_authorized_users
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists puc_customers_owner_access on public.puc_customers;
create policy puc_customers_owner_access on public.puc_customers
  for all to authenticated
  using (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user())
  with check (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user());

drop policy if exists puc_reminders_owner_access on public.puc_reminders;
create policy puc_reminders_owner_access on public.puc_reminders
  for all to authenticated
  using (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user())
  with check (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user());

drop policy if exists puc_activity_owner_access on public.puc_activity;
create policy puc_activity_owner_access on public.puc_activity
  for all to authenticated
  using (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user())
  with check (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user());

drop policy if exists puc_settings_owner_access on public.puc_center_settings;
create policy puc_settings_owner_access on public.puc_center_settings
  for all to authenticated
  using (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user())
  with check (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user());

revoke all on public.puc_authorized_users from anon, authenticated;
grant select on public.puc_authorized_users to authenticated;
grant select, insert, update, delete on public.puc_customers, public.puc_reminders, public.puc_activity, public.puc_center_settings to authenticated;

insert into public.puc_center_settings (center_id, settings, revision)
values ('00000000-0000-0000-0000-000000000001', '{}'::jsonb, 0)
on conflict (center_id) do nothing;

create or replace function public.save_puc_center_state(
  p_customers jsonb,
  p_reminders jsonb,
  p_activity jsonb,
  p_settings jsonb,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_revision bigint;
begin
  if auth.uid() is null or not public.is_authorized_puc_user() then
    raise exception 'User is not authorized to manage this PUC center.';
  end if;

  select revision into current_revision
  from public.puc_center_settings
  where center_id = '00000000-0000-0000-0000-000000000001'
  for update;

  if current_revision is null then
    raise exception 'PUC center settings row is missing. Run supabase/schema.sql again.';
  end if;
  if current_revision <> p_expected_revision then
    raise exception 'Data changed in another session. Refresh the page to load the latest version.'
      using errcode = '40001';
  end if;

  update public.puc_center_settings
  set settings = coalesce(p_settings, '{}'::jsonb),
      revision = current_revision + 1,
      updated_at = now()
  where center_id = '00000000-0000-0000-0000-000000000001';

  insert into public.puc_customers (
    id, center_id, name, mobile, vehicle_number, vehicle_type, puc_expiry_date,
    email, address, is_sample, created_at, updated_at
  )
  select c.id, '00000000-0000-0000-0000-000000000001', c.name, c.mobile, c.vehicle_number, coalesce(c.vehicle_type, 'Other'),
         c.puc_expiry_date, coalesce(c.email, ''), coalesce(c.address, ''), coalesce(c.is_sample, false),
         coalesce(c.created_at, now()), coalesce(c.updated_at, now())
  from jsonb_to_recordset(coalesce(p_customers, '[]'::jsonb)) as c(
    id text, name text, mobile text, vehicle_number text, vehicle_type text,
    puc_expiry_date date, email text, address text, is_sample boolean,
    created_at timestamptz, updated_at timestamptz
  )
  on conflict (center_id, id) do update set
    name = excluded.name, mobile = excluded.mobile, vehicle_number = excluded.vehicle_number,
    vehicle_type = excluded.vehicle_type, puc_expiry_date = excluded.puc_expiry_date,
    email = excluded.email, address = excluded.address, is_sample = excluded.is_sample,
    updated_at = excluded.updated_at;

  delete from public.puc_customers
  where center_id = '00000000-0000-0000-0000-000000000001'
    and not (id = any(array(select c.id from jsonb_to_recordset(coalesce(p_customers, '[]'::jsonb)) as c(id text))));

  insert into public.puc_reminders (
    id, center_id, customer_id, vehicle_number, cycle_expiry, interval_days,
    scheduled_date, status, opened_at, confirmed_at, message, notes, created_at
  )
  select r.id, '00000000-0000-0000-0000-000000000001', r.customer_id, r.vehicle_number, r.cycle_expiry, r.interval_days,
         r.scheduled_date, r.status, r.opened_at, r.confirmed_at, coalesce(r.message, ''),
         coalesce(r.notes, ''), coalesce(r.created_at, now())
  from jsonb_to_recordset(coalesce(p_reminders, '[]'::jsonb)) as r(
    id text, customer_id text, vehicle_number text, cycle_expiry date, interval_days integer,
    scheduled_date date, status text, opened_at timestamptz, confirmed_at timestamptz,
    message text, notes text, created_at timestamptz
  )
  on conflict (center_id, id) do update set
    customer_id = excluded.customer_id, vehicle_number = excluded.vehicle_number,
    cycle_expiry = excluded.cycle_expiry, interval_days = excluded.interval_days,
    scheduled_date = excluded.scheduled_date, status = excluded.status,
    opened_at = excluded.opened_at, confirmed_at = excluded.confirmed_at,
    message = excluded.message, notes = excluded.notes;

  delete from public.puc_reminders
  where center_id = '00000000-0000-0000-0000-000000000001'
    and not (id = any(array(select r.id from jsonb_to_recordset(coalesce(p_reminders, '[]'::jsonb)) as r(id text))));

  insert into public.puc_activity (id, center_id, type, text, at)
  select a.id, '00000000-0000-0000-0000-000000000001', a.type, a.text, coalesce(a.at, now())
  from jsonb_to_recordset(coalesce(p_activity, '[]'::jsonb)) as a(id text, type text, text text, at timestamptz)
  on conflict (center_id, id) do update set type = excluded.type, text = excluded.text, at = excluded.at;

  delete from public.puc_activity
  where center_id = '00000000-0000-0000-0000-000000000001'
    and not (id = any(array(select a.id from jsonb_to_recordset(coalesce(p_activity, '[]'::jsonb)) as a(id text))));
  return current_revision + 1;
end;
$$;

revoke all on function public.save_puc_center_state(jsonb, jsonb, jsonb, jsonb, bigint) from public, anon;
grant execute on function public.save_puc_center_state(jsonb, jsonb, jsonb, jsonb, bigint) to authenticated;
