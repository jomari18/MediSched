begin;
-- Additive only: existing appointment tables, RLS and booking RPCs are unchanged.
-- One provider attempt per appointment. Never auto-expire/reclaim an uncertain send.
create table public.appointment_notifications (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  attempt_id uuid not null unique,
  state text not null check (state in ('sending','accepted','failed','unknown')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  provider_message_id text
);
alter table public.appointment_notifications enable row level security;
revoke all on public.appointment_notifications from public, anon, authenticated, service_role;

create function public.claim_appointment_confirmation(p_appointment_id uuid, p_owner_uid uuid, p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.appointments; n public.appointment_notifications;
begin
  -- Only the Edge Function's service client can execute; identity comes from getUser(jwt).
  if p_owner_uid is null or not exists(select 1 from auth.users where id=p_owner_uid and email_confirmed_at is not null) then
    raise exception using errcode='42501', message='Verified sign-in required.';
  end if;
  select * into a from public.appointments where id=p_appointment_id and owner_uid=p_owner_uid for share;
  if not found then raise exception using errcode='42501', message='Appointment unavailable.'; end if;
  if a.status <> 'active' or a.start_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode='22023', message='Appointment no longer eligible for confirmation.';
  end if;
  insert into public.appointment_notifications(appointment_id,attempt_id,state)
    values(a.id,p_attempt_id,'sending') on conflict (appointment_id) do nothing;
  if not found then
    select * into n from public.appointment_notifications where appointment_id=a.id;
    return pg_catalog.jsonb_build_object('claimed',false,'state',n.state);
  end if;
  -- Trust saved server snapshots; no client email/name/time parameters are accepted.
  return pg_catalog.jsonb_build_object('claimed',true,'state','sending','appointment',
    pg_catalog.jsonb_build_object('id',a.id,'patient_name',a.patient_name,'confirmation_email',a.confirmation_email,
      'doctor_name',a.doctor_name,'type_name',a.type_name,'start_at',a.start_at,'end_at',a.end_at));
end;
$$;
create function public.finish_appointment_confirmation(p_appointment_id uuid,p_attempt_id uuid,p_state text,p_message_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_state not in ('accepted','failed','unknown') then raise exception using errcode='22023',message='Invalid notification state.'; end if;
  update public.appointment_notifications set state=p_state,completed_at=pg_catalog.clock_timestamp(),
    provider_message_id=pg_catalog.left(p_message_id,500)
    where appointment_id=p_appointment_id and attempt_id=p_attempt_id and state='sending';
  if not found then raise exception using errcode='22023',message='Notification attempt unavailable.'; end if;
end;
$$;
revoke all on function public.claim_appointment_confirmation(uuid,uuid,uuid),public.finish_appointment_confirmation(uuid,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.claim_appointment_confirmation(uuid,uuid,uuid),public.finish_appointment_confirmation(uuid,uuid,text,text) to service_role;
commit;
