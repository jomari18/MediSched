-- Apply after 008. Checked-in patients may begin their consultation early.
-- Existing staff authorization, version checks and actual timestamps remain in the RPC.
begin;
create or replace function medisched_private.workflow_actions(p_status text,p_state text,p_start timestamptz,p_end timestamptz,p_now timestamptz) returns text[] language sql stable security definer set search_path='' as $$
 select case when p_status='cancelled' or p_start<(select started_at from medisched_private.workflow_rollout) then array[]::text[]
 when p_state='scheduled' then
  case when (p_start at time zone 'Asia/Manila')::date=(p_now at time zone 'Asia/Manila')::date and p_now<p_end then array['check_in'] else array[]::text[] end ||
  case when p_now>=p_end then array['no_show'] else array[]::text[] end
 when p_state='checked_in' then
  case when p_now>=p_start then array['start_consultation','complete'] else array['start_consultation'] end
 when p_state='in_consultation' then array['complete'] else array[]::text[] end
$$;
commit;
