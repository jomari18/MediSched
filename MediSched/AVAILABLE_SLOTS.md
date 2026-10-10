# Available appointment times

The approved schedule is **every day, 8 AM–5 PM**, with a **12 PM–1 PM lunch break**, for all listed doctors. Appointments last one hour and may start every 15 minutes. The last morning visit starts at 11 AM; afternoon visits start from 1 PM through 4 PM. A visit cannot cross lunch or closing time. All scheduling uses Philippine time (`Asia/Manila`, UTC+08:00).

## Apply to your existing MediSched project

This feature was implemented and checked locally. No hosted database or settings were changed, no site/function was deployed, and no real email was sent.

1. Open your **MediSched** Supabase project → **SQL Editor** → **New query**.
2. Open `supabase/migrations/202610090005_available_slots.sql` locally. Copy the **entire file** into the query and run it **once**. It assumes migrations 001–004 already exist. Do not rerun the old schema migrations or reset the database.
3. Check Table Editor → `clinic_hours`: there should be 14 rows, two for each weekday (Monday=1 through Sunday=7). Morning minutes: `480`–`720`; afternoon: `780`–`1020`.
4. Refresh the local MediSched app at `http://127.0.0.1:5173` (Ctrl+Shift+R). Choose **Schedule an appointment**, then a doctor and future date. Choose a full visit time from the list and save.

No new public keys, Auth changes, Brevo secrets or Edge Function deployment are needed for this feature. Keep existing booking readiness flags, RLS, Auth and email settings. Until migration 005 is applied, the picker reports administrator setup and prevents a new booking; it does not fall back to an unsafe client check. A Live Server address works too, provided it is already covered by your notification function's allowed origins.

For a fresh **disposable test project**, apply all migrations in filename order. Use the existing README for Auth/notification setup and booking readiness. Never apply `tests/postgres-bootstrap.sql` to Supabase.

## How availability and booking work

- The browser calls `list_available_slots` with only a stable doctor ID and Manila calendar date. Only verified authenticated patients can call it. It returns only `start_at` timestamps, never another patient's ID, name, address, owner or email.
- The function checks active appointments across all owners, using complete one-hour overlap calculations and the approved weekly clinic windows. Past starts are excluded. The query is bounded to one day and returns at most 96 distinct starts.
- Available times are a snapshot. Choosing a time does not reserve it. The existing transactional booking RPC and GiST exclusion constraint remain the final authority when users book simultaneously.
- A new database trigger also enforces clinic windows on bookings, preventing a modified client from bypassing lunch/closing restrictions. Existing records are not rewritten. Old out-of-hours visits remain visible, and their original request retries and valid future cancellations still work.
- A confirmed conflict refreshes times while retaining patient fields. A network/unknown save failure can mean the booking already committed: fields and refresh are locked, and **Retry reservation** reuses the exact request ID and details. Closing/reopening preserves that retry. After a reload, inspect appointments before creating a different reservation.
- Cancellation keeps its record and frees availability in the same transaction. Reopening the form or **Refresh times** reloads the latest snapshot. Appointment email failure still leaves a successful booking saved.

The weekly windows are administrator-owned, with no patient write grants. This version uses the same schedule for every doctor, including weekends. Doctor-specific hours, holidays and rescheduling are not included. Changing hours later requires a reviewed SQL change and matching the form's explanatory copy. Do not delete existing appointments to change hours.

## Verification and limitations

See [tests/RESULTS.md](tests/RESULTS.md). Local PostgreSQL tests exercise the real SQL, permissions, overlap constraint and concurrent transactions with synthetic Auth rows. Chromium checks use mocked Supabase responses, including stale requests, missing migration, conflicts and a committed booking whose response was lost.

Real Supabase Auth/PostgREST integration, this migration on the hosted project and iPhone Safari have not been verified by the agent. Apply and review migration 005 before using this feature against your hosted database. No automatic email was used in local tests.
