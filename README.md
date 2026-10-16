# MediSched

**Clinic Appointment Scheduling System**

MediSched lets patients book, track, and cancel clinic appointments online, and gives clinic staff a daily schedule with QR check-in, consultation progress, and analytics. Appointments last one hour, start at 15-minute intervals, and follow clinic hours: every day, 8 AM–5 PM, with lunch from 12 PM–1 PM, in Philippine time.

## Live Demo

**[Open MediSched](https://mymedisched.netlify.app/)**

## Highlights

- Patient registration with email verification and OTP resend
- Live available slots, booking, appointment history, and cancellation
- Double bookings prevented by a PostgreSQL exclusion constraint and idempotent request IDs
- Booking confirmation emails sent from a Supabase Edge Function through Brevo
- Expiring QR check-in passes with staff camera or manual check-in
- Private staff workspace with daily schedule, consultation progress, activity log, and clinic analytics
- Responsive phone layouts with bottom navigation, light/dark themes, and medical illustrations

## System design

These diagrams were drawn from the app's actual database schema, roles and code paths.

**Context diagram.** MediSched as a single process, and the people and outside services it exchanges data with.

![MediSched context diagram](docs/diagrams/context-diagram.png)

**Data flow diagram (Level 1).** The main processes, the data stores they read and write (grouped from the database tables), and the data that moves between them.

![MediSched data flow diagram](docs/diagrams/data-flow-diagram.png)

**Flowchart: booking and QR check-in.** The main workflow step by step, including decisions and error paths.

![MediSched flowchart](docs/diagrams/flowchart.png)

## Tech Stack

- HTML5, CSS3, JavaScript
- Supabase Auth, PostgreSQL (with `btree_gist`), Row Level Security, and RPC functions
- Supabase Edge Functions
- Brevo SMTP for sign-up codes and Brevo API for appointment emails
- Netlify

## Security Design

Patient records are owner-only through Row Level Security. Staff access comes from a private staff-membership table checked in the database, not from editable user metadata. Booking, cancellation, check-in, and attendance changes run through transactional RPC functions, and QR check-in passes are opaque, single-use, and expire.

> Only the Supabase project URL and publishable key are in `config.js`. The Brevo API key and other server credentials are stored as Supabase Edge Function secrets and must never be committed to this repository.

## Database

SQL migrations are in [`MediSched/supabase/migrations/`](MediSched/supabase/migrations/) and apply in filename order to a fresh project. Do not replay migrations against an already-configured production database. Setup guides: [production setup](MediSched/PRODUCTION_SETUP.md), [email](MediSched/EMAIL_SETUP.md), [available slots](MediSched/AVAILABLE_SLOTS.md), [staff access](MediSched/STAFF_SETUP.md), and [QR check-in and analytics](MediSched/docs/qr-analytics-setup.md).

## Local Use

```sh
cd MediSched
npm ci
npm run serve
```

Open http://127.0.0.1:5173. Local configuration targets a separate staging backend. `npm run build:production` creates `MediSched/dist` with the production configuration; Netlify builds this automatically from the `MediSched` base directory. More detail is in the [project README](MediSched/README.md).

## Testing

`npm test` (from `MediSched`) runs 59 unit tests. 51 database integration tests run against an isolated local PostgreSQL fixture, and browser audits use the Playwright CLI. Results and screenshots are in the [audit report](MediSched/AUDIT.md).

## Author

**Jomari M. Candido**
Sole Software Developer

## Project Status

Portfolio release — live on Netlify and deployed from this repository.
