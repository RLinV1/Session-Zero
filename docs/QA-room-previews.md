# QA: board previews on the dashboard's hosted rooms (gm-dashboard), 2026-11-02

Verification log for leading each Hosting card on `/gm-dashboard` with a picture of the room's
board (map, fog, tokens; hidden tokens dimmed), fetched from the new owner-only
`GET /api/me/rooms/:roomId/preview`.

## Environment touched

- This session's own dev servers from `.claude/launch.json`: `server-isolated` (port 3101,
  in-memory store, seeded dev account) and `web-isolated` (port 5273). The user's own
  `npm run dev` servers (5173, 3001) and the `vtt` dev database were not touched.
- Signed in as the seeded dev account (`DEV_ACCOUNT` in `apps/server/src/identity/devAccount.ts`)
  on localhost only, in the desktop app's browser pane.
- Four rooms created on that in-memory server by a scratch socket.io script (not in the repo):
  "Sunken Crypt", "Hollowfrost Keep", "Temple of the Green Sun — session 4" (each a shipped map,
  four party tokens, a size-2 ogre; Crypt and Temple also a fog rectangle and a hidden token) and
  "Blank prep room" (no map).
- The test tab's theme was switched to dark with the page's own toggle (localStorage on
  localhost:5273 only).

## Steps and results

| Step | Result |
| --- | --- |
| New integration tests, `membership.test.ts` "a hosted room's board preview" | Owner gets map, both tokens (hidden flagged), one fog region, and no token names; a player in the room and a missing room get 404, signed out gets 401 |
| `/gm-dashboard` at 1440 × 900, light theme | Create a room on the left, Hosting on the right, three cards per row; each mapped room shows its map with tokens and fog; the map-less room shows a grid with "No map yet" |
| Same, dark theme | Cards, picture frame and empty grid read on the dark panel |
| Click the Hollowfrost Keep picture | Opens `/r/73245154-…`; the board matches the picture (party in a row on the left, ogre above) |
| `/gm-dashboard` at 375 × 812 | One column; the create form is not sticky; no horizontal scroll (scrollWidth 375) |
| Console errors on the dashboard | None |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass: shared 841, server 525 (48 skipped), web 1138, latency benchmark 2 |

## Cleanup

- `server-isolated` and `web-isolated` were left running for a look in the browser pane. Stopping
  `server-isolated` discards the four sample rooms (in-memory store).
