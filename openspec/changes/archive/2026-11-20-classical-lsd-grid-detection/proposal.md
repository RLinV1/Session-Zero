# Classical LSD grid detection

## Why

The reviewed native-resolution classical LSD detector produces editable grid estimates, but the application still uses a different detector and advertises uncalibrated confidence percentages. Integrating the reviewed behavior with bounded execution and per-upload persistence makes those estimates available during private map setup.

## What Changes

- Port the reviewed preprocessing, LSD settings, filtering and fractional fitter without experiment imports; keep best-candidate behavior even when diagnostic gates fail.
- Analyze new raster map uploads asynchronously up to a separate default 16 MP analysis ceiling. Tokens, UVTT grids and shipped calibrations stay authoritative.
- Persist source identity, configuration fingerprint, attempts, candidates and completed no-grid outcomes per upload; hide obsolete metadata without backfilling maps.
- Limit grid execution to one analysis, with disposable processes, deadlines, bounded retries and a bounded local pending buffer.
- Wait for a stable estimate before revealing unconfigured raster setup, then apply geometry and reveal the private draft together. Keep checking, queued and running status text without a processing deadline. X, Escape, backdrop and Set up manually skip waiting while server analysis continues and remains cached; later results require explicit Use suggestion. Configured maps, UVTT grids and shipped calibrations bypass waiting. Open private setup before placing unconfigured library maps; saves and room placement remain explicit.
- **BREAKING**: Remove candidate confidence from the private shared HTTP contract and UI.

## Capabilities

### New Capabilities

- `grid-detection`: Private upload analysis, durable cache validity, bounded execution and guarded draft adoption. This capability exists in a prior unarchived change but has no main spec yet; this change records the agreed replacement behavior.

### Modified Capabilities

- `asset-library`: Unconfigured library selections require private setup before placement.

## Impact

Python vision service and shared wall dependencies; Node upload routes, memory/Postgres stores, Prisma migration and dispatchers; shared private schemas; React grid editors and library selection; Compose resource settings and local verification tooling. ADR 0045 requires architecture-owner review before merge. Local implementation only: no merge, deployment or committed supplied maps.
