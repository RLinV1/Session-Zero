## 1. Web

- [x] 1.1 Rewrite `ShareButton.tsx` as button + modal (single-column link field + icon Copy, on-demand QR popup modal, Reset link with confirm) (FR-GM-20)
- [x] 1.2 CSS block `share-modal` in `styles.css`; update guide text
- [x] 1.3 Replace `shareQr.test.tsx` with modal flow test (QR absent until "Show QR code", popup, reset uses new link)

## 2. Verification

- [ ] 2.1 Run `npm run lint && npm run typecheck && npm test --workspace=@vtt/web -- shareQr`
- [ ] 2.2 Check in the browser (narrow width, dark mode, Esc, focus return)
