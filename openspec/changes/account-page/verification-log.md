# Verification log: account-page

Run on 2026-11-04 against branch `feat/account-page`, cut from `origin/main` at `2153d2a`.

## Environment

- **Code under test:** the worktree `.claude/worktrees/account-page`. It has no `.env`, so its server used the in-memory store.
- **Servers:** API on :3201 and web on :5373, confirmed by each process's working directory. Both are stopped.
- **Browser:** the app's built-in browser, at `http://127.0.0.1:5373` for the results below. Tabs are closed.
- **Accounts:** the project's seeded dev account (README), and one throwaway account, `verify-account-page@example.test`, which step 8 deleted. Both lived only in that server's memory.

## Steps and results

| # | Step | Result |
|---|---|---|
| 1 | Home header, signed out | "Sign in" links to `/account`, "Create account" to `/account/new` |
| 2 | Open `/account` signed out | Sign-in form under the site header, on the hub layer, with Privacy and Terms in the footer |
| 3 | Sign in with a wrong password | "Email or password is incorrect." in place; email kept; password cleared; still on `/account` |
| 4 | Sign in with the right password | Stays on `/account`, showing "Your account"; `/api/auth/me` agrees; survives a full reload |
| 5 | Home header, signed in | Account menu and "Your rooms"; the menu's "Your account" opens `/account` |
| 6 | "Sign out" on the page | Lands on `/`, signed out, with the signed-out header links |
| 7 | Create an account at `/account/new` | Ends on `/account`, signed in as the new account; `/account/new` no longer in the address |
| 8 | "Delete account" on the page | Dialog opens with its button disabled; after typing the email and password, deletion lands on `/`, signed out; signing in to the deleted account answers 401 |
| 9 | Open `/gm-dashboard` signed out | Redirects to `/signin?next=%2Fgm-dashboard`; its create link keeps `next`; signing in returns to `/gm-dashboard` |
| 10 | 375 × 812, signed in | No horizontal overflow (scroll width 375); each button wraps beneath its text |
| 11 | Light theme, signed in | Reads correctly (theme set by script for the screenshot, not through the toggle) |
| 12 | Console errors | Only 401s from sign-ins refused on purpose |

Also run: `npm run lint`, `npm run typecheck`, `npm test`, and `openspec validate account-page --strict`.

## Fixes made because of this

- **Delete button was not danger-coloured.** `button.secondary` comes later in `styles.css` than `button.danger` and overrides its colour. Fixed for this row only. The room card's Delete on the dashboard uses the same two classes, so it probably has the same problem; not checked and not changed here.
- **Light-mode contrast.** `--danger` on the light ground measured 2.87:1. The row uses `--danger-strong` in the light theme, about 4.6:1 by calculation, not measured in the browser.

- **Account button did not match the header.** Reported by the user from a screenshot. `.site-header .account-menu > button` only set the size, so the fill, border and weight still came from `button.secondary`. It now belongs to the shared control family in `styles.css`, which also takes its horizontal padding from 0.7rem to 0.85rem.

### Checks for the account button

Run on `http://127.0.0.1:5473` (API :3401), both from this worktree (confirmed by each process's working directory), signed in as the seeded dev account in memory. "Same" means the computed fill, border, text colour and weight are equal on the account button and "Your rooms".

| Check | Result |
|---|---|
| Home, light theme, at rest | Same: fill `rgb(251, 252, 253)`, border `rgb(122, 131, 148)`, weight 600; both 33.6px tall |
| Home, dark theme (real toggle), at rest | Same: fill `rgb(24, 27, 32)`, border `rgb(100, 106, 120)`, weight 600; both 33.6px tall; the theme toggle has the same fill and border |
| Hover, dark theme | Same: fill `rgba(227, 230, 234, 0.06)`, border `rgb(179, 85, 45)`. Read with transitions turned off on the test page, because a first reading with them on caught "Your rooms" mid-transition |
| `/gm-dashboard`, dark theme | Same fill and border as Library and the toggle. Library keeps its quieter text colour and weight, as `.nav-link` intends |
| 375 × 812, touch | Same colours, both 44px tall on one row, no horizontal overflow |
| Items inside the open menu | Unchanged: transparent, weight 500 |
| Console errors | None |

Re-run after this fix: `npm run lint` and `npm run typecheck` exit 0; `npm test` exits 0 (998, 601 with 53 skipped, 1298 and 2 tests). Those tests don't apply the stylesheet, so they guard against breakage, not the colour.

**Not covered:** the reduced-motion rule was changed but not exercised.

### After merging `origin/main` at `cf3262e`

The merge was clean. It brought in PR #162, which puts the name to the right of "Your rooms", as in the user's screenshot.

- `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` and `openspec validate account-page --strict` all exit 0 (1015, 625 with 53 skipped, 1313 and 2 tests).
- In the browser, from the merged code on the same ports: signing in at `/account` stays on `/account`; the home header reads "Your rooms", the name, then the theme toggle; in dark theme all three have fill `rgb(24, 27, 32)` and border `rgb(100, 106, 120)`, 33.6px tall, and the two text buttons have the same text colour and weight. No console errors.
- The hover, light-theme and phone checks above were not repeated on the merged code. The merge changed none of the header control rules.

## Things that went wrong

- **The dev server was restarted twice.** To start the work I ran `git switch -c feat/account-page origin/main` in the main checkout, in the same command as the check for running servers. The user's dev servers run from that checkout, so `tsx watch` restarted the API on :3001, and restarted it again when the checkout was put back on `main`. It was on Postgres and Redis, so no stored data was lost. Live sockets and in-memory rate-limit counters were reset. The work then moved to this worktree.
- **First browser pass tested the wrong code.** `preview_start` runs from the main checkout whatever the session's directory, so the first attempt served old `main`. That pass was thrown away. `.claude/launch.json` in the main checkout temporarily held two entries with `npm --prefix <worktree>`, removed straight after the servers started, and the file is clean there now.
- **A port clash with another session.** Port :3101 belonged to another chat's server, so the :5273 web server started against it was stopped before it was used. That session later wanted :3201 and :5373 too; they were freed when testing finished.
- **Being signed out on `localhost`.** The session cookie is scoped to the host, not the port, and the browser profile is shared between sessions. A sign-in on `localhost:5373` was gone after a reload, with no server restart and no sign-out request in its log. The likely cause is another server on `localhost` clearing a token it did not recognise. The same sign-in on `127.0.0.1` survived reloads, so the page is not at fault. Signing in on `localhost` here may also have replaced a dev session held in that shared profile.

## Cleanup

Nothing left to clean up in the servers or browser. The worktree and branch remain until this change lands.
