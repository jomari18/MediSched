# MediSched QR check-in and clinic analytics — design specification

Date: 10 October 2026  
Status: authorized local implementation complete; hosted migrations/device verification outstanding
Scope: existing vanilla MediSched patient/staff workspaces, Supabase PostgreSQL and RPCs.

## Intent and approved direction

Jomari M. Candido wants receptionists to check patients in faster with an appointment QR pass and staff to understand clinic activity through meaningful analytics. The approved direction is a 10-minute opaque pass, authenticated staff scan/review/confirmation, staff-only analytics, actual waiting-time tracking through Start consultation, Unassigned departments until configured, and removal of the landing scene hint/Pause button with attribution relocated to the footer.

Success means the new workflow works alongside the existing reservation and attendance workflows, reveals no patient information in a QR payload, rejects unauthorized/replayed/expired operations, reports clearly defined metrics, and remains usable on desktop and phone layouts. Local work must not deploy, send real email, change hosted configuration/data, or create real appointments.

## Current implementation and constraints

- HTML/CSS/JavaScript; no framework conversion. Existing red light/dark themes and mobile navigation are retained.
- Auth/OTP and booking/cancellation APIs already exist. Appointment ownership is enforced by verified-user RLS and server RPC checks. Staff membership lives in `medisched_private.staff_memberships` and cannot come from signup metadata.
- Attendance is versioned/idempotent: scheduled → checked_in → completed, or scheduled → no_show. Staff events are private and reservations remain active through attendance changes. Owner cancellation retains history and releases reservations.
- Existing check-in eligibility is the appointment's Philippine calendar day, before its end, for an active scheduled visit after the workflow rollout. QR check-in uses precisely that eligibility; it does not introduce a new early-arrival window.
- Existing records include no consultation-start event and no doctor department. Completion time cannot substitute for consultation start. Old unknown waiting times stay unavailable.
- Existing clinic hours come from `public.clinic_hours`: every day 08:00–12:00 and 13:00–17:00, Asia/Manila. Capacity calculations read that catalog, not a hard-coded schedule.
- Migration files are prepared locally, applied only through later authorized setup. Missing new backend functions disable new features with clear setup guidance without breaking existing login/booking/staff reads.

## Chosen approach and alternatives

Use PostgreSQL RPCs and a private hashed-pass table. It reuses existing verified-user/staff checks, attendance locks and atomic transactions, needs no new hosted signing secret, and fits the present minimal-dependency stack.

An Edge Function with signed expiring tickets is also viable but would add signing-key provisioning/rotation and still need database state for one-time consumption. A printable day-long pass would be convenient for paper tickets, but a short-lived on-demand pass better matches the approved 10-minute design. Neither alternative is included in this implementation.

The work has three focused units: QR issuance/scan/consumption, consultation measurement/aggregate analytics, and landing cleanup. QR and analytics share attendance state; they have separate modules and additive migrations so each can be verified independently.

## QR pass contract

### Payload and private storage

- A verified appointment owner requests a pass from `issue_appointment_checkin_pass(p_appointment_id uuid)`.
- The database generates 32 cryptographically secure random bytes. Encode as 64 lowercase hexadecimal characters. The QR text is exactly `medisched:checkin:v1:<64 hexadecimal characters>`.
- The payload carries no appointment ID, patient name, age, address, email, doctor details or external URL. Scanner input accepts only this exact version/format; it never opens URLs or executes scanned text.
- Store only a SHA-256 hash of the raw token in a private RLS-enabled table, with appointment ID, issued/expiry timestamps and consumption metadata. Revoke raw-table access from public, anon, authenticated and service-role clients; only reviewed security-definer functions access it.
- Server generation uses pgcrypto `gen_random_bytes`; verify its extension schema during migration. Unsupported/missing cryptographic support blocks setup. Never substitute predictable randomness.
- One pass row per appointment. Regeneration replaces the hash and invalidates the earlier QR. Issuance is allowed only while check-in itself is eligible. Expiry is `min(server_now + 10 minutes, appointment.end_at)`; the exact expiry boundary is invalid.
- Enforce a 30-second server issuance cooldown per appointment. The patient may request another pass after expiry/cooldown. A failed/lost issuance response does not automatically retry; a deliberate regeneration creates a new pass after the cooldown.
- Return the raw token once, along with server time and expiry. Keep it in memory only. Clear it on dialog close, expiry, account change, logout and navigation. No token in local/session storage, logs, analytics URLs, notification emails or browser history.

### Patient experience

Add Show check-in QR to eligible appointment details, including today's started appointment where current check-in remains eligible. Do not depend solely on the Upcoming filter because started visits appear in Past in the existing app.

The dialog shows a clear QR, expiry countdown, and copyable opaque reference as an accessibility/manual-scanning alternative. It explains that reception must confirm the visit. Client countdown uses the server time offset; the server remains authoritative. Loading, cooldown, expiry and failure states retain existing appointment data and prevent repeated issuance.

QR encoding is local canvas rendering, with a four-module quiet zone and readable contrast. Use pinned `qrcode-generator` 2.0.4, locally shipped with its MIT notice. No QR image generation service receives the token.

### Reception experience

Add Scan check-in to the staff workspace. Camera access begins only after an explicit user click. Use supported native QR detection when available and lazy-load a local pinned jsQR 1.4.0 decoder otherwise. Manual reference paste remains available if camera access is denied, absent or unsupported.

Camera scanning requires HTTPS or a trustworthy localhost context. A phone loading an HTTP LAN address is not assumed camera-capable. Explain this condition without changing the server bind address or deploying an HTTPS site automatically.

Stop media tracks and the decode loop when a pass is found, the dialog closes, the page hides, or staff access ends. A camera-permission promise resolving after closure must immediately stop its returned tracks. Avoid duplicate requests from successive video frames.

`preview_appointment_checkin_pass(p_token text)` verifies current staff membership, token hash, expiry, active appointment and attendance eligibility. It returns only a bounded reception projection: patient name, doctor/type names, visit start/end, attendance version and expiry. It omits age, address, recipient email and owner UID. No state changes occur during scanning/preview.

The receptionist reviews the preview and chooses Confirm check-in. Camera scanning alone must never check someone in.

### Atomic consumption and retries

`consume_appointment_checkin_pass(p_token text, p_action_id uuid, p_expected_version integer)` requires current verified staff membership on every call. Lock appointment, attendance and pass in a consistent order; recheck eligibility and expiry after acquiring locks. Call the existing attendance transition with `check_in` inside the same transaction, and mark the pass consumed in that transaction. Any failure rolls back both changes.

Exactly one successful new consumption is permitted. Simultaneous scans/confirmations, owner cancellation races and manual check-in races cannot produce duplicate state changes or audit events. Token regeneration uses the same appointment-first lock order.

A retry with the same actor, token hash, action ID and expected version returns the originally saved result even if its response was lost and the token has since expired. A different action/actor cannot replay it. Replayed responses must be labeled as an already-recorded action and followed by a fresh schedule read; they do not imply the appointment is still active.

Retain consumed-pass metadata and the existing immutable attendance event for retry/audit consistency. Expired unconsumed passes may be replaced by their owner when eligible. Automatic background cleanup/retention scheduling is outside this change.

Unrecognized, expired, cancelled, regenerated or otherwise unavailable passes use a generic safe rejection. A revoked staff membership fails before any token lookup/result is exposed. The QR is a reference, not authentication or a substitute for receptionist identity checks.

## Consultation timing and compatibility

Add `in_consultation` to attendance states and `start_consultation` to versioned staff actions. Record trusted server timestamps for check-in, consultation start and completion. Add `consultation_started` to the private event vocabulary.

Normal new UI flow: Scheduled → Check in → Start consultation → Complete. Start consultation requires an active checked-in appointment at or after its scheduled start. Existing manual check-in and no-show timing remain intact. Existing Complete-from-checked_in API behavior stays available for compatibility, but such a visit has no measured consultation wait if the start action was skipped. Cancellation continues through the existing RPC and retains precedence in patient display.

Both QR and manual check-in use the same attendance logic. Preserve action-ID idempotency, optimistic versions, appointment-first locks, current staff authorization and transactional event writing for every new transition. Attendance does not release a reservation.

Use exact existing audit timestamps to populate historical check-in/completion timestamps where present. A currently checked-in row's existing updated_at is also its recorded check-in time. Never invent a consultation start or infer waiting time from booking time, scheduled start, completion time or duration. Historical rows lacking evidence remain nullable and contribute to coverage/missing-data indicators.

Expose only owner-scoped attendance timing through the existing RLS boundary. Staff schedule projections include the new state/timing needed for their actions; staff gain no raw patient-table grants.

## Department association

Add a departments catalog and a nullable doctor department assignment. Project owners configure these through a reviewed setup SQL file; no new client administrative role/UI is introduced and no doctor specialty is inferred from the demo names.

Snapshot each new appointment's department association/name from its doctor during the booking transaction through an additive trigger. Existing bookings remain Unassigned unless the owner separately reviews and applies a mapping later. Do not replay old bookings or silently backfill guessed departments. Later doctor reassignment does not rewrite earlier appointment associations.

The busiest-departments view groups by those appointment snapshots, with an explicit Unassigned bucket and configuration guidance. Its counts are valid even when all existing records are Unassigned; it must not invent hospital departments or display fabricated rankings.

## Staff analytics contract

Add an Analytics view to the existing staff workspace, available to current verified staff only. On phones it is reachable from More to preserve the approved bottom navigation. Use the existing themes, responsive cards, accessible labels/focus and 44px controls.

The backend returns aggregates only. Do not fetch all patients/appointments into the browser to calculate metrics. A single bounded `get_clinic_analytics(p_from date, p_to date, p_doctor_id text default null)` accepts an inclusive Philippine-date range of at most 93 days. Presets: Today, Last 7 days, Last 30 days. End date cannot exceed Philippine today. Guard empty/inverted/oversized inputs in both client and server. Optional doctor filtering applies consistently to every returned metric/chart.

Treat metrics as a snapshot as of the server response time. Include range, generated_at, coverage and the calculation basis. Clear obsolete results on failed loads or access loss; ignore stale responses after newer filters/account changes. No manual save actions exist in Analytics.

### Exact metric definitions

| Metric | Calculation / interpretation |
| --- | --- |
| Daily appointments | Count all saved visits with start_at on each selected Philippine date, including cancelled records; provide active and cancelled subdivisions. This is visit-date activity, not bookings-created-that-day. |
| Cancellations | Cancelled visits within the same selected start-date cohort. Label the chart accordingly; do not mix cancellation-event dates with visit dates. |
| Doctor utilization | Booked, noncancelled reservation minutes intersecting the clinic windows ÷ clinic-window minutes for the selected dates. This is booked utilization against the current clinic-hours baseline, not actual clinical working time. Include currently active doctors and doctors represented in the selected visits. Show N/A for zero capacity. |
| Recorded no-show rate | Explicit no_show outcomes ÷ (completed + no_show outcomes) for noncancelled visits whose end_at has passed. Unmarked, checked-in/in-consultation and legacy unknown outcomes do not silently count as no-shows. Show numerator/denominator and coverage; N/A when no terminal outcomes exist. |
| Busiest departments | Visit counts grouped by appointment department snapshots, with active/cancelled subdivisions and Unassigned retained. Do not calculate department capacity or guess specialty from appointment type. |
| Average waiting time | Mean actual consultation_started_at − checked_in_at, in minutes, for noncancelled visits in the selected start-date cohort with both trusted timestamps. Show sample count and missing-data coverage. Zero-minute waits are valid; no samples means N/A. Completion time is not used. |

Current-hour capacity is a clearly labeled baseline for historical dates, because the existing app has no historical doctor schedules, leave records or clinic-hour version history. Do not claim it measures staffing availability or physical occupancy. Do not modify historical appointments to fit clinic hours; clip intersection minutes only for the utilization calculation.

Use small native SVG/CSS charts and readable companion tables. A chart must not rely on color alone; ensure keyboard/readable labels and meaningful empty/loading/error states. Do not add a chart framework or export patient lists.

## Landing cleanup

Remove the visible Move your pointer to explore hint, scene toolbar, Pause motion button and their spacing. Preserve the Spline scene, lazy-loading, timeout/static fallback, phone exclusion and reduced-motion behavior.

Without a visible pause control, freeze the decorative scene when the pointer is outside it and resume during pointer interaction; initial rendering must not become a continuous automatic animation. Background tab, reduced motion and phone changes still dispose active and pending renderers. A scene failure shows the static artwork; forms remain usable. No replacement scene hint or retry button is added under the artwork.

Move source/creator/license credit to a quiet footer link opening a local artwork-credit page. Keep attribution accessible in both themes and on phones. The credit page identifies Boxes Hover by vladkolokolnikov, CC BY 4.0, the source URL and the local changes (demo UI hidden, red tint). Required attribution is relocated, not erased.

## Implementation boundaries and local files

Prepare separate additive QR and consultation/analytics migrations after 006. Existing booking/cancellation RPC signatures, Auth OTP APIs, Brevo notification secrets/function and ownership rules stay intact. Any necessary attendance-function replacements preserve their existing signatures, explicit grants and behaviors while supporting the approved new action/state.

Create focused QR protocol/rendering, camera lifecycle, QR data and analytics data/view modules. Wire them through patient details and staff navigation. Update the exact local-server allowlist for new frontend/vendor/credit files only; do not expose SQL, tests, reports, evidence or environment files through the server.

Ship QR vendor licenses and pinned artifacts; do not add runtime CDN dependencies for QR scanning. Keep application assets separate from private tokens and fixtures. Documentation names required migrations/setup steps and blocks feature readiness until those are applied and verified in authorized staging.

## Verification and handoff

1. Unit tests: strict token parsing, QR encode/decode round trip, numeric/empty metric presentation, date ranges, safe messages, action retries, stale responses, camera cleanup including delayed permissions, reduced-motion/scene cleanup.
2. Isolated PostgreSQL fixtures: ownership/verification/staff revocation, private table/grants, cryptographic token hash/rotation/expiry/cooldown, preview projection, atomic consumption and concurrent replay/cancellation/manual-check-in races; new attendance transitions/version/idempotency; metric boundary/timezone/denominator/coverage/department snapshots and calculation fixtures.
3. Existing isolated booking/cancellation/security suites must keep passing. Never apply test Auth helpers or fixture clock overrides to hosted Supabase.
4. Installed Playwright CLI: patient pass dialog, staff camera-denied/manual scan/preview/confirm/retry, Analytics loading/error/date/filter states, desktop/phone themes/overflow/modals, scene cleanup and existing Auth/OTP/appointment regressions. Use isolated local fixtures/stubs for mutations and label them; supplied real accounts permit only normal sign-in/logout/read checks with write/email guards.
5. No real appointment, cancellation, consultation, QR consumption, email or hosted schema/data/role/configuration changes without later explicit authorization. Real camera/device/Safari checks and hosted deployment remain separate readiness checks.
6. Update README, setup instructions and AUDIT.md with actual tests/evidence, unresolved limitations and migration requirements. Do not count mocks or standalone PostgreSQL as real GoTrue/PostgREST/provider/device verification.

## Non-goals

No public patient search, self-service scan-to-check-in, transferable authentication credential, QR medical data, kiosk without staff authentication, offline attendance sync, automatic no-show marking, invented department assignments, department/doctor administration UI, billing, treatment/medical history, forecasting, real emails, deployment or production data migration execution.

## Primary references

- [PostgreSQL pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html): server random-byte generation and hashing.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator): local QR encoding and license; pinned JS version 2.0.4.
- [jsQR](https://github.com/cozmo/jsQR): image-data QR decoding fallback; pinned version 1.4.0.
- [BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector/detect): native detection has limited browser availability.
- [getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia): secure context, permissions and camera stream behavior.
