## Decisions

- **Reuse `ui/Modal`** (native `<dialog>`), as the checkpoint preview does: it gives the accessible name, focus trap, Escape and focus return. `onAfterClose` focuses the Detect walls button, since the opener (that button) is disabled while detection runs.
- **Preview is a static SVG** of the map image with the detected segments in board coordinates (invariant 8), not the server-rendered PNG, so it needs no extra fetch and no placeholder. Doubtful walls keep their kind colour and carry a pink dashed halo.
- **Open when** the detected segments are loaded and there is at least one. **Discard** sets the client's detection status to none (the same thing a successful Apply does), so the modal closes; nothing is sent.
- **Review lives in the modal:** per-wall erase (click or keyboard on a focusable preview wall), the doubtful styling, legend and count, the Review doubtful walls stepper, and Apply confident walls only from `wall-confidence-review` are all kept, inside the modal. Only the canvas overlay is dropped, so the editing canvas shows just the room's walls.
