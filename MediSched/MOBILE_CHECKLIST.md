# Mobile device checklist

The interface is an online web app. Chromium tests resize/touch-emulate layouts; they do not reproduce a real software keyboard, Safari, notch or home indicator.

Use an authorized test deployment on HTTPS for physical checks. The bundled local server binds loopback only: `127.0.0.1` on a phone means that phone, not your computer. No hosting or LAN exposure was performed here.

- Android Chrome: open the site; use the browser menu's Add to Home screen / Install option when available. Launch from the icon. Browser/install wording and availability vary.
- iPhone Safari: open the site, tap Share, then Add to Home Screen. Launch from the icon. Check the local plus icon and standalone layout. Metadata does not sign you in or grant staff access.
- Both: test light/dark portrait and landscape, long text, zoom, safe-area edges and bottom-nav clearance. Reach Home, Appointments, Activity (staff), More, theme, workspace switch and Sign out.
- Open booking/details/confirmation/More on a short visible screen. With the keyboard open, scroll to every field, submit and close; close the keyboard and ensure navigation returns. Check focus restoration/Escape with a hardware keyboard where available.
- Paste an eight-digit code with leading zeros; check resend cooldown after reload. Passwords start hidden and visibility resets when forms switch.
- Verify sign-out and expired sessions remove protected content; normal patients cannot enter staff. Revoke staff in authorized staging and refresh an existing staff session.
- Disconnect the network: show errors without fabricated success; booking and attendance uncertain-response retries keep their operation IDs. There is no offline booking or personal-data cache.

Physical Android Chrome, iPhone Safari, keyboard, installation, native insets and standalone session behavior remain untested. No local WebKit runtime was found; none was downloaded.
