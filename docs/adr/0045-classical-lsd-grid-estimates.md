# ADR 0045: Versioned private classical LSD grid estimates

## Status

Proposed — Real-Time Architecture owner review is required before merge.

## Context

ADR 0028 introduced private upload analysis with a confidence number. The reviewed native classical LSD experiment supplies a ranked geometry estimate, including possible suggestions on gridless artwork; it supplies no calibrated confidence. Results must survive restart and must not overwrite manual alignment or saved grids.

## Decision

Remove confidence from `GridDetectionCandidate`; retain fractional positive cell size (at most 2000 pixels) and canonical offsets. Keep all analysis behind existing authorized REST endpoints, outside RoomState/events/player payloads. Label it as an estimate to check. Untouched unconfigured editor sessions may prefill once; explicit saves remain the only persistence/room commit path.

Before revealing unconfigured raster setup, wait in the existing modal for the original upload's analysis. This applies to library and room uploads and pending unconfigured library reopening/selection. Show a centered spinner and Checking grid…, Waiting to fit grid… or Fitting grid…, with polite announcements and reduced-motion support. Hide the canvas, fields, tabs and save/apply actions until ready. Commit usable geometry and the editable phase together, preserving units and style and retaining check-before-saving wording. Configured maps, UVTT grids and shipped calibrations bypass waiting; cached candidates have no artificial delay.

The waiting X, labelled Set up manually, and the visible manual action, Escape and backdrop all reveal manual setup without losing the upload. Skip latches synchronously and prevents automatic adoption for the remainder of that session, including completion races and tab remounts. Analysis continues on the server and stays cached; a later result remains available through Use suggestion. Focus the grid canvas on reveal; normal editor close/save behavior resumes afterward. Completed no_grid or failed fitting opens manual setup with a neutral explanation, while absent/denied analysis falls back quietly. Keep waiting as long as valid queued/running responses continue. A 10-second timeout bounds each status request independently; failure/timeout reveals manual setup and blocks future automatic adoption. Poll once per editor session and preserve target/unmount guards. This interaction revision changes no endpoints, database records, fingerprints, queue policy or Python processing.

Version analysis by source SHA-256 plus a detector/preprocessing/fitter fingerprint. Store it on each upload, separately from the saved grid. Queue payloads and atomic claims/completions include source, version and attempt; legacy or obsolete metadata is invisible and never backfilled. Separate uploads of identical bytes analyze independently. The original library asset is the cache authority when selected in a room.

Bound analysis to one globally active BullMQ job, or one local active job with bounded pending work. A lightweight HTTP supervisor admits one analysis, invokes a fresh child, and terminates/reaps it at the deadline. Busy work defers without spending an execution attempt. Only transient errors retry, up to three executions. Oversized images are terminal errors with manual fallback. Default analysis/processing/HTTP/stale/memory limits are 16 MP / 30 s / 40 s / 90 s / 2 GiB, separately from upload limits.

## Consequences

No existing room event schema or saved grid changes. Nullable additive migration leaves historical uploads alone. Python grid/wall dependencies are pinned together and require wall regressions. Local detector parity and resource measurements do not establish calibrated accuracy or hosted performance. Merge requires architecture-owner review and local Compose acceptance; no deployment is authorized by this ADR.
