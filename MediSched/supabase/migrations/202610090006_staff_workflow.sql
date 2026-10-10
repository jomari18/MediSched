-- Additive clinic workflow. Apply only after review; never grants staff raw patient-table access.
begin;
create table if not exists medisched_private.staff_memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists medisched_private.workflow_rollout (
 singleton boolean primary key default true check(singleton), started_at timestamptz not null default clock_timestamp()
);
insert into medisched_private.workflow_rollout default values on conflict do nothing;
create table if not exists public.appointment_attendance (
 appointment_id uuid primary key references public.appointments(id) on delete restrict,
 state text not null default 'scheduled' check(state in ('scheduled','checked_in','completed','no_show')),
 version integer not null default 0 check(version>=0), updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
create table if not exists medisched_private.appointment_events (
 id uuid primary key default gen_random_uuid(), appointment_id uuid not null references public.appointments(id) on delete restrict,
 action_id uuid unique, event_type text not null check(event_type in ('booked','cancelled','checked_in','completed','no_show')),
 actor_uid uuid references auth.users(id) on delete set null, actor_role text not null check(actor_role in ('patient','staff','system')),
 actor_name text not null, patient_name text not null, doctor_id text not null, doctor_name text not null,
 occurred_at timestamptz not null, result_state text, result_version integer
);
create unique index if not exists appointment_lifecycle_event_once on medisched_private.appointment_events(appointment_id,event_type) where event_type in ('booked','cancelled');
create index if not exists appointment_events_time on medisched_private.appointment_events(occurred_at desc,id desc);
create index if not exists appointment_events_doctor_time on medisched_private.appointment_events(doctor_id,occurred_at desc,id desc);
create index if not exists appointments_staff_start on public.appointments(start_at,id);
create index if not exists appointments_staff_doctor_start on public.appointments(doctor_id,start_at,id);
alter table public.appointment_attendance enable row level security;
alter table medisched_private.staff_memberships enable row level security;
alter table medisched_private.workflow_rollout enable row level security;
alter table medisched_private.appointment_events enable row level security;
revoke all on public.appointment_attendance,medisched_private.staff_memberships,medisched_private.workflow_rollout,medisched_private.appointment_events from public,anon,authenticated,service_role;
grant select(appointment_id,state,version,updated_at) on public.appointment_attendance to authenticated;
drop policy if exists own_verified_attendance on public.appointment_attendance;
create policy own_verified_attendance on public.appointment_attendance for select to authenticated using (
 (select medisched_private.is_verified_user()) and exists(select 1 from public.appointments a where a.id=appointment_id and a.owner_uid=(select auth.uid()))
);
create or replace function medisched_private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select medisched_private.is_verified_user() and exists(select 1 from medisched_private.staff_memberships where user_id=auth.uid() and active)
$$;
create or replace function medisched_private.workflow_now() returns timestamptz language sql volatile security definer set search_path='' as $$select pg_catalog.clock_timestamp()$$;
create or replace function public.get_access_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not medisched_private.is_verified_user() then raise exception using errcode='42501',message='Verified sign-in required.';end if;
 return (select pg_catalog.jsonb_build_object('display_name',p.full_name,'is_staff',medisched_private.is_staff()) from public.profiles p where p.id=auth.uid());
end $$;
create or replace function medisched_private.record_appointment_event(p_appointment_id uuid,p_event text,p_action uuid default null,p_state text default null,p_version integer default null) returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_role text;v_name text;
begin
 if medisched_private.is_verified_user() then
   v_role:=case when medisched_private.is_staff() then 'staff' else 'patient' end;
   select full_name into v_name from public.profiles where id=v_uid;
 else v_uid:=null;v_role:='system';v_name:='System';end if;
 insert into medisched_private.appointment_events(appointment_id,action_id,event_type,actor_uid,actor_role,actor_name,patient_name,doctor_id,doctor_name,occurred_at,result_state,result_version)
 select a.id,p_action,p_event,v_uid,v_role,coalesce(v_name,'Account'),a.patient_name,a.doctor_id,a.doctor_name,medisched_private.workflow_now(),p_state,p_version from public.appointments a where a.id=p_appointment_id;
end $$;
create or replace function medisched_private.appointment_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
   if new.start_at >= (select started_at from medisched_private.workflow_rollout) then
     insert into public.appointment_attendance(appointment_id) values(new.id) on conflict do nothing;
   end if;
   perform medisched_private.record_appointment_event(new.id,'booked');
 elsif new.status='cancelled' and old.status<>'cancelled' then
   perform medisched_private.record_appointment_event(new.id,'cancelled');
 end if;
 return new;
end $$;
-- New attendance rows for future legacy visits; no fabricated historical audit events.
insert into public.appointment_attendance(appointment_id) select a.id from public.appointments a,medisched_private.workflow_rollout r where a.start_at>=r.started_at and a.status='active' on conflict do nothing;
drop trigger if exists medisched_appointment_lifecycle on public.appointments;
create trigger medisched_appointment_lifecycle after insert or update of status on public.appointments for each row execute function medisched_private.appointment_lifecycle();
create or replace function medisched_private.workflow_actions(p_status text,p_state text,p_start timestamptz,p_end timestamptz,p_now timestamptz) returns text[] language sql stable security definer set search_path='' as $$
 select case when p_status='cancelled' or p_start<(select started_at from medisched_private.workflow_rollout) then array[]::text[]
 when p_state='scheduled' then
  case when (p_start at time zone 'Asia/Manila')::date=(p_now at time zone 'Asia/Manila')::date and p_now<p_end then array['check_in'] else array[]::text[] end ||
  case when p_now>=p_end then array['no_show'] else array[]::text[] end
 when p_state='checked_in' and p_now>=p_start then array['complete'] else array[]::text[] end
$$;
create or replace function public.list_staff_appointments(p_date date,p_doctor_id text default null,p_search text default '',p_cursor timestamptz default null,p_cursor_id uuid default null,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_start timestamptz;v_search text:=pg_catalog.btrim(coalesce(p_search,''));v_now timestamptz:=medisched_private.workflow_now();v_result jsonb;
begin
 if not medisched_private.is_staff() then raise exception using errcode='42501',message='Clinic staff access required.';end if;
 if p_date is null or not pg_catalog.isfinite(p_date) or p_limit is null or p_limit<1 or p_limit>100 or pg_catalog.length(v_search)>120 or (p_cursor is null)<>(p_cursor_id is null) or (p_cursor is not null and not pg_catalog.isfinite(p_cursor)) then raise exception using errcode='22023',message='Invalid date, search, cursor or page size.';end if;
 if p_doctor_id is not null and not exists(select 1 from public.doctors where id=p_doctor_id) then raise exception using errcode='22023',message='Choose a listed doctor.';end if;
 v_start:=p_date::timestamp at time zone 'Asia/Manila';
 with filtered as (
  select a.id,a.patient_name,a.doctor_id,a.doctor_name,a.type_name,a.start_at,a.end_at,a.status,
   case when a.status='cancelled' then 'cancelled' when a.start_at<r.started_at then 'not_recorded' else coalesce(w.state,'scheduled') end as attendance_state,
   coalesce(w.version,0) as version,medisched_private.workflow_actions(a.status,coalesce(w.state,'scheduled'),a.start_at,a.end_at,v_now) as allowed_actions
  from public.appointments a cross join medisched_private.workflow_rollout r left join public.appointment_attendance w on w.appointment_id=a.id
  where a.start_at>=v_start and a.start_at<v_start+interval '1 day' and (p_doctor_id is null or a.doctor_id=p_doctor_id)
   and (v_search='' or pg_catalog.strpos(pg_catalog.lower(a.patient_name),pg_catalog.lower(v_search))>0)
 ), page as (select * from filtered where p_cursor is null or (start_at,id)>(p_cursor,p_cursor_id) order by start_at,id limit p_limit+1),
 shown as (select * from page order by start_at,id limit p_limit)
 select pg_catalog.jsonb_build_object(
  'items',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by start_at,id) from shown s),'[]'::jsonb),
  'totals',(select pg_catalog.jsonb_build_object('total',count(*),'checked_in',count(*) filter(where attendance_state='checked_in'),'completed',count(*) filter(where attendance_state='completed'),'no_show',count(*) filter(where attendance_state='no_show')) from filtered),
  'next_cursor',case when (select count(*) from page)>p_limit then (select pg_catalog.jsonb_build_object('at',start_at,'id',id) from shown order by start_at desc,id desc limit 1) else null end
 ) into v_result;
 return v_result;
end $$;
create or replace function public.list_staff_activity(p_date date,p_doctor_id text default null,p_cursor timestamptz default null,p_cursor_id uuid default null,p_limit integer default 25) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_start timestamptz;v_result jsonb;
begin
 if not medisched_private.is_staff() then raise exception using errcode='42501',message='Clinic staff access required.';end if;
 if p_date is null or not pg_catalog.isfinite(p_date) or p_limit is null or p_limit<1 or p_limit>100 or (p_cursor is null)<>(p_cursor_id is null) or (p_cursor is not null and not pg_catalog.isfinite(p_cursor)) then raise exception using errcode='22023',message='Invalid date, cursor or page size.';end if;
 if p_doctor_id is not null and not exists(select 1 from public.doctors where id=p_doctor_id) then raise exception using errcode='22023',message='Choose a listed doctor.';end if;
 v_start:=p_date::timestamp at time zone 'Asia/Manila';
 with page as (
 select id,appointment_id,event_type,actor_name,actor_role,patient_name,doctor_name,occurred_at from medisched_private.appointment_events
 where occurred_at>=v_start and occurred_at<v_start+interval '1 day' and (p_doctor_id is null or doctor_id=p_doctor_id)
 and (p_cursor is null or (occurred_at,id)<(p_cursor,p_cursor_id)) order by occurred_at desc,id desc limit p_limit+1
 ),shown as (select * from page order by occurred_at desc,id desc limit p_limit)
 select pg_catalog.jsonb_build_object('items',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) order by occurred_at desc,id desc) from shown s),'[]'::jsonb),
 'next_cursor',case when (select count(*) from page)>p_limit then (select pg_catalog.jsonb_build_object('at',occurred_at,'id',id) from shown order by occurred_at,id limit 1) else null end) into v_result;
 return v_result;
end $$;
create or replace function public.set_appointment_attendance(p_appointment_id uuid,p_action text,p_action_id uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;w public.appointment_attendance;e medisched_private.appointment_events;v_state text;v_now timestamptz:=medisched_private.workflow_now();
begin
 if not medisched_private.is_staff() then raise exception using errcode='42501',message='Clinic staff access required.';end if;
 if p_action_id is null or p_expected_version is null or p_expected_version<0 or p_action is null or p_action not in ('check_in','complete','no_show') then raise exception using errcode='22023',message='Invalid attendance request.';end if;
 select * into a from public.appointments where id=p_appointment_id for update;
 if not found then raise exception using errcode='42501',message='Appointment unavailable.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_action_id::text,0));
 select * into e from medisched_private.appointment_events where action_id=p_action_id;
 v_state:=case p_action when 'check_in' then 'checked_in' when 'complete' then 'completed' else 'no_show' end;
 if found then
  if e.appointment_id<>a.id or e.actor_uid is distinct from auth.uid() or e.event_type<>v_state then raise exception using errcode='22023',message='Action ID was used for a different request.';end if;
  return pg_catalog.jsonb_build_object('appointment_id',a.id,'state',e.result_state,'version',e.result_version,'action_id',p_action_id,'replayed',true);
 end if;
 if a.status='cancelled' or a.start_at<(select started_at from medisched_private.workflow_rollout) then raise exception using errcode='22023',message='This appointment cannot receive attendance actions.';end if;
 insert into public.appointment_attendance(appointment_id) values(a.id) on conflict do nothing;
 select * into w from public.appointment_attendance where appointment_id=a.id for update;
 if w.version<>p_expected_version then raise exception using errcode='40001',message='Appointment changed. Refresh before trying again.';end if;
 v_now:=medisched_private.workflow_now(); -- Evaluate time after waiting for reservation/workflow locks.
 if not p_action=any(medisched_private.workflow_actions(a.status,w.state,a.start_at,a.end_at,v_now)) then raise exception using errcode='22023',message='Attendance action is unavailable at this time or state.';end if;
 update public.appointment_attendance set state=v_state,version=version+1,updated_at=v_now,updated_by=auth.uid() where appointment_id=a.id returning * into w;
 perform medisched_private.record_appointment_event(a.id,v_state,p_action_id,w.state,w.version);
 return pg_catalog.jsonb_build_object('appointment_id',a.id,'state',w.state,'version',w.version,'action_id',p_action_id,'replayed',false);
end $$;
revoke all on function medisched_private.is_staff(),medisched_private.workflow_now(),medisched_private.record_appointment_event(uuid,text,uuid,text,integer),medisched_private.appointment_lifecycle(),medisched_private.workflow_actions(text,text,timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.get_access_context(),public.list_staff_appointments(date,text,text,timestamptz,uuid,integer),public.list_staff_activity(date,text,timestamptz,uuid,integer),public.set_appointment_attendance(uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_access_context(),public.list_staff_appointments(date,text,text,timestamptz,uuid,integer),public.list_staff_activity(date,text,timestamptz,uuid,integer),public.set_appointment_attendance(uuid,text,uuid,integer) to authenticated;
commit;
