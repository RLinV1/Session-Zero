# QA: guest GM hosting (guest-gm-hosting), 2026-11-13

Verification log for starting and running a room without an account, the interactive demo, and
saving guest rooms into an account. Playwright MCP in Chrome, on the dev server (in-memory store),
after merging `main` at eb2a7683.

| Where | Checked | Result |
|---|---|---|
| `/` → Start a room | Signed-out visitor lands on `/signin?next=/gm-dashboard`; sign-in and sign-up both offer "Continue as guest GM" | Pass |
| `/start` | Six shipped maps, room name, your name; kept-in-this-browser and 30-day note; Start the room opens the table on the chosen map | Pass |
| Guest room, first open | Asks "Try the interactive demo?" with Yes / No, focus on the question | Pass |
| Demo steps | Your table → Invite players (on copying the link) → Place a token (skipped when one is already placed) → Move it (on dragging) → Hide part of the map (on drawing fog) → Roll dice (on Roll) → You are all set (Save to a free account, Finish) | Pass |
| Demo focus | A step reached by acting on the board leaves focus where it was; Escape to end placing does not skip the demo | Pass (fixed during this pass) |
| Demo resume and restart | Reload resumes at the same step; More → Interactive demo starts again at step 1 | Pass |
| Built-in art | Saved Creatures lists only the built-in creatures; placing a Goblin Guard is accepted | Pass |
| Forged requests | `POST /api/uploads` and UVTT import into a guest room → 403 `guest_upload`; `GET /api/rooms/:id/guest` → `{guest:true, idleDays:30}` | Pass |
| Player | Kim joins by the invite link in a separate browser context, connects, and sees no demo, no guest notice and no Save | Pass |
| Save, signed out | More → Save to a free account → sign up → dashboard shows "Moved into your account: 2 rooms." with no further click; `vtt.gm` cleared; the room reports `guest:false` | Pass |
| Save, signed in | Save in the room goes straight to the dashboard (no sign-up form) and moves the room | Pass |
| Plain sign-up | Signing up without choosing Save shows the move offer and moves nothing | Pass |

Covered by tests rather than this pass: the forged map command (`guest_asset`), creation limits per
address and per browser, the pre-account token (409 `legacy_identity`), the idle sweep and its races
with saving and starting a room (`apps/server/test/guestRooms.test.ts`).
