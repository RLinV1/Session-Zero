# QA: painted condition icons (FR-TAC-08), 2026-11-01

Verification log for replacing the shape-and-abbreviation condition markers with painted icons
(`apps/web/public/img/conditions`, see CREDITS.md there).

## Environment touched

- ChatGPT, in the desktop app's browser pane, signed in as the user: one chat ("Create Status
  Icons") with three generated sheets. Nothing else in the account was changed.
- This session's own web dev server, `web-isolated` from `.claude/launch.json`, which came up on
  port 5274 because 5273 was taken. It proxies to the `server-isolated` API on 3101, which was
  already running from another session (seeded dev account). The user's own `npm run dev` servers
  (5173, 3001) and the `vtt` dev database were not touched.
- Signed in as the seeded dev account (`DEV_ACCOUNT` in `apps/server/src/identity/devAccount.ts`)
  on localhost only.

## Steps and results

| Step | Result |
| --- | --- |
| Generated sheet 1 (flat inked cartoon) | Consistent set; turned down by the user for "cool realistic" |
| Generated sheet 2 (realistic) | Cut out and wired in; then replaced by sheet 3 |
| Sheet 3 ("make them simple and stylish", asked by the user in the chat) | 12 separate opaque regions, one per grid cell; cut to 192 × 192 WebP with alpha |
| Contact sheet on #20232a at 96 px and 48 px (24 CSS px at 2×) | All 12 read at both sizes; `prone` is the thinnest |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | 129 files, 1136 tests pass (plus the benchmark's 2) |
| Home page, Conditions tile (in the uncommitted home page work, so its copy change isn't on this branch) | Markers load `/img/conditions/*.webp` at 192 px; copy now reads "its own picture" |
| Room "Condition icons check", token Brenna with Frightened, Poisoned, Concentrating | Edit dialog's picker shows the icons at 24 px; roster row shows them; board draws them on a dark disc under the name label |
| Console errors in the room | None |

## Fixes made because of it

- A sheet's grid cells don't hold each picture whole (the flask's vapour and the lying figure
  cross the lines), so icons are cut by connected region, not by cell.

## Cleanup

- Room "Condition icons check" (`/r/1020d074-835a-4ace-8223-4535b4113aad`) on the isolated
  server's database: delete from the dev account's GM dashboard when done.
- Stop this session's `web-isolated` server on 5274.
- The ChatGPT chat "Create Status Icons" stays in the user's history.
