-- Additive consultation timing and staff-only aggregates. Apply after 007.
begin;
alter table public.appointment_attendance drop constraint if exists appointment_attendance_state_check;
alter table public.appointment_attendance add constraint appointment_attendance_state_check check(state in ('scheduled','checked_in','in_consultation','completed','no_show'));
alter table medisched_private.appointment_events drop constraint if exists appointment_events_event_type_check;
alter table medisched_private.appointment_events add constraint appointment_events_event_type_check check(event_type in ('booked','cancelled','checked_in','consultation_started','completed','no_show'));
alter table public.appointment_attendance add column if not exists checked_in_at timestamptz;
alter table public.appointment_attendance add column if not exists consultation_started_at timestamptz;
alter table public.appointment_attendance add column if not exists completed_at timestamptz;
alter table public.appointment_attendance drop constraint if exists attendance_timing_order;
alter table public.appointment_attendance add constraint attendance_timing_order check(consultation_started_at is null or (checked_in_at is not null and consultation_started_at>=checked_in_at));
-- Only actual recorded events or a currently checked-in state's update time.
update public.appointment_attendance w set checked_in_at=coalesce(w.checked_in_at,(select min(e.occurred_at) from medisched_private.appointment_events e where e.appointment_id=w.appointment_id and e.event_type='checked_in'),case when w.state='checked_in' then w.updated_at end),completed_at=coalesce(w.completed_at,(select min(e.occurred_at) from medisched_private.appointment_events e where e.appointment_id=w.appointment_id and e.event_type='completed'));
grant select(checked_in_at,consultation_started_at,completed_at) on public.appointment_attendance to authenticated;
create table if not exists public.departments(id text primary key,name text unique not null check(pg_catalog.length(pg_catalog.btrim(name)) between 1 and 100));
alter table public.departments enable row level security;
revoke all on public.departments from public,anon,authenticated,service_role;
grant select on public.departments to authenticated;
drop policy if exists verified_department_catalog on public.departments;
create policy verified_department_catalog on public.departments for select to authenticated using((select medisched_private.is_verified_user()));
alter table public.doctors add column if not exists department_id text references public.departments(id) on delete restrict;
alter table public.appointments add column if not exists department_id text references public.departments(id) on delete restrict;
alter table public.appointments add column if not exists department_name text;
create or replace function medisched_private.snapshot_appointment_department() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select d.department_id,p.name into new.department_id,new.department_name from public.doctors d left join public.departments p on p.id=d.department_id where d.id=new.doctor_id;
 return new;
end $$;
drop trigger if exists medisched_department_snapshot on public.appointments;
create trigger medisched_department_snapshot before insert on public.appointments for each row execute function medisched_private.snapshot_appointment_department();
create or replace function medisched_private.workflow_actions(p_status text,p_state text,p_start timestamptz,p_end timestamptz,p_now timestamptz) returns text[] language sql stable security definer set search_path='' as $$
 select case when p_status='cancelled' or p_start<(select started_at from medisched_private.workflow_rollout) then array[]::text[]
 when p_state='scheduled' then
  case when (p_start at time zone 'Asia/Manila')::date=(p_now at time zone 'Asia/Manila')::date and p_now<p_end then array['check_in'] else array[]::text[] end ||
  case when p_now>=p_end then array['no_show'] else array[]::text[] end
 when p_state='checked_in' and p_now>=p_start then array['start_consultation','complete']
 when p_state='in_consultation' and p_now>=p_start then array['complete'] else array[]::text[] end
$$;
create or replace function public.get_clinic_analytics(p_from date,p_to date,p_doctor_id text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=medisched_private.workflow_now();v_result jsonb;
begin
 if not medisched_private.is_staff() then raise exception using errcode='42501',message='Clinic staff access required.';end if;
 if p_from is null or p_to is null or not pg_catalog.isfinite(p_from) or not pg_catalog.isfinite(p_to) or p_to<p_from or p_to-p_from>92 or p_to>(v_now at time zone 'Asia/Manila')::date then raise exception using errcode='22023',message='Choose up to 93 inclusive days through today.';end if;
 if p_doctor_id is not null and not exists(select 1 from public.doctors where id=p_doctor_id) then raise exception using errcode='22023',message='Choose a listed doctor.';end if;
 with dates as(select (p_from+n)::date as day from pg_catalog.generate_series(0,p_to-p_from)n),
 windows as(select d.day,(d.day::timestamp+pg_catalog.make_interval(mins=>h.opens_minute)) at time zone 'Asia/Manila' as opens_at,(d.day::timestamp+pg_catalog.make_interval(mins=>h.closes_minute)) at time zone 'Asia/Manila' as closes_at from dates d join public.clinic_hours h on h.weekday=extract(isodow from d.day)),
 cohort as(select a.*,(a.start_at at time zone 'Asia/Manila')::date as day,w.state,w.checked_in_at,w.consultation_started_at from public.appointments a left join public.appointment_attendance w on w.appointment_id=a.id where a.start_at>=p_from::timestamp at time zone 'Asia/Manila' and a.start_at<(p_to+1)::timestamp at time zone 'Asia/Manila' and (p_doctor_id is null or a.doctor_id=p_doctor_id)),
 totals as(select count(*) total,count(*) filter(where status='cancelled') cancelled,count(*) filter(where status='active') active,count(*) filter(where status='active' and end_at<=v_now) ended_visits,count(*) filter(where status='active' and end_at<=v_now and state='no_show') no_show_count,count(*) filter(where status='active' and end_at<=v_now and state in ('completed','no_show')) no_show_denominator,count(*) filter(where status='active' and checked_in_at is not null) checked_in_samples,count(*) filter(where status='active' and consultation_started_at is not null and checked_in_at is not null) wait_samples,avg(extract(epoch from (consultation_started_at-checked_in_at))/60) filter(where status='active' and consultation_started_at is not null and checked_in_at is not null) average_wait_minutes from cohort),
 summary as(select t.*,case when no_show_denominator>0 then 100.0*no_show_count/no_show_denominator else null end no_show_rate from totals t),
 daily as(select d.day,count(c.id) total,count(c.id) filter(where c.status='active') active,count(c.id) filter(where c.status='cancelled') cancelled from dates d left join cohort c on c.day=d.day group by d.day),
 capacity as(select coalesce(sum(extract(epoch from(closes_at-opens_at))/60),0) minutes from windows),
 doctor_ids as(select d.id,d.name from public.doctors d where (p_doctor_id is null or d.id=p_doctor_id) and (d.active or exists(select 1 from cohort c where c.doctor_id=d.id))),
 doctor_minutes as(select d.id,d.name,cap.minutes capacity_minutes,coalesce((select sum(greatest(0,extract(epoch from(least(c.end_at,w.closes_at)-greatest(c.start_at,w.opens_at)))/60)) from cohort c join windows w on c.start_at<w.closes_at and c.end_at>w.opens_at where c.doctor_id=d.id and c.status='active'),0) booked_minutes from doctor_ids d cross join capacity cap),
 doctors as(select m.*,case when capacity_minutes>0 then 100.0*booked_minutes/capacity_minutes else null end utilization_percent from doctor_minutes m),
 departments as(select coalesce(department_id,'') id,coalesce(department_name,'Unassigned') name,count(*) total,count(*) filter(where status='active') active,count(*) filter(where status='cancelled') cancelled from cohort group by department_id,department_name)
 select pg_catalog.jsonb_build_object('from',p_from,'to',p_to,'timezone','Asia/Manila','generated_at',v_now,
 'summary',(select pg_catalog.to_jsonb(s) from summary s),
 'daily',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by day) from daily d),'[]'::jsonb),
 'doctors',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by booked_minutes desc,name) from doctors d),'[]'::jsonb),
 'departments',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) order by total desc,name) from departments d),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
create or replace function public.set_appointment_attendance(p_appointment_id uuid,p_action text,p_action_id uuid,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.appointments;w public.appointment_attendance;e medisched_private.appointment_events;v_state text;v_now timestamptz:=medisched_private.workflow_now();
begin
 if not medisched_private.is_staff() then raise exception using errcode='42501',message='Clinic staff access required.';end if;
 if p_action_id is null or p_expected_version is null or p_expected_version<0 or p_action is null or p_action not in ('check_in','start_consultation','complete','no_show') then raise exception using errcode='22023',message='Invalid attendance request.';end if;
 select * into a from public.appointments where id=p_appointment_id for update;
 if not found then raise exception using errcode='42501',message='Appointment unavailable.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_action_id::text,0));
 select * into e from medisched_private.appointment_events where action_id=p_action_id;
 v_state:=case p_action when 'check_in' then 'checked_in' when 'start_consultation' then 'in_consultation' when 'complete' then 'completed' else 'no_show' end;
 if found then
  if e.appointment_id<>a.id or e.actor_uid is distinct from auth.uid() or e.event_type<>(case when v_state='in_consultation' then 'consultation_started' else v_state end) then raise exception using errcode='22023',message='Action ID was used for a different request.';end if;
  return pg_catalog.jsonb_build_object('appointment_id',a.id,'state',e.result_state,'version',e.result_version,'action_id',p_action_id,'replayed',true);
 end if;
 if a.status='cancelled' or a.start_at<(select started_at from medisched_private.workflow_rollout) then raise exception using errcode='22023',message='This appointment cannot receive attendance actions.';end if;
 insert into public.appointment_attendance(appointment_id) values(a.id) on conflict do nothing;
 select * into w from public.appointment_attendance where appointment_id=a.id for update;
 if w.version<>p_expected_version then raise exception using errcode='40001',message='Appointment changed. Refresh before trying again.';end if;
 v_now:=medisched_private.workflow_now(); -- Evaluate time after waiting for reservation/workflow locks.
 if not p_action=any(medisched_private.workflow_actions(a.status,w.state,a.start_at,a.end_at,v_now)) then raise exception using errcode='22023',message='Attendance action is unavailable at this time or state.';end if;
 update public.appointment_attendance set state=v_state,version=version+1,updated_at=v_now,updated_by=auth.uid() where appointment_id=a.id returning * into w;
 update public.appointment_attendance set checked_in_at=case when p_action='check_in' then v_now else checked_in_at end,consultation_started_at=case when p_action='start_consultation' then v_now else consultation_started_at end,completed_at=case when p_action='complete' then v_now else completed_at end where appointment_id=a.id;
 perform medisched_private.record_appointment_event(a.id,case when v_state='in_consultation' then 'consultation_started' else v_state end,p_action_id,w.state,w.version);
 return pg_catalog.jsonb_build_object('appointment_id',a.id,'state',w.state,'version',w.version,'action_id',p_action_id,'replayed',false);
end $$;

revoke all on function medisched_private.snapshot_appointment_department(),medisched_private.workflow_actions(text,text,timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.get_clinic_analytics(date,date,text),public.set_appointment_attendance(uuid,text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_clinic_analytics(date,date,text),public.set_appointment_attendance(uuid,text,uuid,integer) to authenticated;
commit;



