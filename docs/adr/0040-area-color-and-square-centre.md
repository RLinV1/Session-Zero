# ADR 0040: Area colours, hatched GM-only areas, and squares placed by their centre

**Status:** Proposed — needs review by the Real-Time Architecture owner · **Amends:** `docs/adr/0007-shared-area-templates.md`, `docs/adr/0021-area-lines-and-aim.md`
**Amended by:** `docs/adr/0058-edit-placed-area-templates.md` (a click places a 2-cell area; placed areas can be edited)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/aoe-tool-refinements` · **Requirement:** FR-TAC-06

## Context

Every area template is drawn the same orange, so a table can't tell one spell's area from another's. GM-only areas are told apart only by being purple, so the cue depends on colour alone. A square area (`box`) is anchored on the middle of its near side (ADR 0021), but the table expects to click the square's centre.

## Decision

### An optional, named colour

`packages/shared` gains `AreaColor = z.enum(["red", "orange", "yellow", "green", "blue", "purple", "grey"])` and `DEFAULT_AREA_COLOR = "orange"`. These gain an optional `color: AreaColor`:
- `AreaTemplate`;
- `template.place`;
- the ephemeral `templatePreview.preview`.

`decide` copies the colour into `TemplatePlaced` when it's present.

- **Optional, not defaulted.** Every stored `TemplatePlaced` / `TemplateRemoved` parses and replays unchanged. A template without a colour is drawn orange.
- **The zod enum is the validation.** An unknown colour or a hex value fails parsing at the boundary, for commands and ephemeral payloads alike.
- **Names, not hex.** The shades live in the web client, so a later theme change can adjust them without touching history. White is left out: a translucent white fill disappears on light maps.
- **Visibility is unchanged.** A GM-only template, and a GM-only aim preview, are already withheld from players whole, so its colour is too. The activity log names the colour ("placed a red 20 ft circle").

### GM-only areas are hatched, not purple

GMs see a GM-only area with diagonal hatching in its own colour and a solid outline. Every other area has a plain translucent fill. Purple is now an ordinary colour choice. This only changes drawing; `gmOnly` itself is unchanged.

### A square's origin is its centre

For `shape: "box"`, `origin` now means the square's **centre**, not the middle of its near side. The square is turned so that it faces `toward`, and `size` is still its side. This supersedes ADR 0021's "a box is a square of side `size`, centred on its origin's near edge".

The outline is derived only on the client (`areaShape`), so changing that one function moves every square the same way for everyone: in live play, replays, checkpoints, and the eraser's hit test. No event is rewritten (invariant 5).

**Consequence, accepted by the table:** squares placed before this change are drawn centred on their stored point, so each moves by half its side toward where it was aimed from.

## Alternatives considered

- **A hex colour.** Rejected: arbitrary colours would need validating, and a theme change couldn't adjust them.
- **A per-viewer colour preference.** Rejected: a colour only the placer sees tells the table nothing.
- **Keeping purple for GM-only areas, or a dashed outline instead of hatching.** Purple ties GM-only areas to one colour. A dashed outline is less visible at a distance than hatching.
- **Keeping the near-side anchor and converting the clicked centre on placement.** This would have left old squares where they were. It was turned down in favour of making the stored point mean the centre, accepting that old squares move.
