# QR check-in and analytics setup

The local application includes these features. **Hosted readiness remains blocked until migrations 007 and 008 are reviewed, applied and verified in an authorized environment.** No hosted changes are made by starting the local server.

## Required database changes

1. Confirm migrations 001–006 are already applied. Preserve the existing booking configuration, private staff membership and notification setup.
2. In the project’s Supabase Dashboard, Database → Extensions, verify **pgcrypto** is enabled. Migration 007 discovers its installed schema and uses its real cryptographic functions; it refuses setup if unavailable. There is no predictable fallback or new signing secret.
3. Review `supabase/migrations/202610100007_qr_checkin.sql`. Apply it in the SQL Editor in an authorized staging project first. It creates a private hashed-pass table and the owner issue / staff preview / staff consume RPCs. Confirm raw table access is denied.
4. Review/apply `supabase/migrations/202610100008_clinic_analytics.sql` after 007. It adds consultation state/timestamps, department catalogs/snapshots and staff-only analytics. It replaces the attendance RPC with the same signature and compatible existing actions. It does **not** replace booking/cancellation or notification functions.
5. Refresh the application and verify using staging fixtures: eligible patient pass; staff preview/confirm; concurrent consumption; expiry; cancellation; start consultation; metrics. Missing RPCs show setup guidance while existing workspaces remain available.

Do not rerun migration 006 after 008: it contains the older attendance function definition. Use the numbered order. The new migrations are transactional. Back up/review existing data first through your normal process. SQL in test bootstrap files belongs only to the disposable local test database, never a hosted project.

### Department configuration

Existing visits remain **Unassigned**. Configure actual department names and doctor IDs through administrator SQL after clinical review, for example:

```sql
-- Replace BOTH placeholders with reviewed catalog values; this is a setup example.
insert into public.departments (id, name)
values ('YOUR_DEPARTMENT_ID', 'YOUR_DEPARTMENT_NAME');
update public.doctors set department_id = 'YOUR_DEPARTMENT_ID'
where id = 'YOUR_EXISTING_DOCTOR_ID';
```

New bookings snapshot that association/name inside their existing transaction. Reassignment does not rewrite historical snapshots. There is no inferred specialty or public department editing UI.

## Workflow and privacy

- Patient: appointment details → Show check-in QR → Generate. Only scheduled eligible visits on the current Manila date, before their end, may issue. Today’s started visits are accessible through Past.
- Pass expires after 10 minutes or at visit end, whichever comes first. Reissue is limited to once per 30 seconds and invalidates the previous pass. A lost issuance response requires a deliberate retry after cooldown.
- QR is exactly `medisched:checkin:v1:` plus a random 64-character hex reference. No patient or appointment identifier is encoded. Browser pass/reference is cleared on close, expiry, navigation or session loss; only a SHA-256 token hash is stored server-side.
- Reception: Scan check-in QR → Start camera, or paste reception reference → Review → Confirm check-in. Scanning never mutates attendance. Retry an uncertain confirmation with the same action; the private durable result prevents a second attendance event. A different actor/action/version cannot replay the consumed pass.
- Cancellation, manual check-in, reissue and scanning use appointment-first locks. Attendance and pass consumption commit together. Appointment history and reservation behavior remain unchanged.
- Checked in → Start consultation → Complete. Server records actual timestamps. Older clients may still complete directly from checked-in, but such visits have unknown consultation start/wait. Historical check-in/completion backfill uses real recorded events only, or current checked-in update time.

Pass rows/consumed metadata are retained for retry/audit. No automated retention cleanup is installed. A pass is a temporary bearer reference: show it only at reception. No third-party QR generation endpoint receives the payload.

## Analytics definitions

Staff More → Clinic analytics. Today, 7-day and 30-day presets; custom inclusive range up to 93 days, no future end date; optional doctor filter applies to every metric.

| Metric | Definition / limitation |
|---|---|
| Daily visits | All saved visits by their **scheduled start date** in Manila, split active/cancelled. |
| Cancellations | Cancelled visits in that same scheduled-date cohort, not cancellation-event dates. |
| Doctor utilization | Active booked minutes intersecting clinic windows / current clinic-window capacity over selected dates. Reads clinic-hours catalog, excludes lunch; N/A if zero capacity. This is booked utilization, not work performed. Historical shift schedules are not known. |
| Recorded no-show rate | Explicit no_show / (completed + no_show), only non-cancelled visits that have ended. Shows denominator and ended-visit coverage. Unmarked visits are never inferred as no-shows; empty denominator = N/A. |
| Departments | Saved department snapshot counts by visit-date cohort; unknown historical assignments = Unassigned. |
| Average waiting | Mean real consultation_started_at − checked_in_at for non-cancelled selected visits, in minutes. Sample count and check-in coverage shown; missing history = N/A, measured zero remains zero. |

Only aggregates leave the analytics RPC. Reception preview deliberately omits age, address, email and owner UID.

## Local operation and checks

```powershell
cd C:\Users\Mojxd\Documents\ChatGPT\PORTFOLIO\MediSched
npm.cmd ci
npm.cmd run serve
```

Open `http://127.0.0.1:5173`. The QR encoder and fallback decoder are vendored locally, with licenses in `vendor/`. Camera requires HTTPS or trustworthy localhost and explicit permission. A phone opening an ordinary HTTP LAN address may not have camera access: manual reference entry remains available. The local server stays bound to 127.0.0.1; no automatic public exposure or deployment is included.

```powershell
npm.cmd test
# Installed PostgreSQL 18, dedicated synthetic port 55432/database medisched_test only:
& .\tools\start-test-postgres.ps1
npm.cmd run test:database
# Installed Playwright CLI, synthetic Supabase module only:
node tools/prepare-qr-cli.js
playwright-cli.cmd -s=qr-audit open http://127.0.0.1:5173/index.html
playwright-cli.cmd -s=qr-audit run-code --filename=evidence/qr-cli-prepared.js
playwright-cli.cmd -s=qr-audit close
```

The CLI script does not use real accounts or production writes. Its generated fixture and screenshots are ignored evidence. Close an old `qr-audit` session before repeating. See AUDIT.md for confirmed results and remaining tests. Physical phone cameras, iPhone Safari, hosted PostgREST/Auth and live Brevo delivery still need separate authorized verification.

## Early consultation — 11 October 2026

Apply `supabase/migrations/20261010193257_early_consultation.sql` after 008 in staging, then refresh the staff schedule. Do not rerun older migrations afterward, because they restore the previous workflow function.

Checked-in patients can now start consultation before their booked time. Once started, staff can complete immediately when finished. Actual check-in/start/completion timestamps still drive waiting time. Scheduled patients must first check in; same-day check-in, cancelled-visit protection, staff authorization and version/idempotency checks remain enforced. The booked slot and clinic hours are unchanged.

Local validation: 51 PostgreSQL integration tests and 50 unit tests passed. Playwright CLI passed the staff start/complete flow at 1440px and 390px using synthetic data. This migration has not been applied to hosted Supabase by the agent.
