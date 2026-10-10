# Local QR dependencies

- `qrcode-2.0.4.mjs`: unmodified `qrcode-generator@2.0.4/dist/qrcode.mjs`, Kazuhiko Arase, MIT. Original copyright/license notice is retained in the source.
- `jsQR-1.4.0.js`: unmodified `jsqr@1.4.0/dist/jsQR.js`, Apache-2.0; full license in `jsQR-LICENSE.txt`.

Downloaded from version-pinned unpkg package artifacts. No remote QR image service or runtime dependency fetch is used for appointment passes. Scanner decoder loads only when a camera scan starts and native QR detection is unavailable.
