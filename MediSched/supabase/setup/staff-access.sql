-- Review and run manually in an authorized Supabase SQL editor after migration 006.
-- Replace the placeholder; use a confirmed account. Never expose this SQL through the app.
do $$
declare target uuid; approved_email text := 'REPLACE_WITH_CONFIRMED_STAFF_EMAIL';
begin
 if approved_email='REPLACE_WITH_CONFIRMED_STAFF_EMAIL' then raise exception 'Set the approved staff email first';end if;
 select id into target from auth.users where lower(email)=lower(approved_email) and email_confirmed_at is not null;
 if target is null then raise exception 'Confirmed account not found';end if;
 insert into medisched_private.staff_memberships(user_id,active) values(target,true) on conflict(user_id) do update set active=true,updated_at=now();
end $$;
-- Revoke separately after replacing the same email:
-- update medisched_private.staff_memberships set active=false,updated_at=now()
-- where user_id=(select id from auth.users where lower(email)=lower('REPLACE_WITH_CONFIRMED_STAFF_EMAIL'));
