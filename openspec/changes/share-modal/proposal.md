## Why

Share was a split button (copy on click, caret menu with QR toggle and Reset link). The options were hidden and the link was never shown. A Google-Docs-style share dialog is clearer (FR-GM-20).

## What Changes

- Share is one button opening a single-column "Share this room" modal: a labelled, full-width read-only invite link with an icon Copy button (Check for 1.5s after copying), "Anyone with this link can join as a player."
- The QR code is generated on demand: a "Show QR code" button opens a small "QR code" popup (second modal on top) with the QR on a white quiet-zone panel, "Scan to join as a player.", and Close. Focus returns to the button. No QR is rendered in the share modal.
- A "Reset link" section (danger-tinted, below a divider; "Replaces the link and QR code. The old ones stop working.") reuses the existing confirm step; after reset the modal shows the new link and flashes "Link reset"; any QR shown afterwards encodes the new link.
- The invite is fetched on each open (loading state, Retry on error), so a reset in another tab shows up.
- Not included: email sharing (the server has no email sender; add `mailto:` or a provider later).
- `InviteQr` toggle and the caret menu are removed.
