# MediSched Patient, Staff and Mobile Portals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Implement the approved patient/staff portal design with red-accent light/dark themes and an app-like Android/iOS web experience while preserving secure booking and emails.

**Architecture:** Add private database-controlled staff access and projected RPCs without widening patient appointment RLS. Store attendance separately from active/cancelled reservations, with locked, idempotent transitions and transactional audit events. Share the existing verified Supabase client/session across focused vanilla modules and a responsive workspace shell.

**Tech Stack:** Vanilla HTML/CSS/ES modules; existing Supabase JS 2.117.3, Supabase Auth/Postgres and Brevo Edge Function; existing Node test runner, pg 8.16.3 and Playwright 1.56.1. No framework or runtime dependency additions.

**Spec:** [Approved design and mobile requirements](../specs/2026-10-09-patient-staff-portals-design.md).

## Global Constraints

- Only `MediSched/` product files change; preserve unrelated portfolio projects and original recovery files.
- No deployment, hosted setting changes, production data mutations or real email sends. No GitHub push/publication without a subsequent request; the workspace currently has no remote.
- Keep the existing Supabase project, verified email/password access, eight-digit signup OTP, current RLS, atomic booking/cancellation, availability picker and server-side Brevo confirmations.
- Every day, 8 AM–5 PM, with a 12 PM–1 PM break; one-hour appointments starting on 15-minute boundaries in Asia/Manila. Last morning start 11 AM; last afternoon start 4 PM.
- Reservation status stays `active`/`cancelled`; Upcoming means `start_at > now`, Past means the visit has started, and Cancelled takes precedence.
- No passwords or OTPs in storage. No role authority from signup metadata, storage or the UI. No service worker or cached authenticated data.
- At least 44px touch targets, 16px input text, enabled pinch zoom, visible focus, reduced motion, phone-safe dialogs and bottom navigation below 768px.
- Home-screen metadata is online-only; installation and actual phone keyboard/Safari behavior are not proven by Chromium emulation.
- Existing Supabase/Brevo secrets and email sender stay unchanged. Notification client sends only the saved appointment UUID.

## Review Focus

1. Auth switches or revoked staff while a slow request is pending: discard response and remove privileged content immediately (Tasks 3/6).
2. Lost attendance response followed by cancellation or replay: same action UUID returns the original operation; refresh current appointment state before allowing another action (Tasks 2/6).
3. Legacy past bookings and empty result pages: never infer attendance or fabricate metrics/events; filtered totals remain correct (Tasks 2/5/6).
4. Phone landscape, short viewport and focused input with bottom navigation: no covered action/focus or page overflow, including long names/errors (Tasks 4/7/8).
5. Storage denied, offline RPCs or setup migration missing: theme still renders, no staff bypass, no fake success, and saved booking/email outcomes stay accurate (Tasks 3/4/5/8).

## File boundaries

All paths below are relative to `MediSched/`.

| Files | Responsibility |
| --- | --- |
| `supabase/migrations/202610090006_staff_workflow.sql` | Additive roles, attendance, tracking cutoff, audit, projected reads, transition RPCs, indexes and triggers |
| `supabase/setup/staff-access.sql`, `STAFF_SETUP.md` | Reviewed manual assignment/revocation and staged rollout instructions |
| `session.js` | One Supabase client, verified session lifecycle, auth epochs and protected page guards |
| `script.js`, `auth-helpers.js`, `otp.js` | Existing auth and patient flow integration; existing domain/OTP contracts retained |
| `staff-data.js`, `attendance.js` | Validated staff RPC adapter and pure attendance/status/time formatting |
| `theme.js`, `workspace.js`, `styles.css`, `workspace.css` | Shared themes, navigation, More/dialog focus and responsive presentation |
| `dashboard.html`, `patient-view.js` | Patient overview/details/history and existing booking modal wiring |
| `staff.html`, `staff.js` | Staff daily schedule, filters/totals, paged activity, transitions and stale-response suppression |
| `manifest.webmanifest`, `assets/app-icon.svg`, generated PNG icons, `tools/generate-icons.cjs` | Local home-screen metadata and reproducible code-native icon assets |
| `tools/serve.js` | Explicit application asset allowlist; never expose SQL, tests, docs or secrets |
| `tests/staff-postgres.integration.js`, `tests/attendance.test.js`, `tests/session.test.js`, `tests/theme.test.js`, `tests/mobile.cjs` | New permission/workflow/session/theme/mobile verification |
| `tests/browser.cjs`, `tests/postgres.integration.js`, `package.json` | Extend existing mocks/setup and add genuinely implemented test scripts |
| `README.md`, `tests/PORTALS_RESULTS.md`, `MOBILE_CHECKLIST.md` | Commands, actual results, mobile device checklist and remaining blockers |

## Execution preflight

- [x] Read this plan/spec and the Superpowers execution, worktree, TDD and verification skills. Use the user-selected execution method only; no subagents are launched by this planning stage.
- [x] Inspect Git status, repository instructions and existing attached worktrees. The repository currently tracks design artifacts only; runtime files are untracked. Preserve them before isolation: review and commit a scoped MediSched baseline with exact application/test/SQL/document paths. Exclude parent `API KEY.txt`, `MediSched-Brevo.txt`, `.env`, `node_modules`, `.local-db`, logs and unrelated recovery files. `config.js` may contain only the already-required public Supabase URL/key, never a service secret.
- [x] Use `codex/medisched-portals` for an implementation branch/worktree after the scoped baseline exists. Reuse a suitable attached worktree if present; do not start an empty checkout or lose current files. Integration back to the user's MediSched folder is local and must preserve any newer unrelated edits.
- [x] Run baseline `npm.cmd test` and `npm.cmd run test:browser`. Inspect failures before changing behavior. For SQL, start the dedicated fixture with `powershell.exe -ExecutionPolicy Bypass -File .\tools\start-test-postgres.ps1`, then `npm.cmd run test:database`. The process-only flag does not change Windows execution policy globally.

### Task 1: Database-controlled staff access and private daily reads

**Files:** Create migration `006`, `supabase/setup/staff-access.sql`, `STAFF_SETUP.md`, `tests/staff-postgres.integration.js`; modify `tests/postgres.integration.js`, `package.json`.

**Interfaces:** `get_access_context()` returns JSON `{display_name,is_staff}` for a verified caller. `list_staff_appointments(p_date,p_doctor_id,p_search,p_cursor,p_cursor_id,p_limit)` returns JSON `{items,totals,next_cursor}`; each item includes `id,patient_name,doctor_id,doctor_name,type_name,start_at,end_at,status,attendance_state,version,allowed_actions`. Totals: `total,checked_in,completed,no_show`. Cursor: `{at,id}` or null. In this task attendance is absent and must be projected as not recorded; Task 2 completes workflow-derived projections.

- [x] Add failing SQL tests for active staff allowed; patient/anon/unverified/forged metadata/revoked staff rejected with `42501`; direct membership writes/appointment cross-owner SELECT denied; projection excludes address/age/email/owner UID; exact date/doctor/name filters and whole-result totals; cursor tied timestamps; limits outside 1–100, >120-character search, unknown doctor and partial cursor rejected with `22023`.
- [x] Run `node --test tests/staff-postgres.integration.js`; confirm missing functions fail, not an unrelated connection failure. Keep a loopback/55432/dedicated-database/fixture-marker safety guard equivalent to the existing SQL harness.
- [x] Implement private memberships, `is_staff()` and verified context/read RPCs with qualified objects, empty search path and explicit grants. Escape `%`, `_` and backslash in literal case-insensitive patient-name search. Stable order `(start_at,id)`; one Manila day per call. Index `(start_at,id)` and `(doctor_id,start_at,id)`. Validate finite dates and complete cursor pairs. Use one read snapshot for rows/totals; no dynamic user SQL. Keep appointment owner policies intact.
- [x] Add manual SQL selecting a confirmed Auth user by exact supplied email into a checked UUID variable, then assignment/revocation. No embedded real staff email or auto-assignment. Document service-role/secrets never entering frontend code.
- [x] Teach both local SQL fixtures to apply migration `006` if its known marker is absent. Add `test:database` command `node --test --test-concurrency=1 tests/postgres.integration.js tests/staff-postgres.integration.js`; this serializes shared synthetic fixture resets. Existing unknown-database safety remains.
- [x] Run `npm.cmd run test:database`; all existing permission/booking/availability/email-ledger tests plus new staff tests pass. Commit exact task files as `feat: add database-controlled clinic staff access`.

### Task 2: Attendance transitions, history and transaction concurrency

**Files:** Extend migration `006` and `tests/staff-postgres.integration.js`; create `attendance.js`, `tests/attendance.test.js`.

**Interfaces:** `set_appointment_attendance(p_appointment_id,p_action,p_action_id,p_expected_version)` returns JSON `{appointment_id,state,version,action_id,replayed}`. Actions `check_in`, `complete`, `no_show`. `list_staff_activity(p_date,p_doctor_id,p_cursor,p_cursor_id,p_limit)` returns `{items,next_cursor}` with event ID/time/type/appointment ID/patient name/doctor name/trusted actor name+role. `attendanceLabel(appointment,attendance)` returns a display label; `formatVisitRange(appointment)` returns a full start/end range in Asia/Manila.

- [x] Write failing SQL tests for the transition matrix, exact start/end and Manila day boundaries, terminal/cancelled rejection, stale version, duplicate UUID, UUID/payload mismatch, two staff competing, cancellation race, transactional audit rollback and occupied interval after completion/no-show. Add old-past/no-inferred-history and future-legacy cases. Include code assertions such as `assert.equal(replay.action_id, original.action_id)` and `assert.equal(events.length, 1)` for a replayed transition.
- [x] Add unit assertions: `attendanceLabel({status:'cancelled'}, {state:'checked_in'}) === 'Cancelled'`; missing attendance === `Attendance not recorded`; explicit no-show remains `No show`; a `09:45–10:45` visit keeps minutes and timezone formatting.
- [x] Run `node --test tests/attendance.test.js tests/staff-postgres.integration.js`; observe feature failures.
- [x] Add attendance with owner SELECT RLS and no client writes; private tracking cutoff and audit tables. Initialize Scheduled attendance rows only for existing future appointments without audit backfill. Past rows remain absent. New booking trigger creates attendance plus a booked event; first cancellation creates a cancelled event. No audit is written for unchanged cancellation.
- [x] Implement row-locked transitions and durable action UUID uniqueness. Replay requires same actor/appointment/action; compare expected version only for new actions. Check in same Manila day and before end; complete checked-in at/after start; no-show Scheduled at/after end. Refuse starts before cutoff. Do not change reservation status or the existing cancellation function/interface. Lock the appointment before attendance/audit rows, including UUID collision handling, to serialize cancellation and avoid deadlock order reversal.
- [x] Add private `workflow_now()` returning `clock_timestamp()` with no client execute grants. Use it only for workflow timing/projections. In the isolated fixture, superuser temporarily replaces this helper for deterministic boundary tests and restores it in `finally`; no caller-supplied time or deployed test override. Use existing real booking/cancellation functions in race tests.
- [x] Complete daily projection/totals and allowed-action flags from server time. Privileged inserts create trusted actors from current Auth identity or an explicit System marker; browser payload supplies no audit actor/name/time.
- [x] Run `npm.cmd test` and `npm.cmd run test:database`; existing reservations and notification ownership/duplicate protections still pass. Commit as `feat: add atomic appointment attendance and audit history`.

### Task 3: Shared verified session and protected staff routing

**Files:** Create `session.js`, `tests/session.test.js`; modify `script.js`, `auth-helpers.js`, `tests/browser.cjs`.

**Interfaces:** `createSessionController({client,onState,onError})` exposes `start()`, `refresh()`, `signOut(scope='global')`, `snapshot()` and `dispose()`. State is `{epoch,user,access}`; access from Task 1 only. `initializeSession({page,onReady,onClear,onError})` creates the existing configured Supabase client once per page and delegates lifecycle. Existing `AUTH_STORAGE_KEY`, OTP/signup/verification/resend API shapes stay unchanged.

- [x] Add failing unit/browser tests for anonymous/unverified guards, patient direct staff route, active/revoked staff, staff routing after OTP/password login, missing access RPC/network errors, account A→B while context/catalogue load is delayed, and expired session clearing open dialogs. Assert old epoch callbacks cannot render prior data and `auth.signOut()` is called on actual logout/unverified rejection.
- [x] Run `node --test tests/session.test.js` and `npm.cmd run test:browser`; verify relevant failures.
- [x] Extract client/session lifecycle from current shared script without rewriting OTP helpers. Keep Supabase calls outside `onAuthStateChange` callbacks. Auth operations use the existing operation guard; perform one checked routing decision once settled. Context failure shows setup/error state and grants no staff access; do not spoof a default staff context. Patient page remains protected by authoritative verified Auth and owner RLS.
- [x] Clear pending patient/staff views, modal values, lists and epochs on auth loss. Clear only app-owned session/auth pending state; preserve a chosen app theme preference. Preserve current exact-UUID booking retry state during a still-valid session.
- [x] Run `npm.cmd test` and `npm.cmd run test:browser`, including all existing OTP/password/cooldown/registration and logout scenarios. Commit as `refactor: share verified portal session handling`.

### Task 4: Theme system and responsive workspace navigation

**Files:** Create `theme.js`, `workspace.js`, `workspace.css`, `tests/theme.test.js`; modify `styles.css`, `index.html`, `dashboard.html`, `tools/serve.js`, `tests/browser.cjs`.

**Interfaces:** `initializeTheme({document,storage,media})` exposes `setTheme('light'|'dark')`, `currentTheme()`, `dispose()`. Storage key `medisched.theme`. `mountWorkspace({role,currentView,onNavigate,onBook,onSignOut,onSwitchWorkspace})` returns `setView(view)` and `clear()`. Views: `home`, `appointments`, `activity` (staff only), `more`.

- [x] Add failing theme tests for saved preference, system fallback, denied storage, media changes only when no explicit preference, correct theme-button label/pressed state and no unrelated storage deletion. Browser tests assert patient has no staff controls, desktop/mobile destinations work, More reaches theme/logout, 320px navigation fits and no hidden sidebar links remain keyboard-focusable.
- [x] Run `node --test tests/theme.test.js` and targeted browser scenarios; confirm new controls absent.
- [x] Implement semantic light/dark tokens matching approved local preview and system fonts. Load theme initialization before protected content becomes visible; honor a readable CSS media fallback if JS/storage fails. Keep strong focus and text-based status badges.
- [x] Implement desktop sidebar, compact mobile top bar and bottom nav below 768px. More is a focus-managed dialog/menu with authorized switches only. Add safe-area padding and page bottom clearance; nav labels/icons use `aria-current`. Keep controls reachable at 320px and in landscape. Shared navigation state changes scroll/focus intentionally and respects reduced motion.
- [x] Restyle existing auth/register/OTP screens and password buttons without changing IDs/form constraints. Add asset allowlist entries for the actual new modules/CSS; SQL/docs/secrets remain 404.
- [x] Run `npm.cmd test` and `npm.cmd run test:browser`; inspect light/dark desktop and phone auth/OTP screenshots. Commit as `feat: add themed desktop and mobile workspace shell`.

### Task 5: Patient overview, details and progress integration

**Files:** Create `patient-view.js`; modify `dashboard.html`, `script.js`, `tests/browser.cjs`.

**Interfaces:** `renderPatientOverview({user,appointments,attendance,onBook,onDetails,onCancel})`; `renderPatientAppointments({appointments,attendance,filter,onDetails,onCancel})`. Attendance is a Map keyed by appointment ID; owner-scoped table SELECT reads `appointment_id,state,version,updated_at` only for loaded appointment IDs in batches of at most 100. RLS remains authoritative.

- [x] Add failing browser checks for next future noncancelled appointment, empty next visit, correct full-hour range, all three time categories, historical missing attendance, cancellation precedence, long/injected names, details focus/Escape and confirmation focus restoration.
- [x] Run `npm.cmd run test:browser`; confirm missing overview/detail features fail.
- [x] Implement next-visit and clinic cards using safe DOM text; keep existing `scheduleBtn`, `scheduleForm`, catalogue inputs, slot controls and feedback IDs. Own details may show the owner's saved data; staff detail remains limited. Details and cancellation use accessible native dialogs with explicit confirmation, never inline user interpolation.
- [x] Load owner attendance alongside own appointments; missing workflow migration produces clear setup feedback, not invented attendance. Reuse `appointmentStatus`, `availableOptions`, `validateAppointment` and `bookingParameters`. Retain booking values/UUID on uncertain outcome, refresh stale slots, saved UUID notification, and exact separate failure copy.
- [x] Run existing booking/OTP/email failure browser scenarios, `npm.cmd test` and `npm.cmd run test:database`. Confirm no whole-user/appointment collection read or EmailJS is reintroduced. Commit as `feat: add patient overview and attendance progress`.

### Task 6: Staff daily schedule, activity and attendance actions

**Files:** Create `staff.html`, `staff-data.js`, `staff.js`; modify `tests/browser.cjs`, `tools/serve.js`; create/update `tests/staff-data.test.js`.

**Interfaces:** `createStaffData(client)` exposes `context()`, `appointments({date,doctorId,search,cursor,limit=25})`, `activity({date,doctorId,cursor,limit=25})`, `transition({appointmentId,action,actionId,expectedVersion})`, consuming Task 1/2 response fields. UI never supplies a patient email, audit actor or server time.

- [x] Add failing adapter/browser tests for RPC parameter mapping, filtered whole-result metrics, 25-row pagination/empty page, tied cursor IDs, debounced search, doctor/date changes while old requests resolve, logout/revocation while rows render, unsafe strings, missing setup, retained filters after errors and long/mobile rows. Mock no-show only when server allows it.
- [x] Test lost transition response: retry uses the same `actionId`, appointment/action/version; changed actions are blocked until outcome is resolved; replayed success refreshes current rows. Stale-version error refreshes with no overwrite; email is not invoked by attendance.
- [x] Run `node --test tests/staff-data.test.js` and `npm.cmd run test:browser`; verify failures.
- [x] Implement session-gated staff page with loading/error/empty states, today in Manila, allowed catalogue filters, metrics, safe list/table/detail rendering and paged activity. Search debounce 250ms; each request carries auth epoch and query generation; old responses are discarded. Activity reports post-rollout events only.
- [x] Implement confirmed attendance actions with disabled duplicate submit/loading. Definite invalid/permission/version errors unlock after refresh; uncertain network errors retain the exact operation ID/payload for retry. Never optimistically display saved state before server confirmation. Revocation clears lists and returns to a safe route.
- [x] Run `npm.cmd test`, `npm.cmd run test:database` and `npm.cmd run test:browser`. Inspect real UI with mocked backend only; confirm no full patient table or notification ledger reaches client. Commit as `feat: add clinic operations workspace`.

### Task 7: Android/iOS presentation, short-screen forms and home-screen metadata

**Files:** Create `manifest.webmanifest`, `assets/app-icon.svg`, `assets/icon-192.png`, `assets/icon-512.png`, `assets/apple-touch-icon.png`, `tools/generate-icons.cjs`, `tests/mobile.cjs`, `MOBILE_CHECKLIST.md`; modify all three application HTML heads, `workspace.js`, `workspace.css`, `styles.css`, `tools/serve.js`, `package.json`.

**Interfaces:** `bindDialogViewport(dialog)` in `workspace.js` returns a cleanup function, exposing only CSS `--dialog-viewport-height` from `visualViewport.height` when supported. No native bridge, service worker or new backend. Manifest fields: `id:'./'`, `name:'MediSched'`, `short_name:'MediSched'`, `start_url:'./index.html'`, `scope:'./'`, `display:'standalone'`, local icons; no locked orientation.

- [x] Add failing mobile tests for bottom-nav clearance at 320/360/390/430px, landscape 844×390, short 390×420 viewport, form scroll/focus and close/submit visibility, More/session actions, long content, touch targets, reduced motion, visible OTP/error text, manifest/icon URLs and explicit asset allowlist. Assert zoom remains enabled and CSS safe-area hooks exist; do not claim numeric native inset values were reproduced.
- [x] Run `node tests/mobile.cjs`; verify absent metadata or layout requirements fail. Add `test:mobile: node tests/mobile.cjs` to package scripts only when the test file exists.
- [x] Add viewport-fit, theme-color and Apple touch metadata consistently. Use `100vh` fallback plus `100dvh`; overlay/dialog viewport height respects supported VisualViewport, with listener cleanup and no scroll trap. Hide mobile bottom nav during keyboard-focused text input; restore on blur/closed dialog. Modal content scrolls above safe bottom padding and submits remain reachable. Never disable pinch zoom.
- [x] Generate opaque local icons from the approved red square/white plus mark in SVG using existing headless Chromium dev tooling. Keep adequate icon padding; export 192/512/180px PNGs reproducibly. Do not add icon/font network dependencies. Update allowlist/MIME types for `.webmanifest`, `.svg` and exact `assets/` paths, preserving traversal rejection.
- [x] Document Android Chrome and iOS Safari Add to Home Screen steps and online-only behavior, with browser/host-dependent availability. Keep optional install guidance in More; no intrusive prompt or claim of native app-store distribution.
- [x] Run `npm.cmd run test:mobile` and `npm.cmd run test:browser`; use touch emulation in Chromium. If an existing local WebKit executable is available, run the same harness there and report it as desktop WebKit/emulation, not real iPhone Safari. No unrequested tool downloads. Inspect screenshots of every page/modal/theme in representative desktop/phone states.
- [x] Commit as `feat: add app-like Android and iOS web presentation`.

### Task 8: Full verification, documentation and local integration

**Files:** Modify `README.md`, `STAFF_SETUP.md`, `MOBILE_CHECKLIST.md`, `tests/PORTALS_RESULTS.md`, relevant test harnesses and task checkboxes.

- [x] Run `npm.cmd test`, `npm.cmd run test:database`, `npm.cmd run test:browser`, `npm.cmd run test:mobile`, and `npm.cmd run test:supabase`. A skipped full Supabase test is a recorded limitation, not a pass. Include syntax checks of all new JS modules and existing notification-handler checks. Verify permissions and concurrency with actual local Postgres, synthetic Auth rows, mocked Brevo only.
- [x] Check every spec requirement against the implementation/test evidence. Fix concrete failures, then rerun affected checks. Verify no active EmailJS, client secrets, public staff-membership writes, widened appointment SELECT policy, offline patient cache, dead navigation or synthetic preview patients were shipped.
- [x] Complete setup docs: apply migration `006` after existing five migrations in authorized staging; assign a real confirmed staff account manually; test ordinary/staff access; revoke and retest. No hosted changes are executed. Existing OTP/Brevo instructions remain accurate; staff attendance creates no new email pathway.
- [x] Write results with actual counts/commands, screenshot locations and explicit blockers: full GoTrue/PostgREST/Edge integration if unavailable, hosted migration/settings, Brevo live delivery, physical Android keyboard/install, physical iPhone Safari/home-screen/safe-area behavior. Supply a concise device checklist covering portrait/landscape, keyboard, session loss, theme, dialogs and launch from home screen.
- [x] Follow the selected execution skill's fresh review requirement and address findings. Do not spawn agents until the user selects an execution method that authorizes that review. Review scoped Git diffs, ignored/untracked files and accidental secrets before integration.
- [x] Integrate the reviewed branch locally into the user's working MediSched folder while preserving newer user edits. Run the relevant smoke checks there, show the actual application and report migrations/manual hosted checks still required. No push, deploy, real email or production write.

## Execution choice and review status

Approved 2026-10-09: implement in this session, followed by one fresh final review. Local results and setup blockers are recorded in tests/PORTALS_RESULTS.md.

Recommended: Native implementation in this session, followed by the required fresh final review. The session, staff and mobile tasks share contracts and UI files, so sequential work avoids conflicting edits. Subagent-driven implementation/review is also available if the user prefers more independent per-task review.

Planning self-review: every design section maps to Tasks 1–8; mobile changes are explicit in Tasks 4/7/8; the five Review Focus failures have named tests; RPC/JS field names are consistent. Commands added by this plan are labelled as future additions rather than existing scripts. Production data/configuration and unrelated portfolio scope stay excluded.

## Completed local handoff — 2026-10-09

Native implementation and the fresh final review are complete. Three Important findings were reproduced and repaired, with one minor last-refresh timestamp deferred. Reviewed code was fast-forwarded into the original MediSched folder and its 37 unit, 42 mocked-browser and 43 mobile/desktop checks passed there. The unchanged SQL implementation passed 38 isolated PostgreSQL checks; full Supabase integration remains one skipped test. Local server restarted on 127.0.0.1:5173. Hosted migration/role setup, real email delivery and physical-phone checks remain blocked/unverified as documented. No deploy, push or production mutation. See implementation-notes.md and tests/PORTALS_RESULTS.md.
