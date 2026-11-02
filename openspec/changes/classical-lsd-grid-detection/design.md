# Design

## Context

See proposal.md for motivation. Existing uploads create analysis metadata independently from saved grids, with memory and Prisma adapters. The present dispatcher allows two jobs, trusts uploaded dimensions and has no configuration identity. The editor already keeps drafts private, and library setup spans grid, walls and fog. OpenSpec context describing account sign-in and detection as planned is stale: both are implemented in current main.

## Goals / Non-Goals

Preserve reviewed geometry and original artwork, retain per-upload results across restart, protect manual editor work, and bound CPU/memory work. No detector accuracy improvement, legacy-map backfill, hosted performance claim, merge or deployment is part of this change.

## Decisions

- Copy only production geometry helpers. Use Pillow EXIF transpose and L conversion at original resolution, explicit LSD STD settings, 1 degree orientation, 20 px segments and 4 px fit tolerance. Diagnostic acceptance gates never replace the highest-ranked usable candidate. Keep offsets canonical and fractional.
- Pin Python 3.11 image dependencies to OpenCV 4.8.1.78, NumPy 1.26.4 and Pillow 11.1.0. Verify walls against the same versions.
- Store source SHA-256 and a versioned detector/preprocessing/fitter fingerprint separately from grid metadata. Every queued payload and compare-and-set includes source, version and attempt. New uploads with equal content retain independent identities. Legacy rows remain nullable and invisible; neither editor opening nor recovery starts obsolete work.
- Persist terminal errors for oversized images and invalid input; only transient execution failures retry, at most three executions. Busy admission releases the claim for deferred scheduling without using an execution attempt. Recovery increments a stale claim and rejects late completions. Default processing/HTTP/stale limits are 30/40/90 seconds.
- BullMQ global concurrency is one; the local dispatcher has one active job and a bounded pending buffer, leaving overflow in the store. The HTTP supervisor imports no OpenCV and admits one request; every admitted request starts and reaps a fresh child. Compose limits grid memory to configurable 2 GiB.
- Keep preparation (checking, waiting, editable), draft geometry and manual intent at editor-session scope, keyed to the original analysis target. One poller serves the whole library or room editor across tab remounts. Both raster upload paths and unconfigured library reopening/selection wait before mounting the canvas, fields, tabs or save/apply actions. Show Checking grid… for the initial lookup, Waiting to fit grid… while queued and Fitting grid… while running; do not show progress percentages or estimated time. Successful queued/running responses can continue indefinitely.
- Commit a usable candidate's geometry and the editable phase in one state update so the first visible editor frame is already fitted, preserving units and line style. No editable session may automatically adopt again. Configured maps, validated UVTT grids and shipped calibrations bypass preparation; cached estimates need no extra delay. Completed no_grid or failed fitting reveal manual setup with a short neutral explanation. Missing or denied analysis falls back quietly.
- While waiting, the modal X is labelled Set up manually; X, Escape, backdrop and the visible Set up manually button synchronously latch manual intent and reveal the retained upload. Keep server analysis and client polling running after skip so Use suggestion can offer a later result. First-anchor placement, keyboard alignment, typing, explicit adoption, discard, save, dismissal and access loss retain their equality-independent protection. Normal close/save prompts resume once editable. Announce loading status politely, animate the spinner only without reduced motion and focus the grid canvas after preparation.
- Bound each status request to 10 seconds using an abort controller and a timeout race; this does not bound queue or processing time. A failed or timed-out request permanently releases this session into manual setup; later recovered results are explicit suggestions only. Preserve target-generation and unmount guards, and check the session/phase again in state updaters so skip wins a simultaneous completion. Reopened library setup reads the original asset analysis. Configured library placement keeps its existing path. HTTP contracts, persisted metadata, detector fingerprints, queues and Python processing are unchanged by this interaction revision.

## Risks / Trade-offs

- Reviewed suggestions can select aliases or suggest grids on gridless art → neutral estimate wording and editable explicit saves; no quality cascade.
- Native decoding uses substantial memory → 16 MP default, one child and a container ceiling; timeout terminates/reaps children.
- Runtime differs from the historical Python 3.12/macOS experiment → replay saved segments to 1e-6 px and rerun all 27 images before accepting changes. Capture an unoptimized port baseline before optimization, keep only measured improvements.
- Docker daemon is unavailable at implementation start → run available local tests and document pending Compose resource/combined-wall signoff, without declaring it passed.

## Migration Plan

Add nullable identity/version/error fields to existing per-upload records; do not rewrite or enqueue historical rows. New code reads only matching metadata. Rollback ignores additive fields, but cached results from either contract require their own matching version. Architecture-owner review is a merge prerequisite.
