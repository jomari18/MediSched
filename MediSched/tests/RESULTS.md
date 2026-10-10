# MediSched OTP and Brevo verification — 2026-10-08

Latest local results (2026-10-09): **25 unit tests, 22 PostgreSQL tests and 27 mocked Chromium scenarios passed** for the available-slot addition. See [AVAILABLE_SLOTS_RESULTS.md](AVAILABLE_SLOTS_RESULTS.md) for the current feature checks and limitations. The OTP/Brevo details below remain the record of the prior phase.

| Command/check | Confirmed result |
| --- | --- |
| `npm.cmd test` | 22 passed: scheduling/Auth helpers, OTP length/leading zeros/persistent cooldown, production notification handler with mocked adapters |
| `npm.cmd run test:database` | 15 passed on isolated PostgreSQL 18 at loopback port 55432 |
| `npm.cmd run test:browser` | 21 Chromium scenarios passed with mocked Supabase Auth/Data/Edge responses |
| `npm.cmd run test:supabase` | 1 explicitly skipped: full local Supabase stack/environment unavailable |
| `node --check script.js`, `otp.js`, `config.js`, Edge `index.ts`/`handler.js` | Syntax passed; Node syntax checks do not establish Deno type checking or Edge runtime compatibility |
| Active app/config/package/test/SQL scan | No remaining EmailJS dependency, import, settings, keys or calls |

The PostgreSQL fixture applied the real additive `202610080004_appointment_notifications.sql` migration. Tests exercised unchanged booking/cancellation constraints, RLS and transaction concurrency, plus service-only notification grants, actual Auth-row verification, cross-owner rejection, durable concurrent claim uniqueness, trusted email snapshots and retained appointments after failure. One combined test used the **production notification handler and real SQL** with synthetic authentication and a mocked Brevo provider, confirming one send under concurrency and no resend after failure. No external provider was called.

Auth rows and `auth.uid()`/`auth.role()` were supplied by `postgres-bootstrap.sql`. These are synthetic stand-ins, not GoTrue/JWT validation. Database tests refuse nonlocal databases and unknown fixture markers. The fixture cluster needed restarting after an interrupted earlier session; its helper now keeps the open log outside PGDATA to avoid a Windows recovery sharing violation. After startup, the complete SQL suite passed.

Browser tests cover registration with a null session, code screen, cleared passwords/codes, leading-zero verification, invalid/expired code errors, resend API shape, cooldown disabled after reload, successful verification/session, legacy-link compatibility, unverified/signed-out access, session expiry/logout, owner query shape, safe rendering, saved values on booking failure, successful confirmation acceptance and retained booking when the mocked function fails. The frontend sends only the appointment UUID to the function. Desktop 1440×900 and phone 390×600/320×480 checks, native modal focus/scroll/Tab/Escape and password visibility remain covered. Screenshots include `evidence/supabase-phone-verification.png` and existing dashboard/modal captures.

Docker's Linux engine still reports an unavailable pipe. Supabase CLI/Edge runtime deployment, real GoTrue OTP/PostgREST/JWT integration, real Brevo SMTP/API delivery, inbox acceptance, sender verification and iPhone Safari were **not verified**. The opt-in real local Supabase test now verifies an admin-generated local signup OTP with `type: 'email'`; it remains blocked until the disposable local stack is available. No real password or code was persisted by application code.

No hosted database, Auth template, SMTP setting or Edge secret was changed. No function/site was deployed. No real email was sent. Existing production accounts/appointments were not migrated. Original recovery files and unrelated portfolio projects were preserved. See `EMAIL_SETUP.md` for the required additive migration, approved sender, exact configuration/deployment steps and conservative at-most-one-attempt delivery limitations.

Follow-up setup checks: unconfigured registration does not persist an email/cooldown or open verification; stale verification storage does not show the code screen/countdown while configuration is missing. The public key had been placed in the URL field; it was moved into `publishableKey`. The user supplied the existing MediSched Project URL, which was added locally and passed offline configuration validation. No hosted request was made.

OTP length follow-up: the user confirmed eight-digit signup codes. Frontend configuration and disposable local Auth settings now use 8 digits; the browser regression confirms all eight digits, including leading zeros, reach verifyOtp unchanged. Hosted Auth settings were not changed.
