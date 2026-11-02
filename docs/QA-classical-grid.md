# Classical LSD grid estimates — local verification

The subsequent [grid preparation revision](QA-grid-preparation.md) waits before revealing setup and supports an explicit manual skip. The editor-availability timings below describe the earlier interaction; detector/cache/resource evidence remains applicable.

Implementation branch: `feat/classical-lsd-grid`, isolated worktree `/private/tmp/vtt-classical-lsd-grid`, based on fetched main `5a8a420`. No merge or deployment. ADR 0045 remains proposed pending architecture-owner review. The supplied images and original experiment/environment/results were read without modification; they are not included in the branch.

## Behavior and contract

New PNG/JPEG/WebP map uploads analyze asynchronously. Original bytes are preserved; actual EXIF-oriented dimensions and source SHA-256 come from the uploaded file. Default analysis ceiling is 16,000,000 pixels, separately from the existing 25 MiB upload and dimension limits. Oversized/invalid input records a terminal error and retains quiet manual setup. Tokens, UVTT grids and shipped calibrations do not enqueue grid analysis.

Pillow EXIF transpose and L conversion, original-size OpenCV LSD STD settings, 1° filtering, 20 px minimum segments, interval-union support, spacing search/ranking, 4 px fit tolerance and canonical fractional offsets match the reviewed experiment. `best_candidate` remains the suggestion even when diagnostic gates fail. No confidence probability is returned or shown. Known aliases and suggestions on gridless artwork remain: this change makes no accuracy claim.

Source/configuration/attempt guards protect both memory and Postgres cache reads, claims and completions. Nullable additive migration leaves old metadata unavailable without backfill. Equal bytes in separate uploads analyze independently. Completed candidates and `no_grid` remain separate from saved grids. Authorized polling and editor reopening never enqueue work.

Untouched unconfigured drafts prefill once per editor session. First-anchor placement, keyboard alignment, typing, explicit adoption, discard, save, dismissal and access loss latch manual intent independently of value equality. Units and line style are preserved. `Use suggestion` remains available. Unconfigured library selection opens private preparation before explicit placement; configured selection keeps its placement path.

BullMQ global concurrency is one across dispatchers. Without Redis there is one active job and eight pending slots; overflow remains queued in the store. The lightweight HTTP supervisor admits one request and uses a new child for every analysis. Busy admission defers without advancing attempts; transient execution errors stop after three attempts. Default processing/HTTP/stale deadlines are 30/40/90 seconds. Timed-out children terminate and are reaped.

## Verification

- Required lint, typecheck, full npm tests and build passed. The final full run passed 720 shared, 554 server, 858 web and 2 latency tests (2,134 total); one existing environment-dependent server test was skipped. Postgres and Redis grid tests ran against isolated local services.
- All 49 Python grid/wall tests passed under Python 3.11.17, OpenCV wheel 4.8.1.78, NumPy 1.26.4 and Pillow 11.1.0. Coverage includes decoded EXIF dimensions, PNG/JPEG/WebP, oversized/invalid input, fractional fitting, ranking despite diagnostic rejection, busy admission, disposable processes and timeout/reaping.
- Store/dispatcher checks cover candidate/no-grid/error persistence, independent duplicate uploads, duplicate jobs, source/version/attempt invalidation, source-byte changes, stale completion rejection, three-attempt recovery limits, deletion, bounded overflow and global concurrency across two dispatchers.
- All 12 new grid Playwright cases passed in Chromium, Firefox and WebKit, with desktop and narrow/touch configurations. They cover once-only prefilling, equality-independent manual intent, delayed first-anchor/typing results, saved-grid protection, discard across tabs, cancellation, superseded map responses, denied polling and unconfigured library selection.
- All six existing UVTT browser cases passed after stale selectors were corrected: wall strokes now live on individual lines, the first fixture point maps to pixel zero because it equals `map_origin`, and the editor exposes two Close actions. Product wall/UVTT geometry was unchanged by those test repairs.
- OpenSpec strict validation and `git diff --check` passed.

Node's native experimental Web Storage was disabled for the npm test run so jsdom supplies browser storage. Build output retains existing chunk-size/public-asset warnings. The acceptance script recorded Node v26.9.0; the project supports Node >=22.

## Detector parity and performance

[Machine-readable evidence](classical-grid-evidence.json) contains component distributions and all 27 geometries. Both the unoptimized application port and final implementation ran three identically shuffled passes: 81 actual LSD invocations each, one fresh process per map. A separate replay fitted all 27 saved segment sets with zero LSD invocations.

Every request matched the historical reviewed candidate within 1e-6 pixel, and all 27 raw LSD segment counts matched the saved detections. Maximum observed differences were 5.69e-14 px in spacing, 1.40e-12 px in X phase and 1.01e-12 px in Y phase. There were no unexpected period or phase changes. Existing Outpost/Guild Hall aliases, half-period bundled-map suggestions and gridless-art suggestions were deliberately preserved.

The retained optimization scores seed phases without building detailed residual/regression diagnostics, then computes those for the identical winning phase. It preserves the arithmetic/order used for ranking. No new detection thresholds, period corrections or confidence gates were added.

| Component, seconds | Baseline median | Final median | Baseline p95 | Final p95 |
| --- | ---: | ---: | ---: | ---: |
| Decode/EXIF | 0.100 | 0.089 | 0.216 | 0.209 |
| Grayscale | 0.0066 | 0.0064 | 0.0157 | 0.0131 |
| Array preparation | 0.0031 | 0.0030 | 0.0066 | 0.0061 |
| LSD | 0.462 | 0.473 | 1.088 | 1.077 |
| Coordinate/list adapter | 0.0015 | 0.0014 | 0.0030 | 0.0030 |
| Fitting | 1.825 | 1.248 | 5.348 | 3.870 |
| Processing | 2.643 | 1.984 | 6.030 | 4.470 |
| Process launch through exit | 2.821 | 2.200 | 6.292 | 4.653 |

Median fit time fell about 32%; median processing fell about 25%. Fresh-process throughput was 0.312 → 0.418 maps/s. Peak child process high-water memory remained approximately 0.769 GiB in both runs. Baseline had one 17.55 s process-launch/exit outlier outside the maximum 6.34 s processing interval; final launch/exit maximum was 4.92 s. Component medians are independent and do not sum to the total median.

These are local development-machine measurements with warm file caches and no reserved host; some unrelated verification ran during development. They are not a hosted-performance estimate. Although the code requests one OpenCV thread, this macOS GCD build reports 10, matching the prior experiment; one active analysis is enforced independently. The Python runner's batch queue wait is a sequential-enqueue model; actual service queue measurements follow separately. Rendering was excluded from timed runs.

## Real application run with wall analysis

The final run used real upload HTTP endpoints, Postgres, Redis/BullMQ, the vision supervisor and a Chromium editor. One wall job ran at a time throughout the 27-map queue; 32 wall analyses completed. All 27 grid outcomes retained historical geometry.

| Application measurement | Median | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Upload response | 19.8 ms | 33.4 ms | 190.2 ms |
| Actual queue wait | 33.27 s | 66.12 s | 70.18 s |
| Vision HTTP, including process startup | 2.65 s | 5.11 s | 5.33 s |
| Result availability after upload | 35.61 s | 67.43 s | 73.94 s |

The editor was loaded, opened and successfully edited in 2.12 s while analysis continued. Whole batch throughput was 0.349 maps/s with wall work active. Queue wait reflects a deliberately submitted 27-map batch; it is separate from processing and browser interaction latency.

Invocation counts were 27 after completion, 27 after 270 additional terminal polls and three editor reopenings, and 27 after cached library selection and explicit placement. An independent identical-byte upload advanced the count to 28. A real blank map produced `no_grid` at count 29. Restarting the app/store left it at 29. After restarting the Postgres process, a fresh Node process read all 27 completed maps plus the blank map and observed **zero new detector invocations**.

Across the combined local sampling window, peak grid-supervisor-plus-child RSS was 0.816 GiB, wall-worker RSS 1.436 GiB, and their maximum simultaneous RSS sum 2.243 GiB. At most two grid processes were observed: supervisor plus one disposable child. The wall figure includes retained allocations over sequential work. RSS sums can count shared pages more than once and exclude Node, Redis, Postgres and browser memory; they are not container memory measurements.

## Evidence and reproduction

Local artifacts (outside git):

- `/private/tmp/vtt-grid-baseline/`: unoptimized production port snapshot.
- `/private/tmp/vtt-grid-{baseline,optimized,replay}-results/`: source hashes, per-request JSONL and summaries.
- `/private/tmp/vtt-grid-acceptance-verified/acceptance.json` and `database-restart.json`: real service/counter evidence.
- `/private/tmp/vtt-grid-combined-memory.json`: sampled process measurements.
- `/private/tmp/vtt-grid-review/index.html`: all 27 original-size JPEG overlays, native-center PNG crops and overview; rendered after timing. The source images remain unchanged.
- `/private/tmp/vtt-grid-final-tests.log`, `vtt-grid-python-final.log`, `vtt-grid-playwright-final.log`, `vtt-grid-uvtt-playwright.log`, `vtt-grid-lint.log`, `vtt-grid-typecheck.log`, `vtt-grid-build.log`: check output.

Use an isolated Python 3.11 virtual environment and temporary services/data. The existing experiment virtual environment is not needed or modified. Measurement scripts additionally need `psutil`.

```sh
python3.11 -m venv /private/tmp/grid-qa-venv
/private/tmp/grid-qa-venv/bin/pip install -r services/vision/requirements.txt psutil
/private/tmp/grid-qa-venv/bin/python -B -m unittest discover -s services/vision -v

# Point STUDY_RUN to the existing reviewed expanded-native run; no images are copied into git.
/private/tmp/grid-qa-venv/bin/python -B services/vision/benchmark_grid.py \
  --study-run "$STUDY_RUN" --output /private/tmp/grid-new-measurements
/private/tmp/grid-qa-venv/bin/python -B services/vision/benchmark_grid.py \
  --study-run "$STUDY_RUN" --output /private/tmp/grid-segment-replay --passes 1 --replay-only
/private/tmp/grid-qa-venv/bin/python -B services/vision/render_grid_review.py \
  --study-run "$STUDY_RUN" --results /private/tmp/grid-new-measurements/requests.jsonl \
  --output /private/tmp/grid-new-overlays

# DATABASE_URL and REDIS_URL must point at isolated local test services.
npm run prisma:migrate --workspace=@vtt/server
npm run lint
npm run typecheck
NODE_OPTIONS=--no-experimental-webstorage npm test
npm run build
npm exec -- playwright test browser/grid-detection.spec.ts
npm exec -- playwright test browser/uvtt.spec.ts
```

For real-service measurement, run the vision supervisor on `127.0.0.1:58091`, one wall worker on the test Redis, and Vite on `127.0.0.1:58189` with `VTT_SERVER=http://127.0.0.1:58109`. Set `GRID_STUDY_RUN`, `GRID_BENCH_OUTPUT` to a new temporary directory, `DATABASE_URL`, `REDIS_URL`, and `VISION_URL=http://127.0.0.1:58091`, then run `npm exec --workspace=@vtt/server -- tsx src/scripts/benchmarkGrid.ts`. It starts its own isolated app listener on 58109, records counters/timing, and closes it. After restarting the test database, run `tsx src/scripts/verifyGridCache.ts` in the server workspace with the same environment to verify persistent reuse in another process.

## Docker acceptance — 2026-10-26

Docker Desktop became available after the initial implementation. Acceptance passed in the separate `vtt-grid-agent-qa` Compose project, with independent volumes and localhost ports. The user's existing `vtt-grid-qa` stack remained running and unchanged. Images built from implementation commit `820d953`; Python 3.11.17/Linux ARM64, OpenCV wheel 4.8.1.78, NumPy 1.26.4 and Pillow 11.1.0 were verified in the container. Docker's VM reported 10 CPUs and about 7.75 GiB RAM. These measurements are another local development run, with the user's other stack idle alongside it.

The complete application started with fresh Postgres migrations, Redis, SeaweedFS, grid/wall services, Node and Vite. Lint, typecheck, build and all 2,134 npm tests passed inside the Node 22 image, with one existing environment-dependent skip. All 19 grid/fitter/supervisor and 30 wall Python tests passed in the pinned image. All 12 grid editor and six UVTT Playwright cases passed against the Docker web/API stack in Chromium, Firefox and WebKit, including narrow/touch configurations. Controlled delayed/denied grid responses in the editor suite remain deliberately intercepted to exercise those interactions.

A separate Chromium smoke check used real analysis responses and both upload paths. It verified PNG/WebP candidates, JPEG EXIF handling and actual dimensions, blank `no_grid`, 20 MP terminal errors, token exclusion and player/anonymous access denial. The served WebP SHA-256 matched the original uploaded bytes through the S3-backed stack. A real cached estimate prefilled an untouched library draft while its saved grid remained null until explicit Save; selecting an unconfigured library map opened setup and cancellation closed it cleanly. No product-code changes were needed during this acceptance run.

The existing 27-map acceptance runner used the Docker Postgres, Redis, grid supervisor and wall worker, with its own instrumented host Node app and Chromium/Vite frontend. Its local-disk asset adapter permits exact invocation counting; the separate full-stack check above covers S3. All 27 results matched historical geometry within 1e-6 px; maximum differences were 1.34e-12 px in spacing, 1.68e-11 px in X phase and 1.26e-11 px in Y phase. Every map completed on attempt one. Eleven sequential wall analyses completed successfully alongside the grid batch.

| Docker-backed application measurement | Median | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Upload response | 30.3 ms | 66.1 ms | 103.4 ms |
| Queue wait | 42.30 s | 81.65 s | 86.20 s |
| Vision HTTP, including process startup | 3.40 s | 6.13 s | 6.41 s |
| Result availability after upload | 45.03 s | 83.01 s | 88.87 s |

The editor opened and accepted a field edit in 3.16 s while analysis continued. Batch throughput with wall work active was 0.298 maps/s. These figures have different runtime/resource conditions from the earlier macOS process benchmark and do not measure a new optimization comparison. The acceptance runner's legacy `container_memory` text does not collect memory; the separate cgroup measurements below are authoritative for this run.

Invocation counts remained 27 after 270 terminal polls, three setup reopenings, cached library selection and explicit placement. A separate identical-byte upload advanced the count to 28; the blank map advanced it to 29 and returned `no_grid`. App/store restart kept the count at 29. After an actual restart of the isolated Docker Postgres container, a fresh Node process reused all 27 map outcomes and the blank `no_grid` outcome with **zero new detector invocations**.

Fresh vision containers were created immediately before the measured workload. Docker inspection and cgroup v2 `memory.max` both confirmed an enforced 2,147,483,648-byte grid ceiling. A configuration-only `GRID_MEMORY_LIMIT=1536m` check resolved to 1,610,612,736 bytes without changing running containers. Grid `memory.peak` was **644,042,752 bytes (0.600 GiB)**; wall `memory.peak` was **1,368,784,896 bytes (1.275 GiB)**. These are separate container peaks, not a simultaneous aggregate or process RSS. Neither container recorded a memory-limit hit, OOM or OOM kill; both had zero restarts. The wall container has no independent memory ceiling. Across 550 queue samples, maximum active counts were one grid and one wall job; BullMQ's stored global grid concurrency was one.

Raw logs, browser screenshots/traces, Compose configurations, geometry, cache and memory evidence are retained outside git in `/private/tmp/vtt-grid-docker-agent-20261026/`. The agent's QA containers and temporary Vite process were stopped afterward; its volumes were retained without touching the user's running stack. No supplied images were committed.

## PR review follow-up — 2026-10-29

PR #127's three validated follow-up findings are addressed:

- Memory recovery indexes only current queued/running uploads, updating membership on creation, status changes, retries and deletion. Completed results stay cached without participating in the two-second recovery scan. A regression with 30 terminal records and three unfinished records reduces recovery copies from 33 to three; an idle pass after completion/deletion copies none. Busy deferral, explicit retry, stale claims and room/library deletion remain covered.
- Changed source bytes and obsolete configuration jobs have independent scheduling tests. The obsolete case uses matching bytes and creates its queued row after dispatcher startup, with periodic recovery delayed. An isolated test-module mutation that removes the configuration-version comparison makes the new case fail (`no_grid` instead of `queued`); repository production guards were not modified for that check.
- A CI-run positive-image regression passes six deterministic PNG/JPEG/WebP fixtures through decoding, LSD and fitting, checking cell size and wrap-aware offsets within 2 px. It adds no aggregate accuracy gate or confidence assertion, and writes no fixture images to disk.

Fresh lint and full typechecking passed. The server suite passed **498 tests**, with **46 external-service cases skipped**, using `--maxWorkers=2` and database/Redis/S3 environment variables disabled. An initial default-parallel run hit worker/HTTP timeouts; reducing worker concurrency passed without changing test deadlines. All **50 Python grid/supervisor/wall regressions** passed in the pinned Python 3.11 environment, with the localhost supervisor test rerun with loopback access after the sandbox refused its listener. Existing multi-client library placement, private preparation and room synchronization tests passed in the server run. The user's Docker stack and original checkout were untouched.

## Remaining merge prerequisite

Local Docker acceptance is complete. ADR 0045 still requires architecture-owner review before merge. No merge, deployment, calibrated-accuracy claim or hosted-performance claim was made.
