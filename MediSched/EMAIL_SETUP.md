# MediSched email setup

Prepared locally on 2026-10-08. Nothing here was applied to a hosted project. These steps change hosted settings or deploy code: run them only when you decide to enable the implementation. Use the existing dedicated MediSched project; leave its database, booking gate, existing RLS and appointment RPCs intact.

## Signup verification through Supabase Auth and Brevo SMTP

Keep email/password registration and sign-in enabled. In Supabase Dashboard → Authentication → Sign In / Providers → Email, enable **Confirm email**. Keep the **Email OTP length** at **8**, matching the codes the user received, expiry to **3600 seconds**, and the resend interval to at least **60 seconds**. Match `config.js` → `auth.otpLength` to the configured length (6–10 digits are supported); match `resendCooldownSeconds` to your actual server send interval. The checked-in local stack uses 8/3600/60 in `supabase/config.toml`. Dashboard labels can vary by release; inspect the Email provider settings rather than changing an unrelated SMS/MFA OTP length.

Under Authentication → Email → Templates (or Email Templates) → **Confirm signup**, set subject to **Your MediSched verification code** and paste the complete body from `supabase/templates/confirm-signup.html`. Its code is `{{ .Token }}`; do not replace it with a confirmation link or change only the Magic Link template. No passwordless registration was introduced. The client calls `signUp({email,password,...})`, then `verifyOtp({email,token,type:'email'})`; resend uses `resend({type:'signup',email})`. Supabase verifies the email and establishes a session. The browser rechecks `getUser()` before opening appointments, and SQL still checks the authoritative Auth row.

Under Authentication → Email → **SMTP Settings**, keep/configure custom SMTP using the credentials displayed in Brevo → Settings → SMTP & API → SMTP:

| Setting | Value |
| --- | --- |
| Sender name | `MediSched` |
| Sender email | `jomaricandido18@gmail.com` |
| SMTP host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | Exact **SMTP login** shown by Brevo; do not infer it from the sender address |
| Password | Brevo **SMTP key**, not the Brevo API key or Gmail password |

Preserve the sender you approved. Check that Brevo actually accepts this sender; local code cannot establish provider verification or inbox delivery. Do not silently replace the Gmail address if Brevo requires sender/domain changes—review that separately. Keep the existing Site URL; signup codes do not need a redirect URL. Old already-issued confirmation links remain supported for compatibility.

Only email and a resend timestamp are persisted under `medisched.signupVerification`. Passwords and OTP values are never written to storage; password fields and codes are cleared when switching screens, and codes are cleared after verification attempts. A reload restores the email screen and cooldown. This client cooldown is usability feedback, not a substitute for Supabase's rate limits; clearing browser storage can bypass it.

## Appointment confirmations through the Edge Function and Brevo API

Custom Auth SMTP sends Auth messages only. Appointment confirmations use a separate HTTPS call to Brevo's transactional endpoint from `appointment-confirmation`. No Brevo key or SMTP credential goes in `config.js`.

**Required additive migration:** open the existing MediSched project's SQL Editor and review/run **only** `supabase/migrations/202610080004_appointment_notifications.sql` once if migrations 001–003 are already applied. It creates `appointment_notifications` and two service-only RPCs. Do not rerun 001–003 against an existing schema, do not reset the database, and do not widen client grants. For a fresh disposable local stack, all four versioned migrations apply in order. This migration sends nothing, has no send trigger, and does not backfill or mutate existing appointments.

In Supabase Dashboard → Edge Functions → **Secrets**, add:

| Secret | Value |
| --- | --- |
| `BREVO_API_KEY` | Brevo transactional **API key** from Settings → SMTP & API → API Keys; this differs from its SMTP key |
| `BREVO_SENDER_NAME` | `MediSched` |
| `BREVO_SENDER_EMAIL` | `jomaricandido18@gmail.com` |
| `MEDISCHED_ALLOWED_ORIGINS` | Comma-separated exact frontend origins, e.g. `http://127.0.0.1:5173,http://localhost:5173`; add your actual Live Server origin such as `http://127.0.0.1:5500` if used |

An origin contains scheme/host/port, never `/index.html` or a trailing path. Review/add the final hosted frontend origin when you deploy it. No wildcard origin is used. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime. The service-role key stays server-side; the function uses it only for the new notification RPCs. Never copy it into the frontend. Keep the function's **Verify JWT** setting enabled; it also calls Auth `getUser(jwt)` and rejects missing, invalid, unverified and anonymous users even if the gateway accepts an API key.

Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) if unavailable. From the MediSched directory, after reviewing the migration and setting secrets, the deployment commands are:

```powershell
supabase login
supabase functions deploy appointment-confirmation --project-ref YOUR_MEDISCHED_PROJECT_REF
```

Replace the placeholder with this project's ref from Dashboard project settings. These commands are provided for you; they were not executed. Do not add `--no-verify-jwt`. CLI deployment includes both `index.ts` and the imported `handler.js`. If using Dashboard's code editor instead, create the same named function and include both files, preserve the relative import, keep JWT verification enabled, and deploy only after review. No Brevo dashboard template ID is needed: `confirmationMessage()` in `handler.js` creates escaped HTML and plain text, using the approved sender secrets and saved name, doctor, type, date/time, one-hour duration and appointment reference.

Frontend configuration retains your existing Supabase URL/public key. The function name is `appointment-confirmation`; the browser invokes it after a successful booking with **only** `{appointmentId: saved.id}`. The function authenticates the caller, and its SQL claim rechecks confirmed identity and saved ownership. Recipient email comes from the appointment's server-created `confirmation_email` snapshot; patient, doctor/type names and schedule come from the same saved row. Cancelled/started appointments are ineligible. No arbitrary client recipient or personal parameters are accepted.

## Duplicate protection and delivery limits

The durable ledger has a unique appointment ID. An atomic insert claims the send before the provider call; concurrent requests lose that claim. Accepted sends return `already_sent` on later requests. Failed, unknown, or unfinished `sending` records never automatically expire or retry—even after process crashes or browser reloads. A stable Brevo `idempotencyKey` is included as an additional safeguard; Brevo documents a 15-minute window, so it is not the durable authority.

This deliberately permits **at most one automatic provider attempt** per appointment. A crash after claiming but before sending can lose the email. A timeout, 5xx response, missing provider message ID, or failure to store acceptance can leave delivery uncertain. Acceptance means Brevo accepted the request, not that the inbox received it; bounces, spam placement, quotas and sender rejection are not tracked. There is no automatic worker or webhook in this change. Closing the browser between booking and invocation can leave an appointment with no notification attempt. Cancellation can happen after the claim commits; emails describe that snapshot and direct patients to the current dashboard.

For operational review, inspect `appointment_notifications` through privileged Dashboard access and correlate `provider_message_id`, appointment ID, timestamp and sender with Brevo logs. Do not blindly delete/reset ledger records to resend. For `sending`/`unknown`, confirm the function has stopped and whether Brevo accepted/delivered before authorizing another attempt; otherwise duplicate delivery remains possible. A future reviewed queue/webhook design can improve reliability. Browser clients cannot read/write/reset the ledger or call its service RPCs.

Booking is committed before notification starts. The UI shows **“Appointment saved; confirmation email could not be sent”** on invocation/provider failure and retains the appointment. Do not create another appointment to retry an email. Success says **accepted for delivery**, never claims inbox receipt.

## Local checks and remaining verification

`npm.cmd test` covers the same notification handler with mocked Auth/database/Brevo adapters. `npm.cmd run test:browser` exercises mocked signup codes/resend/cooldown, confirmation success/failure and saved booking at phone/desktop sizes. `npm.cmd run test:database` exercises the real additive SQL migration, role grants, verified ownership, concurrent durable claims and retained booking on a synthetic standalone PostgreSQL cluster. See `tests/RESULTS.md` for current results.

The full local Supabase test is opt-in (`npm.cmd run test:supabase`) and uses a locally generated signup OTP; no hosted endpoint is accepted. Docker's Linux engine was unavailable during this work, so GoTrue/PostgREST/Edge runtime integration and actual Brevo SMTP/API delivery remain unverified. To run the local stack later, keep Auth delivery in the local inbox and keep `BREVO_API_KEY` empty during tests. A real Brevo key makes invoking the function capable of sending real email; enter it only for deliberate authorized delivery tests. Validate missing/unverified JWTs, cross-owner IDs, concurrent repeated requests, success and provider failure against a disposable staging environment before production.

Official references checked for this implementation: [signup OTP verification](https://supabase.com/docs/reference/javascript/auth-verifyotp), [signup resend](https://supabase.com/docs/reference/javascript/auth-resend), [Auth templates](https://supabase.com/docs/guides/auth/auth-email-templates), [local OTP configuration](https://supabase.com/docs/guides/local-development/cli/config), [Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Edge authentication](https://supabase.com/docs/guides/functions/auth-headers), [Edge secrets](https://supabase.com/docs/guides/functions/secrets), [Brevo transactional API](https://developers.brevo.com/docs/send-a-transactional-email), [Brevo idempotency](https://developers.brevo.com/changelog/2021/11/10), [Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).
