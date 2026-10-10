# MediSched

**UI update (10 October 2026):** the approved white/blush/red mockups are implemented across landing, auth, patient booking/history and shared staff styles. The landing and workspaces now use the supplied medical PNG/SVG pack in `assets/medical-pack`; existing dark mode is retained. No backend migration is needed for this visual update. See [AUDIT.md](AUDIT.md) for the latest Playwright CLI results, screenshots, intentional differences and verification limits.

Vanilla HTML/CSS/JavaScript appointment app developed solely by **Jomari M. Candido**, Computer Science graduate. Supabase Auth, relational PostgreSQL tables, RLS and transactional RPCs replace the repaired Firebase implementation. The approved red-accent light/dark workspace includes a patient overview, owner-only progress/details, private staff daily schedule/activity and app-like mobile navigation. Accessible forms, reduced motion and secure booking/email behavior are preserved.

**Apply migration 006 before using this updated interface.** See [STAFF_SETUP.md](STAFF_SETUP.md) for staging setup, manual staff assignment/revocation and rollout history. No hosted database, settings, function or Site were changed; no real email was sent. Production readiness remains blocked until authorized backend setup and real-service verification.

## Run the interface

```sh
npm ci
npm run serve
```

If PowerShell blocks `npm.ps1`, use `npm.cmd ci` and `npm.cmd run serve` instead.

Open http://127.0.0.1:5173. VS Code Live Server also works. Keep your existing Supabase public credentials in `config.js`. An empty template configuration shows a setup message. Signup codes and appointment emails require the setup in [EMAIL_SETUP.md](EMAIL_SETUP.md). Firebase and Java emulators are no longer required. The pinned browser client comes from esm.sh, so the interface needs internet access to load it. The local server serves only application files.

For an existing project with migrations 001–005 already applied, apply only the additive `supabase/migrations/202610090006_staff_workflow.sql` in authorized staging first. Do not rerun earlier migrations. The new access-context RPC is required by both patient and staff pages; missing setup fails closed.

## MediSched Supabase Dashboard setup

1. Use your **existing dedicated MediSched project** and preserve its database and settings. A separate disposable project is appropriate for fresh testing. Do not use the ZolTrack or ZolNutrition projects.
2. For a **fresh disposable project**, apply migrations 001–006 in filename order. For an existing project, apply only missing additive migrations after review. Migration 005 clinic-hour setup is in [AVAILABLE_SLOTS.md](AVAILABLE_SLOTS.md), migration 004 notifications in [EMAIL_SETUP.md](EMAIL_SETUP.md), and migration 006 staff access/attendance in [STAFF_SETUP.md](STAFF_SETUP.md). Do not replay 001–003 against existing schemas. Verify `btree_gist` under Database → Extensions.
3. Inspect `profiles`, `doctors`, `appointment_types`, `appointments`, `appointment_attendance` and `booking_configuration` in Table Editor. Patient records stay owner-only through the public API. Dashboard administrators can inspect them through their privileged connection.
4. Keep Email/password and **Confirm email** enabled. Configure the Confirm signup template with `{{ .Token }}`, 8-digit email codes and Brevo SMTP using the approved sender **MediSched <jomaricandido18@gmail.com>**. The frontend uses `verifyOtp` with `type: 'email'` and signup `resend`. See [EMAIL_SETUP.md](EMAIL_SETUP.md) for exact settings, template and sources.
5. Keep the existing Site URL. Code confirmation uses a verification screen; previously issued links remain supported. Match `config.js` Auth code length/cooldown to your server settings. Passwords and OTPs are never persisted.
6. Retain/copy only the project's **URL and publishable/anon key** in `config.js`. Apply the additive notification migration and configure/deploy `appointment-confirmation` with Edge Function secrets as described in [EMAIL_SETUP.md](EMAIL_SETUP.md). Auth SMTP handles account verification only; appointment confirmations use the server-side Brevo API. No hosted settings or deployment were performed here.
7. Booking is closed by default. For an empty **test** project, after reviewing the schema, set the singleton `booking_configuration` row's `enabled` and `migration_approved` booleans to true in Table Editor. For production, complete [MIGRATION.md](MIGRATION.md) first; never approve unresolved legacy conflicts.

These are instructions for you to apply later; no Dashboard changes were made here.

## Database and appointment contract

- Profiles are created by an Auth insert trigger in the signup transaction. A successful signup with `session: null` is expected. The browser never inserts profiles before confirmation. A missing profile produces an administrator setup message rather than asking users to register twice.
- RPCs derive ownership from `auth.uid()` and check `auth.users.email_confirmed_at`. Editable user metadata cannot grant verified access. RLS permits confirmed owners to read their profiles/appointments; clients have no insert/update/delete grants. Catalogs contain no patient details.
- Appointments use stable UUID request IDs, stable doctor/type IDs and foreign keys. Times are `timestamptz`, displayed/scheduled in Asia/Manila (UTC+08:00). Visits last one hour and begin on quarter-hour boundaries. The approved schedule is every day, 8 AM–5 PM, with lunch from 12 PM–1 PM; visits must fit fully within a window. Last starts are 11 AM before lunch and 4 PM before closing. Database enforcement covers modified clients too. Existing out-of-hours records remain intact; underlying half-open `[start,end)` overlap rules still handle historical midnight boundaries.
- `list_available_slots` checks all owners' active reservations but returns only free start times for one doctor/day. Its verified-only SECURITY DEFINER function has a fixed empty search path. Choosing a time is a snapshot; the atomic booking constraint resolves simultaneous requests. Missing migration/load errors disable new booking with actionable feedback. Refresh/doctor/date changes cannot let an old response overwrite the current list.
- A partial GiST exclusion constraint rejects overlapping `active` appointments per doctor, including concurrent requests from different users. Conflict messages omit PostgreSQL details identifying the other row. `book_appointment` and `cancel_appointment` are SECURITY DEFINER with empty `search_path`, qualified references and explicit checks; only authenticated callers can execute them.
- Identical request ID/normalized payload retries return the saved record, even after its start or cancellation. Changed payloads and other owners are rejected. After a lost/unknown save response, the form locks its fields and retries the same payload and ID to avoid duplicates. A definitive conflict refreshes times while preserving patient fields. Cancellation preserves history, atomically releases availability, and rejects visits that have started. Upcoming/Past are calculated from start time; started visits appear in Past. Cancelled takes precedence.
- Supabase Auth sends signup verification codes through Brevo SMTP. Appointment confirmations invoke an authenticated Edge Function with only the saved appointment ID; trusted server snapshots supply the recipient/details. A durable ledger permits one automatic provider attempt per appointment. Notification failure leaves the booking saved and shows a separate error. See [EMAIL_SETUP.md](EMAIL_SETUP.md) for duplicate/delivery limits and operational review. Across reloads, check your appointment list before creating a new request after a lost response. Clinical retention/account deletion needs separate review: appointment history prevents deleting its referenced profile.

## Verification

```sh
npm test
npm run test:browser
npm run test:database
npm run test:mobile
npm run test:supabase
```

The table below records historical implementation validation. Fresh October 9 repair results are in the final section and AUDIT.md.

| Check | Confirmed result |
| --- | --- |
| Unit tests | 37 passed: session epochs, theme behavior, staff adapter, attendance plus existing Auth/OTP/time/notification tests |
| Chromium with Supabase mocks | 42 scenarios passed: existing authentication, slots, booking/cancellation/email behavior plus staff routing, actions/retry, revocation, pagination and stale responses |
| PostgreSQL 18 with synthetic Auth fixtures | 38 passed: existing invariants plus private staff projections, grants, audit/version/idempotency and real concurrent workflow/cancellation checks |
| Phone/desktop Chromium matrix | 43 checks passed; see [tests/PORTALS_RESULTS.md](tests/PORTALS_RESULTS.md) |
| Full Supabase stack | **1 test skipped**: local Supabase services/test-only configuration unavailable; standalone PostgreSQL does not verify GoTrue/PostgREST/email delivery |
| Hosted Supabase, Edge runtime deployment, real Brevo SMTP/API delivery, iPhone Safari | **Not tested** |

Browser tests use installed Playwright and Chrome (`CHROME_PATH` can override its path); they start an isolated preview on port 5174. Screenshots are in `evidence/supabase-*.png`. Database tests only accept `medisched_test` on loopback port 55432 and require the private test cluster; `tests/postgres-bootstrap.sql` supplies stand-in Auth helpers and must **never** be applied to Supabase. The test connection is a privileged local synthetic fixture, not browser credentials.

To restart that private test cluster on this PC, run `powershell -ExecutionPolicy Bypass -File tools/start-test-postgres.ps1` (uses the installed PostgreSQL 18 binaries; `MEDISCHED_PG_BIN` can override their directory). To stop it after testing, use `"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D .local-db stop` from a command prompt in MediSched. The cluster contains synthetic data only and listens on loopback, separate from existing PostgreSQL services.

For a full local Supabase check when Docker works: use the Supabase CLI's `supabase start`, then `supabase db reset --local` **only in this MediSched folder** to apply the migrations to its disposable local stack. Local Auth email confirmations go to its local inbox (port 54324). For `test:supabase`, supply `SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLIC_KEY`, `SUPABASE_TEST_SERVICE_ROLE_KEY` and `SUPABASE_TEST_DB_URL` in the test terminal only. That test refuses hosted hosts and uses local API port 54321/database port 54322. It creates/cleans up its own synthetic accounts. Keep secret keys out of config.js and source files.

Remaining verification: review/apply migration 006 after 001–005 in authorized staging, assign/revoke a confirmed staff account, full Supabase Auth/PostgREST/OTP/Edge integration, any required legacy identity/data review, real email delivery, mobile Safari, clinical approval of catalogs and CDN/offline handling. The project schedule was specified by the owner; it is not a claim of a real clinic's approval. Local tests do not establish production readiness.

References: [Supabase functions/security](https://supabase.com/docs/guides/database/functions), [email signup](https://supabase.com/docs/reference/javascript/auth-signup), [OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp), [supported extensions](https://supabase.com/docs/guides/database/extensions).

## Patient, staff and phone experience

Patient accounts land on their overview; only database-assigned verified staff land on `staff.html`. Staff can switch to their own patient workspace in More. Attendance (Scheduled, Checked in, Completed, No show) is separate from active/cancelled reservations. Legacy outcomes are never inferred, and attendance never releases a reserved interval. Every RPC rechecks private staff membership. Uncertain attendance saves retain the exact action UUID for retry; reload current state before another action.

Below 768px, labelled bottom navigation, safe-area padding, stacked forms and scrollable dialogs provide an app-like online interface. Theme preference persists; passwords and OTPs do not. Home-screen metadata and local icons are included; there is no service worker or offline patient cache. See [MOBILE_CHECKLIST.md](MOBILE_CHECKLIST.md) and [tests/PORTALS_RESULTS.md](tests/PORTALS_RESULTS.md) for emulation evidence and physical-device checks still needed. Regenerate icons, if needed, with `node tools/generate-icons.cjs` after installing the existing dev dependencies and making local Chrome available.

## Landing scene and October 9 repair verification

The approved landing page uses the existing vanilla stack with a lazy-loaded **Spline runtime 2.0.75**. `landing.js` loads the supplied production scene; `landing.css` keeps it separate from the account forms. No package installation, database migration or new secret is required for this change.

The integration uses the runtime's documented WebGL backend to avoid a Windows WebGPU teardown error found during testing. Embedded scene HTML is disabled. The reference's named `UI` group is hidden locally and the cubes are tinted red; the hosted export is unchanged. Attribution: [Boxes Hover by vladkolokolnikov](https://community.spline.design/file/a1f156f7-ef01-42d1-bf7b-5be1b7967b0a), adapted under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Artwork attribution is available through the footer's Artwork credit link.

Phones below 768px skip the scene and its download. Reduced-motion and data-saving preferences use a static poster. Loading/failure does not block forms; a 15-second timeout provides a static fallback. Rendering freezes outside pointer interaction; no scene hint or Pause button is shown. The runtime and scene require access to unpkg and Spline's CDN. Do not replace the production export URL with a community/editor URL. See [Spline's vanilla Code API](https://docs.spline.design/exporting-your-scene/web/code-api-for-web) and [runtime documentation](https://www.npmjs.com/package/@splinetool/runtime).

Fresh verification for this repair: **41 unit tests passed** and **64 Playwright CLI layout observations** across login/registration, patient and staff views passed. The five reported defects have targeted browser reproductions passing. The actual Spline export, reduced-motion/mobile skips, pause/retry and delayed/failed load fallbacks were checked. An intermittent external WebGL shader warning from an earlier pass is documented; it did not recur in the final repeat. Earlier integration-suite totals above are historical and were not rerun as part of this repair.

Read [AUDIT.md](AUDIT.md) for bug severity, reproduction steps, before/after behavior, screenshot references, current test evidence and untested production/device flows. Tests did not create real appointments, send emails or change hosted settings. Local changes do not update the existing hosted site.

## QR check-in and clinic analytics (10 October 2026)

The local implementation includes private 10-minute QR passes, receptionist scan/review/confirm, Start consultation with actual waiting-time tracking, and staff analytics. Read [QR/analytics setup](docs/qr-analytics-setup.md) for migrations 007/008, pgcrypto, department configuration, metric definitions and phone-camera limitations. Apply numbered migrations in order in authorized staging and verify before production use. No migration or deployment has been applied to the hosted project.

Fresh checks: 50 unit tests, 50 isolated PostgreSQL integration tests and installed Playwright CLI synthetic workflow checks pass. CLI includes 15 desktop/phone layout observations, QR issue/review/cleanup, replay after cancellation, camera denial/manual fallback, successful local decoding from synthetic video, and edited/delayed analytics responses. Actual public Spline export also loaded without page errors; reduced-motion/mobile released its canvas. These checks do not verify physical phone cameras, hosted Auth/PostgREST or live email. Earlier audit totals above describe the previous repair. See AUDIT.md for detailed evidence and blockers.
