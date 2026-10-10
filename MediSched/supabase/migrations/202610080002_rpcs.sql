begin;
-- These deliberately run as the owner because clients have no table write grants.
-- All objects are schema-qualified, search_path is empty, and caller identity is
-- rechecked against auth.users before any patient row is read or written.
create function public.book_appointment(
  p_request_id uuid, p_doctor_id text, p_type_id text, p_patient_name text,
  p_patient_address text, p_patient_age integer, p_start_at timestamptz
) returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := pg_catalog.btrim(p_patient_name);
  v_address text := pg_catalog.btrim(p_patient_address);
  v_saved public.appointments;
  v_doctor public.doctors;
  v_type public.appointment_types;
  v_email text;
  v_ready boolean;
begin
  if not medisched_private.is_verified_user() then
    raise exception using errcode = '42501', message = 'Verified sign-in required.';
  end if;
  if p_request_id is null or v_name is null or v_address is null
    or pg_catalog.char_length(v_name) not between 1 and 120
    or pg_catalog.char_length(v_address) not between 1 and 300
    or p_patient_age is null or p_patient_age not between 0 and 120
    or p_start_at is null or not pg_catalog.isfinite(p_start_at)
    or pg_catalog.date_trunc('minute', p_start_at at time zone 'Asia/Manila') <> p_start_at at time zone 'Asia/Manila'
    or extract(minute from p_start_at at time zone 'Asia/Manila')::integer % 15 <> 0 then
    raise exception using errcode = '22023', message = 'Invalid appointment fields or 15-minute start time.';
  end if;
  -- Serializes duplicate request IDs, including two owners trying the same UUID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 0));
  select * into v_saved from public.appointments where id = p_request_id for update;
  if found then
    if v_saved.owner_uid <> v_uid then
      raise exception using errcode = '42501', message = 'Appointment request unavailable.';
    end if;
    if v_saved.doctor_id is distinct from p_doctor_id or v_saved.type_id is distinct from p_type_id
      or v_saved.patient_name is distinct from v_name or v_saved.patient_address is distinct from v_address
      or v_saved.patient_age is distinct from p_patient_age or v_saved.start_at is distinct from p_start_at then
      raise exception using errcode = '22023', message = 'This request already saved different details. Reload appointments before making a new request.';
    end if;
    return v_saved;
  end if;
  select enabled and migration_approved into v_ready from public.booking_configuration
    where singleton = true for share;
  if not coalesce(v_ready, false) then
    raise exception using errcode = '55000', message = 'Booking awaits administrator setup and legacy review.';
  end if;
  select * into v_doctor from public.doctors where id = p_doctor_id and active for share;
  if not found then raise exception using errcode = '22023', message = 'Choose a listed active doctor.'; end if;
  select * into v_type from public.appointment_types where id = p_type_id and active for share;
  if not found then raise exception using errcode = '22023', message = 'Choose a listed active appointment type.'; end if;
  if p_start_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '22023', message = 'Choose a future appointment time.';
  end if;
  select email into v_email from auth.users where id = v_uid;
  insert into public.appointments (id, owner_uid, doctor_id, type_id, doctor_name, type_name,
    patient_name, patient_address, patient_age, confirmation_email, start_at, end_at)
  values (p_request_id, v_uid, p_doctor_id, p_type_id, v_doctor.name, v_type.name,
    v_name, v_address, p_patient_age, v_email, p_start_at, p_start_at + interval '1 hour')
  returning * into v_saved;
  return v_saved;
exception
  when exclusion_violation then
    -- Never return PostgreSQL's constraint DETAIL (which identifies another row).
    raise exception using errcode = '23P01', message = 'This doctor is unavailable at that time. Choose another slot.';
  when unique_violation then
    raise exception using errcode = '22023', message = 'Appointment request unavailable. Reload appointments.';
end;
$$;

create function public.cancel_appointment(p_appointment_id uuid) returns public.appointments
language plpgsql security definer set search_path = '' as $$
declare v_saved public.appointments;
begin
  if not medisched_private.is_verified_user() then
    raise exception using errcode = '42501', message = 'Verified sign-in required.';
  end if;
  select * into v_saved from public.appointments
    where id = p_appointment_id and owner_uid = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'Appointment unavailable.'; end if;
  if v_saved.status = 'cancelled' then return v_saved; end if;
  if v_saved.start_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '22023', message = 'A visit that has started cannot be cancelled.';
  end if;
  -- Updating status removes this row from the partial exclusion constraint in
  -- the same transaction; history remains and availability is released.
  update public.appointments set status = 'cancelled', cancelled_at = pg_catalog.clock_timestamp()
    where id = v_saved.id returning * into v_saved;
  return v_saved;
end;
$$;
revoke all on function public.book_appointment(uuid,text,text,text,text,integer,timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.cancel_appointment(uuid) from public, anon, authenticated, service_role;
grant execute on function public.book_appointment(uuid,text,text,text,text,integer,timestamptz) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
commit;
