# Tasks

## 1. Facts

- [x] 1.1 Check each statement against the code before writing it: account fields and argon2id (`identity/passwords.ts`, `shared/auth.ts`), the cookie's flags and lifetimes (`identity/sessions.ts`: HttpOnly, 30 days idle, 90 at most), IP use (`identity/rateLimit.ts` in memory, windows of at most 60 minutes), browser storage keys (`vtt.*`), no outside hosts (grep for CDNs, analytics, Google Fonts: fonts are `@fontsource`), room and library deletion routes, GM removal (`participant.revoke`), the licences in every `CREDITS.md`.

## 2. Pages and links

- [x] 2.1 Add `pages/PolicyPages.tsx` with `PrivacyPage` and `TermsPage` on `EntryPage`, the `privacy` and `terms` routes, and the entry layer for both. Verify with `test/sitePolicies.test.tsx`.
- [x] 2.2 Link both from the home footer and add the agreement line to the sign-up form, without a checkbox. Verify with `test/sitePolicies.test.tsx`.
- [x] 2.3 Style the card to a reading measure. Verify in a browser at desktop and 375 wide, light and dark (verification-log.md).
- [x] 2.4 Open a new path at its top in `navigate()`, found in 2.3. Verify with `test/sitePolicies.test.tsx` and in the browser (`scrollY` 0 after following the footer's Terms link).

- [x] 2.5 Second pass against the design language: replace the entry card with a reading page (shared header with the policies as navigation, 65-character column, hairline sections, hub ground), and move the footer into `ui/SiteFooter.tsx` for the home and policy pages. Verify with `test/sitePolicies.test.tsx` and in the browser at 1366 and 375 wide, light and dark, with keyboard focus.

## 3. Credits

- [x] 3.1 Add `public/img/CREDITS.md` for the four built-in maps. Verify every folder under `apps/web/public` that holds media has a `CREDITS.md` at or above it.
- [ ] 3.2 Whoever made The Broken Span, Hollowfrost Keep and Temple of the Green Sun (`038b6d54`) adds the image tool and prompts to it.

## 4. Done

- [x] 4.1 `npm run lint && npm run typecheck && npm test` pass.
