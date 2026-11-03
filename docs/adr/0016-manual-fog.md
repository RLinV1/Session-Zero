# ADR 0016 — Manual fog of war

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-10-03 · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0003-tactical-state.md`, `docs/adr/0007-shared-area-templates.md`, `docs/adr/0013-undo.md`
**Change:** `openspec/changes/kan-28-manual-fog` · **Ticket:** KAN-28 (FR-GM-17)

## Context

FR-GM-17 asks for manual fog of war: the GM conceals rectangular or polygonal regions, players see them masked, the GM sees them semi-transparent, content under fog is not sent to players, and fog changes are undoable so an accidental reveal can be taken back. KAN-28 stresses that the third criterion is a visibility invariant (invariant 3), not a rendering detail. Masking in Pixi alone would ship the hidden tokens to every browser.

## Decision

Fog regions become room state, following the standard pattern.

- **State.** `RoomState.fog: Record<Id, FogRegion>`, where `FogRegion` is `{ id, shape: "rect" | "polygon", points: Point[3..64] }` in board coordinates (invariant 8). A rectangle is stored as its four corners, so every reader handles one geometry. A room holds at most `MAX_FOG_REGIONS` (100).
- **Commands** (GM only, `forbidden` otherwise; both strict):
  - `fog.add { region: { shape: "rect", from, to } | { shape: "polygon", points } }`. `decide` normalises a rectangle into four corners and rejects a region with no area as `invalid`.
  - `fog.remove { regionId }`.
- **Events.**
  - `FogAdded { region }`.
  - `FogRemoved { region }`, carrying the whole region (invariant 6).
- **Visibility (invariant 3).** One function, `concealedFrom(fog, token, viewer)`, decides whether a player may see a token: it is hidden, or its centre is inside a fog region and the viewer does not own it. The GM sees everything.
  - `filterStateForViewer` keeps only tokens not concealed from the viewer, so the turn order and attack sides (derived from that token map) follow. A template is withheld when it is GM-only, or when its origin is under fog and the viewer did not place it. Fog regions are sent to players: they are the mask, and they name no token.
  - `filterEventForViewer`: `FogAdded` / `FogRemoved` resync players. `TokenMoved` and `TokenOwnersSet` compare concealment before and after: unchanged and visible passes, unchanged and concealed is redacted, changed resyncs. `TokenCreated`, `TokenDeleted` and other token events are redacted when concealed. Template events are redacted when concealed under the fog before the event; fog changes only through events that resync, so that is the fog the player's state reflects.
  - `LiveRoom.relayEphemeral` drops a drag preview for a viewer from whom the token is concealed, or for whom its preview point is under fog.
- **Attack rolls.** An unowned token under fog is marked `hidden` on every attack roll that names it: at roll time in `decide`, and in `reduce` when fog is added over it or it moves into fog. Like a hidden token (ADR 0010), its side then stays blank for players after a delete, reveal or rename. Party tokens (with owners) follow their current visibility instead, so the party's own names don't vanish from old rolls each time they walk through fog.
- **Rejections.** Commands from a player about a fogged token, or another player's template under fog, answer `not_found`, as for a hidden token.
- **Ordering.** `token.configure` and `token.setAppearance` emit a move into fog before any other edit, and a move out of fog after them, the same "hide first, reveal last" rule as `TokenHiddenSet`.
- **`InitiativeEnded`** passes to players with `previous` reduced to the tokens they may see.
- **Pings.** The GM's automatic attack ping is skipped for a fogged target.
- **Owners keep their tokens.** A player whose token is under fog still sees and moves it. The board draws fog between the grid and the tokens, so it stays on top of the mask.
- **Undo.** `FogAdded` and `FogRemoved` join `REVERSIBLE_EVENT_TYPES` as each other's inverse. Undoing an add is refused once the region is gone; undoing a removal is refused if the region is back, or if the room is already at `MAX_FOG_REGIONS`.
- **Activity log.** "GM added a fog rectangle", "GM removed a fog polygon".
- **Keyboard path (WCAG 2.1.1).** The board's Fog tool needs a pointer, so the GM panel has a Fog of war section that fogs the whole map, fogs a block of grid cells by column and row, and lists every region by the cells it covers with a Reveal button. It is web-only and sends the same `fog.add` / `fog.remove` commands, so the contract above is unchanged.

`fog.add` / `fog.remove` are new commands and `FogAdded` / `FogRemoved` new events. No existing schema changes shape. `RoomState` gains a field that `emptyRoomState` initializes, and state is rebuilt by replaying events, so existing rooms load with `fog: {}`. The filters change behaviour for tokens and templates under fog, which only exist once fog does.

## Consequences

- **Backward compatible.** Old event logs replay unchanged; no migration.
- **Clients.** A client built before this change would throw on the new events. Accepted for a coordinated web + server deploy, as with every earlier event addition.
- **Snapshots on fog changes.** Every fog change resyncs each player. Fog changes are rare GM actions.
- **Centre-point rule.** A large token whose centre is outside fog stays visible even if part of it is under fog.
- **Map pixels are not protected.** The map image URL is already delivered; fog is visual concealment of the picture (FRONTEND-CONTRACT.md, visibility contract). Use maps without baked-in secrets.
- **Map changes keep fog.** Regions stay in board coordinates when the map is replaced; the GM removes them by hand. Scene replacement (FRONTEND-CONTRACT.md) is the place to reset them.
- **Not covered here.** Dynamic line of sight, walls and portals (FR-GM-18, FR-GM-19); editing a placed region; brush-painted fog.

## Alternatives considered

- **Mask-only fog in Pixi.** Rejected: hidden tokens would still be in the player's state and socket frames (DESIGN.md §9).
- **Server-derived visible-area polygon sent instead of the fog regions.** Deferred: with only manual fog, the fogged polygons are an equivalent safe projection, and computing a complement adds geometry work for no secrecy gain. Line of sight (FR-GM-19) is the natural place to introduce it.
- **A fog bitmap or painted grid.** Rejected: large state, poor fit for an append-only log, and it does not follow a grid change.
- **Hide owned tokens under fog too.** Rejected: a player would lose sight of their own character the moment the GM fogs the room it stands in.

## Amendment: terrain and tactical movement

Manual fog retains main's movement policy: an authorized player may ordinarily move their owned, unhidden token into, entirely within, across thin strips between clear endpoints and out of fog, including after GM placement or newly painted fog covers the token. Ordinary GM movement also passes through fog without Reposition. All moves still obey the terrain branch's current physical validation: Blocked terrain, swept walls, closed/locked portals, destination checks, wall clearance and starting-wall escape; Blocked terrain has no escape exception. Difficult terrain retains its proportional cost under fog. Ownership, hidden-token restrictions and revocation remain enforced. Movement never changes manual fog, and owners retain visibility of their tokens. Fog knowledge checks remain: concealed player routes and full cost stay unknown with or without physical obstacles, while GM feedback remains accurate. Painting over occupied tokens remains legal. GM Reposition still bypasses route restrictions for one attempt while requiring a wall- and Blocked-free destination. Sight, range, wall/window/door behavior, combined sight from committed owned-token positions, concealment, filtered drag previews and hide-first/reveal-last edit ordering remain unchanged. Fog boundaries still block sight except for regions containing a sight token's centre; sight overlap never reveals fogged unowned content. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
