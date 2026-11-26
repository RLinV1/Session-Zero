# Implementation handoff

## M5 pilot staging and cutover prerequisite, 2026-11-26

The owner approved deploying `219139aaa6daa9b95407241df4efb54010b4718d` to the isolated pilot for 6.7 and separately authorized the AWS CLI sign-in. Verified the Ohio instance and pinned SSH host key. The existing SSH rule already covered the operator's address.

The exact source archive was verified by SHA-256 after transfer. Server, MCP, web and vision images were built and tagged with the approved revision. The server and MCP images report Node 22.23.2. The staged Caddy configuration validates and retains the pilot's existing restrictions through a separate mount. The live site remains on `7249e8d1694f5f50ba0ed05ca7b425272617f981`, with successful HTTPS health checks for the website and MCP. Cutover, the backup immediately preceding it, and the migration are pending.

The new server requires SMTP configuration at startup. The pilot's existing Compose file and environment contain no SMTP settings. The owner was asked separately about a private pilot mail sink for synthetic verification, because public signups and resets require real mail delivery to reach users. The current pilot account also has all three build slots in use. A separate Chrome window is ready for ChatGPT sign-in and a fresh synthetic pilot account, keeping those drafts intact.

The architectural map and token fixture are committed in `browser/fixtures`. The new synthetic cave fixture is `/private/tmp/session-zero-m5-pilot.uXBpxO/studio-cave-qualification.png`, 1448 × 1086, SHA-256 `c3354de481487854f63082d7158328b26fcc4edc4067a2fc7d1c28392eaf09d3`. The staged rollout helpers and logs are in that same temporary directory. Task 6.7 and the hosted portion of 6.9 remain open.

## M5 verification and release handoff, 2026-11-26

Implemented from `1660e45463b60374fd2311f1bf7452295ca341c6` in `/private/tmp/session-zero-studio-m5-publication` on `feat/studio-m5-publication`. Code through `219139aaa6daa9b95407241df4efb54010b4718d` is the tested source. The later handoff commit updates the specs and documentation.

| Task | Evidence |
| --- | --- |
| 6.1 | The website opened the older displayed Studio revision with its original closed door. Review latest showed the corrected open door and preserved camera and focus. Store tests also verified older-revision restore, candidate-versus-builder divergence, and changed library grid and creature stats. |
| 6.2 | Memory and PostgreSQL both materialized the corrected placements and added only the reviewed closure. Tests covered foreign, pass-only, delegated-only, cross-origin and revoked owner sessions, concurrent commits, operation-ID conflicts, incompatible boards on one source, and equal receipt replay after a lost response. |
| 6.3 | A second PostgreSQL connection could neither see staged library rows nor anonymously GET or HEAD their aliases. A late injected failure rolled back the rows and quota usage, and S3 denied anonymous access to the original key. Disk and S3 delivery returned byte-identical map and token art after commit. A same-name disk file could not answer a reserved alias miss. |
| 6.4 | The test suite exercised candidate-preserving grid confirmation, stale terrain, off-map geometry, portal cutting, legal Difficult terrain, a multi-square Blocked footprint, hidden placements, blank stats, and the three quota checks. Shared art was charged once. Review includes unresolved flags and marks. |
| 6.5 | The real-stack website journey started an ordinary room and both image aliases loaded in the canvas client. Server tests checked template and room units separately, map alignment, walls, portal state, Base terrain, placement, hidden fields and raw player welcome, redacted event and reconnect payloads. |
| 6.6 | Browser reload replayed the withheld commit response. A fresh PostgreSQL store and sign-in replayed the same receipt after discard and library deletion. Tests also covered late corrections, owner-session revocation and reauthorization, partial publication, abandoned cleanup, unpublish and republish, stale removal and account deletion. |
| 6.7 | Pending separate approval of the exact pilot commit and the real ChatGPT web run. Claude Studio publication is unqualified. |
| 6.8 | Local verification and independent review are recorded below. |
| 6.9 | Local OpenSpec deltas and support guidance are ready. Finalize the milestone handoff against the hosted results after 6.7. Keep the parent change open. |

### Local checks

- Node 22.23.2 ran lint, typecheck and the full repository test command successfully. **5,889 passed** (2,074 shared, 292 MCP, 1,425 server, 2,096 web and 2 server benchmarks). The default run skipped 73 optional-service tests. Earlier checks caught missing review catalog entries and a UVTT test whose instrumented asset writer was bypassed by the adapter. The final commit passes both regressions.
- The focused PostgreSQL/S3, builder and authoring run passed 162 tests. The final publication-only rerun passed 12 tests, including the transaction fault injection, cross-connection reads and a queued session revocation.
- The preparation suite passed all 36 distinct cases across the initial run and retries. The new publication journey passed on Chromium desktop and touch, Firefox narrow and WebKit desktop. Retries resolved transient harness failures and the browser test's SVG locator and focus handling.
- Intake passed 42 cases across six separate project invocations. The Chromium website consent and owner-editor suite passed 6 cases.
- Both OpenSpec changes validated. `interactive-ai-scene-studio` retains two existing requirement-length warnings.
- The isolated `sz-studio-m2-96909cb5` Docker services and volumes were removed. Its generated environment file was removed after teardown.

### Independent reviews and fixes

The sync reviewer, visibility auditor and high-effort diff reviewer each reviewed and rechecked the changes. Fixes covered extension-bearing aliases for Pixi, native UVTT export and its asset adapter, compare-and-set removal, finalized workspace edit guards, reused attack animations, revoked grid agreement, session checks under the build lock and before review response, and legacy-route dependency checks. The dialog now pins restored revisions, reports changes even for invalid reviews, previews standalone art, and freezes and recovers the exact retry selection across reload. The reviews found the native event and player-filtering paths intact.

The existing native room-use index is populated after append. A simultaneous native map placement can still race the usage check during unpublish. Publication-versus-template reference checks are serialized at the library asset row.

### Approval gates

Push, PR creation and the pilot deployment each require separate approval. The pilot run must record the deployed commit, representative architectural and cave maps and token art, correction rounds, remaining uncertainty and observed room results.

## M5 local implementation and first review, 2026-11-26

The isolated stack applied all 38 migrations, including the new receipt and original binding. The first focused run passed 157 tests in PostgreSQL, S3, native builder and Studio authoring. The PostgreSQL fault injection checked prospective GET and HEAD aliases through a second connection after insertion and before rollback. The initial browser and full verification runs are being reconciled against the final fixes.

The independent reviews identified stale removal and retry races, inactive authoring guards after partial publication, reused native attack validation, a grid-agreement withdrawal edge, session expiry while waiting for the build lock, and ordinary image consumers that need alias support. The verification entry records the fixes and rechecks.

## M5 approved contract and isolated base, 2026-11-26

Verified the approved transcript title and closing plan tag, and verified local main and origin/main at `1660e45463b60374fd2311f1bf7452295ca341c6`. Created `feat/studio-m5-publication` in `/private/tmp/session-zero-studio-m5-publication`. Recorded the owner's decisions in D10, D14, D15 and ADR 0073 before implementation. Task 6.7 awaits separate pilot approval.

## M4 local verification and PR handoff, 2026-11-25

Verified `feat/studio-m4-chat-selection` from `origin/main` at `4c24533d`. The review covered the M4 diff through `7bb44d3f`. The follow-up commits are `9a9fcef4` (staging validation and limits), `8c38fc5a` (composer and map controls), `153d10f0` (preparation and website browser checks) and `959156be` (stable per-widget selection slot).

### Checks

- All Node commands used Node 22.23.2. `npm ci --no-audit --no-fund`, `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` passed. The full test command passed **5,758** tests, including 1,995 shared, 292 MCP, 1,415 server, 2,054 web and 2 server benchmark tests. The default run skipped 71 optional-service tests.
- `node scripts/studio-m2/prepare.mjs` generated the run configuration with alternate loopback app ports because an earlier M2 run still owned the defaults. Through `with-env.mjs`, `compose up -d --build --wait`, `npm run prisma:migrate --workspace=@vtt/server` (37 migrations) and `node scripts/studio-m2/buckets.mjs` succeeded. The browser used the committed synthetic fixtures and real storage and detection.
- `node scripts/studio-m2/with-env.mjs <run.env> npx playwright test -c playwright.studio-m2.config.ts` passed **32/32**. The first native-browser run passed 20 cases before hitting the OAuth registration budget. The fixture now registers once per worker and obtains a separate grant for each test build.
- Through the same wrapper, `npm test --workspace=@vtt/server -- --no-file-parallelism test/studioAuthoring.test.ts test/studioPostgresRace.test.ts` passed **30/30** across the memory and Postgres cases, including the build-lock race. `compose down -v` removed the disposable project and both volumes. The generated run configuration directory was deleted.
- `STUDIO_BROWSER_TEST=1 npx playwright test browser/studio-intake.spec.ts --project=<project>` passed **21/21** across three fresh runs, in Chromium, Firefox and WebKit order. The final intake runs exercised the stable widget ID after an encounter switch, redraw after a refused attachment, clear during a pending stage and advertised expiry.
- `STUDIO_BROWSER_TEST=1 npx playwright test browser/studio-connect.spec.ts --project=chromium-desktop` passed **6/6**. The website checks cover the launch text before consent and after disconnecting, absence of the embedded Studio, and the native editor's working revision.
- `openspec validate interactive-ai-scene-studio` passed with two pre-existing requirement-length warnings. `git diff --check origin/main...HEAD` passed.

| Project | Preparation | Intake |
| --- | --- | --- |
| `chromium-desktop` | 8/8 | 7/7 |
| `chromium-touch` | 8/8 | |
| `firefox-narrow` | 8/8 | |
| `firefox-desktop` | | 7/7 |
| `webkit-desktop` | 8/8 | 7/7 |

### Review

- The sync reviewer and visibility auditor checked the private authoring path, both stores and live-room boundaries. They found no new player data path or cross-build, credential or private-media disclosure outside the deliberately shared correction crop. The high-effort branch review used the read-only Codex review agent after automatic approval review rejected the external Claude Code invocation for potential source egress.
- Fixed stale and unauthorized staging, bounded both staged and cleared view records, and removed stale PostgreSQL references when the owner deletes an enrolled draft. The two HTTP hops now accept the schema's supported selection sizes behind the existing grant checks. Request creation still validates the saved scope and current authority.
- Fixed delayed attachments appearing after clear, expiry leaving a selection attached, an earlier request clearing a newer draft, and retrying the same selection after a refusal. The widget keeps one view ID and an increasing sequence across map/encounter changes.
- Restored keyboard object picking and explicit inclusion of a whole crossing object. A new rectangle uses the currently approved layers, and a stale inspection keeps navigation available while the view asks for a fresh inspection. Browser checks exercise zoom below fit, pan and pinch handling with synthetic input.
- Deferred physical trackpad classification across devices and real ChatGPT composer behavior across views. Task 5.10 remains open for hosted redraw, clear, a second view and one started correction. The local browser checks use a simulated host. [Earlier hosted correction sequence](evidence/m4-host-2026-11-18.md) · [Hosted selection attach](evidence/m4-host-2026-11-25.md)

## M4 hosted selection attach, 2026-11-25

Commit `f3bb8259` on `feat/studio-m4-chat-selection`, the same change as `7249e8d1` on `feat/studio-m4-declutter`. The pilot runs `7249e8d1`; rollback is `d84d44a9`.

In ChatGPT, every selection failed to attach. ChatGPT's tool proxy answered the view's `studio_stage_chat_selection` call with `-32001 Unknown tool`. Its snapshot of the app's tools predated 2026-11-24 and lacked that tool and `studio_start_correction`. The server serves the current view at any earlier view address, so the new view loaded against the old tool list. **Refresh tools** in ChatGPT's app settings fixed it, and a hosted selection then attached and was described by the AI. New chats and new builds do not refresh the snapshot, so refresh after every deploy that adds or renames tools. [Evidence](evidence/m4-host-2026-11-25.md)

The commit labels `studio_stage_chat_selection` read-only and logs the reason for an attach failure to the view's console. It was made before the root cause was known. The product owner kept the label ([D15](design.md#d15-m4-correction-interaction)). Lint, typecheck and `npm test` passed on this branch (5,757 tests, 71 optional-service skips). On `feat/studio-m4-declutter`, the Studio intake browser spec passed in Chromium (6 tests) and the composer test passed in WebKit. Running all six browser projects at once hit the OAuth registration rate limit (HTTP 429), which is a harness limit, not a product failure. Still not run: `browser/studio-preparation.spec.ts` under its M2 Docker stack, and an independent diff review. Task 8.1 is resolved by the declutter.

See the [local verification and PR handoff](#m4-local-verification-and-pr-handoff-2026-11-25) for the follow-up review and browser runs. Task 5.10 remains open for redraw, clear, a second view and one started correction in ChatGPT.

## M4 Studio declutter, 2026-11-24

Commit `ae9411a4` on `feat/studio-m4-chat-selection`, cherry-picked from `d84d44a9` on `feat/studio-m4-declutter`. That branch was built from pilot release `d11393cb` (`deploy/studio-pilot-chat-selection`). The product owner asked for these changes ([D15 declutter amendment](design.md#d15-m4-correction-interaction)):

- The website build page no longer embeds the Studio. The launch text moved into AI app connections, which shows it before the first connection.
- The embedded view has one bottom toolbar: pan, select area, pick object, clear, and zoom. On phones, the toolbar sits under the map. The instruction form, request status, copy prompt, "up to date" status, chat privacy line, grid-confirmed text and pan help are removed, along with 44 unused catalog keys.
- The map zooms out to half of fit. A trackpad two-finger scroll pans; a mouse wheel and a pinch zoom. The wheel classifier is a heuristic and needs a manual check on real hardware.
- The attached selection now describes its map, squares, editable layers and contents (`apps/web/src/studio/chatSelectionDetails.ts`). The server scope is unchanged.

On the pilot base, lint, typecheck and `npm test` passed: 5,477 tests, with 74 optional-service skips. All six Studio intake browser tests passed in Chromium, and the composer test also passed in Firefox and WebKit. On this branch, lint, typecheck and `npm test` passed: 5,757 tests, with 71 skips. `browser/studio-preparation.spec.ts` runs only under `playwright.studio-m2.config.ts` with its isolated Docker stack (`scripts/studio-m2`), which was not run. Its website comparison was removed because the website no longer embeds the Studio. Removed tests: the website Studio unit test, the website correction browser test, and the embedded form-handoff browser test.

## M4 direct chat corrections, 2026-11-24

The M4 polish runs on `feat/studio-m4-chat-selection`, based on refreshed M4 snapshot `f72b87d0`. An approved build connection can request private corrections without a second setting. The existing grant and build choices still govern writes. The additive chat-selection migration keeps the original correction-permission column available for rollback. Cached first-release widgets receive an enabled correction hint and retain their form until the host loads the new view.

The supported embedded flow attaches the user's selection to the chat composer. The model starts the request using the attached reference and the user's instruction. The selection is bound to the exact scene, build and grant. Drawing, redrawing or clearing a selection only stages or removes that reference. Once a request exists, it keeps its original scope. The website and hosts without usable context attachment retain the instruction form. [Design](design.md#d15-m4-correction-interaction)

Lint, typecheck, build and the full Node 22.23.2 suite passed, with 5,759 tests and 71 optional-service skips. The 64 focused memory and PostgreSQL checks cover expiry, revocation, stale scene versions, out-of-order updates and replay. The browser harness uses a normal composer alongside the sandboxed Studio and tests the attachment, replacement, cancellation, fallback after host refusal, and Before/After. It simulates the ChatGPT bridge. The direct composer test passed in Chromium, Firefox and WebKit. Chromium also passed the consent, website and embedded fallback tests. [Store checks](../../../apps/server/test/studioAuthoring.test.ts) · [Browser checks](../../../browser/studio-intake.spec.ts)

Hosted qualification is tracked in task 5.10. On an authorized pilot release, apply the new migration and refresh the ChatGPT connector's tools so it discovers `studio_start_correction`. In a fresh chat on an already-approved build, verify the prompt carries the current selection after drawing, redrawing and clearing it. Verify that a second Studio view keeps a separate selection, that the AI can describe a selection before starting a request, and that the resulting proposal matches the website build page.

## M4 correction interaction, 2026-11-18

- Implemented selection, correction requests, comparison, refinement, restore, and owner cleanup on merged M3 base `0277c4bb`. The AI app connections panel controls the correction opt-in on each build. Both stores verify it under their write boundary. The additive migration starts each grant with correction creation and restore disabled. [Authority](../../../docs/adr/0073-interactive-scene-studio.md#m4-private-correction-authority) · [Interaction design](design.md#d15-m4-correction-interaction)
- The same map viewport renders the exact inspected scene and the before/after comparison. The request retains its own immutable base and selection. The model tool retrieves that base's authorized crop and structured context. The website shows a copyable saved prompt. The embedded view saves first, then asks the active chat to send. It displays the host acknowledgment, the authorized request read, and the proposal result separately.
- Local Postgres 17 and memory contract checks passed 413 tests with fresh migrations, including a permission change queued against a write, request and restore retries, incompatible restores, atomic mixed-scope refusal, and revocation during crop rendering. The full repository tests include the HTTP and MCP regression for the new tools and model crop. [Store checks](../../../apps/server/test/studioAuthoring.test.ts) · [Postgres races](../../../apps/server/test/studioPostgresRace.test.ts) · [MCP checks](../../../apps/mcp/test/studioAccess.test.ts)
- Lint, typecheck, build, and the full repository suite passed on Node 22.23.2 with 5,464 tests and 71 optional-service skips. Both correction flows passed across six Chromium, Firefox and WebKit projects. The checks cover native drag suppression, pan and zoom, keyboard selection and cancellation, crossing walls, cropped-edge cells, multi-cell destinations, stable comparison focus, English and zh-TW, and reopening. The simulated message bridge covers save-before-send, acknowledgment, refusal and timeout. [Browser checks](../../../browser/studio-intake.spec.ts)
- Eleven existing Studio consent and intake browser checks passed in Chromium. The adjacent library terrain browser check timed out at the `From library` action inside `Edit map` on both the M4 worktree and a clean `0277c4bb` checkout. [Terrain check](../../../browser/terrain.spec.ts#L82)
- The authorized real ChatGPT run completed the doorway, cropped courtyard, hidden sentry move, and visibility refinement against the exact M4 build. The website rendered the same final revision. During an active reply, ChatGPT posted the courtyard request and finished the earlier reply. Explicitly submitting the saved prompt after the reply recovered the unread request. ChatGPT requested direct approval in chat for both sentry edits. The temporary apps, test grants, owners, and stack were cleaned up. [Real ChatGPT evidence](evidence/m4-host-2026-11-18.md)

## M3 review fixes, 2026-11-18

A read-only review of `fab6f9cb` found three defects. All three are fixed in `7b777e92`
on top of that commit (PR #223), and D14 records the changed contract.

- **Owner lockout.** A connection could fill the 32-revision history with stale proposals.
  After that, every owner builder save, delete and publish of the enrolled scene was refused,
  and discarding the build was the only way out. Now:
  - Delegated proposals are still refused at a limit.
  - Owner writes prune to 24 revisions. Pruning keeps the reference, working and
    materialized revisions, and removes orphaned requests and receipts.
  - Postgres reloads the full history in the same transaction only when pruning is needed.
  - Owner deletes are never refused. Deleting an enrolled map or encounter ends the correction.
  - The new owner route `DELETE /api/builds/:id/studio/authoring/maps/:mapKey` ends a
    correction explicitly.
- **Mark scope.** A mark was scope-checked by its square's top-left corner, so marks one
  cell past the selection's right and bottom edges passed. A mark now uses its whole square,
  clipped to the image, for selection and for its destination.
- **Sticky dependencies.** Guarded creatures and files were the union of all history, so a
  creature stayed guarded after its tokens were removed. They are now recomputed from the
  current working and materialized revisions on each write. An owner edit whose scene can't
  be captured (for example, after a used creature is deleted) is saved and shows as drifted.
- **Evidence.**
  - Three new or extended tests in `apps/server/test/studioAuthoring.test.ts` fail on
    `fab6f9cb` and pass with the fixes.
  - On Node with the default stores, lint, typecheck and `npm test` passed (5,462 tests,
    70 optional-service skips).
  - On a disposable Postgres 17, the builder and Studio server files passed serialized
    twice (513 tests).
  - Run in parallel on one shared database, those files fail intermittently on both
    `fab6f9cb` and the fixes (4 of 5 runs on `fab6f9cb`). The failures are cross-file
    sweeps and grant cleanup, including `studioStore`'s sweep test. This is pre-existing
    and not addressed here.
- **Not done.** There is no builder UI for ending a correction yet (M4). The review's
  medium-low and low findings (owner-token working ID, guide comment, replay order, mixed
  token snapshot, full history reads, Studio-off routes, catalog text) are unchanged.

## M3 implementation, 2026-11-18

- Work is on `feat/interactive-ai-scene-studio-m3` in `/private/tmp/session-zero-studio-m3`,
  with local changes based on merged main `dbb6cd3d` after PRs #220 and #221. Git metadata
  in the original workspace is read-only, so this is an independent clone. The separate
  build-access branch has its own credential changes.
- The owner confirmed first-correction enrollment and that an owner website save becomes
  the next working revision. The owner explicitly waived the M3 architecture review.
  The exact HTTP and MCP interfaces, storage limits and requirement-to-test matrix are in
  [D14](design.md#d14-m3-authoring-contract) and the [ADR amendment](../../../docs/adr/0073-interactive-scene-studio.md#m3-revision-and-enrollment-amendment).
- The additive migration adds the authoring workspace and immutable entries. Both stores
  serialize enrollment, saved proposals and native edits with the build. The signed-in
  owner creates a request or restores history. The MCP tools read a request or revision and
  submit scoped edits against the inspected base. Both Studio snapshots display the
  matching working revision. The native owner editor carries the inspected version and
  preserves line, mark and placement IDs when updating existing objects.
- Node 22.23.2 lint, typecheck, build and the full repository test command passed
  with 5,460 passing tests. The default run skipped 70 optional-service tests. The diff
  review covered request authorization, legacy-write guards, owner preconditions,
  fixture isolation and migration cleanup.
- On isolated Postgres 17 and memory, the focused Studio and builder run passed 112 tests.
  Checked cropped-edge erasure, portal cutting, whole-object and footprint scope, two
  concurrent proposals, an old save tool, website saves, profile drift, revocation, retries,
  restore, capacity, discard and ordinary publication. After a real Postgres service
  restart, 3 workspace rows and 80 immutable entries matched the counts and content
  fingerprints from before restart. The disposable database was stopped.
- The real HTTP and MCP regression retrieved a signed-in owner's request, advanced its
  revision, and reopened a saved stale candidate. Playwright passed 11 Chromium Studio
  consent, intake and owner-save checks. The new website grid-save path passed all six
  desktop and narrow Chromium, Firefox and WebKit projects.
- Synthetic authoring snapshots measured 45,248 bytes for a representative scene and
  901,786 for a dense one. The 32-revision dense estimate is 27.52 MiB before request and
  receipt overhead. OpenSpec validation passed with the two existing geometry and
  reopening requirement-length warnings.
- M4 starts with the owner request, revision, and scoped proposal contracts in D14. It
  adds the interactive request and same-camera comparison flow, followed by real ChatGPT
  qualification. Current evidence is local HTTP, MCP and browser execution.

## Personal EC2 pilot, 2026-11-18

The owner deployed an isolated Studio pilot in AWS Ohio at `https://studio-test.habticraft.com`. The personal ChatGPT Work plugin connects to `https://studio-test.habticraft.com/mcp/studio`. Pilot release `7cbb867c` enabled public signup at `/signup`. Pilot accounts, OAuth grants, builds, and private media are stored separately from production and persist across restarts.

Automated checks on the pilot covered OAuth discovery, access to future builds, approval of a second build on a restricted connection, and reopening a saved build after an EC2 reboot. The owner reported the pilot working after signup was enabled. The individual permission and restart checks in ChatGPT Work are still pending.

The owner plans to shut down the pilot later. Check its availability and deployed revision before relying on it, and use synthetic data for tests.

## M2 manual acceptance, 2026-11-17

- The owner tested the fresh isolated M2 stack at `0cd8818e28b887b8d5c62b9c31b313f7e80f2adc`
  in ChatGPT Work with the temporary personal plugin `Session Zero Studio M2 Manual (Fresh)`.
  The Studio resource was `ui://session-zero/studio.08d67fe46f615e81.html`.
- The owner reported that the exercised behavior worked well enough to close task 3.7.
  They observed that a build created after OAuth consent was outside the existing grant.
  That matches D7: consent covers the selected build IDs, and a new build needs a new grant.
  The report was an overall acceptance and included no per-check matrix, original byte
  comparison, or save-to-display measurements.
- Stack readiness was verified separately: clean checkout, Node 22.23.2, fresh migrated
  Postgres, private S3 startup checks, a real detector candidate, public signup and health
  endpoints, and matching OAuth discovery and bearer challenge.
- Full M2 code review done 2026-11-17 on `2bcfa0a1..257ab8f4`. Fixes are in `2524338e`:
  - Poll reads use READ COMMITTED under the build lock, so a revocation is no longer reported as a storage failure.
  - The chat view clears private data when access ends, including through the tagged MCP sign-in challenge.
  - Refused selections keep live refresh going.
  - Receipts cover refused 404 writes and are written once per request.
  - One failing token image no longer takes down the view.
  - Deliberately left: zh-TW issue-text back-translation (owner: not a priority) and
    the dev-time Studio bundle build on MCP import. Website idle polling is task 8.1.
  - Not verified in a real host: whether ChatGPT passes the MCP sign-in error back to the
    view. Without that, a revoked view shows "Connection interrupted" and keeps the last scene.
  The manual stack was left running for the owner.

## Latest session — M2 chat-attachment intake, 2026-11-17

- Worktree `/private/tmp/session-zero-studio-m2`, branch `feat/interactive-ai-scene-studio-m2`.
  Started clean at `9481a162`, the interim exact-host fix, on top of M2 implementation
  `bd9daa1a`. M2 remains unmerged. This session covers the FR-GM-26 policy amendment and
  local commits and checks. The next session owns stack preparation and the user owns task
  3.7 acceptance.
- [D9](design.md#d9-original-file-intake) records the regional composer hostname pattern,
  the interim fix's provenance, the exclusion of widget and Azure Blob origins, the removal
  of the merged M1b view upload paths and origin-only refusal logging. The embedded view
  and refusal messages offer chat reattachment or the existing owner build upload page in
  English and zh-TW. Expired links still ask for reattachment in chat.
- The eventual PR description for **Raymond's Real-Time Architecture review** should call out
  the FR-GM-26 change from exact hosts to the bounded composer prefix and the removal of the
  merged M1b picker/device/tool path. Include the trust boundary, origin-only logging and the
  existing owner upload as the fallback. `CLAUDE.md` requires an ADR for changes to existing
  `packages/shared` schemas. This patch changes no such schema, so the D9 amendment is the
  design record for this review.

### User-reported ChatGPT Work run, 2026-11-17

The user ran ChatGPT Work on `sz-studio-m2-e9216bcf` and reported these observations.

> - The grid suggestion showed.
> - Walls, windows, Blocked and Difficult Base terrain, and visible and
> - Saved changes appeared in the already-open Studio without reopening it.
> - Camera and focus stayed put.
> - Only failure: composer imports refused with "origin" (diagnosed above; interim fix 9481a162).

The placement line ends at “visible and” in the received report. This records the observed
run with its intake failure. Task 3.7 was open at the time. Individual results were pending
for zh-TW, fullscreen/narrow, close recovery, disabled permissions and refused saves,
multi-map/encounter separation, and disconnect/reconnect with a newly created build.

### Independent review

- The security review found that Unicode case folding could hide an IDNA-mapped raw
  hostname. The parser now folds ASCII case only, with a regression for the Unicode
  spelling and a positive uppercase HTTPS control.
- The review also found that the existing website upload is reachable by file link.
  The fallback discloses that visibility in English and zh-TW. The browser test uses
  the real owner form with a synthetic PNG and checks that the open Studio sees it.
- Re-review confirmed both fixes and found no further issues in the requested scope.
  Composer hostnames can still change outside the chosen pattern. The policy constrains
  destinations and retains its transport and decode bounds. Individual descriptors
  remain untrusted.

### Local verification and affected files

- Node 22.23.2 lint and typecheck passed. `npm test` passed 5,406 tests including the
  latency benchmark, with 65 skips for optional services. Tests ran with `COOKIE_SECURE=0`
  and `DATABASE_URL` and `REDIS_URL` unset. The MCP Studio bundle built and loaded as
  `ui://session-zero/studio.08d67fe46f615e81.html` from the production build.
- Playwright consent and intake passed all 60 cases across desktop and narrow/touch
  Chromium, Firefox and WebKit, using test-owned loopback memory/disk fixtures. The
  fallback case verifies English and zh-TW guidance, the build-page URL, and an actual
  synthetic owner upload visible in Studio. A WebKit teardown race was fixed by stopping
  polling and draining bridge callbacks after the assertions. Both complete WebKit
  projects and the fallback case on the other four projects passed the reruns.
- The updated `studio-preparation.spec.ts` typechecked. Its Postgres/S3 and real-detector
  browser run and the ChatGPT Work retest remain for the next stack. The user-reported
  observations above are the only M2 real-host evidence recorded here.
- The change updates server `studioDownload.ts`, the two server catalogs and server
  regressions, MCP Studio tools/resource and intake tests, and the embedded
  `SceneStudio.tsx` and English/zh-TW catalogs. It also updates both intake and preparation
  browser specs, this OpenSpec change and the M2 runbook.
- OpenSpec validation passed in normal mode. Strict mode still reports the two baseline
  requirement-length warnings for native geometry and reopening. The amended intake
  requirement is within the length limit. `git diff --check` passed.

### Next stack-preparation session

Use the clean M2 branch tip and [M2 runbook](../../../apps/mcp/README.studio-m2.md). Prepare
fresh isolated Postgres and authenticated S3 with private/public buckets and run the real
`services/vision` detector. Use Node 22.23.2 and the runbook's explicit loopback endpoints,
migrations and synthetic fixtures. Configure the fresh HTTPS tunnel origin as
`STUDIO_PUBLIC_ORIGIN` on server/MCP and `CLIENT_ORIGIN` on the server. Update the URL of
`Session Zero Studio M2 Manual` to that origin plus `/mcp/studio`, refresh tools and use a new
`studio_open` call. The existing plugin points at the stopped stack's dead tunnel.
Retest composer originals and the owner-page link, then let the user report the pending
qualification steps. The manual stack is stopped.

## Previous M2 research session, 2026-11-17

**Phase 2 authorized:** the user approved recording the Phase 1 design and beginning
implementation. D13 and ADR 0073 record that design before dependent product code.

- **Base verified:** remote main `2bcfa0a1f772a94a907f2c6597aed41d0cef0234`, checked against GitHub and `git ls-remote`. PR #212 merged as `d23a0b65001ef1d544a314c1779ea711f68b3a72`; PR #216 merged as `cd31b0552154e899d4daf06e6d2ad9968ac43fbc`. Both complete PR heads are ancestors of this base, including M1b fixes through `7eadf503` and its final handoff. Main also contains #219's legacy attack-dice test typecheck fix.
- **Approval update from the user:** after the initial prerequisite audit found the historical owner-review rows still pending, the user reported that Raymond approved everything and explicitly waived other approval gates. This satisfies the M1 prerequisite for this session. It is user-reported approval, not a newly discovered GitHub review or a claim that the glossary owner separately reviewed the terms. The older records below retain their historical scope.
- **Existing host evidence:** [M1 qualification](evidence/m1-host-2026-11-16.md) records actual ChatGPT discovery/DCR/consent/read/disconnect and map/token original intake, source view and reopen/recovery. Independent fixes were re-reviewed through `7eadf503`. M1 did not prepare map items or use a real detector; it does not qualify M2.
- **Isolation:** created branch `feat/interactive-ai-scene-studio-m2` and worktree `/private/tmp/session-zero-studio-m2` from that exact main. Other worktrees and uncommitted files are preserved. Use explicit `fnm exec --using=22.23.2` for Node commands: shells do not all resolve the same Node version.
- **Authorization:** tasks 3.1–3.7 only; research/discuss before product code. The user subsequently authorized the real ChatGPT test, temporary tunnel and synthetic-account steps autonomously, superseding the original request for a separate host-run approval. The Phase 1 design still awaits the user's go-ahead before product code. Commit/push and PR to main are authorized after implementation; no merge or deployment.
- **Research:** see research.md's M2 section for existing layers/tools, context and status gaps, traffic budget, proposed design and verification order. These are proposals, not an agreed implementation design. No M2 task is complete; no product code, dependency install or test service has been started.
- **Preserve active stacks:** read-only inspection found `cse416` development services and manual project `sz-studio-m1b-cce5e8a7` (Postgres 55434, S3 18334, vision 18889). Do not reuse these or their databases/buckets. Existing Playwright configuration forces memory persistence and vision 18889; it cannot be used unchanged for M2 proof.

## Planning and M1 baseline

- Date: 2026-11-16 (planning 2026-11-14).
- Repository: `RLinV1/Session-Zero`, locally named `Virtual-Tabletop`. The existing Git remote still uses the older `Virtual-Tabletop` URL; it was not changed.
- Original planning baseline: `origin/main` at `a86160f584c44c8e8998bc56966e214ff04b5a08`. Current implementation bases are recorded per session below.
- Planning branch: `docs/interactive-ai-scene-studio-plan`.
- Planning worktree: `/private/tmp/session-zero-studio-planning`. Artifacts are repo-relative; a later worktree need not use this temporary path.
- Original worktree: `/Users/chrispsimadas/.codex/worktrees/ef7e/Virtual-Tabletop`, on `feat/mcp-scene-preparation`. Its pre-existing edits and untracked files are outside this change and must remain untouched.
- **M1b (2026-11-16):** tasks 2.3–2.8 implemented and verified on `feat/interactive-ai-scene-studio-m1b` from exact M1a `a422cc78`, draft PR #216. Required real ChatGPT intake/identity/recovery passed; independent fixes re-reviewed through `7eadf503`. Architecture-owner code and glossary-owner reviews remain pending. No M2 started.
- **M1a (2026-11-16):** delegated access on `feat/interactive-ai-scene-studio-m1a` from `origin/main` `4033fd4c`, unmerged PR #212. M1b stacks on it and all of M1 merges whole. First real-host discovery/DCR/consent/read/disconnect qualification passed in the M1b session.
- Feature implementation: the planning session changed none. The **M0 session (2026-11-14)** migrated `apps/mcp` to MCP SDK 2.x and added the flag-gated, fixture-only `/mcp/studio-m0` proof endpoint; see "Latest implementation session" below. No migration, deployment or production runtime configuration was changed.
- Planning-context maintenance: `openspec/config.yaml` was corrected to acknowledge implemented accounts, guest rooms, grid detection and build/terrain support; it does not claim the Studio exists.
- OpenSpec progress is in tasks.md; local, real-host and production proof remain distinct. CLI artifact `done` / `isComplete` means planning files exist, not that runtime tasks or external reviews passed.
- First-release image/UVTT boundary: **confirmed by the user on 2026-11-14**. ADR 0073 architecture review: **accepted by Raymond on 2026-11-16 at `6f645f29`** (reported by the user, with Raymond present); ADR 0073 is now Accepted. M0 design amendments: **decided by the user on 2026-11-16** and applied to design.md (research.md "Design amendment decisions"). M0: **complete on 2026-11-16**, including a real-host run of the post-review server (see "M0 close-out" below). Production: **unverified**.

## Read order

1. [proposal.md](proposal.md): scope and exclusions.
2. [tasks.md](tasks.md): M0–M5 outcomes and verification.
3. [design.md](design.md): architecture, private working candidates, protected media and publication.
4. [requirements](specs/interactive-scene-studio/spec.md): testable behavior.
5. [research.md](research.md): observed baseline, primary sources and exact experiments.
6. [ADR 0073](../../../docs/adr/0073-interactive-scene-studio.md): architecture review packet.
7. [fresh-session-prompt.md](fresh-session-prompt.md): M0 starter to use after design approval.

## User direction carried forward

The user currently starts a build, copies its prompt into ChatGPT, supplies map/token images and switches back to Session Zero to see what happened. The Studio must address that friction during initial preparation, not only offer editing after preparation is finished.

The agreed direction is a raw-map journey with visible saved work and precise corrections inside ChatGPT, followed by final website review/publication. Users bring their own AI. Session Zero supplies deterministic tools. Private correction rounds should not require website acceptance after each edit.

The user explicitly selected **protected unpublished images**, including new Studio originals and derivatives. Do not downgrade this to unguessable public URLs for convenience. Previously public files cannot be retroactively described as never disclosed.

The user confirmed that image maps and AI-traced geometry fit the first release, with arbitrary editing of imported UVTT walls deferred and existing UVTT workflows preserved. They then asked about starting milestone research. Research can inspect code and primary documentation and update planning evidence; it does not itself authorize a runtime prototype or establish real-host qualification. The first milestone in the packet is M0; M1's auth/private-file implementation depends on the M0 findings.

The user wants autonomous implementation in fresh bounded sessions after the design is agreed. The latest session below records authorization for M1b and its real ChatGPT test. That authorization does not start M2 or permit merging/deployment; later milestones require their own instruction.

## Review points

The following are proposed defaults for the packet review, not unrecorded external approvals:

- ChatGPT web first; standard MCP Apps foundation; Claude compatibility follows available access.
- One active map and encounter per working context remains the proposed implementation scope. The image-first release boundary and deferral of arbitrary imported UVTT wall editing are now confirmed.
- Scoped OAuth for the hosted release; existing passes can support controlled proof/local workflows.
- Immutable candidates, stable authoring identities and server-enforced scopes. Conflicts preserve stale work and require regeneration; no automatic merge.
- Website-only final publication. Private working candidates can advance through chat corrections without an intermediate owner acceptance.
- M1 likely splits into M1a identity/delegation and M1b private storage/intake. M2 is the first useful visual preparation demonstration; M5 qualifies the complete journey.
- Future rehearsal, repainting, multi-owner collaboration, partial acceptance and public directory submission are outside the first release.

## Known baseline facts that matter

- Main contains AI terrain PR #194. It already uses native Base terrain, grid binding, owner choices, previews, blocked-footprint checks and transactional publication.
- The old standalone branch is reference only. Do not merge it, import its service/infrastructure or substitute its prior tests for this integration.
- Ordinary owner edits lock an entire build item. The new Studio proposal path must preserve that protection and close legacy overwrite paths for enrolled targets.
- Current setup writes protect against overlapping handler writes, but do not carry the AI's original inspected revision. Explicit revision tokens are required for Studio corrections.
- Existing draft files can be publicly read by random URL. Private files require a genuinely private storage/delivery plane, including fallback and direct-store paths.
- Current browser framing protections make whole-site embedding the wrong default. Serve an MCP UI resource with shared rendering components.
- The original builder capability specs remain in active changes, and some durable specs lag implemented behavior. Reconcile affected boundaries before final archival without rewriting unrelated changes during this planning step.
- Real connector qualification remains outstanding in the builder/terrain records. Earlier Cloudflare browser challenges did not determine origin MCP availability.

## Verification record

Planning checks to retain with this packet:

- OpenSpec root resolved to this worktree; no new project root or global store was created.
- `openspec validate interactive-ai-scene-studio --strict`: passes for the drafted proposal/design/specs/tasks.
- Markdown structure, relative links and whitespace: passes for all eight planning Markdown files and 17 local links. The capability contains 20 requirements and 43 scenarios; all 48 future tasks are unchecked.
- Final Git diff is checked before delivery. The planning packet is retained on its local documentation branch; use the reported planning commit as a fresh-session base. No push or merge is performed by this planning session.
- Runtime tests and builds are not claimed for planning-only Markdown/context edits. No real ChatGPT experiment or production probe was performed in this planning session.

## Starting a later milestone

After product review, M0 is the first implementation/proof session. Use its explicit starter. Check out the planning branch or a descendant containing this packet before starting; fetching main alone will not recover an unmerged local planning commit. A fresh session should verify `git status`, branch, baseline and predecessor before editing.

For M1 and later, require the predecessor's actual commits and evidence. Start from latest main only when that predecessor has merged; otherwise name the predecessor branch/commit explicitly. Do not silently overwrite or move branches already used by another worktree. Record new mainline changes that affect the plan.

The default authority is to complete only the selected milestone's implementation, tests, review and handoff. Commit/push/PR actions must follow the actual user request and applicable instructions. Merging, production changes, external consent and new paid services require their own authorization; do not treat a milestone title as blanket permission.

## Required handoff after each implementation session

Replace this section's latest-session entry with concrete facts and retain useful history separately:

- Selected milestone and exact completed/unfinished task IDs.
- Starting and ending branches/commits, with predecessor and merge status.
- What behavior now exists, including contract/storage changes and compatibility behavior.
- Which research questions were resolved, sources and selected approaches.
- Checks run and outcomes; distinguish automated, local-browser, actual-host and deployed evidence.
- Durable redacted screenshot/recording/request references. Do not commit credentials, private user art or authenticated URLs.
- Known defects, external prerequisites and exact reproduction steps. Never describe an unavailable check as passing.
- Product/architecture review status with the actual reviewer and reviewed revision when supplied.
- The next permitted milestone and a self-contained starter naming its base and remaining decisions.

## Latest implementation session — M1b, 2026-11-16

**Authorization and scope:** the saved M1b starter required research/discussion before code.
The user approved the researched D8/D9 design and autonomous implementation, including the
exact two download origins, 40-million-pixel bound and private-file publication refusal.
Design/ADR were recorded in `1a2f7639` before dependent code. The user then authorized the
real ChatGPT test and its registration, connection, selected-build consent and testing clicks.
Optional AWS test-bucket authorization was unused: no AWS CLI/MCP/account operation was needed.
Only tasks 2.3–2.8 were implemented; no M2 overlays, authoring context, revisions or publication aliases.

**Base:** `a422cc78e1c8b3cf1533e152e6ac74681411e421`, the unchanged unmerged M1a head in
PR #212. New worktree `/private/tmp/session-zero-studio-m1b`, branch
`feat/interactive-ai-scene-studio-m1b`. Main initially advanced from `4033fd4c` to
`c007fba33235db37c486907a6918b863d0965b68` (privacy/terms and guest tutorial animation).
During qualification it advanced another five commits to
`8c4f82a1d58fb224067fdc76a6fe274c6286c18d`: legacy attack-dice read upgrades/room render
recovery (#215) and tutorial pacing/practice-map changes (#214). The legacy upgrade touches
the same store files in imports/build-item/encounter conversion, outside Studio auth/media/jobs;
future main integration must retain both. No main merge/rebase. M1a and other branches/worktrees
were untouched; the original M1a worktree remains clean.

**Delivery:** [draft PR #216](https://github.com/RLinV1/Session-Zero/pull/216), base
`feat/interactive-ai-scene-studio-m1a`, head `feat/interactive-ai-scene-studio-m1b`.
Final product revision `7eadf5039f2689bf51f697e0ee044f43595688c5`; the final documentation
commit records host evidence and these check results. Exact pushed head is reported in the
session's final response/PR. Neither PR is merged. GitHub has no status checks attached to
this stacked base (the repository's PR workflow targets main); local results below do not
imply green hosted CI. The connector lacked create-PR permission, so the authenticated local
GitHub CLI created/updates the authorized PR.

| Commit | Content |
| --- | --- |
| `1a2f7639` | Approved exact D8/D9/ADR private layout, intake, recovery and cleanup before code; saved starter approval/corruption note. |
| `6dc65192` | Separate M1a correction: redact malformed credential JSON bodies. M1b only. |
| `a0f8e014` | Private disk/S3 adapters, intake/delivery, persistence/migrations/jobs, attachment/open/app-only tools, static en/zh-TW view, tests and host runbook. |
| `21bf18b9` | Actual 14-day sweep in both stores; true mobile viewport in synthetic host fixture. |
| `6128a46a` | M1a parser follow-up: case-insensitive OAuth/Studio routes. M1b only. |
| `334faed8` / `cce83927` | Review fixes: all S3 filenames qualified; owner session rechecked after private reads; stronger parser proof and safe probe cleanup. |
| `d6182741` | Test-only fix accepts revoked-or-swept grant after proving initially live. Independently re-reviewed. |
| `1e3b5b07` / `2729d389` | Earlier local evidence, handoff, M2 starter and initial PR receipt. |
| `1a8fbdce` | Host-found retained-status localization fix, regression and correct isolated Vite launch command. Independently reviewed and rechecked in ChatGPT. |
| `9eb51538` | Recovery refinement recorded in D8/ADR before dependent fix: pause failed refreshes until explicit Retry/open. |
| `28b09e99` | Prevent repeated dismissed host reconnect prompts; cancellation regression. |
| `7eadf503` | Review fixes: capture operation build/generation/kind before awaits; stale picker/device/import/binding results cannot affect another build; regression tests. Independently re-reviewed. |
| final documentation commit | Actual-host evidence, final checks/cleanup, tasks, research, review disposition and refreshed M2 starter. |

**Delivered:** new private originals/WebP previews use a separate disk directory or explicit
private S3 bucket, never public uploads/mirror/fallback. Guarded intake preserves exact original
hash, raw/oriented dimensions and canonical identity, counts preview quota bytes, deduplicates
receipts/content and retains per-file outcomes. Downloads enforce the approved exact origins,
public pinned DNS, size/time/redirect bounds and no forwarded credentials. The credential-free
content-hashed view obtains images only through authorized app-only calls and `data:` URLs;
open results contain identifiers/status. Reopen/reauthorization recovers saved state; foreign
bindings clear it. Failed refreshes pause until explicit recovery; pending UI operations remain
bound to their initiating context. Durable cleanup covers late writes, discard, account removal,
14-day abandonment and restart. Private dependencies cannot publish before M5; legacy/public
behavior remains valid. No shared room schema or delegated authority change.

**Checks:** Node 22.23.2, existing lockfile, fresh `npm ci`. On final product `7eadf503`,
`npm run lint && npm run typecheck && npm test && npm run build` passes: shared 1,885;
MCP 283; server 1,151 / 64 optional skips; web 1,937; benchmark 2. Full isolated Postgres/S3
server suite: 1,381 passed / five optional skips, including all six real private-S3 cases.
The first final database run inherited HTTPS `COOKIE_SECURE=1`, failing two existing HTTP-cookie
assertions; the entire suite passed after explicitly restoring `COOKIE_SECURE=0`, with no code
change. All 78 relevant Playwright checks pass across six fresh-server browser projects,
including true narrow layouts, cancellation pause/Retry and delayed operation context races.
Earlier unchanged-backend proofs include actual Docker Postgres/S3 restart with recovered
grant/source/retried deletion, additive migrations/schema diff, local MCP container build/health,
and actual selective-public S3 controls. OpenSpec strict validation and local links pass.
[Earlier local evidence](evidence/m1b-2026-11-16.md) preserves revision-specific counts.

**Actual host:** [durable redacted qualification](evidence/m1-host-2026-11-16.md), ChatGPT web
Work / Plus / GPT-6.1 Terra · Light in native Chrome. Actual discovery/DCR, cancelled consent,
selected-build consent, granted reads/unselected refusal, composer map+token originals,
inline/expanded source/identity, host picker and device intake/deduplication, en/zh-TW,
reopen/reload, website disconnect and explicit Retry/same-owner reauthorization passed.
Independent recorded/disk/owner-download hashes match both committed fixtures; two files
remain after repeat selections, with zero prepared items. The final `7eadf503` resource passed
disconnect dismissal and explicit Retry in a fresh conversation. Deliberate host expiry/corrupt
batch, second-owner reauthorization and narrow/keyboard host exercises were not repeated;
automated/M0 evidence remains separately labelled. Old cached template cards may need Refresh
tools plus a new open call after a resource-version change; permanent old-template replay is
not claimed.

**Independent review:** the separate read-only reviewer established and re-reviewed the core
S3 suffix, owner-session race and mixed-case redaction defects, including the stronger parser
assertion and test-isolation fix. It reviewed the host localization change, then reproduced
two context races in the recovery fix. `7eadf503` resolves stale binding and pending picker/
descriptor/device/import effects. Final independent re-review through `7eadf503`: no remaining
findings. The subsequent 78 browser checks pass. This is not architecture-owner review.

**Isolation and cleanup:** earlier local project `sz-studio-m1b-20261116` was removed before
the host run. Host/final-check project `sz-studio-m1b-0fcf88a7` used Postgres17 on55434,
authenticated SeaweedFS on18334 and separate throwaway buckets/config. The host used private
local disk. One root Vite command briefly launched the owned process on default5173; it was
stopped immediately without test requests and the runbook now uses the workspace command
with `--strictPort` on5189. No existing development service/database/bucket was used or changed.
Website discard/account deletion left zero synthetic users/builds/files/grants/tokens and zero
private files; three generated-key-only delayed verification jobs remained under their safety
lease. The temporary M1 ChatGPT app was uninstalled; earlier M0 apps were untouched. Synthetic
test chats/artwork remain in ChatGPT history/Library. Tunnel stopped, then server/MCP/Vite;
no listeners on3109/3119/5189. Compose `down -v` removed both containers, volumes and network;
the owned credential/config/media directory was deleted. No raw authenticated logs or account
profile screenshots were committed. No AWS, production, DNS or edge changes.

**Remaining gates and merge plan:** tasks 2.3–2.8 are verified; architecture-owner code review
and glossary-owner review remain pending. Keep PR #212 and #216 unmerged until the user directs
the whole-M1 merge to main. Production is unverified. The [M2 starter](fresh-session-prompt.md)
names **that whole-M1 merge into main** as its base and requires the actual host/review records;
do not use an unmerged M1b head or start M2 now.

## Previous implementation session — M1a, 2026-11-16

**Authorization:** the user's M1a starter (saved in [fresh-session-prompt.md](fresh-session-prompt.md) "M1a"): tasks 2.1–2.2 only; commit, push and open a PR, no merge; no production, DNS, edge or cloud change; real ChatGPT check optional and only on the user's yes. Recorded approvals: ADR 0073 accepted by Raymond at `6f645f29` (reported by the user); M0 amendments approved by the user on 2026-11-16; implementation choices inside D7 pre-approved in the starter. Nothing on the starter's stop list (external IdP or OIDC, `packages/shared` schema change, owner-choice/publication/room/GM/library authority for a delegated credential, other authority or privacy change) was needed or done.

**Base and branch:** `origin/main` `4033fd4cbfbf192e0006d2297be153832bad7947` (PR #209), unchanged when fetched. Worktree `/Users/chrispsimadas/Projects/VirtualTableTop/studio-m1a`, branch `feat/interactive-ai-scene-studio-m1a`. No other worktree or branch was touched; the user's running `cse416` dev stack and its database were not used.

| Commit | Content |
| --- | --- |
| `67bae769` | Task 2.1: the implementation record in design.md D7 and ADR 0073, before dependent code. |
| `faac0408` | Server: authorization server (`http/studioOAuth.ts`), records and both adapters, additive migration `20261116120000_studio_delegated_access`, `/api/studio/builds/*` with `grantGuard` and the write-time recheck, password change and account deletion, catalog text. |
| `f668ceff` | MCP: `/mcp/studio` verified by introspection; pass and Studio tools share one definition; `/mcp/build` tools unchanged (names, schemas, order). |
| `e954e50b` | Test typing fix. |
| `079895cb` | Web: consent page `/studio/connect`, connections on the build page, en/zh-TW, Vite proxy and `deploy/Caddyfile` discovery routes (repository only), Playwright spec. |
| `16ee1de5` | Independent review fixes (below). |
| later commit | These records, glossary terms, starters. |

**What now exists:** see design.md D7 "M1a implementation record". Everything is off unless `STUDIO_PUBLIC_ORIGIN` is set on both `apps/server` and `apps/mcp`; no deployment file sets it. The delegated tools are the pass tools' reads and draft writes (no upload, removal, choices, pass or publication). Build files are still the existing public `/uploads` files: M1a adds no private media, so the Studio must not be offered to users with private artwork before M1b.

**Checks (all local; no real host):**
- `npm run lint && npm run typecheck && npm test` on `16ee1de5`'s code: exit 0. Shared 1,885; MCP 279 (19 files); server 1,095 passed, 57 skipped (Postgres-only); web 1,937; scripts 2.
- Server suite with `DATABASE_URL` on an isolated throwaway Postgres 17 container (`studio-m1a-test-pg`, port 55433, database `vtt_m1a_test`): 1,311 passed, 4 skipped. `prisma migrate deploy` applied cleanly, and `prisma migrate diff` against the schema reported no drift.
- Postgres race test: a revocation waits for a delegated write that holds the grant; with the `FOR SHARE` line removed the test fails (mutation check run and reverted).
- Playwright `browser/studio-connect.spec.ts` on chromium-desktop, chromium-touch, firefox-narrow and webkit-desktop: 20 passed (consent, refusal, unregistered redirect, zh-TW, sign-in return, disconnect, no sideways scroll). Screenshots stay in Git-ignored `test-results/`.
- `deploy/Caddyfile`: `caddy adapt` with stock `caddy:2` (rate-limit plugin block removed) succeeds and includes the new paths.
- Independent diff review: a separate agent reviewed `4033fd4c..079895cb`. It found no leak of data or authority across owners and reported 10 findings, all fixed in `16ee1de5`: a per-address lockout of shared AI host addresses; an open redirect via registered URIs on the consent page; a registration flood holding the client cap; a race test that proved nothing; the write-time clock; partial batch reporting; racing code or refresh reuse; foreign-key races in sweep and deletion; an untranslated "Unnamed app"; bidi characters in client names. The fixes were not re-reviewed by a second independent pass.

**Evidence labels:** all of the above is [L] local. The real ChatGPT check (optional) was **not run**; M1a is unqualified in a real host. Production: unverified and untouched.

**State left behind:** the throwaway Postgres container `studio-m1a-test-pg` is stopped and removed at the end of the session (see the final report). No tunnel, no ChatGPT connector change, no account data used.

**Pending:**
1. Merge plan (user decision, 2026-11-16, after this session): PR #212 stays open and unmerged; M1b is built on this branch and all of M1 merges to main together. Architecture owner review of the code is not recorded; ADR 0073 lists it as open for the PR.
2. Real ChatGPT run against `/mcp/studio` with a synthetic dev account (DCR, consent, a granted build read, disconnect). The user chose to do it once, at the end of M1b (task 2.8). A local smoke launch of this branch with Studio on (isolated Postgres, uploads on local disk) served the discovery documents and an OIDC 404; nobody clicked through the consent page before it was shut down.
3. Glossary rows added for 建置, AI 應用程式, 連接／中斷連線 and 允許 are marked pending glossary owner review.
4. Deployment prerequisites when it is time: `STUDIO_PUBLIC_ORIGIN` on both services and the Caddyfile routes; not before M1b's private storage.

**Next:** M1b (tasks 2.3–2.8) on a branch from this branch's head, as a stacked PR onto it; starter in [fresh-session-prompt.md](fresh-session-prompt.md) "M1b". Note for local runs: outside production apps/server uses any object storage it finds at 127.0.0.1:8333, which can be the user's dev SeaweedFS; set `S3_ENDPOINT` or `S3_AUTODETECT=0`.

## M0 close-out, 2026-11-16

**Authorization:** the user was present. At their request the agent restarted the quick tunnel and test server, created and connected a new personal plugin "Session Zero Studio M0 (test 2)" in their Chrome, fixed the region drag, and recorded results. The user ran the chats and the device file picker, and ran an independent code review in a separate session. No M1, PR, merge, production change or provisioning.

**Commits on `feat/interactive-ai-scene-studio-m0`:**

| Commit | Content |
| --- | --- |
| `63b1e91a` | Region drag no longer starts the browser's native image drag; cancel handling and clamping. Confirmed live by the user. |
| `f87ebac7` | Review fixes: thin-crop marker crash, evidence log can't reject, bounded `STUDIO_M0_ACCESS_TTL`, non-form OAuth bodies answer 400. |
| `bc105bee` | Review fixes: queued atomic `clients.json`, DCR cap (100) with unused-client expiry, revocation limited to the caller's own token family. **Behavior change:** revoking an access token also revokes its refresh token. |
| `fadf121d` | Review fixes: view URI hashed once; imports checked without a full raw decode and capped at 5 per workspace; **one `createMcpHandler` per route** with the Express request carried in `AsyncLocalStorage`, instead of one handler per request. This changes how every `/mcp`, `/mcp/build` and `/mcp/studio-m0` request is served. |
| `3517078b` | Cleanup: dead code, unused `@modelcontextprotocol/express`, player tool schemas wrapped in `z.object`. |
| later commit | These records. |

**Results (real ChatGPT web, same surface; details in the evidence file's "Follow-up run"):**
- Device upload (`uploadFile`) and `selectFiles`: byte-identical; both use `sediment://` ids and the Azure Blob origin, with 10-minute links (the composer link on 2026-11-14 lasted 5).
- `ui/message` while the model was answering: the host **stopped the current answer** and posted the request; the model read it by id within ≈5 s (2/2). No refusal or timeout was ever returned. Task 1.7 is checked on this basis.
- "Show the Studio again" did not make the model reopen it; the existing view stayed in place. A second open call was not tested.
- Region drag fixed and confirmed.
- New host facts 10–13 are in research.md.

**Checks:** on `3517078b`, `npm run lint`, `npm run typecheck` and `npm test` exit 0; the MCP workspace has 18 files / 271 tests. The implementing agent read the review commits, including the request-serving change, and found no defect. Through the tunnel, the reviewed server answered health 200, an unauthenticated MCP request 401 and a JSON token request 400.

**Qualification:** M0 is qualified. The post-review server (`3517078b`) passed a real-host run after the review: reconnect, a model import of a chat attachment, open, and app-only media calls (evidence file, "Follow-up run"). That run also showed chat-attachment import works when the user asks the AI to set up the Studio with the attached map, which led to the revised intake decision (research.md amendment 15).

**State left behind:**
- Tunnel and test server stopped at the end of the session; the `ripe-resort-…` address is dead, so both ChatGPT test plugins now point at nothing.
- ChatGPT: plugin "Session Zero Studio M0 (test 2)" installed; the old "Session Zero Studio M0 (test)" still points at a dead address. New test chats and the `m0-device-upload` fixture are in the user's history and Library.
- Fixture file outside the repo: `/Users/chrispsimadas/Projects/VirtualTableTop/m0-upload-fixture/m0-device-upload.png` (synthetic).

**Design decisions (2026-11-16):** all proposed amendments approved, with 5a (own OAuth server) and 6a (≈8-hour tokens); intake revised so chat attachments are a primary route; the "Send selection" interruption warning declined. Applied to design.md D2/D7/D8/D9 and ADR 0073.

**Next:** merge or otherwise publish the M0 branch (it also carries the unmerged planning commit), then start M1a from a starter prompt naming the merged base. M1 was not started.

## M0 overnight session, 2026-11-14 (autonomous)

**Authorization:** the user authorized autonomous overnight work to complete M0. That covered driving their logged-in Chrome to add a test connector and run ChatGPT test chats, installing `cloudflared` for a quick tunnel, and committing and pushing the branch with no PR. It did not authorize M1, a PR, a merge, production changes or cloud provisioning, and none were done.

**Branches/commits:** research on `docs/interactive-ai-scene-studio-m0-research` (`497eda71`, from planning commit `5159b88a`). M0 on `feat/interactive-ai-scene-studio-m0`, which descends from it:

| Commit | Content |
| --- | --- |
| `5f0d7919` | `apps/mcp` moved from `@modelcontextprotocol/sdk` 1.32.2 to `server` 2.4.0 / `node` 2.1.2 / `core` + `client` 2.4.0 / `express` 2.0.2, with `ext-apps` 2.0.4 (exact pins). 2025-era requests keep the per-request JSON transport; 2026-07-28 requests are served by `createMcpHandler` in JSON mode. New `test/protocolEras.test.ts`. One test adjusted: v2 answers an unknown tool with a protocol error instead of an `isError` result. |
| `2190ec48` | Flag-gated `/mcp/studio-m0` (`STUDIO_M0=1`, `STUDIO_M0_ONLY=1`): inline `ui://` view, 9 tools, fixture store, bounded downloader, overlay-marker crops, stub OAuth server and resource check. `test/studioM0.test.ts`. |
| `90e11bc8` | Fixes found in the live run: stop answering the OIDC well-known path, content-versioned view URI, persisted DCR clients, media-size probe, expiry hint and operator descriptor replay. |
| later commits | Evidence, `apps/mcp/README.studio-m0.md`, research/tasks/handoff updates. Resolve the exact HEAD with Git. |

The predecessor planning branch is unmerged; this branch carries it. Nothing outside `apps/mcp`, `package-lock.json` and this change folder was modified. `/mcp` and `/mcp/build` behavior is unchanged apart from the SDK swap and the unknown-tool error form.

**What now exists:** a proof endpoint only. It touches no Session Zero builds, accounts, storage, room server, shared contracts or web UI, and its state is in memory. It is off unless `STUDIO_M0=1`.

**Results (real ChatGPT web, Work mode, Plus, GPT-6.1 Terra · Light):** see the research.md section "M0 host results" and [evidence/m0-2026-11-14.md](evidence/m0-2026-11-14.md).
- Pass: view render and fullscreen panel; SDK v2 / protocol `2026-07-28` (no `initialize`); DCR + PKCE + `resource`; app calls carry the bearer; mounted-view refresh in ≈2.3 s; reopen recovers backend state; byte-identical originals by two routes; 5-minute descriptor expiry refused with HTTP 403; model-visible crops 2/2 with a refusing control; selection request traced to the model's read; expired/revoked/foreign access refused with no bytes; `data:` media up to 8.4 MB.
- Design-affecting findings (research.md "New host facts"): template/tool snapshotting per connector version; tool results are retained and re-delivered regardless of later authorization; `blob:` images blocked; two different host file origins; Library retention of attachments; no token refresh on 401; OIDC default when advertised.

**Checks:**
- Automated: `npm run lint` and `npm run typecheck` exit 0; `npm test` exit 0, with 5,101 passed and 56 skipped. The skips are server optional-service tests; the MCP workspace has 17 files / 260 tests, up from 245.
- Local probes: recorded in research.md.
- Actual host: everything above.
- Deployed/production: none.
- Diff review: by the implementing agent only, so an independent review is pending.

**State left behind:**
- Tunnel and server **stopped**. The trycloudflare URL is dead, so the ChatGPT connector "Session Zero Studio M0 (test)" now points at nothing. It is **still installed** in the user's ChatGPT (Plugins → Personal → … → Uninstall to remove).
- Test chats remain in the user's ChatGPT history ("Open Test View", "Describe Image Mark", "Import error reported", "Open Session Zero View", "Import Map File Report").
- The synthetic `e2-fixture-map` is in the user's ChatGPT Library.
- `cloudflared` remains installed via Homebrew.
- Private evidence, keys and the fixture registration are in Git-ignored `apps/mcp/.local/studio-m0/`.

**Pending before M0 is fully qualified (all three resolved on 2026-11-16; see the close-out section):**
1. **View device upload** (`uploadFile`): needs a person at the browser, since a native file picker opens inside the sandbox. Run the README steps; in the Studio view, use "Upload from this device" with a synthetic PNG; confirm the stored SHA-256 matches. The tunnel URL will be new, so recreate the connector or edit its URL, then **Refresh tools**.
2. **`ui/message` refusal/timeout** (task 1.7): try "Send selection to chat" while the model is still answering, and record what the host does.
3. **Independent diff review** (task 1.9) of `5f0d7919..HEAD` in `apps/mcp`, then rerun the repository checks.

**Review status:** product review of the packet and the ADR 0073 architecture review remain **pending**. No reviewer has seen this work.

**Next:** finish the three pending M0 items, then review the design amendment candidates in research.md (D2, D7, D8, D9) with the user and the Real-Time Architecture owner before M1. M1 (M1a delegated access, M1b private storage and intake) is **not authorized** by this session and was not started.

## Research session — M0 research, 2026-11-14 (before the M0 run)

**Requested scope:** research M0 only, without implementing application code or building the prototype. Requested deliverables: resolve or investigate SDK/ext-apps compatibility, rendering and refresh, original-image transfer and model-visible crops, selection-to-chat, and scoped OAuth with protected images. Then recommend one approach and a bounded M0 plan, and update this file and research.md. No deployment, provisioning or M1.

- **Branch/worktree:** new branch `docs/interactive-ai-scene-studio-m0-research` from planning commit `5159b88a`, worktree `/Users/chrispsimadas/Projects/VirtualTableTop/studio-m0-research`. A new branch was used because `docs/interactive-ai-scene-studio-plan` is already checked out in `/private/tmp/session-zero-studio-planning`; that worktree was not touched. `origin/main` is `16a9262a` (+1 web-only commit since `a86160f5`, irrelevant to M0 paths).
- **Preserved:** `feat/mcp-scene-preparation` (`2d19d1ec`, local-only) and its worktree's uncommitted files were read, never modified. The original session worktree was not edited.
- **Changed:** `research.md` (new "M0 research — 2026-11-14" section; R9 note) and this file. No code, dependency, lockfile, tasks.md checkbox, deployment, tunnel, OAuth registration or host connection.
- **Checks:** documentation-only change; runtime tests not claimed. Local protocol probes ran against installed SDK packages outside the repo (recorded in research.md Q1). Primary sources were read on 2026-11-14 (R1–R3, R14–R21).

### Conclusions (details and labels in research.md)

| Question | Status | Conclusion |
| --- | --- | --- |
| SDK/ext-apps | Recommendation; local probes only | Migrate `apps/mcp` to SDK v2 (`server` 2.4.0, `node` 2.1.2, `core`/`client` 2.4.0) with `createMcpHandler({ legacy: "stateless" })` and ext-apps 2.0.4. v1 1.32.2 returns HTTP 400 to `2026-07-28` requests (observed locally), and ChatGPT was seen sending `2026-07-28` (old branch). |
| Render/refresh | Documented; unobserved | One `open` tool carries `resourceUri`. The spec does not deliver later tool results to an open view, so poll app-only reads while visible and recover from the backend on reopen. |
| Originals / crops | Documented, plus prior observation without a view | fileParams original transfer and model-visible MCP image blocks were observed on 2026-11-12 (old branch, no MCP Apps view). Widget file helpers are OpenAI extensions with undocumented limits. Crops must be tool results; image model-context is unsupported on web. |
| Selection→chat | Documented; unobserved | Save a request through an app-only tool first, then `ui/message` naming its ID (ChatGPT defaults to `send: true`). Track handed off vs observed via the model's later read. |
| OAuth / media | Proposed; unobserved | Session Zero as authorization server issuing opaque hashed delegated tokens, verified by `apps/server` via introspection. Media goes through app-only host-proxied tool bytes rendered as `data:`/`blob:`, with no public URL. Whether app calls carry the bearer is unobserved. |

**Design amendment candidates (not applied; need review):** D2 could state that polling is required by the spec, not optional. D8 could record that `data:` is the spec's default-allowed image scheme while `blob:` is unproven. D7 could name the proposed introspection-based grant verification. D9 already excludes bulk bytes in JSON tool arguments, so the view-file route must use host file helpers.

### Required user decisions and access before M0 execution

1. **Authorization to start M0** with the recommended approach: the SDK v2 migration of `apps/mcp` plus a flag-gated fixture-only `/mcp/studio-m0`. The packet's product review remains pending; this research is not that approval.
2. A **ChatGPT web account** whose plan and workspace policy allow adding a custom MCP server with OAuth (old branch path: Plugins → + → Add custom MCP server). The user performs the chat actions and consent, and transcribes or screenshots results, because browser automation was unreliable last time.
3. An **authorized public HTTPS development endpoint**: a user-chosen tunnel to local `apps/mcp`. No production, DNS or edge change is implied.
4. **OAuth test setup:** the stub authorization server rides the same tunnel. The user copies the exact ChatGPT callback URL and signs in with the fixture test identity. An external IdP (such as Cognito) needs separate provisioning authorization and is not the default.
5. **Fixtures:** synthetic, non-sensitive map PNG and token art generated in the session. No private art.
6. Chrome with devtools access to capture console/CSP output from the view.

### Proposed M0 execution steps

1. Preflight per tasks.md 1.1: verify this branch/commit, fetch main, confirm `apps/mcp`/build paths are unchanged, then record surface, plan, model and browser (E0).
2. Migrate `apps/mcp` to v2 with exact pins. Run the existing MCP tests plus local dual-era probes for `/mcp`, `/mcp/build` and `/mcp/studio-m0`, then `npm run lint && npm run typecheck && npm test`.
3. Build `/mcp/studio-m0` (fixture store, inline `ui://` view, eight M0 tools, stub AS, bounded downloader) with unit tests for auth refusal/expiry/revocation, download bounds and hash checks.
4. Ask the user for items 2–4 above. Then run E1 → E6 in real ChatGPT web in that order, because rendering and auth gate the rest. Record each result with its label.
5. Run E7: independent diff review and repository checks. Update research.md, this handoff and tasks.md, checking only boxes whose real-host criterion passed. Raise any host limitation as a concrete design amendment before M1.

Unresolved questions are numbered 1–10 in research.md. None blocks starting M0. Items 2, 4, 5 and 6 are what E5/E6/E2 exist to answer.
