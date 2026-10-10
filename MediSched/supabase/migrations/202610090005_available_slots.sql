begin;

-- Weekly clinic windows in Philippine time. ISO weekdays: Monday=1, Sunday=7.
-- Only administrators configure hours. The patient-facing catalog has no PII.
create table public.clinic_hours (
  weekday smallint not null check (weekday between 1 and 7),
  opens_minute smallint not null check (opens_minute between 0 and 1380 and opens_minute % 15 = 0),
  closes_minute smallint not null check (closes_minute between 60 and 1440 and closes_minute % 15 = 0),
  primary key (weekday, opens_minute),
  check (closes_minute - opens_minute >= 60)
);
alter table public.clinic_hours enable row level security;
revoke all on public.clinic_hours from public, anon, authenticated, service_role;
grant select on public.clinic_hours to authenticated;
create policy verified_clinic_hours on public.clinic_hours for select to authenticated
  using ((select medisched_private.is_verified_user()));

-- Confirmed project schedule: every day, 08:00–12:00 and 13:00–17:00.
-- Visits last one hour; last morning start=11:00, last afternoon start=16:00.
insert into public.clinic_hours (weekday, opens_minute, closes_minute)
  select day, opens, closes
  from pg_catalog.generate_series(1,7) day
  cross join (values (480,720),(780,1020)) windows(opens,closes);

-- Additive enforcement leaves the existing booking/cancellation RPCs intact.
-- An already saved appointment is not moved or rewritten by this migration.
create function medisched_private.enforce_clinic_hours() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_local_start timestamp := new.start_at at time zone 'Asia/Manila';
  v_day date := v_local_start::date;
begin
  if new.status = 'cancelled' then return new; end if;
  perform 1 from public.clinic_hours h
    where h.weekday = extract(isodow from v_local_start)::integer
      and new.start_at >= (v_day::timestamp + h.opens_minute * interval '1 minute') at time zone 'Asia/Manila'
      and new.end_at <= (v_day::timestamp + h.closes_minute * interval '1 minute') at time zone 'Asia/Manila'
    for share;
  if not found then
    raise exception using errcode = '22023', message = 'Choose a one-hour visit within clinic hours, outside lunch breaks.';
  end if;
  return new;
end;
$$;
revoke all on function medisched_private.enforce_clinic_hours() from public, anon, authenticated, service_role;
create trigger medisched_clinic_hours_before_booking
  before insert or update of start_at, end_at, status on public.appointments
  for each row execute function medisched_private.enforce_clinic_hours();

create function public.list_available_slots(p_doctor_id text, p_date date)
returns table (start_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not medisched_private.is_verified_user() then
    raise exception using errcode = '42501', message = 'Verified sign-in required.';
  end if;
  if p_date is null or not pg_catalog.isfinite(p_date)
    or p_date < date '0001-01-01' or p_date > date '9999-12-31' then
    raise exception using errcode = '22023', message = 'Choose a valid calendar date.';
  end if;
  if not exists (select 1 from public.doctors d where d.id = p_doctor_id and d.active) then
    raise exception using errcode = '22023', message = 'Choose a listed active doctor.';
  end if;
  if not exists (select 1 from public.booking_configuration c where c.singleton and c.enabled and c.migration_approved) then
    raise exception using errcode = '55000', message = 'Booking awaits administrator setup and legacy review.';
  end if;
  -- A single-day, bounded lookup returns free start times across ALL owners.
  -- This is a snapshot, never a reservation. The existing exclusion constraint
  -- still arbitrates simultaneous bookings and prevents one-hour overlaps.
  return query
    select distinct s.slot_start
    from public.clinic_hours h
    cross join lateral pg_catalog.generate_series(h.opens_minute::integer, h.closes_minute::integer - 60, 15) m(minute)
    cross join lateral (select (p_date::timestamp + m.minute * interval '1 minute') at time zone 'Asia/Manila' as slot_start) s
    where h.weekday = extract(isodow from p_date)::integer and s.slot_start > v_now
      and not exists (select 1 from public.appointments a
        where a.doctor_id = p_doctor_id and a.status = 'active'
          and a.start_at < s.slot_start + interval '1 hour' and a.end_at > s.slot_start)
    order by s.slot_start;
end;
$$;
revoke all on function public.list_available_slots(text,date) from public, anon, authenticated, service_role;
grant execute on function public.list_available_slots(text,date) to authenticated;
commit;
