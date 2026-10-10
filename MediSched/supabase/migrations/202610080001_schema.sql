begin;
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set local search_path = pg_catalog, public, extensions;
create schema medisched_private;
revoke all on schema medisched_private from public, anon, authenticated, service_role;
grant usage on schema medisched_private to authenticated;
revoke create on schema public from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (full_name = btrim(full_name) and char_length(full_name) between 1 and 120),
  created_at timestamptz not null default now()
);
create table public.doctors (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,60}$'),
  name text not null unique check (char_length(btrim(name)) between 1 and 120),
  active boolean not null default true
);
create table public.appointment_types (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,60}$'),
  name text not null unique check (char_length(btrim(name)) between 1 and 120),
  active boolean not null default true
);
create table public.appointments (
  id uuid primary key,
  owner_uid uuid not null references public.profiles(id) on delete restrict,
  doctor_id text not null references public.doctors(id) on delete restrict,
  type_id text not null references public.appointment_types(id) on delete restrict,
  doctor_name text not null,
  type_name text not null,
  patient_name text not null check (patient_name = btrim(patient_name) and char_length(patient_name) between 1 and 120),
  patient_address text not null check (patient_address = btrim(patient_address) and char_length(patient_address) between 1 and 300),
  patient_age smallint not null check (patient_age between 0 and 120),
  confirmation_email text not null,
  start_at timestamptz not null check (isfinite(start_at)),
  end_at timestamptz not null check (isfinite(end_at)),
  status text not null default 'active' check (status in ('active','cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint one_hour_duration check (end_at = start_at + interval '1 hour'),
  constraint quarter_hour_start check (
    date_trunc('minute', start_at at time zone 'Asia/Manila') = start_at at time zone 'Asia/Manila'
    and extract(minute from start_at at time zone 'Asia/Manila')::integer % 15 = 0
  ),
  constraint cancellation_history check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint no_doctor_overlap exclude using gist (
    doctor_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'active')
);
create index appointments_owner_start on public.appointments(owner_uid, start_at);
create index appointments_owner_status on public.appointments(owner_uid, status);
create table public.booking_configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  migration_approved boolean not null default false
);
insert into public.booking_configuration default values;

alter table public.profiles enable row level security;
alter table public.doctors enable row level security;
alter table public.appointment_types enable row level security;
alter table public.appointments enable row level security;
alter table public.booking_configuration enable row level security;
revoke all on public.profiles, public.doctors, public.appointment_types,
  public.appointments, public.booking_configuration from public, anon, authenticated, service_role;

-- Verification comes from Auth's authoritative row, never editable user metadata.
create function medisched_private.is_verified_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.role() = 'authenticated'
    and exists (select 1 from auth.users u where u.id = auth.uid()
      and u.email_confirmed_at is not null);
$$;
revoke all on function medisched_private.is_verified_user() from public, anon, authenticated, service_role;
grant execute on function medisched_private.is_verified_user() to authenticated;

-- The trigger runs in the same transaction as signup, even with no session yet.
create function medisched_private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name)
    values (new.id, coalesce(nullif(pg_catalog.left(pg_catalog.btrim(new.raw_user_meta_data->>'full_name'), 120), ''), 'Patient'));
  return new;
end;
$$;
revoke all on function medisched_private.create_profile() from public, anon, authenticated, service_role;
create trigger medisched_profile_after_signup after insert on auth.users
  for each row execute function medisched_private.create_profile();

grant select on public.profiles, public.doctors, public.appointment_types, public.appointments to authenticated;
create policy own_verified_profile on public.profiles for select to authenticated
  using (id = (select auth.uid()) and (select medisched_private.is_verified_user()));
create policy own_verified_appointments on public.appointments for select to authenticated
  using (owner_uid = (select auth.uid()) and (select medisched_private.is_verified_user()));
create policy verified_doctor_catalog on public.doctors for select to authenticated
  using ((select medisched_private.is_verified_user()));
create policy verified_type_catalog on public.appointment_types for select to authenticated
  using ((select medisched_private.is_verified_user()));
commit;
