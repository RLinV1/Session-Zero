## Why

Players in the same room as the GM can join faster by scanning than by typing or pasting a link (FR-GM-20).

## What Changes

- The Share options menu gets a "Show QR code" toggle that renders the same invite link Copy uses.
- The QR is drawn client-side (`qrcode.react`, SVG); the link is never sent to a third-party service.

## Impact

- `apps/web/src/ui/ShareButton.tsx`, `apps/web/test/shareQr.test.tsx`, `apps/web/package.json` (adds `qrcode.react`).
