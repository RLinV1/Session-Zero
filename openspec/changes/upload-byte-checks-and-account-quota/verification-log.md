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

## A real game, end to end: Lanternfall (2026-11-09)

The user asked for Lanternfall (`games/lanternfall`) to be set up under their account as a check of this change. It ran on a separate copy of this branch, because the server on port 3001 runs the main checkout and doesn't have the change.

**Environment:** this branch at `3156698`, API on `127.0.0.1:3491`, web on `127.0.0.1:5491`, a throwaway Postgres (`lanternfall-check-pg`, port 55491), uploads in the session scratchpad. **Account:** the address the user named, registered on this copy only, with a generated test password kept in the scratchpad. Ports 3001 and 5173, the dev database and production were not touched. `scripts/lanternfall/` ran unmodified.

| Step | Result |
|---|---|
| `setup-library.mjs` | 4 maps, 22 tokens, 17 creatures, 4 encounter templates. Doors and windows as the game's own log records: 2 doors; none; 14 doors (1 locked) and 4 windows; 1 locked door. Templates hold 11, 13, 9 and 11 tokens, with 0, 1, 7 and 0 fog regions |
| Recorded sizes against the source files | All 26 uploads match in bytes, width and height, including art carried inside `.dd2vtt`. 26 files on disk, 2,341,832 bytes, equal to the recorded total. 6 built-in maps stay unsized and uncounted |
| Run the setup again | Nothing added, total unchanged |
| Real non-images from the game folder: SVG as `.png`, Markdown as `.webp`, PDF as a map, HTML as `.jpg` | Each 415, nothing stored |
| Real WebP sent as `.jpg` declaring 9999×9999 | Accepted as 256×256, `.webp` key, served as `image/webp`. Deleting it restored the total at once |
| `GET /api/library` | Fields are `createdAt, grid, height, id, kind, name, url, width`, with no size or object key |
| 1 KB of storage left | A 15 KB token gets 409 with the 2 GB message and no `Retry-After`, nothing left behind. A 1×1 PNG still fits |
| Storage full | Library, UVTT import, direct room token and direct room map all 409, nothing left behind. The library still opens |
| Delete the filler through the API | Space back at once |
| Direct room map declaring 1000×1000, with space | Recorded as 1960×1400 and 556,474 bytes, the file's real values. Deleting the room removed the record and the file. This is the request the browser check above couldn't reach |
| 1,000 library items | The next upload gets 409 with the 1,000-item message |
| `uploads:backfill-sizes` | Recorded 0, none over either limit, this account at 2.2 MB and 26 items |
| Browser, signed in at `127.0.0.1:5491` | Library lists the maps with art, 22 tokens, 17 creatures with stats and art, 4 encounters. Created room "LanternFall" through the form from Scene 1: the map, 11 tokens and the hidden moths appear, with no console or server errors |
| `group-tokens.mjs`, run twice | Wardens 4, Allies 1, Gloam Moths 4, Board pieces 2, the same both times, shown in the room after a reload |
| Allowance after creating the room | Unchanged. A template's map is a library asset, so 0 room uploads |

Filler rows were put straight into this throwaway database to reach the limits, and were removed afterwards. The account ended with exactly the game's 26 images.

**Still running for the user to look at:** the two servers and the `lanternfall-check-pg` container. Not exercised here: S3 storage (local disk only; the backfill section above covers SeaweedFS), and dice pictures, which Lanternfall doesn't use.

## Left for after release

An owner runs the backfill on production and reads its report. Production data was not examined, so the 1,000-item and 2 GB values are still unconfirmed against real accounts.
