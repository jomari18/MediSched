# QR check-in and clinic analytics implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, then one fresh final review. The user has explicitly authorized implementation here.

**Goal:** Add private expiring QR check-in and trustworthy staff analytics, and simplify the landing scene.
**Architecture:** Additive PostgreSQL migrations reuse verified ownership, staff membership and attendance transactions. Focused vanilla modules present patient passes, scanner review and aggregate analytics.
**Tech Stack:** HTML/CSS/JavaScript, Supabase PostgreSQL RPCs, locally pinned qrcode-generator 2.0.4 and jsQR 1.4.0; Playwright CLI.
**Spec:** ../specs/2026-10-10-qr-checkin-analytics-design.md

## Global constraints
- Existing auth/OTP, booking/cancellation and notification contracts stay unchanged.
- No hosted migration, deployment, real appointments or real email. Test mutations only in isolated fixtures.
- QR contains `medisched:checkin:v1:` followed by 64 lowercase hex characters; server stores SHA-256 only, expiry at min(now+10 minutes,end), issuance cooldown 30 seconds.
- Verified owner issues; verified staff preview/consume. Raw private tables remain inaccessible. Review before mutation, explicit confirmation, stable action ID/version.
- Daily 08–12 and 13–17 Asia/Manila; analytics read current hours, at most 93 inclusive days, never infer missing history.
- Preserve responsive red light/dark workspaces, native dialogs, reduced motion and attribution.

## Review focus
- Expiry while waiting for a row lock: reject after acquiring locks.
- Cancellation/manual check-in races and different staff scanning one pass: one attendance event maximum.
- Lost response: identical consume retry returns result, altered payload cannot replay.
- Camera permission resolves after close: stop all tracks, no background scan.
- Historical missing timestamps/departments: N/A/Unassigned, never fabricated zero wait or outcomes.

### Task 1: QR database and protocol
Files: migrations/202610100007_qr_checkin.sql; checkin.js; tests/checkin.test.js; tests/z-checkin-analytics-postgres.integration.js.
Interfaces: issue_appointment_checkin_pass(uuid) -> token, issued_at, expires_at, server_now; preview_appointment_checkin_pass(text) -> reception projection/version; consume_appointment_checkin_pass(text,uuid,integer) -> attendance result. parseCheckinPayload(text) -> token or null.
- [x] Write protocol rejection/leading-zero tests and isolated owner/staff/expiry/replay/race tests; run and observe missing implementation failure.
- [x] Implement appointment → attendance → pass locking, private hashed table, cryptographic issuance, bounded projection and atomic consumption using existing attendance RPC.
- [x] Run targeted unit and isolated PostgreSQL tests; expect all pass.

### Task 2: Consultation and aggregate analytics
Files: migrations/202610100008_clinic_analytics.sql; analytics.js; attendance.js; tests/z-checkin-analytics-postgres.integration.js; tests/analytics.test.js.
Interfaces: set_appointment_attendance accepts start_consultation; get_clinic_analytics(date,date,text) -> summary,daily,doctors,departments,coverage. Attendance gains in_consultation and real nullable timestamps. Appointment department snapshot populated on insert.
- [x] Write real wait, empty coverage, bounded range, nonstaff rejection and lunch-intersection capacity tests; observe failures.
- [x] Implement additive constraints/columns, truthful backfill, compatible attendance transitions, department snapshots and aggregate RPC.
- [x] Run old and new database suites; expect old contracts and new tests pass.

### Task 3: Patient pass, staff scanner and analytics UI
Files: checkin-ui.js; scanner.js; analytics-ui.js; dashboard.html; patient-view.js; script.js; staff.html; staff.js; workspace.css; vendor/; tools/serve.js.
Interfaces consume Tasks 1/2 RPCs through authenticated client. Clear/close lifecycle invalidates asynchronous responses and camera tracks. Manual paste works without camera. Analytics is accessible through staff More.
- [x] Write scanner lifecycle/data request tests first, run red.
- [x] Add locally pinned encoder/decoder with licenses, QR expiry/cooldown, explicit scan/review/confirm and retry state; add consultation action and aggregate charts/tables.
- [x] Run unit tests and CLI fixture interactions desktop/phone, expired/invalid input, missing backend, camera denial/late cleanup; expect safe readable UI without overflow.

### Task 4: Landing cleanup
Files: index.html; landing.js; landing.css; artwork-credit.html; tests/landing.test.js.
- [x] Add pointer freeze/resume and absent-control lifecycle tests, run red.
- [x] Remove hint and Pause toolbar; relocate license attribution to footer credit page; preserve mobile/reduced-motion fallback and disposal.
- [x] Run unit tests and CLI desktop/phone visual checks; expect no toolbar, readable forms and proper fallback.

### Task 5: Handoff and final verification
Files: README.md; AUDIT.md; docs/qr-analytics-setup.md; package.json.
- [x] Run npm.cmd test and npm.cmd run test:database; inspect results.
- [x] Use installed Playwright CLI for local fixture UI tests and screenshots. Record actual vs untested, never claim real device/provider verification.
- [x] Document migrations 007/008, pgcrypto requirement, department setup, metrics, camera limitations and deployment blockers.
- [x] Request one fresh whole-change review; fix important findings with regression tests and rerun relevant suites.

Commit policy: keep product edits local and reviewable; do not stage unrelated existing changes or secrets. Self-review: all spec sections covered; RPC names shared consistently; Tasks 1/2 feed 3, Task 4 independent, Task 5 verifies all.
