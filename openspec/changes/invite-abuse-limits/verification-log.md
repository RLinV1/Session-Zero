# Verification log

Date: 2026-11-04. Code: branch `fix/invite-abuse-limits`, from `origin/main` at `2153d2a`.

## Environment touched

- Isolated preview servers on ports 3457 (server) and 5457 (web), run from this worktree with the in-memory store. Stopped afterwards. No dev server, dev database, Postgres or Redis was touched.
- `.claude/launch.json` in the main checkout was edited for a few seconds, twice, because the preview tool reads it from there. Each time the file was restored byte for byte once the servers had started, and `git diff` on it is empty.
- A first attempt on ports 3201 and 5373 collided with another chat's servers. The web server that came up pointed at that chat's API. It was stopped straight away, having made only page-load requests including `GET /api/auth/me`.
- Throwaway accounts `qa-<timestamp>@example.test`, only in memory, gone when the servers stopped. Test values, typed only to loopback hosts.
- Temporary socket scripts in the session's scratchpad, stopped afterwards. Nothing added to the repository.

## Browser and socket checks

| # | Step | Result |
|---|---|---|
| 1 | GM opens Share | Lock switch shows, unlocked |
| 2 | GM locks | Switch on, link hint changes to "The room is locked, so this link can't admit anyone new." |
| 3 | Guest joins over HTTP while locked | 409 `room_locked` |
| 4 | Guest joins through the real form while locked | Shows the locked message. `aria-invalid` not set, so the name isn't blamed. The red outline is the focus ring |
| 5 | Wrong code | 404 |
| 6 | GM unlocks, three guests join with sockets | 200 each, `joinsLocked` false in their snapshots |
| 7 | GM ticks Bot A and Bot B, removes them | Both get `sessionEnded: revoked` and disconnect. Real Player stays. Participants drops to 2 |
| 8 | GM ticks Everyone (3), removes them | Dialog closes, Participants drops to 1 |
| 9 | 8 more connections on the GM's seat | GM tab closes with "Open in too many places". Credential kept |
| 10 | GM clicks Reload | Back in the room. The next-oldest connection closes with `too_many_connections` |
| 11 | Guest holds an arrow key, ~33 a second for 25 seconds, with a budget of 600 per 20 seconds | **Failed.** 600 moves in 18 seconds, then about 2 seconds of "too fast" refusals |
| 12 | Budget raised to 800 per 20 seconds, step 11 repeated | 834 presses, 0 refusals, all 834 moves reached the GM (seq 5 to 839) |
| 13 | Guest rolls 1d20 from the Dice tab | Roll shows, seq 840, no refusal |

The key presses in steps 11 and 12 were synthetic `keydown` events at a 30 ms interval, the fastest macOS repeat. Console errors in the guest tab: only the expected 409 from step 4.

## Fixes made because of this

- Step 11 raised the player's 20-second budget from 600 to 800.
- An earlier audit had missed "Move with arrow keys" and set the budget at 60 per 20 seconds. Finding that setting raised it to 600, before this log's steps.

## Automated

`npm run lint`, `npm run typecheck`, `npm run build`, `openspec validate --strict` and `npm test`, run again after merging `origin/main` at `4a27363`, which also changed `commands.ts` and `decide.ts`. All passed: 1,015 shared, 625 server, 1,300 web and 2 benchmark tests. 53 server tests skipped because they need a database or Redis.

The browser and socket checks above ran before that merge and were not repeated. The merged commits change terrain layers and the home header, not the code those checks exercise.

## Not covered

- Postgres: the server's store-backed integration tests skip without a database. The lock is an ordinary event, so no store code changed.
- No load test. Timings are from one local machine.
- A real network. The arrow-key test ran on loopback, where acks return fastest. Higher latency lowers the rate, because the client sends one move at a time.
