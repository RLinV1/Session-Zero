# ADR 0058 — Editing placed area templates

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0007-shared-area-templates.md`, `docs/adr/0021-area-lines-and-aim.md`, `docs/adr/0040-area-color-and-square-centre.md`
**Change:** `openspec/changes/edit-placed-area-templates` · **Requirement:** FR-TAC-06

## Context

ADR 0007 left editing out: "Editing a placed template: remove and place again." At the table, areas are nudged all the time: a misplaced click, a creature that moved, a lingering spell. Redoing the aim each time is slow, and it fills the activity log with remove/place pairs. The Area tool's size picker also slows the common case, since most areas are sized by dragging anyway.

## Decision

**A new command and event for a placed area's geometry.**
- `template.update { templateId, origin, toward, size, width?, expected: { origin, toward, size, width? } }`. The command always carries the full new geometry, never a patch. `decide` checks, in order:
  1. A missing template, or one the actor can't see (`templateConcealedFrom`), answers `not_found`, as `template.remove` does.
  2. `can.editTemplate` (owner or GM, the same rule as removal) fails with `forbidden`.
  3. If `expected` isn't the current geometry, the edit was made from stale geometry, and it is rejected as `invalid` (`reject.templateStale`). This mirrors `token.move`'s `expectedOrigin`.
  4. A line wider than 10 cells is rejected with `reject.lineTooWide`, as at placement.

  `width` is dropped for shapes other than lines.
- `TemplateChanged { templateId, from, to }`. `from` is the stored geometry, so the event carries the replaced value (invariant 6). Id, owner, colour and `gmOnly` never change.

**Visibility.** `filterEventForViewer` treats `TemplateChanged` like `TokenMoved`: `byVisibility(concealed before, concealed after)`.
- A move into or out of a player's view resyncs that player.
- A change they can't see either side of is a bare seq.
- `gmOnly` can't change, so a GM-only area stays redacted for players.

**Edit previews.** The ephemeral `templatePreview` gains an optional `templateId`, so other boards hide the original while it's being dragged. This is an additive change to an existing schema. For a preview naming a template, the relay:
- drops it unless the sender can see and edit that template
- takes `gmOnly` from the stored template, never from the payload
- filters recipients on the preview's geometry, as for aiming

A cleared edit preview names the template too, so receivers draw the original again. Receivers also expire it after 1 s.

**Activity log.** "Pat moved a red 20 ft circle" (position only), "Pat turned a 30 ft cone" (direction only), "Pat changed a 15 ft cone to a 30 ft cone" (anything else). "(GM only)" is appended as for placement.

**Area tool.** The size picker is removed. A click places an area 2 cells in size (`2 × unitsPerCell`). The server is unchanged: `template.place` still takes any valid size.

## Consequences

- **Backward compatible.** Old logs replay unchanged, and there is no migration. A client built before this change would throw on `TemplateChanged`. That is acceptable for a coordinated web + server deploy, as with every earlier event addition.
- **Not undoable,** like placing and removing areas. Undo for areas would come as one piece, in its own ADR.
- **Colour and GM-only** stay fixed after placement.

## Alternatives considered

- **Separate move / resize / rotate commands.** Rejected: a handle drag changes size and direction together, and several event types would multiply the visibility and log code.
- **A new `templateEditPreview` message.** Rejected: it would have the same geometry, filtering and drawing as `templatePreview`.
- **Last write wins without `expected`.** Rejected: two people dragging the same area would silently overwrite each other.
