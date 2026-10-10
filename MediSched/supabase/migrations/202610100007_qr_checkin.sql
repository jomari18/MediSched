-- Local reviewed migration; apply only after 006. No public raw pass access.
begin;
do $migration$
declare s text;
begin
 select n.nspname into s from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 if s is null then raise exception 'pgcrypto must be installed by the project administrator before QR setup.';end if;
 execute pg_catalog.format('create or replace function medisched_private.checkin_random() returns text language sql volatile security definer set search_path='''' as %L', 'select pg_catalog.encode('||pg_catalog.quote_ident(s)||'.gen_random_bytes(32),''hex'')');
 execute pg_catalog.format('create or replace function medisched_private.checkin_hash(p_token text) returns text language sql immutable security definer set search_path='''' as %L', 'select pg_catalog.encode('||pg_catalog.quote_ident(s)||'.digest(p_token,''sha256''),''hex'')');
end $migration$;
create table if not exists medisched_private.appointment_checkin_passes(
 appointment_id uuid primary key references public.appointments(id) on delete restrict,
 token_hash text unique not null check(token_hash ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz not null, expires_at timestamptz not null check(expires_at>issued_at),
 consumed_at timestamptz, consumed_by uuid references auth.users(id) on delete set null,
 consumed_action_id uuid, consumed_expected_version integer, consumed_result jsonb
);
alter table medisched_private.appointment_checkin_passes enable row level security;
revoke all on medisched_private.appointment_checkin_passes from public,anon,authenticated,service_role;
create or replace function public.issue_appointment_checkin_pass(p_appointment_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;w public.appointment_attendance;p medisched_private.appointment_checkin_passes;v_now timestamptz;v_token text;v_expiry timestamptz;
begin
 if not medisched_private.is_verified_user() then raise exception using errcode='42501',message='Verified owner required.';end if;
 select * into a from public.appointments where id=p_appointment_id and owner_uid=auth.uid() for update;
 if not found then raise exception using errcode='42501',message='Appointment unavailable.';end if;
 select * into w from public.appointment_attendance where appointment_id=a.id for update;
 select * into p from medisched_private.appointment_checkin_passes where appointment_id=a.id for update;
 v_now:=medisched_private.workflow_now();
 if not coalesce('check_in'=any(medisched_private.workflow_actions(a.status,w.state,a.start_at,a.end_at,v_now)),false) then raise exception using errcode='22023',message='Check-in unavailable.';end if;
 if p.issued_at is not null and v_now<p.issued_at+interval '30 seconds' then raise exception using errcode='55000',message='Pass generation cooldown.';end if;
 v_token:=medisched_private.checkin_random();v_expiry:=least(v_now+interval '10 minutes',a.end_at);
 insert into medisched_private.appointment_checkin_passes(appointment_id,token_hash,issued_at,expires_at) values(a.id,medisched_private.checkin_hash(v_token),v_now,v_expiry)
 on conflict(appointment_id) do update set token_hash=excluded.token_hash,issued_at=excluded.issued_at,expires_at=excluded.expires_at,consumed_at=null,consumed_by=null,consumed_action_id=null,consumed_expected_version=null,consumed_result=null;
 return pg_catalog.jsonb_build_object('token',v_token,'issued_at',v_now,'expires_at',v_expiry,'server_now',v_now);
end $$;
create or replace function public.preview_appointment_checkin_pass(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;w public.appointment_attendance;p medisched_private.appointment_checkin_passes;v_now timestamptz;
begin
 if not medisched_private.is_staff() then raise exception using errcode='42501',message='Clinic staff access required.';end if;
 if p_token is null or pg_catalog.length(p_token)<>64 or p_token !~ '^[a-f0-9]{64}$' then raise exception using errcode='22023',message='Invalid pass.';end if;
 select * into p from medisched_private.appointment_checkin_passes where token_hash=medisched_private.checkin_hash(p_token);
 if not found then raise exception using errcode='22023',message='Pass unavailable.';end if;
 select * into a from public.appointments where id=p.appointment_id;
 select * into w from public.appointment_attendance where appointment_id=a.id;
 v_now:=medisched_private.workflow_now();
 if p.consumed_at is not null or v_now>=p.expires_at or not coalesce('check_in'=any(medisched_private.workflow_actions(a.status,w.state,a.start_at,a.end_at,v_now)),false) then raise exception using errcode='22023',message='Pass unavailable.';end if;
 return pg_catalog.jsonb_build_object('appointment_id',a.id,'patient_name',a.patient_name,'doctor_name',a.doctor_name,'type_name',a.type_name,'start_at',a.start_at,'end_at',a.end_at,'version',w.version,'expires_at',p.expires_at,'server_now',v_now);
end $$;
create or replace function public.consume_appointment_checkin_pass(p_token text,p_action_id uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;w public.appointment_attendance;p medisched_private.appointment_checkin_passes;v_hash text;v_id uuid;v_now timestamptz;v_result jsonb;
begin
 if not medisched_private.is_staff() then raise exception using errcode='42501',message='Clinic staff access required.';end if;
 if p_token is null or pg_catalog.length(p_token)<>64 or p_token !~ '^[a-f0-9]{64}$' or p_action_id is null or p_expected_version is null or p_expected_version<0 then raise exception using errcode='22023',message='Invalid check-in request.';end if;
 v_hash:=medisched_private.checkin_hash(p_token);
 select appointment_id into v_id from medisched_private.appointment_checkin_passes where token_hash=v_hash;
 if not found then raise exception using errcode='22023',message='Pass unavailable.';end if;
 -- All paths lock appointment, attendance, pass in this order.
 select * into a from public.appointments where id=v_id for update;
 -- Attendance also uses this action lock. Acquire it before final expiry checks:
 -- waiting inside the nested attendance RPC must not extend pass validity.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_action_id::text,0));
 select * into w from public.appointment_attendance where appointment_id=a.id for update;
 select * into p from medisched_private.appointment_checkin_passes where appointment_id=a.id for update;
 if p.token_hash is distinct from v_hash then raise exception using errcode='22023',message='Pass replaced.';end if;
 if p.consumed_at is not null then
  if p.consumed_by is distinct from auth.uid() or p.consumed_action_id is distinct from p_action_id or p.consumed_expected_version is distinct from p_expected_version then raise exception using errcode='22023',message='Pass already consumed.';end if;
  return p.consumed_result || pg_catalog.jsonb_build_object('replayed',true);
 end if;
 v_now:=medisched_private.workflow_now();
 if v_now>=p.expires_at or not coalesce('check_in'=any(medisched_private.workflow_actions(a.status,w.state,a.start_at,a.end_at,v_now)),false) then raise exception using errcode='22023',message='Pass unavailable.';end if;
 v_result:=public.set_appointment_attendance(a.id,'check_in',p_action_id,p_expected_version);
 -- Never consume a pass using an earlier manual check-in action ID.
 if coalesce((v_result->>'replayed')::boolean,false) then raise exception using errcode='22023',message='Action ID already used.';end if;
 update medisched_private.appointment_checkin_passes set consumed_at=v_now,consumed_by=auth.uid(),consumed_action_id=p_action_id,consumed_expected_version=p_expected_version,consumed_result=v_result where appointment_id=a.id;
 return v_result;
end $$;
revoke all on function medisched_private.checkin_random(),medisched_private.checkin_hash(text) from public,anon,authenticated,service_role;
revoke all on function public.issue_appointment_checkin_pass(uuid),public.preview_appointment_checkin_pass(text),public.consume_appointment_checkin_pass(text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.issue_appointment_checkin_pass(uuid),public.preview_appointment_checkin_pass(text),public.consume_appointment_checkin_pass(text,uuid,integer) to authenticated;
commit;
