# Terrain and tactical movement — verification

## Main synchronization — 2026-11-03

PR #134 merges `origin/main` through `6298da81a7c61097c3ba05356d6b7617c24e5b75` into `feat/terrain-tactical-movement`, preserving both branch histories. Nine conflicted files were reconciled across the board, movement ruler, library editor, styles, reducer, replay, undo and visibility. Main's personal movement planner, area effects, group rolls and design styles remain integrated with terrain editing, private movement feedback and preparation revision checks.

A new replay regression round-trips the combined terrain/area-effect/group-roll flow through the wire schema, compares each replayed state with the authoritative filtered state, and checks that hidden tokens and canonical terrain stay private. The movement planner's board mock now includes the terrain view methods and connection subscription used by the merged component.

Verification used Node **22.23.2**:

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS, including browser TypeScript |
| `npm test` | PASS: **886 shared + 553 server + 1171 web + 2 latency = 2612 passed**, **51 skipped** |
| `npm run build` | PASS |
| `openspec validate terrain-tactical-movement --strict` | PASS |
| `npm run test:browser -- browser/terrain.spec.ts` | PASS: **12/12**, covering desktop/touch/narrow Chromium, Firefox and WebKit with separate GM/player sessions |
| Staged and working-tree whitespace/conflict checks | PASS |

The service-dependent tests were skipped because this run did not configure PostgreSQL, Redis or optional S3 persistence. The local relay benchmark delivered 300/300 messages to both recipients, with p95 **116.7 ms** for each, below the existing 150 ms threshold. These results do not establish hosted performance or architecture approval.

The first browser run passed 11/12 cases. WebKit desktop clicked the moved token after the separate wire observer caught up, before the test synchronized with the browser's rendered state. The test now waits for the page's committed sequence and two animation frames before clicking the destination; the complete six-project rerun passed. Its original failure trace is preserved at `/private/tmp/vtt-terrain-sync-webkit-failure-20261103/`. No production timing or movement behavior was changed for this test correction.

Task 4.2 and Raymond's architecture/resource review remain open. The PR also has nine existing unresolved review threads, including stale terrain protection for map/UVTT applications and size-only token configuration. Clean conflict resolution and passing checks do not resolve those findings. The original checkout remains on `main` with its pre-existing package-lock, skills and tmp changes intact.

Logs: `/private/tmp/vtt-terrain-sync-tests-final.log`, `vtt-terrain-sync-typecheck.log`, `vtt-terrain-sync-lint.log`, `vtt-terrain-sync-build.log`, `vtt-terrain-sync-openspec.log` and `vtt-terrain-sync-browser-final.log` (all under `/private/tmp`). Earlier sections retain their historical verification evidence.

## Earlier verification runs

Implemented and verified on `feat/terrain-tactical-movement` in `/private/tmp/vtt-terrain-tactical-movement`, based on `origin/main` at `ffeb553`. References below to uncommitted changes, HEAD values and unpublished state describe the corresponding verification run; Git and the pull request record the current publication status. The original checkout remains on `main` at `4dff92b` with its existing package-lock, skills and tmp changes preserved.

## Delivered behavior

- Optional sparse base terrain and named temporary effects; cell brush, rectangle fill, layer erase, strongest restriction, bounded gestures and guarded undo.
- Private room/library preparation, immediate completed live gestures, Show terrain, persistent temporary markers, keyboard cancellation and a bounded scrolling token card.
- Straight swept square movement against Blocked ground, walls and closed/locked portals; wall clearance and starting-wall escape retained, with no Blocked escape exception. Fog permits ordinary authorized owner and GM movement while preserving concealment; one-move GM Reposition checks its destination.
- Mover-only Chebyshev/free Euclidean ruler with proportional Difficult cost and conservative visual feedback. Actual origins are retained; ghosts never change sight origins. TokenMoved carries no terrain cost.
- Server-ordered current-state validation, stale origin/epoch/revision fences, generic refusals and player-safe effective projection. Temporary markers expose presence and public effective ground, never weaker underlying layers or names.
- Atomic owner-scoped library grid/board compare-and-swap in memory and Postgres. Legacy omitted terrain is preserved; geometry changes require explicit reset. Library placement copies base; encounters save base only; checkpoints retain all active layers. Replay carries sight/projection metadata.

## Automated results

All checks used Node **22.23.2**. The Prisma client was regenerated in the isolated installation from the existing schema; no migration was added.

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test`, with isolated PostgreSQL `DATABASE_URL` | PASS: 816 shared + 584 server + 1045 web + 2 latency tests = **2447 passed**, 4 skipped |
| Final web rerun after the mobile card fix | PASS: 1045 tests |
| `npm run build` | PASS |
| `openspec validate terrain-tactical-movement --strict` | PASS |
| `git diff --check` | PASS |
| `npx playwright test browser/terrain.spec.ts` | PASS: all 6 projects |

The four skipped cases require optional Redis/BullMQ or S3 integration configuration: grid worker, global grid admission, Redis sequence deletion and UVTT Postgres/S3 persistence. PostgreSQL terrain serialization, a fresh-store reload, library concurrency and stale-write checks actually ran against a dedicated database. That test database was removed afterward; existing databases and running services were left in place.

The existing ephemeral benchmark delivered 300/300 messages to each recipient with **p95 117.2 ms** for both GM and Bob, below its 150 ms profile limit. This is local benchmark evidence, not a hosted latency claim.

## Browser acceptance

Projects: Chromium desktop/touch, Firefox desktop/narrow and WebKit desktop/touch. Each uses separate GM/player sessions. The flow verifies:

- Live brush painting, temporary effect creation/removal and preserved underlying base.
- Private Terrain preparation that sends nothing before Save.
- No player painting control, private names or GM edit revisions in player payloads.
- Escape cancels a stroke before closing the editor, and cancels a drag without committing.
- Real token movement buttons and arrow keys; restrictive painting over an occupied token; generic refusal; one-move GM Reposition reset.
- The editor Close button, token-card Close button and movement readout fit within their viewports. The token card scrolls its body while keeping its header and cost visible.
- No browser page errors.

Snapshots are generated under ignored `test-results/terrain-*/`: `terrain-editor.png`, `terrain-board.png`, `terrain-player.png`. Desktop and phone layouts were visually inspected. These are browser emulations, not physical-device or production acceptance.

## Resource bounds

`node --import tsx scripts/bench-terrain.ts` exercises 10,000 separately stored cells and 100 fog regions. Final warm local samples (ms):

| Operation | Samples |
| --- | --- |
| Paint | 12.65, 5.46, 6.31 |
| Route | 6.78, 6.26, 5.27 |
| Player projection | 17.55, 13.89, 14.21 |

Bounds are enforced at 32 temporary effects, 10,000 overridden cells across all layers and paint commands strictly below 32 KiB. Tests cover cell/payload/layer overflow, no partial gesture writes, stale contexts, proportional costs, boundary contact, large swept footprints, thin fog, undo conflicts, current visibility, checkpoint restore, reconnect, real Postgres reload, independent library copies and base-only encounters. These observations support review; they do not approve the resource limits for production load.

## Release gates

Task 4.2 remains open: Raymond must review [ADR 0046](../../../docs/adr/0046-terrain-tactical-movement.md), its amendments and resource bounds under [CLAUDE.md](../../../CLAUDE.md). No approval is claimed, and nothing was pushed, merged or deployed. Earlier result sections below retain their historical evidence; the ordinary owner movement revision supersedes their former player fog restrictions.

The refreshed unmerged `origin/feat/area-effects` overlaps shared contracts/reducers/filters, Board.tsx, boardView.ts, RoomPage.tsx, styles and integration tests. The ADR records that overlap for merge coordination. Existing sight and atomic-placement reviews remain separate outstanding reviews.

Pre-existing non-blocking Vite public-asset/chunk-size notices and jsdom canvas notices remain visible in the logs. Logs for this run are in `/private/tmp/terrain-verified-tests.txt`, `/private/tmp/terrain-browser-final.txt`, `/private/tmp/terrain-web-final.txt`, `/private/tmp/terrain-lint.txt`, `/private/tmp/terrain-all-types.txt`, `/private/tmp/terrain-build.txt` and `/private/tmp/terrain-benchmark.json`.

## Manual-testing follow-up: erase preview and private wall feedback

The erase gesture used a Difficult placeholder in the common terrain renderer, which drew an incorrect ×2 preview. Erase now previews selected cells with translucent white, hides the removed layer in the draft preview, and preserves underlying layers. The hover cursor uses the same white treatment.

Plain walls were intentionally withheld from player snapshots, while the local ruler checked the incomplete player wall list and displayed "No known obstruction." The user confirmed that walls should remain hidden. Obstruction-status wording has been removed from labels. Known blocked routes are red and dashed, uncertain routes faint and dashed, and checked clear routes solid. Distance and cost remain visible.

A new unpersisted tokenMovePreview request receives tokenMoveFeedback only on its originating socket. The pure viewer filter checks ownership/visibility, exact committed origin, board epoch and full current route coverage before consulting canonical collision geometry. Concealed routes return unknown with or without obstacles; responses carry no wall geometry, obstacle identity or terrain cost. Requests are coalesced to 10/s and independently capped at 10/s on the server within the existing 40/s ephemeral limit. A response for an older pointer request or committed sequence is ignored. Redacted edits refresh stationary drags, and move commits still independently validate current state.

Follow-up verification used Node 22.23.2:

- Lint, typecheck, build, strict OpenSpec validation and diff checks: PASS.
- `npm test`: PASS, **817 shared + 524 server + 1046 web + 2 latency = 2389 passed**, 50 skipped. This rerun did not configure PostgreSQL/Redis/S3; service-dependent tests were skipped. The earlier real PostgreSQL results above remain the persistent-store evidence; these fixes do not change stored content.
- Latency: 300/300 messages per recipient; GM p95 115.1 ms and Bob p95 115.8 ms, below 150 ms. This is the existing relay benchmark, not a hosted or new-advisory latency guarantee.
- Terrain browser acceptance: PASS in all six projects. The player's red route is asserted from rendered canvas pixels, then a hidden wall is removed while the pointer is stationary and the route becomes clear. Other sockets receive no feedback. Erase preview has white fill and no text; existing editing/movement acceptance still passes.
- Desktop and touch screenshots were visually inspected. Additional artifacts: `terrain-erase-preview.png` and `terrain-player-blocked-route.png` under each ignored terrain test result directory.
- The UI scan reported no findings. Focused tests also cover older-target/canceled-drag replies, same snapped target reuse, private response routing, no state/sequence changes, forged replies, stale origin/epoch, ownership and concealed-layout invariance.

Follow-up logs: `/private/tmp/terrain-feedback-all-tests.txt`, `/private/tmp/terrain-feedback-browser-final.txt`, `/private/tmp/terrain-feedback-lint.txt`, `/private/tmp/terrain-feedback-types.txt`, `/private/tmp/terrain-feedback-build.txt` and `/private/tmp/terrain-feedback-ui-scan.json`. Changes remain uncommitted in the isolated feature worktree.

## Ordinary GM fog movement revision

Historical verification of the initial GM correction follows. The later owner movement revision supersedes the player fog restrictions described in this section while retaining its GM, physical-collision and privacy evidence.

The authenticated actor’s role now exempts ordinary GM moves from manual-fog collision in `movementBlocked`, for both `token.move` and permitted positional `token.configure` edits. The server advisory uses the same check; the local ruler applies the same role rule. No command schema, permission flag or automatic Reposition was added. Physical route/destination restrictions, proportional Difficult cost, player swept-fog restrictions, visibility filters and hide-first/reveal-last event ordering remain intact. The board’s existing drag, button, arrow-key, read-only preview and stale-reply paths use these checks without production changes. ADR 0046 remains Proposed and task 4.2 remains open.

Regression coverage includes entry, movement entirely within fog, a thin strip between clear endpoints and exit; owned players starting under fog; full swept player footprints; Blocked/wall/closed/locked portal routes and destinations under fog; open portals, clearance and starting-wall escape; proportional Difficult cost; local/server GM feedback agreement; actual drag/button/key/positional-editor flows; unowned monster movement and ghosts; private rename ordering; Reposition consumption after success and refusal; queued physical edits during a drag and stale origin/epoch refusal. Existing stale-target/canceled-drag, concealed-route uncertainty, private wall feedback, white erase preview and read-only preview tests remain in the suite.

Verification uses Node **22.23.2** from the installed fnm runtime.

| Check | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` (including browser tests) | PASS |
| `npm test` with isolated PostgreSQL and Redis | PASS: **828 shared + 594 server + 1047 web + 2 latency = 2471 passed**, **1 skipped** |
| `npm run build` | PASS |
| `openspec validate terrain-tactical-movement --strict` | PASS |
| `npm run test:browser -- browser/terrain.spec.ts` | PASS: **6/6** Chromium desktop/touch, Firefox desktop/narrow, WebKit desktop/touch, separate GM/player sessions |
| `git diff --check` | PASS |

The sole skipped test is `apps/server/test/uvttPersistence.test.ts`, which requires optional S3 configuration (`UVTT_S3_ENDPOINT`) in addition to PostgreSQL. PostgreSQL persistence, terrain serialization/library concurrency and Redis/BullMQ integration actually ran against new local instances on ports 55479 and 6397. Both instances were stopped and the disposable PostgreSQL cluster removed after the suite; the user’s Docker stack was not stopped or rebuilt. Browser app services use separate ports 3109/5189 with in-memory storage and separate GM/player sessions. Initial sandboxed server attempts could not bind sockets (`listen EPERM`); rerunning with local socket access passed.

The existing relay latency benchmark delivered 300/300 messages per recipient: GM p95 **116.2 ms**, Bob p95 **115.9 ms**, below its 150 ms profile threshold. This does not establish hosted or advisory-channel latency. Existing jsdom canvas, Vite public-asset and bundle-size notices remain non-blocking. Initial browser runs exposed test sequencing/card-occlusion issues; the final six-project run passes after waiting for accepted UI state/acknowledgements and closing the card before small-viewport drags. Browser screenshots were visually inspected; these are browser emulations, not physical-device acceptance.

Files affected by this revision (relative to the preserved uncommitted feature):

- Shared implementation: `packages/shared/src/movement.ts`, `decide.ts`, `visibility.ts`; regression tests: `packages/shared/test/terrain.test.ts`, `fog.test.ts`.
- Server regressions: `apps/server/test/terrain.test.ts`, `fog.test.ts`.
- Web implementation: `apps/web/src/board/movementRuler.ts`; regression test: `apps/web/test/terrain.test.tsx`.
- Browser acceptance: `browser/terrain.spec.ts`.
- Architecture: `docs/adr/0046-terrain-tactical-movement.md` and only the terrain amendment in `docs/adr/0016-manual-fog.md`.
- Active OpenSpec change: `proposal.md`, `design.md`, `tasks.md`, this `verification.md`, and delta specs `fog-of-war/spec.md`, `portals/spec.md`, `terrain-tactical-movement/spec.md`.

Logs: `/private/tmp/vtt-gm-fog-all-tests.log`, `vtt-gm-fog-lint.log`, `vtt-gm-fog-types.log`, `vtt-gm-fog-build.log`, `vtt-gm-fog-openspec.log`, and `vtt-gm-fog-browser-verified.log` (all under `/private/tmp`). Changes are uncommitted; no commit, push, deployment, architecture approval or archive was performed.

Final preservation checks confirmed the original checkout’s status and originally changed/untracked file hashes match the pre-edit baseline; all pre-existing feature files remain present. No remaining issue is known to affect this requested GM fog behavior. Architecture review remains outstanding; this evidence does not approve the change for release.

## Ordinary owner fog movement revision — 2026-10-30

Restored main's ordinary owner movement policy in the existing uncommitted terrain worktree, retaining this branch's physical movement implementation. Fog no longer collides in `movementBlocked` or the local ruler. The unused actor parameter, role-specific fog branch and imports were removed, and all authoritative/advisory callers were updated. Authorization still runs before physical validation. No permission flag or automatic Reposition was added.

The production follow-up changes only four files: `packages/shared/src/movement.ts`, `decide.ts`, `visibility.ts`, and `apps/web/src/board/movementRuler.ts`. The fog knowledge predicate in `terrainVisibility.ts`, viewerSight, fog rendering, Board/BoardView input and stale-feedback handling, the ordered pipeline, response routing and rate limits are unchanged from the preserved feature. Fog-only owner previews are uncertain with Cost unknown; concealed server feedback remains unknown with and without obstacles. GM physical feedback and proportional Difficult cost remain accurate.

Regression coverage now permits owner and GM entry, movement entirely within fog, thin-strip crossing and exit; GM placement followed by owner movement; and newly painted fog over an owned token. It retains hidden/unowned/ownership-revoked movement refusal, revoked-seat queued-command and reconnect refusal, positional-edit permissions, generic refusals, current wall clearance and starting-wall escape, closed/locked portal and Blocked route/destination collision, no Blocked escape exception, Reposition authorization/destination checks, and correct concealed cost handling.

Wire tests explicitly keep monsters, names, prior values, positions and ghosts out of owner payloads when sight overlaps fog, after owner movement, in reconnect snapshots and REST replay. Drag previews leave committed sight unchanged; actual moves update it. Existing sight/range/wall/window/door/combined-origin tests and hide-first/reveal-last rename tests pass. Private feedback remains limited to its requesting socket and ten requests per socket per second. Existing older-target/cancelled-drag reply checks remain; new owner tests cover stale origins/epochs and revalidation after fog-only changes, Blocked painting and portal closure.

The real browser flow now exercises player drag, movement buttons and arrow keys within/into/out of fog, across a thin strip, after GM placement and after fog covers a token during a drag. New concealed physical restrictions still refuse the drop. It asserts unchanged fog, no player Reposition flag/control, no concealed monster details in browser frames, Reposition cancellation without a write, consumption on successful/refused attempts, and read-only GM view-as-player with no outgoing movement/ephemeral traffic. Both GM and player sessions use each project's configured viewport, including Firefox narrow. Existing white erase and rendered red collision-route assertions remain.

### Verification results

All checks below used the installed fnm **Node 22.23.2** runtime. No dependencies or migrations were added.

| Check | Actual result |
| --- | --- |
| `npm run lint` | PASS; final rerun after the browser viewport correction |
| `npm run typecheck` | PASS, including browser tests; final rerun after the viewport correction |
| `S3_AUTODETECT=0 DATABASE_URL=postgresql://vtt@127.0.0.1:55481/vtt_owner_fog REDIS_URL=redis://127.0.0.1:6399 npm test` | PASS: **830 shared + 603 server + 1047 web + 2 latency = 2482 passed, 1 skipped** |
| `npm run build` | PASS |
| `openspec validate terrain-tactical-movement --strict` | PASS |
| `S3_AUTODETECT=0 npm run test:browser -- browser/terrain.spec.ts` | PASS: **6/6** chromium-desktop, chromium-touch, firefox-desktop, firefox-narrow, webkit-desktop, webkit-touch; separate GM/player contexts at matching project viewports |
| `git diff --check` | PASS |

The sole skip is `apps/server/test/uvttPersistence.test.ts`, which requires optional `UVTT_S3_ENDPOINT`; no isolated S3 service was configured. PostgreSQL persistence/terrain serialization/library concurrency and Redis/BullMQ integrations actually ran against new local instances. The existing relay benchmark delivered 300/300 messages per recipient, with GM p95 **117.4 ms** and Bob p95 **116.4 ms**, below its 150 ms threshold. This is local relay evidence, not a hosted or advisory latency guarantee.

Initial sandboxed attempts to bind server sockets and initialize PostgreSQL failed with EPERM/shared-memory restrictions; the checks passed with local test-service access enabled. An initial focused web fixture accidentally left a portal midpoint outside fog; the fixture was corrected to exercise a concealed portal while preserving known-collision feedback. The first full suite found two failures in a new test that waited for messages after revoking/disconnecting its player; moving revocation after the live ownership checks fixed the test. The final full run passes. An initial six-project browser run also passed; the final six-project rerun additionally makes Firefox's player session use its configured narrow viewport.

Existing non-blocking jsdom canvas, Vite public-asset/chunk-size and terminal color notices remain. Desktop, Chromium touch and Firefox narrow screenshots were visually inspected, including the uncertain owner route and white erase preview. Screenshots are under ignored `test-results/terrain-*/`, with the added `terrain-owner-fog-route.png`. These are browser emulations, not physical-device or production acceptance.

### Preservation and cleanup

All 89 pre-existing changed feature files were backed up before editing in `/private/tmp/vtt-owner-fog-followup/initial-worktree.tar.gz`, with initial diffs/status/hashes alongside it. Every pre-existing file remains present. The original checkout's status and saved hashes of its originally changed/untracked files match the initial baseline. The feature worktree stays on `feat/terrain-tactical-movement`; no commit, push, deployment, archive or branch switch was performed.

Disposable PostgreSQL on port 55481 and Redis on port 6399 were stopped and their test data directories removed. Playwright's separate in-memory API/web services on ports 3109/5189 also stopped. None of those ports retained a listener after verification. No Docker command was used, and the user's running stack was not stopped, rebuilt or modified.

Follow-up files relative to the preserved feature:

- Production: `packages/shared/src/movement.ts`, `packages/shared/src/decide.ts`, `packages/shared/src/visibility.ts`, `apps/web/src/board/movementRuler.ts`.
- Regressions: `packages/shared/test/terrain.test.ts`, `packages/shared/test/fog.test.ts`, `apps/server/test/terrain.test.ts`, `apps/web/test/terrain.test.tsx`, `browser/terrain.spec.ts`.
- Architecture: `docs/adr/0046-terrain-tactical-movement.md` and only the terrain amendment in `docs/adr/0016-manual-fog.md`.
- Active OpenSpec change: `proposal.md`, `design.md`, `tasks.md`, `verification.md`, and delta specs `fog-of-war/spec.md`, `portals/spec.md`, `terrain-tactical-movement/spec.md`.

Logs are in `/private/tmp/vtt-owner-fog-followup/`: `all-tests-final.log`, `lint-final.log`, `typecheck-final.log`, `build.log`, `openspec.log`, `browser-final.log`, plus focused and initial-attempt logs. The incremental follow-up patch is `followup.patch` in that directory.

**20/21 tasks complete; architecture review task 4.2 remains open.** ADR 0046 remains Proposed. No remaining issue is known to affect the requested ordinary owner/GM fog movement behavior. Optional S3 persistence was not reverified; no architecture approval or release approval is claimed. Historical verification above is retained and does not restore the superseded player fog restrictions.

## Independent review corrections — five findings

This follow-up started from the verified `ffeb553` feature worktree: 65 tracked edits and 24 untracked files, including the important terrain source files. The five review findings are fixed in production code. Existing fog concealment and authorized owner/GM movement behavior remain unchanged; no superseded fog-blocking rule was restored.

### Changes and regression evidence

1. **P1 preview termination:** `terrainVisibility.ts` rejects unsafe integer bounds on both axes and conservatively returns unknown for over-budget traversals. Every row/column iteration consumes work before any `continue`. Ordinary off-map movement remains permitted. `terrainTraversal.test.ts` launches a timeout-killed Node subprocess and actually commits extreme owner origins before previewing back onto the map, including negative/positive extreme coordinates, individual axes and very long ranges. Ordinary on-map coverage and return movement still pass.
2. **Private terrain preservation:** `GmPanel.tsx` leaves private cells and their revision context intact for unit/style-only grid saves. Terrain now joins the existing unsaved-work navigation guard, with an explicit option to keep the draft while entering Grid. Geometry edits require private terrain to be saved or explicitly discarded first; committed resets retain their confirmation. Rendered tests use the real form-associated grid submit for units and opacity, then return to Terrain and save the retained stroke. They also verify navigation and geometry refusal. The browser flow exercises the units round-trip before publishing terrain.
3. **Atomic stale saves:** `scene.savePreparation` is a strict GM-only, non-recursive whitelist. `decide` validates parent context, stages every edit using pure decide/reduce, and returns all events only after the complete operation passes. LiveRoom performs one existing atomic append, one undo group and existing filtered broadcasts. Tests gate a prior append to change terrain/geometry between submission and execution, and assert no preparation append, event prefix or board change. Late edit errors, append failures, unauthorized/nested payloads, undo, filtering, reconnect-style reload and real PostgreSQL persistence are covered.
4. **Changed cells and larger saves:** `mapDraft.ts` sends changed values and selected-base erasures only. One changed cell on a fragmented 1,000-cell base produces a **243-byte** preparation in the local reproduction. A 10,000-cell fragmented preparation produces **40 bounded paints / 490,816 bytes** and succeeds atomically through the authenticated preparation-only HTTP endpoint. Every paint stays below 32 KiB; cumulative unique painted positions and canonical overrides stay within 10,000, and the 32-effect bound is unchanged. The envelope is strictly below 768 KiB with at most 1,600 edits. Authorization occurs before the larger HTTP parser. Socket.IO and general JSON retain **64-KiB** limits, explicitly regression-tested. The response contains only sequence; RoomConnection waits for filtered ordered events through that sequence before completing Save. HTTP errors and delayed/disconnected acknowledgments are covered.
5. **Prepared library geometry:** `scene.setMap` compares placement spacing/origin with the saved library grid when base terrain exists. Incompatible overrides refuse the whole placement until the explicit reset checkbox is selected. Reset installs Normal ground in the same reversible MapSet; matching and cosmetic/unit-only geometry still copies the exact base. Shared and wire tests cover spacing, both origin axes, unchanged state/sequence on refusal, undo and library isolation; browser acceptance exercises cosmetic placement, refused spacing, explicit reset and undo.

### Final verification

All commands used fnm **Node 22.23.2**, with PATH inherited by npm, child processes and Playwright's servers.

| Check | Actual result |
| --- | --- |
| Focused shared regressions plus terrain/fog/replay | PASS: 83 tests |
| Focused terrain/library/FIFO wire tests | PASS: 30 tests |
| Final preparation and real Postgres regression run | PASS: 17 tests |
| Focused client HTTP/terrain/draft tests | PASS: 20 tests; broader room-editor focused run passed 85 tests |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS, including browser TypeScript |
| `S3_AUTODETECT=0 DATABASE_URL=postgresql://vtt_review@127.0.0.1:55492/vtt_terrain_review REDIS_URL=redis://127.0.0.1:6407 npm test` | PASS: **840 shared + 610 server + 1057 web + 2 latency = 2509 passed, 1 skipped** |
| `npm run build` | PASS |
| Strict OpenSpec and tracked/untracked whitespace checks | PASS |
| All six terrain browser projects | PASS: **12/12**, two scenarios in each of chromium-desktop, chromium-touch, firefox-desktop, firefox-narrow, webkit-desktop and webkit-touch. Separate GM/player sessions; desktop/touch screenshots visually inspected. |

The single skipped test is optional UVTT PostgreSQL/S3 persistence, requiring `UVTT_S3_ENDPOINT`. Fresh disposable PostgreSQL and Redis were used for the full suite; no historical URL, user database or Docker service was reused. Initial default-sandbox server tests failed with `listen EPERM`; the same tests passed with loopback access. Browser setup was corrected to reuse one account per project within the real signup rate limit and to explicitly clear player cookie storage, retaining separate GM/player authentication. Final browser evidence supersedes those setup attempts. Automatic approval review rejected a proposed shared socket-cap increase; the final preparation-only HTTP implementation preserves the existing socket cap. Existing jsdom canvas and Vite public-asset/chunk-size notices remain non-blocking.

The existing latency benchmark delivered **300/300** messages to both recipients, with GM p95 **118.0 ms** and Bob p95 **117.9 ms**, below the 150 ms profile. Local 10,000-cell preparation warm samples measured **342.92–370.22 ms** for schema/decision staging and **68.20–77.71 ms** for final reduction, excluding storage/broadcast. Existing terrain benchmark warm samples: paint 3.47–7.67 ms, route 5.36–6.64 ms, player projection 13.57–18.83 ms. These are observational local measurements. The aggregate and resource bounds still require Raymond's review; no architecture/resource approval is supplied or implied.

### Files changed in this correction

Production:
- `packages/shared/src/terrainVisibility.ts`, `commands.ts`, `decide.ts`.
- `apps/server/src/app.ts`, new `apps/server/src/http/roomPreparation.ts`.
- `apps/web/src/net/api.ts`, `roomConnection.ts`; `apps/web/src/pages/GmPanel.tsx`, `mapPrep.ts`, `mapEditor/mapDraft.ts`.

Regression coverage (27 added tests, plus updated existing assertions and browser flows):
- New shared `terrainTraversal.test.ts`, `preparation.test.ts`.
- New server `preparation.test.ts`; updated `libraryBoard.test.ts`, `postgresStore.test.ts`.
- New web `preparationSave.test.ts`, `terrainDraftGrid.test.tsx`; updated `roomConnection.test.ts`, `terrain.test.tsx`, `mapDraft.test.ts`, `mapEditorStepSwitch.test.tsx`, `mapEditorWalls.test.tsx`, `sightStep.test.tsx`, `uvttEditor.test.tsx`.
- `browser/terrain.spec.ts` contains the expanded existing flow and a separate library placement regression, each run in all six projects.

Artifacts: ADR 0046, active change design/tasks/verification, and the terrain-tactical-movement, map-editor and asset-library delta specs. Existing unrelated edits are preserved.

### Preservation, cleanup and release boundary

The original checkout's tracked/untracked content hashes, HEAD and Git status match the initial snapshot. The feature remains on `feat/terrain-tactical-movement` at `ffeb553`; all 89 pre-existing changed feature files remain present, with unrelated files unchanged. No reset, stash, clean, branch switch, commit, push or deployment occurred. Disposable PostgreSQL on port 55492 and Redis on port 6407 were stopped; their test data was removed. Playwright's in-memory services stopped too. Ports 55492, 6407, 3109 and 5189 have no remaining listener. No Docker command or operation on the user's stack occurred.

Logs, manifests, benchmark reproduction and separate browser screenshots/traces are in `/private/tmp/vtt-terrain-review-fixes-20261030-212413/`. Key files: `all-tests-final.log`, `browser-accepted.log`, `lint-accepted.log`, `typecheck-accepted.log`, `build.log`, `openspec-accepted.log`, `preparation-benchmark.json`, `terrain-benchmark.json`, `original-before.json`, `original-final-audit.json`, and `feature-final-audit.json`.

**26/27 tasks complete; task 4.2 remains open.** ADR 0046 remains Proposed. Optional S3 persistence, physical-device testing, hosted/load acceptance and Raymond's architecture/resource approval remain outside this local verification. No commit, push, deployment or Docker-stack operation occurred.
