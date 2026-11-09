# Verification log

Done on 2026-11-08 from the worktree `claude/ecstatic-cray-753671`. The dev database, production, and the servers on ports 3001, 5173 and 3002 were not used.

## Environment touched, all removed afterwards

| Thing | Detail |
|---|---|
| Throwaway Postgres | Container `vtt-allowance-test-55491`, `postgres:17`, 127.0.0.1:55491. Stopped and removed. |
| Throwaway production stack | Compose project `vtt-allowance-check`, built from this worktree, vision stubbed, web not started, no ports published. Removed with its volumes and images. |
| Browser test servers | Real app on an in-memory store, API on 3492 and web on 5491, `S3_AUTODETECT=0`, uploads in a scratch folder. Stopped. An account whose email started with `full` was created already at the storage limit. |
| Test accounts, in memory only | `normal-allowance-check@example.test`, `full-allowance-check@example.test`, each with a random password that was not kept. On the throwaway stack: `backfill-check@example.com`. |
| `.claude/launch.json` | Temporary configs added, then restored byte for byte. |

## Automated checks (task 5.3)

| Command | Result |
|---|---|
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test`, no `DATABASE_URL` | Shared 1,015, server 683 (53 Postgres-only skipped), web 1,315, bench 2: all passed |
| `npm test --workspace=@vtt/server` with `DATABASE_URL` on the throwaway Postgres, twice on the same database | 761 passed, 4 skipped, both runs |
| `prisma migrate deploy` on an empty throwaway database | All migrations applied; `prisma migrate diff` against the schema found no difference |
| Remove the allowance lock, run the concurrency tests on Postgres, three times | The tests failed every time; lock restored, tests pass. The tests do guard the lock. |
| `openspec validate --strict` | Valid |

A first Postgres run of the backfill test passed, then failed when the same database was reused, because it assumed its owner was the largest. Fixed in the test.

## Backfill on a production-style stack (task 5.1)

Run on the throwaway stack with real Postgres and SeaweedFS, using the command in `docs/DEPLOYMENT.md` with `-p vtt-allowance-check`.

| Step | Result |
|---|---|
| Upload two 70-byte PNGs through the API | 201, `byte_size` 70 |
| Upload a script declared as `image/png` | 415 |
| Clear both sizes, delete one image's disk copy, add a row with no object anywhere | Set up |
| First run | "Recorded 2 size(s). 1 upload(s) had no stored object and stay unsized." The image kept only in SeaweedFS measured 70. The missing one stayed NULL. |
| Second run | "Recorded 0 size(s)". Nothing changed. |
| Report | Accounts over each limit: 0. One line for the largest total, by owner id only. |

## Upload screens show the refusal (task 5.2)

Browser on `http://127.0.0.1:5491`, signed in as the account at its limit. Files were handed to each screen's file input.

| Screen | Request | What the person sees |
|---|---|---|
| Library, Upload map | `POST /api/library` 409 | Limit message above the tabs |
| Library, Upload token art (through the cropper) | `POST /api/library` 409 | Limit message above the tabs |
| Room, Manage, Upload map | `POST /api/library` 409 | Limit message under the Upload map button |
| Room, New Token, image (through the cropper) | `POST /api/uploads` 409 | Limit message in the New Token dialog |
| Library, Dice, a die's picture | `PUT …/faces/d4` 409 | Limit message on the die's card, **after a fix** |

The dice screen replaced the server's message with "Your dice look could not be saved. Try again." `saveDiceLook` now passes a 409's message through (`apps/web/src/ui/diceSkinStore.ts`, test in `apps/web/test/diceLookSaveFailure.test.ts`).

A signed-in GM's room map is saved to the library, so that screen sent `POST /api/library`. The direct room-map request was not exercised in the browser. It uses the same `api.upload` as New Token, the same error display as the screen above, and the route's 409 is covered in `uploadAllowance.test.ts`.

## Browser check of the byte checks (task 5.4)

| Step | Result |
|---|---|
| Real WebP named `renamed-cave.png`, declared `image/png`, uploaded as a map | Accepted, 120×90, URL ends `.webp`, served as `image/webp`, bytes start with a WebP header |
| Script named `evil.png` in the same upload button | The browser's own check stopped it: "Could not read image". No request sent. |
| The same script sent straight to `POST /api/library`, declaring 100×100 | 415 "Use PNG, JPEG or WebP", nothing listed |
| Upload at the limit, on all five screens | See the table above |

## Visibility audit (task 5.5)

`visibility-auditor` read the whole diff, without running anything.

- No path sends `byteSize`, `bytes` or an `objectKey` field to a client. Each response is built field by field.
- The refusal has fixed text with no counts, owner id or names. No new way to learn whether another owner's room or asset exists.
- **Low, not reachable today:** a second GM in someone else's room could use the 409 as a yes/no signal about the owner's storage, and "your" would be the wrong word for them. A room has only one GM seat, so nothing changes now. If co-GMs are added, that refusal needs neutral wording.
- **Minor test gap, left as is:** the "never sends byte sizes" test doesn't cover the UVTT import response, library PATCH, dice rename or face delete. These use the same mappers.

## Left for after release

An owner runs the backfill on production and reads its report. Production data was not examined, so the 1,000-item and 2 GB values are still unconfirmed against real accounts.
