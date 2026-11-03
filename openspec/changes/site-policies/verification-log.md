# Verification log: site-policies

What was touched, run and seen while applying this change, and what was fixed because of it.

## Environment

- **Servers.** `server-isolated-2` on :3201 (in-memory store) and `web-isolated-2` on :5373, from `.claude/launch.json`. Another session held :3001, :5173, :3101 and :5273; none of them were touched.
- **Accounts.** None created. Nothing was submitted; the in-memory store discards everything when the server stops.
- **Browser.** The desktop app's browser pane, 800 px wide (light) and the 375 × 812 mobile preset (dark).

## 1.1 Facts behind each statement

- **Account fields and password.** Sign-up takes display name, email and password; passwords are argon2id (`identity/passwords.ts`, DESIGN.md §5).
- **Cookie.** One session cookie, `HttpOnly; SameSite=Lax`, `Secure` when configured, ending after 30 days idle or 90 at most (`identity/sessions.ts`). In the browser, `document.cookie` on `/privacy` read `""`.
- **IP.** Used only as a rate-limit key in `RateLimiter`, an in-memory `Map`; the longest window is 60 minutes (`signUpPerIp`). The page says "an hour at most".
- **Outside hosts.** Grep of `apps/web/src`, `index.html` and `apps/server/src` for CDNs, analytics and Google Fonts found nothing; fonts are `@fontsource` packages. In the browser, every resource loaded by `/privacy` came from `localhost:5373`.
- **Deletion.** `DELETE /api/rooms/:roomId` removes the log and room uploads (ADR 0009); library items, creatures, encounters and animations each have a delete route. There is no account-deletion route, so the page names the team (README §10), as the user chose over an email address.
- **GM removes a player.** `participant.revoke`, refused only for the GM.
- **Licences.** Every `CREDITS.md` under `public/`: the images are generated for the project; the sounds are CC0 (BigSoundBank, StarNinjas on OpenGameArt). The first draft said only "art made for this project"; it now names the CC0 sounds too.

## 2.1–2.2 Unit tests

- `test/sitePolicies.test.tsx`: routes and layer, the privacy headings and deletion line, the terms' uploads section and privacy link, the home footer's links, the sign-up line with no checkbox. 6 of 6 pass.

## 2.3 In the browser

- **`/privacy`, light, 800 px.** Card 672 px wide, headings in the text colour, no horizontal overflow, no console errors.
- **`/terms`, dark, 375 px.** Entry layer, dark theme, no horizontal overflow; the policy links sit under a rule at the end of the card.
- **`/signup`, dark, 375 px.** The agreement line sits under the password field, above Create account, with both links underlined.
- **Home footer.** "Built for CSE 416 at Stony Brook." then Privacy and Terms.
- **Found and fixed.** Following Privacy from the footer opened `/privacy` scrolled to 1600 px, its own footer: `navigate()` kept the scroll position. It now scrolls to the top when the path changes (`router.ts`), not for a query-only change or back and forward. Following Terms afterwards opened at `scrollY` 0. Covered by a sixth test.

## 2.5 Second pass: matching the design language

Same isolated servers (`server-isolated-2` :3201, `web-isolated-2` :5373), restarted for this pass. No accounts made, nothing submitted.

- **Audit (before).** Read `docs/INTERFACE.md` §11.5–11.9 and the product-design-language design. Two mismatches:
  - The policy pages stretched the entry card (meant for one decision) into a 1,500 px document. §11.9 keeps cards for elevation and groups by hairline and space.
  - The footer's Privacy and Terms were in `--text` at weight 400 beside a muted credit, louder than the line they sit on, unlike the header's quiet Sign in.
- **Copy audit.** "built by Antonio Cottone, Raymond Lin, Christos Psimadas or Vincent Chen" used the list meant for "ask any of us". Authors now take "and", the deletion line "or". The copy switched to straight apostrophes, as the rest of the app's copy is written. No em dashes.
- **After, 1366 × 900, dark.** `/privacy`: shared header with Privacy marked (raised, rust underline) and Terms, Sign in, Create account and the theme toggle; one left column; "What we keep" as a two-column list; hairline sections; footer with the credit at left and the links at right, Privacy in the text colour. `data-layer` is `hub`, no sideways scroll, no console errors.
- **Tweaks after looking.** The last-updated date was first set in Geist Mono, which spaced out oddly mid-sentence; it is now in the body face. The list's label column widened to 12.5rem so "What happens in a room" fits on one line.
- **Light, 1366 × 900.** `/privacy` and the home footer follow the light tokens; footer links are `--muted` (`#5b6270`, 5.27:1). The home footer lines up with the closing band's edges.
- **Phone, 375 × 812, dark.** `/terms`: the header's navigation and the account pair take their own rows, as on the hub; no sideways scroll; the footer's links wrap under the credit.
- **Keyboard.** A Tab press onto the footer's Privacy link showed the global 2px rust focus ring at a 2px offset, with the control radius.
- **Found and fixed.** Lint failed on a comment placed between two `case` labels in `theme.ts` (`no-fallthrough`); the comment moved above the group.

## 3.1 Credits

- A walk of every folder under `apps/web/public` holding media found one with no `CREDITS.md` at or above it: `public/img/` (the four built-in maps). `public/img/CREDITS.md` now covers them. `apps/server/uploads/` also has none, but it is git-ignored local upload data. `public/brand-mark.svg` is the project's own mark.
- `assets/default-maps/`, which the top-down-default-maps proposal names as the generated maps' sources, is not in the repository, so the tool and prompts are left for task 3.2.

## Cleanup

- Stopped `server-isolated-2` and `web-isolated-2`; the viewport emulation was reset to desktop.
