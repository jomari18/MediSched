# Clinic staff setup

Apply `supabase/migrations/202610090006_staff_workflow.sql` after migrations 001–005 in authorized staging first. This is an additive migration: no existing booking RPC or owner RLS policy is replaced. Review memberships, attendance, audit tables and explicit execute grants before applying it to production.

Use an existing email-confirmed account. Edit and manually run `supabase/setup/staff-access.sql` with the approved staff email; never paste a service key into the browser. Only the project owner assigns/revokes staff. The role is checked from the private membership table on every staff RPC; signup metadata is ignored.

Verify a normal patient cannot access staff RPCs or raw other-patient rows; verify staff can load the bounded daily projection, then revoke the role and verify subsequent calls reject. Restore staff only if appropriate. Already-running transactions are not retroactively revoked.

Attendance is separate from reservations. Checked-in/completed/no-show never frees a booking. Owner cancellation remains allowed before start, including early check-in, and retains history. Events begin at rollout; legacy outcomes are not fabricated. New public attendance grants expose only owner-scoped state/version/time fields.

No hosted migration, role assignment, deployment or real email is run by local tests. Full hosted readiness requires this setup and authorized real Supabase integration checks. PostgreSQL tests use synthetic Auth rows and an isolated test clock; the shipped clock has no client grants or override input.

## Apply manually in authorized staging

1. Open `supabase/migrations/202610090006_staff_workflow.sql`, review it and run its complete contents once in the staging project SQL Editor after 001–005. Do not rerun earlier production migrations.
2. Open `supabase/setup/staff-access.sql`. Replace `REPLACE_WITH_CONFIRMED_STAFF_EMAIL` with the exact confirmed account email, review the selected identity and run the assignment block manually. The commented revocation statement is a separate action.
3. Restart the local server if it predates this change, then sign out/in. Verified staff route to `staff.html`; ordinary users route to their patient dashboard. Staff can use More → Switch workspace for their own appointments. Existing OTP/Brevo settings require no changes from this upgrade.
4. Check owner-only patient data, staff daily projections, booking/cancellation, all attendance transitions and audit events. Revoke a test staff membership and refresh its existing session; it must lose clinic access. Never use editable signup metadata to assign roles.
5. Before any production rollout, review legacy cutoff/history and run the authorized real-service/device checks in `tests/PORTALS_RESULTS.md` and `MOBILE_CHECKLIST.md`. This local work does not perform that rollout.
