## Supplied asset pack integration — 10 October 2026

Replaced the provisional calendar SVG with the supplied transparent PNGs: landing hero, desktop next visit, mobile calendar, booking/auth still life and OTP envelope. Integrated the supplied logo mark, feature illustrations, blush halo and navigation/action icons. The wordmark text stays live and theme-aware. Unused decorative variants remain available in `assets/medical-pack`; guide and prompts are retained as source documentation, not served by the local app.

The local server explicitly allowlists the pack's PNG/SVG files. No dependencies or backend changes. Re-ran the Playwright CLI redesign scenario: **passed, 20 captures, zero page exceptions, no document overflow**. Visually inspected landing desktop and patient phone; verified image decoding and HTTP 200 for the logo. Screenshots listed below now show the supplied assets. The earlier description of the provisional vector artwork is superseded by this update. Real-device/hosted verification limitations still apply.

# UI redesign verification — 10 October 2026

## Scope and mapping

The five approved image references were implemented within the existing vanilla application. `index.html` hosts the landing and account views; `dashboard.html` hosts patient overview/history and the existing booking dialog; `staff.html` receives the shared visual system. `redesign.css`, `presentation.js`, and a locally authored `assets/care-calendar.svg` provide the new presentation. No new dependency or database migration is required.

- White/light-gray surfaces, blush cards, medical-red actions, rounded navigation, softer borders/shadows, and consistent form styling.
- Landing hero, clinic-hours strip and three onboarding cards; account buttons reveal the existing sign-in/register/verification forms.
- Patient overview uses actual profile/appointment records; aligned desktop appointment rows become phone cards.
- Booking retains the original controls, field names, validation and handlers. Its desktop dialog has patient/visit/summary columns; phone layout stacks these sections. Time buttons mirror server-returned options and respect the original select's disabled state. Native date selection remains available.
- Staff, analytics, QR review and dialogs inherit the shared design. Existing dark-mode preference remains functional.
- Supabase schema, RLS, transactional SQL, QR authorization, clinic hours, duration, timezone, and notification backend were not changed by this redesign.

## Confirmed checks

- `npm.cmd test`: **50 tests passed**.
- Installed **Playwright CLI 0.1.22**, Chromium: redesign flow passed with **20 screenshot captures**; widths 320, 390, 768 and 1440 checked as applicable, without document horizontal overflow or page exceptions.
- Synthetic signup, eight-digit OTP including leading zeros, password visibility/reset, booking via new time buttons, cancellation retaining history, details/Escape, sign-out, and booking success despite confirmation-email failure passed.
- Submit buttons were scrolled into view and confirmed reachable at 320/390/768 widths.
- Existing CLI QR/analytics scenario passed: opaque pass generation, preview before mutation, same-action retry, cancelled state after replay, manual fallback, synthetic camera decoding/track cleanup, analytics stale-request/error behavior and 15 layout observations across 320–1440 widths/light and dark.
- Source review identified two P2 regressions, both fixed and reproduced successfully in the final CLI run (below).

## Findings resolved during implementation

| Finding | Severity | Reproduction / actual behavior before fix | Expected behavior and fix |
| --- | --- | --- | --- |
| Detached booking controls | P1 | Open booking after presentation initialization; a moved button was queried before its new section was attached, interrupting layout assembly. | Attach sections before moving controls. Original fields remain in the form and can submit; booking scenario now passes. |
| Hidden callback feedback | P2 | Open `index.html?code=expired` or `?reason=session-ended`; feedback could be inside hidden account view. | Auth errors/session feedback reveal the account view. Both URLs have visible feedback in the final CLI test. |
| Slot keyboard focus lost | P2 | Focus a time button and press Enter; rebuilding the buttons removed the focused element. | Reuse buttons when options are unchanged and update pressed/disabled state. Keyboard selection retains focus in the final test. |
| Narrow appointment actions | P3 | Desktop action buttons inherited obsolete grid-column assignments and wrapped excessively. | Reset action-column placement; desktop actions fit and mobile buttons remain touch-friendly. |

## Screenshot references

- [Landing desktop](evidence/redesign-landing-desktop.png)
- [Patient desktop](evidence/redesign-patient-desktop.png)
- [Patient phone](evidence/redesign-patient-390.png)
- [Booking desktop](evidence/redesign-booking-desktop.png)
- [Booking phone actions](evidence/redesign-booking-actions-390.png)
- [Sign in](evidence/redesign-signin-desktop.png)
- [Registration phone](evidence/redesign-register-phone.png)
- [OTP](evidence/redesign-otp-desktop.png)
- [History phone](evidence/redesign-history-phone.png)
- [Staff analytics](evidence/analytics-desktop.png)
- [QR review](evidence/qr-review-desktop.png)

## Intentional differences from the images

The artwork is a local scalable vector illustration, with subtle reduced-motion-aware floating motion, rather than the mockup's photorealistic render or the previous Spline cubes. The previous Spline module remains on disk but is no longer loaded on the redesigned landing. A native date input and time select remain alongside time buttons; there is no decorative fixed-date ribbon. Booking remains a native, scrollable modal rather than a new route, preserving existing lifecycle and focus restoration. OTP stays at the configured eight digits rather than the image's six. Names and records are real application data; screenshots from this audit explicitly use synthetic fixtures. Cancellation and dark-mode functionality remain available.

## Limits and follow-up

These browser interactions used a synthetic Supabase module; they did not write hosted records or send emails. Real OTP delivery, Brevo delivery, hosted RLS/concurrency and physical Android/iPhone camera behavior were not retested for this presentation-only change. Real-device Safari/Android verification remains outstanding. No deployment or hosted settings change was performed.

To reproduce with the local server running:

```powershell
node tools/prepare-redesign-cli.js
playwright-cli.cmd -s=redesign-check open http://127.0.0.1:5173
playwright-cli.cmd -s=redesign-check run-code --filename=evidence/redesign-cli-prepared.js
node tools/prepare-qr-cli.js
playwright-cli.cmd -s=redesign-qr open http://127.0.0.1:5173
playwright-cli.cmd -s=redesign-qr run-code --filename=evidence/qr-cli-prepared.js
```

Older audit entries below describe previous designs and checks; this section supersedes their visual description.

---

# MediSched — browser audit and repair verification

**Date:** 9 October 2026 (Asia/Manila)  
**Target:** local working copy at `http://127.0.0.1:5173`  
**Browser tool:** installed Playwright CLI 0.1.22, Chromium; no replacement automation tool used.

## Result and scope

All five reported findings A01–A05 have local fixes and passing targeted browser reproductions. The approved landing/login design now integrates the supplied Spline export using the vanilla JavaScript runtime. Supabase Auth/OTP APIs, database schema/RLS, booking/cancellation transactions and notification backend were not changed.

The existing development command is `npm.cmd run serve` on Windows PowerShell (`npm run serve` elsewhere). It runs `node tools/serve.js`. The local server allowlist now includes `landing.js` and `landing.css`.

This is local verification, not a production certification. No deployment, hosted configuration/schema change, real registration, appointment, cancellation, attendance update or email was performed. Real supplied accounts were used only for authorized login/logout and normal reads. Mutation and email requests were intercepted by Playwright before reaching the service. Secrets, session tokens and passwords are excluded from this report and saved test scripts.

## Findings and fixes

| ID | Severity | Original defect | Current result |
| --- | --- | --- | --- |
| A01 | Medium | Empty staff date reached PostgreSQL and showed raw HTTP 400 errors | Fixed; zero empty-date schedule/activity RPCs observed |
| A02 | Medium | Pending verification email returned after verified login/logout | Fixed; pending email cleared, cooldown retained, logout/reload stays on sign-in |
| A03 | Low | Registration errors remained on sign-in | Fixed; panel-specific errors cleared when switching forms |
| A04 | Low | Fetch failures exposed SDK/configuration text | Fixed; readable connectivity guidance across Auth, availability, booking and staff |
| A05 | Low | Staff brand silently opened the patient workspace | Fixed; desktop/mobile brands stay in staff, explicit switch names its destination |
| G01 | Low | Initial Spline WebGPU integration emitted a Windows texture-lifecycle error | Fixed locally by using the documented WebGL backend; final normal check had no console errors |
| G02 | Medium | A timed-out in-flight scene was not immediately disposed | Fixed; active and pending renderers are disposed, with a regression covering late completion |

Medium means a normal workflow is disrupted with a workaround. Low means confusing presentation or an observed nonfatal graphics issue. Before-fix evidence is retained under `evidence/audit-2026-10-09/`; current evidence is under `evidence/audit-fixed-2026-10-09/`.

### A01 — Empty staff date

**Reproduce:** Sign in as staff. Clear Date (Philippine time), then visit Activity. Restore a valid date.

**Expected:** Accessible date guidance without a malformed database request; restoring a date reloads the view.

**Before:** An empty `p_date` reached `list_staff_appointments`; PostgreSQL returned 400 and `invalid input syntax for type date`.

**Fix:** `staff.js` validates the date before both schedule and activity reads, marks the input invalid, clears stale content deliberately, disables pagination and invalidates older pending responses. `staff.html` associates the date with the status message.

**Verified:** Local guidance and deliberate empty state appeared in both views. Zero empty-date RPC requests were observed. A valid date recovered Activity. [Before](evidence/audit-2026-10-09/staff-empty-date-error.png) · [After](evidence/audit-fixed-2026-10-09/staff-empty-date-fixed.png).

**Recommendation:** Retain this client guard alongside existing server validation. No database change is needed for this fix.

### A02 — Stale signup verification after login

**Reproduce:** Establish a pending verification screen; return to sign-in; sign in with an existing confirmed account; sign out; reload.

**Expected:** Sign-in is shown after logout, without an obsolete email-code prompt. The resend cooldown remains independent.

**Before:** The pending email survived confirmed password login and restored Verify your email after logout and reload.

**Fix:** `clearVerificationContext()` clears only the pending email and retains `nextResendAt`. Confirmed routing/session handling calls it. Passwords and OTPs are never saved by this helper.

**Verified:** A guarded resend established synthetic pending context without sending mail. A real staff password login cleared its email. Logout returned HTTP 204; sign-in remained visible after reload. Unit coverage confirms cooldown preservation. Confirmation callback cleanup uses the same path, but a real emailed callback was not executed. [Before](evidence/audit-2026-10-09/logout-stale-verification.png) · [After](evidence/audit-fixed-2026-10-09/logout-fixed.png).

**Recommendation:** Keep verification-screen restoration separate from resend timing; do not clear unrelated storage.

### A03 — Registration feedback on sign-in

**Reproduce:** Submit mismatching registration passwords, then choose Back to sign in.

**Expected:** Registration-only feedback is removed; passwords remain hidden and are cleared during the panel change.

**Before:** Sign-in still displayed “Passwords do not match.” or “Enter your name.”

**Fix:** `showPanel()` clears panel-specific status by default while intentional verification transitions preserve their message. Configuration errors remain visible until the client is ready.

**Verified:** Mismatch feedback appeared, then cleared on sign-in. Password inputs reset and returned to `type=password`. [Before](evidence/audit-2026-10-09/auth-stale-error.png) · [After](evidence/audit-fixed-2026-10-09/auth-error-cleared.png).

**Recommendation:** Preserve explicit cross-panel messages rather than clearing every status indiscriminately.

### A04 — Technical network feedback

**Reproduce:** In an isolated CLI session, abort a resend, availability, booking or staff-list request.

**Expected:** Clear connection/retry guidance, safe disabled states and retained booking data where the outcome is unknown.

**Before:** Patients saw `TypeError: Failed to fetch` or instructions about local Supabase configuration.

**Fix:** `friendlyError()` recognizes string/wrapped fetch failures and browser/SDK variants. It returns “We could not connect. Check your internet connection and try again.” Existing conflict/auth error mappings and uncertain-save behavior remain intact.

**Verified:** Guarded resend, aborted staff/availability reads and an intercepted booking displayed readable guidance. Availability failure disabled booking. The intercepted booking retained and locked the entered values, enabled retry and created no appointment. The test installed its own write blocker before submission and counted one blocked booking request. [Before](evidence/audit-2026-10-09/booking-network-error.png) · [Booking after](evidence/audit-fixed-2026-10-09/booking-error-fixed.png) · [Staff after](evidence/audit-fixed-2026-10-09/staff-network-fixed.png).

**Recommendation:** Keep the distinction between an uncertain booking response and a confirmed booking whose notification fails. The latter backend flow was not changed.

### A05 — Staff brand navigation

**Reproduce:** Click the sidebar MediSched brand at desktop width or the mobile header brand; inspect More → workspace switch.

**Expected:** The brand retains the clinic workspace. An explicit control identifies a switch to the user's own patient workspace.

**Before:** Both staff brands linked to `dashboard.html`.

**Fix:** Both now link to `staff.html`. Switch controls say “Open my patient workspace” or “Open clinic workspace”.

**Verified:** Both brand clicks remained on `staff.html`. The staff switch displayed its patient destination. [Before](evidence/audit-2026-10-09/staff-brand-switch.png) · [Current staff phone](evidence/audit-fixed-2026-10-09/staff-home-dark-phone.png). Routing assertions are in `staff-results.json`.

**Recommendation:** Keep workspace changes explicit. This fix does not change authorization.

### G01 — Spline graphics compatibility

**Reproduce:** Load the initial auto-selected WebGPU runtime on Windows, then change scene lifecycle/viewport and navigate/reload.

**Expected:** Decorative rendering and teardown without GPU errors.

**Observed during integration:** Spline/Three emitted a destroyed `ShadowDepthTexture` validation error. An older viewer also warned that the export was newer than its runtime.

**Fix:** Pin runtime 2.0.75 and select the documented `renderer: 'webgl'`. Disable embedded scene HTML with `htmlContentMode: 'none'`. Preserve independent loading/fallback behavior and disposal.

**Verified:** The final normal scene loaded and remained interactive; login fields were usable; zero captured console errors and zero HTTP failures. An earlier WebGL pass logged an external shader compiler warning about potentially uninitialized `f_blur`; it did not recur in the final repeat. No visible failure was observed from that warning; it remains a graphics compatibility observation.

**Recommendation:** Recheck graphics after changing the export/runtime or on another GPU. Keep the static fallback and pause control.

### G02 — Pending scene cleanup

**Reproduce:** Stall the scene load beyond its 15-second timeout (or pause/resize while loading), then retry.

**Expected:** Release the pending renderer immediately and prevent late loading from reviving a cancelled scene.

**Before:** Only the fully loaded application was tracked for disposal. A constructed renderer waiting on a stalled load survived cancellation and could accumulate on retries.

**Fix:** Track the pending application immediately after construction. Cancellation clears and disposes both pending and active instances. Late completion disposes any resources created after cancellation without touching a newer application. Defensive teardown keeps fallback available if the renderer itself throws.

**Verified:** A focused unit regression failed before the patch (zero immediate disposals), then passed after it, covering both immediate disposal and late settlement. Actual CLI timeout, pause, resize and retry checks passed after the patch. An independent read-only reviewer approved the fix and reran all 41 unit tests.

**Recommendation:** Retain this regression when upgrading Spline. Unit lifecycle instrumentation supplements the browser checks; no complete GPU-memory profile is claimed.

## Landing implementation

- Vanilla HTML/CSS/JavaScript retained; no React/Next migration or npm dependency added.
- Uses the user's production `.splinecode` URL through `@splinetool/runtime@2.0.75` loaded lazily from unpkg.
- The named `UI` artwork group from the reference is hidden locally so its demo headline/navigation do not overlap MediSched. Cube rendering is tinted red with CSS. The hosted Spline file is unchanged.
- Credit identifies **Boxes Hover by vladkolokolnikov**, links the source and CC BY 4.0, and labels this as an adaptation. The local changes hide demo UI and alter presentation/color.
- Desktop: headline and decorative scene beside the existing login, registration and OTP forms; light/dark themes.
- Widths below 768px: a compact single column with the 3D stage hidden and no Spline request. Desktop reduced-motion/data-saving modes use the static CSS cube poster. No critical information depends on the artwork.
- Loading does not block forms. Failed or 15-second timed-out loads show a static fallback and Retry 3D view. Pause, phone resizing and reduced motion dispose the canvas; stale loads cannot replace the selected fallback. Page visibility changes suspend the scene through its lifecycle.
- The scene module does not read credentials, OTPs, Supabase sessions or appointment data.

## Fresh verification results

### Unit tests

`npm.cmd test`: **41 passed, 0 failed, 0 skipped**. These include existing Auth/session, appointment-time, notification-handler, OTP, staff-data and theme tests plus regressions for network wording, verification-context cleanup, 3D eligibility and pending-scene disposal. Notification tests use stubs; they do not establish real provider delivery or hosted ledger behavior.

### Playwright CLI layout checks

| Surface | Matrix | Observed result |
| --- | --- | --- |
| Login + registration | 2 themes × 2 panels × 8 sizes = 32 observations | No horizontal overflow; visible form inputs/buttons at least 44px tall |
| Staff schedule + activity | 2 themes × 2 views × 4 sizes = 16 observations | No horizontal overflow |
| Patient overview + booking | 2 themes × 2 views × 4 sizes = 16 observations | No horizontal overflow or modal outside viewport; Close reachable at 390×420 |

**64 layout observations**, not 64 independent end-to-end tests. Public sizes: 320×568, 360×740, 390×600, 430×932, 768×768, 1024×768, 1440×1000, 844×390. Staff: 1440×1000, 390×740, 320×568, 844×390. Patient: 1440×1000, 390×740, 320×568, 390×420.

Representative screenshots:

- [Desktop light](evidence/audit-fixed-2026-10-09/landing-light-desktop.png) · [Desktop dark](evidence/audit-fixed-2026-10-09/landing-dark-desktop.png)
- [Phone login](evidence/audit-fixed-2026-10-09/login-dark-phone.png) · [Phone registration](evidence/audit-fixed-2026-10-09/register-light-phone.png) · [Phone OTP](evidence/audit-fixed-2026-10-09/otp-phone.png)
- [Phone booking](evidence/audit-fixed-2026-10-09/patient-booking-dark-phone.png) · [Phone staff](evidence/audit-fixed-2026-10-09/staff-home-dark-phone.png)
- [Reduced motion](evidence/audit-fixed-2026-10-09/landing-reduced-motion.png) · [Scene failure](evidence/audit-fixed-2026-10-09/landing-scene-fallback.png) · [Timeout](evidence/audit-fixed-2026-10-09/landing-timeout.png)

Full-page phone screenshots are stitched: fixed navigation appears at its original viewport position. That is not itself an overlap defect. Account-holder names can appear in protected-page screenshots; evidence stays local/ignored by Git.

### Functional checks

- Real patient and staff password sign-ins succeeded; staff logout returned 204. Signed-out staff access redirected to sign-in; a patient navigating to staff was returned to the patient dashboard.
- A02 pending-email cleanup, A03 password reset/error cleanup and A01/A05 staff reproductions passed as described above.
- Eight-digit synthetic OTP entry preserved leading zeros; a six-digit value failed validity. Guarded resend cooldown survived reload (60s → 59s), remained disabled, and OTP input was cleared. No OTP was delivered or accepted by the real service.
- Patient filters loaded current history. In the final evening run Account A had **0 Upcoming, 1 Past, 0 Cancelled**; earlier morning results differ because appointments naturally crossed their start time.
- Age 121 and a past date were rejected locally. A future free day offered 26 quarter-hour starts for one-hour visits, entirely within 08:00–12:00 and 13:00–17:00 (last starts 11:00/16:00).
- Availability recovered after the deliberate read failure. A blocked booking retained values and did not change the appointment count. This is failure-state verification, not a successful transaction test.
- Spline loaded the actual supplied export; pause, retry, phone resize, reduced-motion skip and mobile network skip passed. A delayed scene reached the 15-second fallback while the form stayed usable; no canvas remained visible after fallback.

### Console/network distinction

The final normal landing check recorded **0 console errors, 0 console warnings and 0 HTTP failures**. An earlier external shader warning is documented in G01. Aborted Auth/read/booking/Spline requests deliberately generated failure messages during injected-failure tests and are not provider outages. The initial WebGPU error was found and addressed before the final check. No request headers, bodies, tokens or secret values are exported.

## Untested features and limits

| Feature | Why / required follow-up |
| --- | --- |
| Successful signup, real OTP verification/resend/delivery/expiry and emailed callbacks | Would create accounts or send real email. Use an explicitly approved test account/inbox. Only guarded client behavior was exercised. |
| Real unverified account access | Supplied accounts are confirmed. Unit tests cover session rejection; no authentication bypass or hosted confirmation-state change was used. |
| Successful booking, cross-user concurrent/overlapping requests, definitive server-side past rejection | Would mutate hosted data. Existing unit overlap tests pass, but hosted atomic constraints were not exercised here. Use an approved disposable environment. |
| New cancellation retaining history/releasing availability and attendance writes | No hosted mutation was authorized. These transactions remain unchanged and require isolated integration verification. |
| Real confirmation email, provider failure after a successful booking, notification ownership/durable deduplication | Handler unit tests use stubs. No real function invocation, Brevo send or hosted ledger mutation was performed. |
| RLS enforcement against crafted cross-owner requests, role revocation, pagination beyond available fixtures | Normal session routing/read behavior is not a full authorization proof. No policy/role/fixture changes were made. |
| Physical Android/iPhone Safari, touch hover behavior, hardware safe areas, keyboards and installation | Chromium viewport checks are not device verification. Test on actual devices before release. |
| Sustained low-end GPU performance, real graphics-context loss and all background-tab lifecycle variations | Actual scene loading was checked on this Windows host; timeout/failure were injected. No performance certification is claimed. |
| Full offline startup, screen readers and complete accessibility conformance | The Auth SDK still requires its existing network dependency. Reduced motion, labels, focus and sampled controls were checked; no VoiceOver/TalkBack/WCAG certification. |
| Deployed site and current backend production readiness | Local changes do not update the hosted site. No deployment or backend readiness assertion is made. |

No migration or new secret is required for these fixes or the landing page. Existing backend setup requirements in README/EMAIL_SETUP/STAFF_SETUP still apply.

## Evidence and repeatability

Current sanitized result files in `evidence/audit-fixed-2026-10-09/`:

- `public-results.json`: A03, guarded resend/OTP/cooldown, 32 layout observations.
- `staff-results.json`: A01/A02/A04/A05, staff navigation/layout, real logout status.
- `patient-results.json`: age/date validation, guarded availability/booking, current history and 16 layout observations.
- `scene-results.json`, `scene-timeout-results.json`, `final-console-results.json`: actual Spline, fallback/lifecycle and final graphics check.

CLI scripts live beside the results. Use an isolated CLI browser, install `safe-session.js` before testing, and sign in manually with an approved account when required. `patient-checks.js` also installs its own database-write/email guards before submission. Do not remove safeguards to test production mutations. Existing Node browser scripts were not substituted for the required CLI workflow.

The original audit is archived as `evidence/audit-2026-10-09/AUDIT-before-fixes.md`. Its historical findings/test totals must not be treated as fresh results. Some original CLI string results require two JSON parses; the current summary results are ordinary JSON objects.

## QR check-in and analytics audit — 10 October 2026

Scope: new QR check-in, consultation timing, clinic analytics and landing cleanup. Local edits only: no deployment, hosted SQL/configuration changes, real account mutations, appointments or email sends.

### Confirmed verification

- **50 unit tests pass** (`npm.cmd test`): strict opaque QR parsing, reference-only RPC payloads, latency-aware pass countdown, local QR encoder/decoder round-trip, denied/late camera cleanup, N/A metrics, date presets, and Spline pointer/disposal behavior.
- **50 isolated PostgreSQL integration tests pass** (`npm.cmd run test:database`). Dedicated localhost port 55432/database medisched_test with synthetic Auth identities; this is not hosted Supabase. Original RLS, transactional overlap booking/cancellation, notification and attendance regressions pass. New checks cover cryptographic hashed passes, rejected cross-owner/unverified/nonstaff requests, private table denial, expiry/reissue/end boundaries, concurrent same/different scans, replay actor/version checks, concurrent cancellation/manual check-in/reissue, and expiry after appointment AND advisory action-lock waits. Analytics tests verify actual 15-minute waiting, unknown waits staying N/A, date/range/doctor bounds, department snapshots/Unassigned, cancellations/no-shows and 480-minute capacity excluding lunch.
- **Installed Playwright CLI 0.1.22** runs `tests/qr-cli-audit.js` through a prepared sandbox file. Synthetic SDK fixtures exercise normal login/routing/logout, patient details → QR canvas, reference cleanup, invalid pasted URL, review without mutation, lost-response retry with identical action ID, explicit replay label and current cancelled schedule, camera denial/manual entry, successful local fallback decoder using a generated canvas MediaStream, track cleanup after detection, Escape, missing analytics migration, and changed filters/delayed obsolete responses. **15 layout observations** pass: analytics 320/375/390/430/768/1440 in both themes, landing 320/390/1440. No page errors in the final run.
- Separate public-only CLI run loads the **actual Spline export** successfully, exercises pointer hover/leave, reduced motion and phone viewport, releases canvas and reports no page errors. No account sign-in or app mutations in that run.
- One fresh read-only code review completed. Its three important findings were reproduced, repaired in one fix pass, and verified with database/CLI regressions. The inactive-doctor selector limitation remains documented below.

### Findings, reproduction and resolution

| ID / severity | Steps to reproduce | Expected vs. actual before repair | Fix / evidence |
|---|---|---|---|
| Q01 — Medium: phone analytics overflow | Staff More → Clinic analytics; 320px viewport. | Filters should fit. Native date minimum widths forced the second grid column outside the page. | Reset minimum widths and use one filter column below 480px. Red browser reproduction; all 12 analytics size/theme observations now pass. |
| Q02 — Low: first QR action label | Open Show check-in QR before generating. | First action should say Generate check-in QR. Timer immediately changed it to Generate a new pass. | Preserve the first action label. CLI locates and uses it. |
| Q03 — Medium: expired pass after action-lock wait | In isolated SQL fixture hold the chosen action-ID advisory lock; consume a valid pass, advance beyond expiry, release. | Expired pass must reject. Nested attendance waited after the wrapper's expiry check and could commit the check-in. | Acquire the action lock before final pass expiry check. New test fails before repair and passes afterward; attendance version/event remain unchanged on rejection. |
| Q04 — Medium: replay shown as new check-in | Lose a committed confirmation response; cancel visit; retry the identical confirmation. | Say already recorded and refresh current visit state. UI always said Check-in saved; from Analytics it refreshed only aggregates. | Explicit already-recorded message; switch to schedule and refresh current rows. CLI checks same action ID and cancelled state. |
| Q05 — Medium: stale analytics under edited filters | Load analytics or delay a request; change From date before updating. | Results should correspond to an explicit applied range/snapshot. Old/late results remained below new editable filters without provenance. | Filter edits invalidate requests and clear results. Display immutable applied response dates, doctor and server snapshot. Loaded and delayed-response CLI regressions pass. |
| Q06 — Requested landing cleanup | Open desktop landing. | Requested clean scene. Hint, Pause button and large credit line appeared below artwork. | Remove toolbar/hint; footer Artwork credit page retains author/source/license/modifications. Freeze outside pointer interaction; fallback/reduced motion remain verified. |

Errors in test-fixture routing, viewport selection and asynchronous close-event assertions were corrected while authoring the CLI checks; those were not application bugs.

### Screenshots and repeatability

All patient/reference data in these screenshots is **synthetic**; landing screenshots are public and unauthenticated.

- `evidence/analytics-overflow-before.png`: Q01 reproduction.
- `evidence/analytics-desktop.png`, `evidence/analytics-phone.png`: corrected aggregate workspace.
- `evidence/qr-patient-desktop.png`: locally generated patient pass.
- `evidence/qr-review-desktop.png`: receptionist review before mutation.
- `evidence/qr-scan-phone.png`: camera-denied manual fallback.
- `evidence/qr-decoder-phone.png`: synthetic video decoded by the actual local browser fallback, with tracks stopped.
- `evidence/landing-clean-desktop.png`, `evidence/landing-clean-phone.png`, `evidence/landing-scene-live.png`: toolbar removal, phone/reduced-motion fallback, actual export.
- `evidence/qr-cli-output.txt`, `evidence/scene-cli-output.txt`, `evidence/qr-unit.txt`, `evidence/qr-database-full.txt`: fresh final results. `evidence/review-database-red.txt`, `evidence/review-cli-red.txt`, `evidence/analytics-filter-red.txt`: review reproductions; corresponding green results and final suite verify fixes.

Run instructions are in `docs/qr-analytics-setup.md`. Fixture preparation only serializes test data; browser automation runs through installed Playwright CLI, not the project's Node browser harness. Generated fixtures/screenshots are ignored local evidence. No real credentials are stored in these test files.

### Blockers, untested flows and limitations

| Feature / limitation | Why / recommended verification |
|---|---|
| Hosted QR/analytics RPCs and permissions | Migrations **007/008 are not applied to hosted Supabase**. Review/apply in authorized staging, verify pgcrypto, grants/RLS, PostgREST calls and real authorization/concurrency before production readiness. |
| Full Supabase Auth/OTP, role revocation, Edge/Brevo email delivery | Unit/synthetic SQL/SDK checks are not provider verification. Existing flows were preserved. No real registration/resend/email was triggered. Test later with authorized staging identities. |
| Physical Android/iPhone camera, native BarcodeDetector and Safari | CLI used desktop Chromium viewports, injected denial and synthetic video. Local fallback image/video decoding passed; hardware camera/permission UI/native decoder was not verified. Test HTTPS on actual devices. |
| Historical inactive doctor filter — Low, deferred | Doctor table can include inactive doctors with selected visits; selector currently uses the existing active schedule catalog. All-doctor aggregates include them. Recommended later fix: load a verified all-doctor analytics catalog and add an inactive-doctor selector regression. |
| Clinical department catalog and historical shift capacity | No specialties invented. Existing visits remain Unassigned; configure reviewed doctor assignments. Utilization uses current clinic hours, not historical doctor shifts. |
| GPU/scanner endurance and assistive technology | Actual Spline loaded on this host; no low-end performance, VoiceOver/TalkBack or complete accessibility certification. Reduced motion and sampled focus/touch layout behavior were checked. |
| QR metadata retention | Private consumed rows remain durable for retry/audit. No purge or cron was installed; define retention operationally before clinical use. |

**Next required step:** backend setup review in authorized staging, then real phone QR and hosted RPC checks. Production readiness remains blocked by unapplied/unverified migrations. Local files do not update the existing hosted site.

Console/network clarification: the synthetic CLI fixture deliberately aborts the external Spline runtime to test fallback, producing one expected `net::ERR_FAILED` console/resource entry. There were no uncaught page exceptions. The separate actual-export run reported no page errors and reached ready. Final review follow-up also verifies replay refreshes the scanned visit's date and clears unrelated schedule filters (red reproduction in `evidence/replay-date-red.txt`, green in final CLI output). Pass countdown subtracts RPC latency conservatively; server expiry remains authoritative.

## Early consultation verification — 11 October 2026

- **Previous behavior (medium workflow limitation):** check in a patient before the booked start time, refresh the staff schedule; Start consultation is absent and the RPC rejects it with 22023. Under the newly approved rule, checked-in patients should be able to start early and complete when finished.
- **Fix:** additive migration `supabase/migrations/20261010193257_early_consultation.sql` replaces the private action eligibility function. No frontend or booking changes. Staff permissions, cancellation guards, same-day check-in, timestamp recording and duplicate-action protection are retained. Legacy direct completion without starting remains limited to at/after booked time.
- **Database verification:** 51/51 integration tests passed on the isolated local PostgreSQL fixture. Early start at 10:35 and completion at 10:40 for an 11:00 visit succeed; actual wait remains five minutes. Unchecked-in, patient-role and cancelled starts are rejected; concurrent identical starts produce one transition. Evidence: `evidence/early-consultation-database.txt`.
- **Unit verification:** 50/50 passed.
- **Browser verification:** installed Playwright CLI passed Start consultation → confirmation → Complete → confirmation at 1440px and 390px. No page exceptions or horizontal overflow. Synthetic API fixtures only; no real appointments mutated. Reproduce using `node tools/prepare-early-consultation-cli.js`, then CLI `run-code --filename=evidence/early-consultation-cli-prepared.js` against the local server.
- **Screenshots:** `evidence/early-consultation-1440.png`, `evidence/early-consultation-390.png` show the in-consultation state and Complete action.
- **Not tested:** hosted migration execution and physical phone hardware. Apply the new migration after 008 in staging, refresh the schedule, and verify with an authorized test visit. Earlier audit findings and limitations remain separately documented above.

## Netlify package — 11 October 2026

Added an explicit static build shared with the local server allowlist, Netlify configuration and camera-self permissions headers. `npm run build` produces 84 public files in `dist`; a manual-upload ZIP is prepared. Current backend remains MediSched-Staging. The package excludes database scripts, local data, logs, tests and documentation. Build succeeded; 50 unit tests passed. Playwright CLI opened the generated build on loopback port 5175, captured the 390px landing page and recorded zero console errors/warnings. Hosted HTTPS, hosted headers and actual phone camera remain unverified until uploaded. Instructions: NETLIFY_SETUP.md. No Netlify site or Supabase setting was changed during package preparation.

## Production preparation — 11 October 2026

Original MediSched was missing QR/analytics functions. Applied migrations 007, 008 and the early-consultation function through Supabase migration tooling with user authorization. Verified all four QR/analytics RPCs, early action arrays and denied raw pass-table reads. Four existing appointments remain. Production-only build substitution leaves local staging config intact. 50 unit tests and generated-build desktop/mobile Playwright CLI checks passed; no console errors/warnings or overflow. Production deployment ZIP is ready. Hosted Netlify still points to staging. Production appointment-email OPTIONS preflight from https://sage-quokka-26302a.netlify.app returns 403 without access-control-allow-origin; append that exact origin in the original project's Edge secrets. Auth URL/code settings and deployment upload need Dashboard completion; see PRODUCTION_SETUP.md. No live appointments/emails were generated. User reports physical phone camera works on the staging-backed deployment; production end-to-end verification is pending.



## Netlify domain change — 11 October 2026

Owner renamed the site to https://mymedisched.netlify.app. Read-only HTTP checks confirm 200 and deployed config points to original MediSched. Appointment-confirmation OPTIONS preflight from the new origin returns 403 with no allow-origin header. Update original MediSched Auth Site/Redirect URLs and append the new exact origin to MEDISCHED_ALLOWED_ORIGINS. PRODUCTION_SETUP.md now uses the new domain; earlier audit entries retain their original test URLs. No hosted settings changed by this check.
