# ADR 0007 — Shared area templates

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-09-27 · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0003-tactical-state.md`
**Amended by:** `docs/adr/0021-area-lines-and-aim.md` (line templates, shared aiming), `docs/adr/0040-area-color-and-square-centre.md` (area colours, hatched GM-only areas, squares placed by their centre), `docs/adr/0058-edit-placed-area-templates.md` (editing placed areas)
**Change:** `openspec/changes/shared-aoe-templates` · **Tickets:** KAN-35 (FR-TAC-06), KAN-69

## Context

The board tool rail (KAN-69) shipped an Area tool whose templates lived only in the placing viewer's browser. At the table, an area of effect exists to be *seen*: the player who casts Fireball and the GM who resolves it need the same circle over the same squares. FR-TAC-06 asks for placed templates and FR-SYNC-02 lists templates among the things synchronized across browsers. A GM also needs to place areas players must not see yet (a trap's blast radius), with the same guarantee hidden tokens have (FR-GM-23).

## Decision

Placed area templates become room state, following the standard pattern.

- **State.** `RoomState.templates: Record<Id, AreaTemplate>`, where `AreaTemplate` is `{ id, shape: "circle" | "cone" | "box", origin, toward, size, ownerId, gmOnly }`. `origin` and `toward` are board coordinates (invariant 8). `origin` is already snapped by the client. `size` is in grid units (circle radius, cone length, box side), so a later grid change rescales every template identically for everyone. The outline is derived, never stored.
- **Commands.**
  - `template.place { shape, origin, toward, size, gmOnly = false }`: any active participant. `gmOnly: true` is GM-only (`forbidden` otherwise). It is rejected as `invalid` once the room holds `MAX_AREA_TEMPLATES` (200).
  - `template.remove { templateId }`: the owner or the GM (`can.removeTemplate`).
- **Events.**
  - `TemplatePlaced { template }`.
  - `TemplateRemoved { template }`, which carries the whole template as it was (invariant 6), so undo (FR-REC-02) can restore it with a compensating `TemplatePlaced`.
- **Visibility (invariant 3).**
  - `filterStateForViewer` drops `gmOnly` templates for players.
  - `filterEventForViewer` redacts `TemplatePlaced` and `TemplateRemoved` of a `gmOnly` template to a bare seq. `gmOnly` is fixed at placement, so the event alone decides it and no resync is needed.
  - A player removing a GM-only template gets the same `not_found` as for a missing one.
- **Activity log.** "Pat placed a 20 ft cone", "GM removed a 10 ft box (GM only)". The line is written in the room grid's unit label.

`template.place` is a new command and `TemplatePlaced`/`TemplateRemoved` are new events. No existing schema changes shape. `RoomState` gains a field that `emptyRoomState` initializes, and state is rebuilt by replaying events, so existing rooms load with `templates: {}`.

## Consequences

- **Backward compatible.** Old event logs replay unchanged; there is no migration.
- **Clients.** A client built before this change receives the new events, but its reducer's `assertNever` would throw on them. That's acceptable for a coordinated web + server deploy, the same as every earlier event addition.
- **Rate and size.** The 200-template cap bounds state per room. Each template is a few numbers.
- **Not covered here.**
  - Live aiming previews for other viewers: an ephemeral `templatePreview` message is the natural follow-up under FR-SYNC-03 (KAN-39).
  - Undo (KAN-41).
  - Line-shaped templates.
  - Editing a placed template: remove and place again.
- **Drawings and measurements stay local.** Sharing drawings (FR-TAC-04, KAN-33) would follow this same pattern with its own ADR.

## Alternatives considered

- **Ephemeral-only templates (broadcast, never persisted).** Rejected: a template must survive a reconnect and be there for a late joiner (FR-PL-06), which ephemeral messages never are (invariant 4).
- **Storing the computed outline.** Rejected: it duplicates data that `shape`/`origin`/`toward`/`size` already determine, and it would not follow a grid change.
- **A per-template visibility list (party / specific players / GM).** Deferred: GM-only versus everyone covers the stated need. A richer model can extend `gmOnly` into an enum later, with its own ADR.
