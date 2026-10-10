# Netlify deployment and phone QR test

The prepared build uses MediSched-Staging, matching the tested local app. Production backend selection is a separate explicit configuration decision.

## Manual deployment

1. Run `npm.cmd run build` from MediSched, or use the prepared `dist` folder.
2. Sign in to Netlify and open https://app.netlify.com/drop. Drop **MediSched/dist**, not the project/source folder. Netlify manual uploads publish the already-built files; they do not run the build script.
3. Copy the resulting HTTPS `.netlify.app` address. Keep the same site when uploading later builds.
4. In MediSched-Staging → Edge Functions → Secrets, append the exact HTTPS site origin (without a trailing slash) to `MEDISCHED_ALLOWED_ORIGINS`, preserving local origins. This is required for appointment-confirmation emails from the deployed site. No secret value belongs in the frontend.
5. Review Staging Authentication → URL Configuration for confirmation-link redirects. Add the deployed `https://YOUR-SITE.netlify.app/index.html` URL if using links. Email OTP entry itself does not require a redirect. Keep existing URLs needed by local testing.

## Git-connected alternative

For this PORTFOLIO repository, select **Base directory: MediSched**, **Build command: npm run build**, **Publish directory: dist**. `MediSched/netlify.toml` supplies the build settings. Do not publish the repository root.

## Phone camera verification

1. Open the HTTPS site directly in Safari on iPhone or Chrome on Android.
2. On another screen, sign in as the patient and generate a fresh pass for an eligible appointment today. Passes expire in ten minutes; a reissued pass invalidates the old one.
3. On the phone, sign in with the staging staff account → Scan check-in QR → Start camera → Allow camera permission.
4. Scan the QR on the other screen. Confirm the reviewed patient/doctor/date are correct. Scanning alone must not change attendance.
5. Tap Confirm check-in once. Verify Checked in on the refreshed schedule and that the camera indicator stops after detection/closing.
6. If permission is denied, use the manual reception-reference fallback. Restore camera permission in the browser/site settings before retrying.

Hosted deployment and physical camera scanning remain pending until these steps are completed. The build includes only explicitly allowlisted application files and assets; it excludes SQL, tests, local databases, logs and source documentation.
