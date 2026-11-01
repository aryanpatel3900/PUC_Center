-- Migration: import batches — track every Excel import and allow deleting
-- exactly the customer records that one import created.
-- Run this file in Supabase Dashboard > SQL Editor (it is idempotent).
-- Fresh setups can keep using supabase/schema.sql, which includes this.

/* 1. Import batch records ------------------------------------------------ */

create table if not exists public.puc_import_batches (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null default '00000000-0000-0000-0000-000000000001',
  filename text not null,
  imported_at timestamptz not null default now(),
  total_rows integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  conflicts_count integer not null default 0,
  invalid_count integer not null default 0,
  -- Customer ids that did not exist before this import created them.
  -- Deletion of an import batch may ONLY touch these ids.
  created_customer_ids text[] not null default '{}'
);

create index if not exists puc_import_batches_center_imported_at
  on public.puc_import_batches (center_id, imported_at desc);

alter table public.puc_import_batches enable row level security;

-- The browser may only READ batch history; rows are written and removed by
-- the SECURITY DEFINER functions below so that created-customer tracking and
-- batch deletion always go through server-side validation.
drop policy if exists puc_import_batches_owner_read on public.puc_import_batches;
create policy puc_import_batches_owner_read on public.puc_import_batches
  for select to authenticated
  using (center_id = '00000000-0000-0000-0000-000000000001' and public.is_authorized_puc_user());

revoke all on public.puc_import_batches from anon, authenticated;
grant select on public.puc_import_batches to authenticated;

/* 2. Helper: insert one batch row (server-computed created ids) ---------- */

create or replace function public.record_puc_import_batch(
  p_batch jsonb,
  p_created_customer_ids text[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null or not public.is_authorized_puc_user() then
    raise exception 'User is not authorized to manage this PUC center.';
  end if;

  insert into public.puc_import_batches (
    id, center_id, filename, imported_at, total_rows, imported_count,
    skipped_count, conflicts_count, invalid_count, created_customer_ids
  )
  values (
    coalesce((p_batch->>'id')::uuid, gen_random_uuid()),
    '00000000-0000-0000-0000-000000000001',
    coalesce(nullif(trim(coalesce(p_batch->>'filename', '')), ''), 'Unnamed file'),
    coalesce((p_batch->>'imported_at')::timestamptz, now()),
    coalesce((p_batch->>'total_rows')::int, 0),
    coalesce((p_batch->>'imported_count')::int, 0),
    coalesce((p_batch->>'skipped_count')::int, 0),
    coalesce((p_batch->>'conflicts_count')::int, 0),
    coalesce((p_batch->>'invalid_count')::int, 0),
    coalesce(p_created_customer_ids, '{}')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_puc_import_batch(jsonb, text[]) from public, anon;
grant execute on function public.record_puc_import_batch(jsonb, text[]) to authenticated;

/* 3. save_puc_center_state: optionally records an import batch atomically */

drop function if exists public.save_puc_center_state(jsonb, jsonb, jsonb, jsonb, bigint);

create or replace function public.save_puc_center_state(
  p_customers jsonb,
  p_reminders jsonb,
  p_activity jsonb,
  p_settings jsonb,
  p_expected_revision bigint,
  p_import_batch jsonb default null
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

  -- When this save is an Excel import, record the batch in the same
  -- transaction. Which customers it "created" is decided by the database
  -- (ids in the payload that do not exist yet), never by the browser.
  if p_import_batch is not null then
    perform public.record_puc_import_batch(
      p_batch := p_import_batch,
      p_created_customer_ids := (
        select coalesce(array_agg(c.id), '{}')
        from jsonb_to_recordset(coalesce(p_customers, '[]'::jsonb)) as c(id text)
        where not exists (
          select 1
          from public.puc_customers pc
          where pc.center_id = '00000000-0000-0000-0000-000000000001'
            and pc.id = c.id
        )
      )
    );
  end if;

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

revoke all on function public.save_puc_center_state(jsonb, jsonb, jsonb, jsonb, bigint, jsonb) from public, anon;
grant execute on function public.save_puc_center_state(jsonb, jsonb, jsonb, jsonb, bigint, jsonb) to authenticated;

/* 4. Delete one import batch (only the customers it created) ------------- */

create or replace function public.delete_puc_import_batch(
  p_batch_id uuid,
  p_customer_ids jsonb default null,
  p_force boolean default false,
  p_activity_id text default null,
  p_activity_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch public.puc_import_batches%rowtype;
  v_ids text[];
  v_edited text[];
  v_deleted integer;
  v_revision bigint;
begin
  if auth.uid() is null or not public.is_authorized_puc_user() then
    raise exception 'User is not authorized to manage this PUC center.';
  end if;

  select * into v_batch
  from public.puc_import_batches
  where center_id = '00000000-0000-0000-0000-000000000001' and id = p_batch_id;

  if not found then
    raise exception 'This import batch was not found. It may already be deleted — refresh the list.';
  end if;

  -- Only customer ids that belong to THIS batch can ever be deleted here.
  -- Anything else (older records, manual customers, skipped duplicates) is
  -- impossible to reach, even if the browser asks for it.
  select coalesce(array_agg(x), '{}') into v_ids
  from unnest(v_batch.created_customer_ids) as x
  where p_customer_ids is null
     or exists (select 1 from jsonb_array_elements_text(p_customer_ids) as t(id) where t.id = x);

  -- Records edited after the import must never be deleted silently.
  select coalesce(array_agg(c.id), '{}') into v_edited
  from public.puc_customers c
  where c.center_id = '00000000-0000-0000-0000-000000000001'
    and c.id = any(v_ids)
    and c.updated_at > v_batch.imported_at;

  if coalesce(array_length(v_edited, 1), 0) > 0 and not p_force then
    raise exception '% customer record(s) from this import were edited later and will not be deleted without explicit confirmation.',
      array_length(v_edited, 1);
  end if;

  delete from public.puc_customers
  where center_id = '00000000-0000-0000-0000-000000000001'
    and id = any(v_ids)
    and (p_force or updated_at <= v_batch.imported_at);
  get diagnostics v_deleted = row_count;

  delete from public.puc_import_batches
  where center_id = '00000000-0000-0000-0000-000000000001' and id = p_batch_id;

  update public.puc_center_settings
  set revision = revision + 1, updated_at = now()
  where center_id = '00000000-0000-0000-0000-000000000001'
  returning revision into v_revision;

  insert into public.puc_activity (id, center_id, type, text, at)
  values (
    coalesce(nullif(trim(coalesce(p_activity_id, '')), ''), ('a_' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '_' || substr(md5(random()::text), 1, 6))),
    '00000000-0000-0000-0000-000000000001',
    'import_deleted',
    coalesce(nullif(trim(coalesce(p_activity_text, '')), ''), 'Deleted an import batch'),
    now()
  );

  return jsonb_build_object(
    'revision', v_revision,
    'deleted_customers', v_deleted,
    'kept_edited', coalesce(array_length(v_edited, 1), 0)
  );
end;
$$;

revoke all on function public.delete_puc_import_batch(uuid, jsonb, boolean, text, text) from public, anon;
grant execute on function public.delete_puc_import_batch(uuid, jsonb, boolean, text, text) to authenticated;
