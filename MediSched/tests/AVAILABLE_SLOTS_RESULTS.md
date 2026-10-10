# Available slots — 2026-10-09

| Local check | Confirmed result |
| --- | --- |
| `npm.cmd test` | 25 unit tests passed, including malformed/wrong-day/off-grid/duplicate availability, exact-time expiration and Manila one-hour labels |
| `npm.cmd run test:database` | 22 real PostgreSQL 18 tests passed on the dedicated loopback fixture (port 55432), including migration 005 |
| `npm.cmd run test:browser` | 27 mocked Chromium scenarios passed, retaining the existing Auth/OTP/email/UI checks |
| `npm.cmd run test:supabase` | One explicitly skipped: no configured disposable local Supabase stack |
| `node --check` | Application script, availability module, browser harness and guarded Supabase test passed |

The SQL checks confirm verified-only availability execution, rejected anonymous/unverified/service-role calls, read-only clinic windows, empty search path and timestamp-only results. They exercise every weekday, 8 AM opening, 11 AM last morning start, noon–1 PM lunch, 4 PM last start and rejected bypasses (including 11:15 lunch overlap and 16:15 closing overlap). Other owners' reservations block all overlapping quarter-hour starts while owner RLS still hides their appointments. Exact adjacent intervals remain available. Past dates return no starts; today's starts are future-only. Unknown/inactive doctors and invalid dates are rejected.

Both synthetic users can observe an available snapshot; concurrent booking still produces exactly one success using the unchanged exclusion constraint. Cancellation retains the row and restores all affected starts. A preexisting out-of-hours record remains retryable and cancellable without allowing new out-of-hours bookings. The original midnight constraint test uses a preexisting synthetic record, inserted with **only the clinic-hours trigger temporarily bypassed inside the isolated fixture transaction**; no production trigger is disabled. Original tests temporarily use broad synthetic clinic windows, then the new tests restore and verify the approved daily schedule.

Browser checks confirm disabled controls while loading, full visit labels, lunch/closing exclusions, doctor/date selection invalidation, stale-response suppression, empty/missing-migration feedback, refresh recovery and patient-field retention. A definitive conflict refreshes times and uses a new request only after rejection. A mocked committed booking whose response was lost locks the payload, preserves it across close/reopen and retries the identical request without duplicating the record. Email failure continues to leave a booking saved. Desktop 1440×900 and phone 390×600/320×480 layouts were checked, including modal scrolling, 44px refresh target and no horizontal overflow. Captures: `evidence/available-slots-phone.png` and `evidence/available-slots-desktop.png`.

PostgreSQL Auth rows/helpers are synthetic; Chromium mocks Supabase APIs. These checks do **not** establish real GoTrue/JWT/PostgREST integration, hosted migration success, Edge runtime compatibility, real Brevo/inbox delivery or iPhone Safari behavior. No hosted project was accessed or changed, no deployment occurred and no real email was sent. Only MediSched local application/docs/tests were edited.
