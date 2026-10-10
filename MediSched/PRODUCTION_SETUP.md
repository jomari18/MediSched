# Production handoff — 11 October 2026

Site: https://mymedisched.netlify.app

Production backend: original MediSched (`uoqosdefnaycqfqogirj`). Local `config.js` remains MediSched-Staging. `npm.cmd run build:production` substitutes only the generated `dist/config.js`, using the enabled production publishable key. Ordinary `npm.cmd run build` uses the local staging config.

## Completed

- Read-only inspection confirmed existing booking/staff functions, pgcrypto/btree_gist, active confirmed staff membership, enabled/approved booking configuration and daily 8–12 / 13–17 clinic windows.
- Applied missing QR migration 007 and analytics migration 008, then restored the reviewed early-consultation function in the original MediSched through Supabase migration tooling. The four existing appointments remain present. No appointments were created, cancelled or checked in during this preparation.
- Verified issue/preview/consume/analytics functions exist; authenticated clients cannot read raw pass storage; checked-in and in-consultation states advertise early start and completion respectively.
- Production ZIP built from the explicit 84-file public allowlist. 50 unit tests passed. Playwright CLI verified desktop/mobile generated landing (1440 / 390), correct production backend and zero console errors/warnings.

## Remaining Dashboard steps

In **original MediSched**, not MediSched-Staging:

1. Authentication → URL Configuration → Site URL: `https://mymedisched.netlify.app/index.html`.
2. Add Redirect URLs `https://mymedisched.netlify.app/` and `https://mymedisched.netlify.app/index.html`. Preserve needed local URLs. Review Email provider code length: app expects 8 digits. Preserve Confirm email and existing SMTP.
3. Edge Functions → Secrets → `MEDISCHED_ALLOWED_ORIGINS`: append `https://mymedisched.netlify.app`, preserving existing origins, comma-separated. OPTIONS preflight from this origin currently returns 403 with no allow-origin header. Do not put Brevo/service credentials in Netlify frontend settings.
4. Extract `MediSched-Production-Netlify.zip` and upload the folder containing index.html to **the existing site's Deploys page**. Do not create a second Netlify site. Refresh config.js on the hosted URL and verify it targets `uoqosdefnaycqfqogirj`.

Netlify upload and hosted Auth/secret settings were not performed by the agent: there is no authenticated Netlify deployment or Auth-settings/secret-management tool available in this session.

## Final live verification

Sign in using original-project accounts (staging users do not carry over). Verify patient/staff routing, availability, history and analytics first. Then create one clearly identified authorized test booking and verify OTP/email, QR check-in and consultation completion on the deployed original backend. No real booking/email was sent automatically. Physical phone camera scanning was reported working by the owner on the earlier staging-backed Netlify deployment; production smoke testing is still pending.

