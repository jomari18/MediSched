# MediSched patient and clinic staff portals

Status: design approved by the user on 2026-10-09. Android/iOS app-like presentation added at the user's request. Implementation-plan review is next; product implementation has not started.

## Goal and agreed constraints

Turn the existing booking application into a useful patient and clinic operations project for Jomari M. Candido’s developer portfolio. Jomari is the sole developer. The user approved combining a stronger patient experience with a clinic staff workspace, and explicitly selected light/dark themes with red accents.

Keep vanilla HTML/CSS/JavaScript, the existing Supabase project, verified email/password access, eight-digit signup OTP, current RLS, atomic booking/cancellation, availability picker and server-side Brevo confirmations. Keep dependencies minimal. Work locally; no deployment, hosted setting changes, production data mutations or real email sends.

Clinic rules remain every day, 8 AM–5 PM, with a 12 PM–1 PM break; one-hour appointments starting on 15-minute boundaries in Asia/Manila. Visits must fit entirely inside an open interval. Last morning start is 11 AM; last afternoon start is 4 PM.

This is a single-clinic scheduling system. Staff may manage attendance for any listed doctor. Doctor accounts, medical records, clinical advice, payments, insurance, appointment rescheduling, automatic reminders, multi-clinic tenancy and role-management UI are outside this release.

## Approach

Use additive database tables and narrowly scoped staff RPCs. Keep patient ownership policies on `appointments` unchanged. Separate attendance from reservation status, so clinical workflow cannot accidentally release a booking.

Alternatives considered:

- Expanding appointment RLS to let staff select entire rows is simpler, but unnecessarily exposes addresses, ages, owner IDs and email addresses. Prefer explicit staff projections.
- A separate staff backend or framework would add deployment and maintenance overhead. Existing transactional Postgres functions can enforce this release’s permissions and state transitions.

The Figma and local previews illustrate appearance; their synthetic records and workspace selector are never application authority.

## Design reference and review evidence

- [Editable Figma draft](https://www.figma.com/design/G65DKar9DpQJnsp0TOO84T): patient and staff screens in light/dark themes plus phone compositions.
- [Local interactive design preview](../figma/portal-preview.html): corrected button labels, both portals, theme toggle, synthetic search/filters, and preview-only dialogs. It has no backend connection, imports, credentials or storage. Open the file directly in a browser.
- [Local preview check results](../figma/preview-checks.json).

Figma’s Starter plan tool limit blocked the last component correction and three final exports. The canvas still has narrow/wrapping button labels. Treat it as an incomplete composition draft, not a finished implementation reference. The saved authoring source contains the proposed label correction; it was not applied to the cloud file. The local preview is the visual review reference until Figma can be updated.

Fresh local headless Chromium checks passed for eight combinations: patient/staff, light/dark, 1440/390 CSS-pixel widths. No page overflow, clipped button labels, buttons below 44px height, or JavaScript page errors were detected. Sample search/filter, theme toggle, dialog opening and Escape were checked. All eight layout captures were visually inspected; phone staff caption/filter spacing was corrected and all eight checks rerun. These are static design checks, not product, Supabase, email or iPhone Safari verification.

## Patient experience

### Overview

- Verified user name, next noncancelled future appointment, and a prominent booking action.
- Clear date, full one-hour time range, doctor, appointment type, and Philippine timezone.
- Clinic hours and concise arrival guidance; no invented clinic address or doctor credentials.
- Appointment details and eligible cancellation actions, preserving confirmation and loading/error feedback.
- Empty state with booking action when there is no next appointment.

### Appointments and progress

Keep current time-based categories: Upcoming means `start_at > now`; Past means the visit has started; Cancelled takes precedence over time. An in-progress visit therefore appears in Past, with its attendance badge explaining its state. Do not silently change the existing category contract.

Attendance badges are Scheduled, Checked in, Completed, No show, or Attendance not recorded. Cancellation overrides the displayed attendance badge but retains earlier audit events. Only the owner can see their own attendance. No owner can write attendance.

Keep the accessible booking modal, current fields, slot refresh, input preservation after failure, request UUID retry protection, conflict recovery and separate email outcome. An email failure continues to mean “Appointment saved; confirmation email could not be sent.”

## Clinic staff experience

Use the same sign-in and signup verification flows. On verified login, a server access-context RPC chooses patient or staff landing page. An active staff member can switch back to their own patient workspace. Ordinary users do not see staff navigation.

### Overview and daily appointments

- Today in Asia/Manila by default, with an explicit date picker.
- Daily totals: all bookings including cancellations, currently checked-in, completed, and explicitly recorded no-shows. Counts match the selected date, doctor and name filter; they describe the entire result, not just the displayed page.
- Search by saved patient name and filter by permitted doctor.
- List: stable appointment ID internally, start/end time, patient name, doctor, type, effective attendance/cancellation status and eligible action flags. Do not return address, age, email, owner UID, patient profile lists or notification ledger data.
- Read-only appointment detail panel uses the same limited projection.
- Refresh and pagination, loading/error/empty states, last-refresh timestamp. No fabricated analytics or placeholder chart.
- Check-in, complete, and mark-no-show actions with confirmation and inline progress. No staff cancellation or booking-on-behalf in this release.

### Activity history

Append-only records of booking, cancellation, check-in, completion and no-show events recorded after migration. Show timestamp, appointment’s saved patient name, action and trusted actor display name/role. Use a selected day and optional doctor filter; paginate. The same page-size and input-validation limits apply here; patient-name search is on the daily appointment list.

A separate mobile navigation menu exposes Overview, Appointments, Activity history, patient-workspace switching and Sign out. Controls stay reachable when the desktop sidebar is absent. The current design preview illustrates content layout; this mobile navigation is a required implementation screen state.

## Permissions and backend contract

### Staff membership

Create `medisched_private.staff_memberships` keyed by Auth UUID, with `active`, `created_at` and `updated_at`. Membership is assigned/revoked only by the project owner using reviewed setup SQL. No browser write grants, user-selected signup role, local-storage authorization or editable Auth metadata roles.

A private security-definer helper checks both current verified Auth identity and active database membership on every staff RPC. Use an empty search path, qualified objects and minimal execute grants. Revocation blocks subsequent calls even if an old JWT or UI still says staff. Already-running transactions are not retroactively revoked.

Access-context returns only caller identity, verification and `is_staff`. Route guards protect direct staff navigation and clear stale privileged content on auth change or access rejection. Signed-out/unverified users get no appointments or access context. Frontend routing supplements database checks.

### Staff read functions

Proposed public contracts:

- `get_access_context()` — verified caller’s display name and active staff flag.
- `list_staff_appointments(p_date date, p_doctor_id text, p_search text, p_cursor timestamptz, p_cursor_id uuid, p_limit integer)` — one Manila day, approved projection, action eligibility flags, next stable `(start_at,id)` cursor and matching totals. Limit 1–100; search at most 120 trimmed characters; validate doctor against catalogue. No dynamic SQL from search input.
- `list_staff_activity(p_date date, p_doctor_id text, p_cursor timestamptz, p_cursor_id uuid, p_limit integer)` — similarly bounded events and stable `(occurred_at,id)` cursor.
- `set_appointment_attendance(p_appointment_id uuid, p_action text, p_action_id uuid, p_expected_version integer)` — authorized atomic transition, described below.

Reject malformed dates, unknown doctors, invalid limits, partial cursors and unsupported actions. A single call may retrieve only the selected day, not an arbitrary unrestricted range. UI paginates rather than collecting every patient. Queries use parameterized values, deterministic ordering and date/doctor indexes; counts and rows use the same filter definitions.

No new staff SELECT policy on `public.appointments`. Owner-only appointment reads/writes and appointment notification ownership checks remain intact. Staff RPCs perform deliberately privileged access after authorization and expose only their documented fields.

## Attendance, concurrency and history

Create `public.appointment_attendance`, keyed by appointment UUID, with `state`, integer `version`, `updated_at` and trusted `updated_by`. Owner SELECT RLS requires verified sign-in and appointment ownership; direct authenticated INSERT/UPDATE/DELETE are denied. Staff write access is exclusively the validated RPC.

Reservation `appointments.status` remains `active`/`cancelled`. Attendance does not change `start_at`, `end_at`, owner, doctor, email recipient or the GiST exclusion reservation constraint.

| Action | Required current state | Server time eligibility | Result |
| --- | --- | --- | --- |
| Check in | Scheduled | Same Manila day; before visit end | Checked in |
| Complete | Checked in | At or after visit start | Completed |
| Mark no show | Scheduled | At or after visit end | No show |

All actions reject cancelled appointments, historical records excluded from attendance tracking, invalid transitions and nonstaff/unverified callers. No-show is explicit, never inferred just because time passed. A checked-in patient is not automatically marked no-show. Terminal outcomes have no correction/reversal UI in this release; exceptional corrections require a future reviewed administrative workflow.

RPC transaction order: verify caller; lock appointment row; check/replay action UUID; establish/lock attendance row; validate time, state and expected version; update state/version; append event; return trusted saved state. Reusing an action UUID with the same actor, appointment and action returns the original result. Reusing it with a different payload is rejected. Competing actions with stale versions are rejected with refresh guidance. The UUID uniqueness guarantee is durable.

The existing cancellation RPC locks the same appointment row. Preserve its policy: the verified owner may cancel an active future visit even if early check-in was recorded. Cancellation wins the displayed status; staff actions after cancellation reject; history of any earlier check-in remains. Once a visit starts, owner cancellation is already rejected. The shared lock serializes cancellation/attendance races.

Completion/no-show never releases an interval early. Only the existing cancellation transaction releases reservations. Staff actions cannot free another person’s slot.

Create a private append-only audit table with UUID event ID, appointment ID, action UUID where applicable, event type, trusted actor UID/role/name snapshot and timestamp. Booking INSERT and first cancellation transition generate events using narrowly scoped database triggers in the existing transaction. Failed/conflicting bookings produce no committed event; repeated cancellation produces no extra event. Attendance writes and audit inserts commit together. Browser clients cannot insert, edit or delete events.

Record a migration tracking start timestamp. Existing appointments starting before this timestamp have “Attendance not recorded” unless subsequently supported by an explicit administrative correction; they cannot be given inferred outcomes. Existing future appointments can start as Scheduled without creating fictitious historical events. Do not backfill booking/cancellation events or production outcomes.

## Visual system and accessibility

- Light: soft neutral workspace, white cards, dark readable text. Dark: charcoal workspace, raised surfaces and muted borders. Red anchors primary actions, active navigation and identity.
- Shared semantic CSS tokens for surfaces, text, borders, red, status colors, focus, spacing and radii. Theme follows system preference initially; an explicit app-owned preference persists across reloads. Never persist passwords or OTPs.
- Use the existing system font stack for reliable local rendering. Figma uses DM Sans as a composition reference; no new font CDN or dependency is required.
- Balanced typography, clear hierarchy, restrained shadows, 8–24px spacing, 44px touch targets, visible keyboard focus. Status includes text, not color alone.
- Desktop sidebar and compact responsive cards; phone staff rows become labelled cards without horizontal page overflow. Two-column phone summary metrics when space permits.
- Semantic headings, associated labels, accessible tables/filters, live error/progress messages, focus-managed confirmation/details dialogs, Escape and focus restoration.
- Theme switch has an accessible name and state. Honor reduced-motion preferences. Signup/password visibility, OTP length/paste, cooldown and verification enforcement remain unchanged.
- Redesign auth/OTP and booking/cancellation modal surfaces with the same tokens. Preserve working form contracts, IDs or documented replacements and animations where applicable. Remove no working feature.

## Android and iOS web-app presentation

The user approved the design and requested an app-like experience on Android and iOS phones. This adds responsive web presentation and home-screen metadata within the existing stack.

- At widths below 768px, use compact top branding and fixed bottom navigation. Patient destinations: Home, Appointments and More; the booking action remains prominent on Home. Staff destinations: Home, Appointments, Activity and More. More exposes theme, Sign out and authorized workspace switching. No signup-selected staff role or preview workspace selector.
- Bottom navigation must fit without horizontal scrolling at 320px. Each target is at least 44px high; use text plus icons, an accessible navigation label and `aria-current` for the active view. Desktop retains the sidebar.
- Use `viewport-fit=cover`, minimum padding plus `env(safe-area-inset-*)`, and extra page bottom padding for the navigation and home indicator. Dialogs sit above navigation. Landscape respects left/right cutouts as well as top/bottom insets.
- Use dynamic viewport units with a conventional viewport fallback for dialog/shell height. Keep focused form controls and submit/close actions reachable with reduced visible height; allow dialog scrolling and never lock page height to a phone model. Where visual viewport support is present, use its visible height for open dialogs and hide bottom navigation during keyboard-focused text entry; restore on blur/close. Keep pinch zoom enabled.
- Form inputs retain 16px text, correct input modes/autocomplete, hidden passwords by default, eight-digit text OTP with leading zeros and paste, and no persistent passwords/OTPs. Appointment forms stack on phones. Long names/status/error messages wrap safely.
- Add a manifest with name/short name MediSched, relative scope/start URL, `display: standalone`, and local 192/512px icons. Include a local 180px Apple touch icon and matching theme metadata on all application pages. Provide concise Android/iOS Add to Home Screen instructions; availability and browser prompts depend on browser, hosting and device. Do not promise automatic installation or an app-store package.
- No service worker, offline booking, cached authenticated HTML/API responses, background reminders, push notifications or new personal-data storage in this release. The app remains online. Home-screen metadata does not grant a session or staff rights.
- Verify portrait widths 320, 360, 390 and 430px, phone landscape and a short 390×420 viewport in both themes. Check every auth/OTP, patient, staff, More and modal state, footer visibility, touch targets and keyboard focus. Browser emulation and resized viewports are reported as such; physical Android Chrome, iPhone Safari, mobile keyboards and installed home-screen behavior need a separate device checklist.

Technical references checked during planning: [WebKit safe-area guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/), [MDN viewport length units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length), and [MDN manifest display](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display).
## Local implementation boundaries

Only `MediSched/` changes. Introduce focused modules for theme, staff data/access, staff rendering and attendance presentation. Keep existing domain/auth/OTP/availability responsibilities and public client configuration. Avoid a framework migration or general unrelated refactor.

Add `staff.html`, shared workspace styling/navigation, and local-server allowed-file entries as needed. Keep mock review files outside the server’s application allowlist. Do not ship synthetic patients, the preview workspace selector or preview-only handlers in product code.

Add migration `006` after the five existing migrations: memberships, attendance, audit, indexes, helpers, RPC grants and transactional event triggers. Do not edit/replay existing migrations on production. Provide separate reviewed staff assignment/revocation SQL and staging setup instructions. No migration or role assignment is applied to hosted Supabase automatically.

Existing signup SMTP, OTP template, Brevo Edge Function sender/secrets, durable notification ledger, booking/cancellation RPC interfaces and availability RPC remain the same. Any required trigger integration must be tested against the existing transactions before handoff.

## Verification and acceptance

Before claiming product completion:

1. Run existing unit, browser and local Postgres checks plus new meaningful tests.
2. Test signed-out/unverified routes and RPCs, ordinary user direct staff access, role spoofing, revoked staff with an existing session, and allowed staff access.
3. Test owner-only appointment/attendance reads and denied cross-user/direct attendance/audit/membership writes. Verify staff projections omit private patient/email fields and underlying tables remain inaccessible.
4. Test stable pagination, filtered totals, malformed inputs and bounded dates/search/limits.
5. Test every transition and boundary with server time, two staff concurrent actions, exact retry UUID replay, mismatched UUID reuse, stale versions and cancellation races. Verify state/audit commit together and reservations remain occupied after attendance changes.
6. Test booking/cancellation events, rollback on conflict, retained cancelled records, duplicate cancellation and no fabricated legacy events/outcomes.
7. Retest cross-owner simultaneous/overlapping booking, lunch/end-of-day restrictions, uncertain booking retry and saved booking when notification fails. No real Brevo send.
8. Test light/dark preference, both routes and auth/modal screens at desktop and 390/360px phone widths; keyboard navigation, focus restoration, Escape, reduced motion and no overflow.
9. Update README/setup/test results with exact commands actually available, migration order and role setup, and separate local/mock/Postgres evidence from untested hosted Supabase/Brevo/Safari behavior.

The static preview checks above are already confirmed. The new staff schema, RPCs, workflow, theme persistence, mobile navigation and application integration are not implemented or tested yet. Production readiness remains blocked until the eventual migration/configuration is applied and verified by an authorized person.

## Handoff gate

Review this written scope and the local preview. Written-spec approval allows an implementation plan to be prepared. The Superpowers workflow then requires review of that plan and selection of execution method before product code changes begin.
