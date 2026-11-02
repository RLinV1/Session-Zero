# Grid preparation before revealing setup

Branch: `feat/classical-lsd-grid`. This follow-up extends the unmerged `classical-lsd-grid-detection` change and ADR 0045. No merge or deployment is included.

## Behavior

Unconfigured raster uploads and pending library reopening/selection first open a centered waiting view in the existing setup modal. The canvas, fields, tabs and save/apply actions mount only after preparation. Status is Checking grid…, Waiting to fit grid… or Fitting grid…. Valid queued/running responses can continue indefinitely; each individual status request has a 10-second timeout.

The private draft and editable phase update together, so its first visible grid already uses a usable estimate. Units and line style survive adoption. Configured maps, UVTT grids and shipped calibrations bypass waiting. Completed no_grid and failed fitting open manual setup with a neutral explanation; missing or denied analysis falls back quietly.

X is labelled Set up manually while waiting. X, the visible manual action, Escape and backdrop reveal the retained upload and immediately latch manual intent. Background analysis and session-level polling continue; later results require Use suggestion. Automatic adoption never runs after setup becomes editable, including across tab changes, typing, the first anchor, discard and completion races. The canvas receives focus after preparation, status announcements are polite, and reduced motion disables spinner animation. Normal closing prompts resume afterward. Saving and room placement remain explicit.

Runtime changes are limited to web preparation, polling and modal presentation. The existing acceptance runner now handles the optional manual-wait action and records `browser_wait_skipped` alongside its editor-availability measurement. Endpoints, database records, detector fingerprints, queue scheduling and Python processing are unchanged.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run build`, OpenSpec strict validation and `git diff --check` passed. Build retains the existing large-chunk/public-asset notices.
- The full `npm test` run passed 720 shared, 554 server, 892 web and two latency tests: **2,168 passing**, with one existing environment-dependent server skip. Postgres tests used a dedicated `vtt_grid_preparation_tests` database; Redis tests used database 1 on the isolated QA service. Node's experimental Web Storage was disabled for jsdom.
- The 34 new preparation tests cover initial lookup, queue/running transitions, cached completion without advancing timers, the first visible geometry, units/style preservation, library and room upload modes, pending library selection, every dismissal path, completion/skip ordering, first-anchor/typing protection, tab remounts without duplicate requests, target switching, unmount, absent/denied results, terminal errors, request failures/timeouts and recovery. Responsive queues were exercised for 39 seconds without a loading deadline; both initial and subsequent status requests were tested at the 10-second request boundary. A separate race case models completion being computed eagerly before commit: skipping restores the draft from the waiting frame rather than inheriting that pending completion.
- Existing explicit saving, private room preparation, UVTT and detector invocation-count tests remain passing, including cached polling/reopening and placement without re-analysis.
- All 49 existing grid/fitter/supervisor and wall Python tests passed in the pinned Python 3.11 environment.
- All 24 grid and six UVTT Playwright cases passed across Chromium desktop/touch, Firefox desktop/narrow and WebKit desktop/touch against the isolated Docker app. After strengthening the eager-completion race guard, the 12 fitting/skip cases were repeated on the rebuilt final app and passed in every profile. Checks cover initial status/queue/running transitions, first-frame geometry, canvas focus, reduced motion and X/manual/Escape/backdrop skip alongside the existing saving, first-anchor/typing, map-switching, denied-polling and UVTT flows. Desktop and narrow waiting/editor screenshots were reviewed; the waiting modal exposes a real clickable backdrop.

## Integration with current main — 2026-10-29

Merged main through `039ab27` (PR #130), retaining its Sight step, editor guides, detected-wall preview, token-placement dialog, account upload limits and per-map shipped seeding alongside grid preparation and the recovery index. The grid ADR is now 0045 because main assigned 0044 to line of sight.

The latest merged frontend passed all 999 web tests, including all 39 preparation cases and ten editor-guide cases. Preparation checks also verify that the Guide button is absent while waiting and appears with the fitted editor. The token-placement regression verifies that an estimated grid stays private through confirmation, preserves units/style and exposes the Sight tab only after preparation. Earlier integration checks passed all 796 shared tests and 128 focused server integration/store tests, with 31 external-service cases skipped; the subsequent main changes are frontend-only. Repository lint and full typechecking passed; the regenerated Prisma client includes both changes' schema fields. No temporary images or changes to the user's running Docker stack are included.

## Isolated Docker and real fitting

Verification used the complete stack in the separate `vtt-grid-preparation-qa` Compose project, with independent volumes and localhost ports: Postgres 55440, Redis 56390, S3 58334, grid service 58092, API 58110 and web 58190. The user's `vtt-grid-qa` containers and original checkout are preserved. Docker images use the pinned Python detector and Node 22; application tests ran on the host with Node 26.

After verification, the QA containers and network were stopped/removed; their independent volumes and evidence were retained. The original seven `vtt-grid-qa` containers remained running. The original checkout still has exactly its pre-existing modified lockfile and untracked skill/tmp paths; all implementation edits are in `/private/tmp/vtt-classical-lsd-grid`. No merge or deployment was performed.

A Chromium smoke check uses real HTTP analysis responses without interception and a generated 3600 × 3000 raster grid, with real queued work ahead of it. It verifies a Fitting grid… to editable transition, canvas focus and the first visible geometry. The observed candidate is 80.10072679827948 px with offsets 6.770104796295698 / 12.96661874436339 px; the first visible cell-size observation is exactly that candidate. The library grid remains null before explicit Save. Reopening reuses the cached candidate. X skip preserves a typed 71.5 px cell size after the server completes and caches its suggestion. Direct room upload also waits for real fitting privately; WebSocket placement counts advance only after explicit placement/Apply.

Raw logs, configuration, screenshots and JSON evidence live outside git in `/private/tmp/vtt-grid-preparation-qa/`. Key artifacts are `npm-tests-final.log`, `preparation-tests.log`, `python-tests.log`, `lint.log`, `typecheck.log`, `build.log`, `playwright-grid-final.log`, `playwright-grid-races-final.log`, `playwright-uvtt-final.log`, `real-transition.json` and `real-transition.log`. Synthetic artwork and screenshots are not committed. Earlier detector parity/resource measurements remain in [QA-classical-grid.md](QA-classical-grid.md); their former immediate-editor availability timings do not describe this waiting interaction.

## Reproduction

Use isolated services and data. The Docker override and Playwright configuration in the evidence directory select separate ports and all six configured profiles. Restart only the isolated QA server between grid and UVTT groups: combined repeated smoke/browser runs otherwise exhaust the unchanged per-IP signup allowance of ten accounts per hour. An initial matrix run passed 24 cases before six cases stopped at signup with HTTP 429; these were test setup failures, before map setup was exercised.

```sh
npm run lint
npm run typecheck
NODE_OPTIONS=--no-experimental-webstorage npm test
npm run build
openspec validate classical-lsd-grid-detection --strict

npm exec -- playwright test browser/grid-detection.spec.ts \
  --config=/private/tmp/vtt-grid-preparation-qa/playwright.docker.config.mjs
# Restart the isolated QA server to reset only its in-memory test-account limiter.
npm exec -- playwright test browser/uvtt.spec.ts \
  --config=/private/tmp/vtt-grid-preparation-qa/playwright.docker.config.mjs
node /private/tmp/vtt-grid-preparation-qa/real-transition.mjs
```
