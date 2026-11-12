# ADR 0021: Line templates and shared area aiming

**Status:** Proposed — needs review by the Real-Time Architecture owner · **Amends:** `docs/adr/0007-shared-area-templates.md`
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-35-aoe-line-and-aim` · **Ticket:** KAN-35 (FR-TAC-06)
**Amended by:** `docs/adr/0040-area-color-and-square-centre.md` (a box's origin is now its centre), `docs/adr/0058-edit-placed-area-templates.md` (edit previews, editing placed areas)

## Context

ADR 0007 made placed area templates room state (circle, cone, box) and left two things for later: line-shaped templates, and letting the others watch an area being aimed. FR-TAC-06 asks for both, with the line between ephemeral aiming and committed placement covered by tests. The ephemeral channel now has a coalescing sender and a latency benchmark (KAN-39).

## Decision

### Lines

`AreaShape` gains `"line"`. A line starts at its origin and runs `size` grid units toward `toward`. `AreaTemplate` and `template.place` gain an optional `width` (grid units); a line without one is one cell wide, and the other shapes ignore it (`decide` drops it). `decide` refuses a line wider than 10 cells of the room's grid. Because `width` is optional, every stored `TemplatePlaced` / `TemplateRemoved` still parses, and undo restores a line whole as it does any template. The activity log says "placed a 60 ft line", adding ", 10 ft wide" when the width isn't one cell.

### Aiming is an ephemeral `templatePreview`

`EphemeralPayload` gains `templatePreview { preview: { shape, origin, toward, size, width?, gmOnly } | null, gmOnly? }`. There is no template id, since nothing is placed yet; receivers key it by sender. The client sends it through the coalescing sender (`connection.preview("aim", …)`, at most one per 50 ms with the trailing value kept), and ends the stream with `preview: null` on place or cancel. Receivers draw it as a faint outline labelled "<name> aiming" and drop it a second after the last update, which covers a lost clear or a disconnect. It is never persisted and never sequenced; only `template.place` commits.

### Relay rules (`LiveRoom.relayEphemeral`)

An aim follows the rules for the area it would place:

- A GM-only aim from a player is dropped (only the GM places GM-only areas, ADR 0007).
- A GM-only aim, and the clear of one (`gmOnly: true` on the null payload), reach GMs only, so players never learn the GM was aiming. The schema requires `gmOnly` on every clear, so the server never has to guess.
- An aim whose origin is off the map, or sent with no map, is dropped.
- An aim from under fog reaches no player but its sender (`templateConcealedFrom`, ADR 0016).

Delivery is volatile, like drag previews: a lost frame is replaced by the next.

## Consequences

- A client built before this change fails its zod parse on a `"line"` template or a `templatePreview`; web and server deploy together, as with every earlier addition.
- The latency benchmark sends aims alongside pings and drag previews (p95 ≈ 126 ms against the 150 ms target).
- The existing 40-per-second per-connection ephemeral cap still bounds preview spam.

## Alternatives considered

- **A line as a thin box.** A box is a square of side `size`, centred on its origin's near edge; it can't take a separate width or start at the caster.
- **Persisting the aim.** Rejected by invariant 4: aiming is pointer traffic, and only the placement is history.
