## 1. Typography

- [x] 1.1 Move `--font-ui` from the `.home-page` block to `:root` in `apps/web/src/styles.css`; verify the home page's computed font is still Geist Sans
- [x] 1.2 Add `.gm-dashboard` rules: `font-family: var(--font-ui)` and home-style headings (no small caps, tight tracking); verify in the browser that the dashboard's heading, labels, fields and button compute to Geist Sans and that a room's section headings are still Alegreya Sans SC
- [x] 1.3 Run `npm run lint && npm run typecheck && npm test` and confirm all pass
