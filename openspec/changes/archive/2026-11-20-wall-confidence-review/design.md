## Context

Detection returns `WallDetectionResult` (ADR 0029). `GET .../walls/detected` gives `{resultId, walls}`; the Walls step lets the GM erase walls by index, and `wall.applyDetected` takes `exclude.indices` guarded by `resultId` (a hash of the walls JSON). `decide` copies only `a` and `b` into room walls. The learned path is `detect_model` in `walls.py`, which has a per-pixel probability map before tracing.

## Goals / Non-Goals

**Goals:** a per-wall confidence from the model; doubtful walls visible and reviewable; apply without them; no new command or event.

**Non-Goals:** changing the model or training; confidence for the rule-based pipelines; storing confidence on room walls; editing or merging walls.

## Decisions

1. **Confidence = mean smoothed probability along the segment.** Sample points along each final segment on the Gaussian-smoothed probability map, each taking the max in a small neighbourhood (a traced centreline can sit a pixel off the peak). Mean of samples, rounded to 2 decimals. Segments added by gap joining get low values naturally. Alternative: mean over the band mask: needs a per-segment mask, more code, same signal.
2. **Optional field on `DetectedWall`** (`z.number().min(0).max(1).optional()`). Old workers and results parse. `resultId` hashes the JSON, so it stays consistent. Alternative: a parallel `confidences` array drifts from walls on any filter; rejected.
3. **Threshold constant in shared** (`DOUBTFUL_WALL_CONFIDENCE = 0.6`, `isDoubtfulWall`). The UI is the only consumer today, but shared keeps one definition for tests and a future server filter.
4. **Confident-only via existing `exclude.indices`.** The client computes the indices of doubtful walls and unions them with the erased set. The server still checks `resultId`. No change to commands (invariants 1 and 7 hold). The library-map draft path (`draftConnection`) already honors `exclude`.
5. **Review is client state only**: a cursor over the non-erased doubtful walls. The canvas gets `doubtful` and `focus` props and recentres on the focus wall. Erasing reuses `toggleCandidate`.

## Risks / Trade-offs

- [Probability is not calibrated; 0.6 may over- or under-flag] → one constant; tune on real maps later.
- [Schema change in `packages/shared`] → optional field, ADR 0038, review by the Real-Time Architecture owner.
- [Amber is close to the orange of applied walls] → candidates are dashed with a dark casing and a legend; applied walls are solid.
