# ADR 0030 — Portals: doors and windows on walls

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-10-11 · **Extends:** `docs/adr/0029-walls-and-wall-detection.md`, `docs/adr/0013-undo.md`, `docs/adr/0016-manual-fog.md`
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/archive/2026-10-11-portals` · **Requirements:** FR-GM-18, the portal half of FR-GM-09

## Context

ADR 0029 made walls straight segments that block tokens, kept GM-only because wall geometry inside fog draws rooms the players have not seen. A doorway is either a wall that can never be crossed or a gap that can never be shut. FR-GM-18 asks for doors and windows that are `Open`, `Closed` or `Locked`, which the GM controls and players understand. Players can only use a door they can see, so portals cannot stay GM-only the way walls are.

## Decision

### State

- `Portal = { kind: "door" | "window", state: "open" | "closed" | "locked" }`.
- `Wall` gains `portal?: Portal`. A wall without it is a plain wall. Old events, snapshots and checkpoint tables parse unchanged.
- `WallsAdded` and `WallsRemoved` carry the portal with the rest of the wall, so removing a door and undoing that brings back the same door in the same state. `wall.applyDetected` creates plain walls. Each wall in `wall.add` may carry an optional `portal`, so the map editor's Save can add a door drawn in its draft in one step.

### Blocking

- A plain wall, a closed portal and a locked portal block movement exactly as ADR 0029 describes (footprint for everyone, straight path for players). An open portal does not.
- Windows block movement like doors. `kind` matters for drawing now and for line of sight (FR-GM-19) later, where a closed window will let sight through.
- Closing a door on a token that stands in the doorway is allowed. The path check already ignores walls the token stands across, so it can step out.

### Commands

- **`portal.set { wallId, portal: Portal | null }`** — GM only. Designates a wall as a portal, edits its kind or state, or (`null`) turns it back into a plain wall. The map editor's Door / window tool marks walls in its private draft (map-editor-drafts); Save sends `portal.set` for each kept room wall whose portal changed, and new walls carry theirs on `wall.add`.
- **`portal.setState { wallId, state }`** — the board sends it.
  - The GM may set any portal to any state.
  - A player may set `open` or `closed` on a portal they can see (below). The checks run in this order, so a refusal never depends on what the player cannot see:
    1. `state: "locked"` from a player is `forbidden`.
    2. A missing wall, a plain wall, or a portal concealed from the player is `not_found` ("portal"), all three with the same words.
    3. A locked portal is `invalid`: "That door is locked." (or "window").
  - Players need no token near the door. The GM controls the table and can lock a door to stop that.
- Both refuse a change that changes nothing ("That door is already open.").

### Event

`PortalChanged { wallId, from: Portal | null, to: Portal | null }`. `from` is the replaced value (invariant 6). Both commands emit it: one event keeps `reduce`, undo and the visibility filter in one place.

### Visibility

Players see portals, never plain walls:

- `portalConcealedFrom(fog, wall, viewer)`: never for the GM; always for a plain wall; otherwise when the wall's midpoint is under fog, the rule `concealedFrom` uses for a token's centre (ADR 0016).
- `filterStateForViewer` keeps only walls not concealed from the player. A player's `walls` is exactly the portals they can see, with kind and state.
- `filterEventForViewer`:
  - `WallsAdded` / `WallsRemoved`: a resync when any wall in it is a portal the player can see, else redacted. Removing a visible door must remove it from the player's board, and a resync does that without sending the plain walls.
  - `PortalChanged`: visible before and after, delivered as-is; concealed before and after, redacted; otherwise a resync, because the wall's geometry must arrive or leave with it.
  - Fog, checkpoint and encounter events resync already, which covers fog moving off or onto a door.
- A move refused by a door reads "A wall is in the way.", the same as a hidden wall.
- Players see a locked door as locked. FR-GM-18 says they should understand the portal's state.

### Undo

`PortalChanged` is reversible (ADR 0013). The inverse swaps `from` and `to`. The undo is refused with "Can't undo: that wall no longer exists." when the wall is gone, and with "Can't undo: that door has changed since." when its portal is no longer `to`. A player's opening is an undoable action for the GM, like a player's move.

### Activity log

One wording helper (`describePortalChange`) serves both the activity log ("Alex opened a door") and the Undo labels ("Undo open a door", "the opening a door"):

| From | To | Sentence |
|------|----|----------|
| closed | open | opened a door |
| open | closed | closed a door |
| closed | locked | locked a door |
| locked | closed | unlocked a door |
| locked | open | unlocked and opened a door |
| open | locked | closed and locked a door |
| none | portal | made a wall a closed door |
| portal | none | turned a door back into a wall |
| door | window | made a door an open window |

## Alternatives rejected

- **A separate `RoomState.portals` record keyed by wall id.** Every wall removal path (`wall.remove`, `wall.clear`, `scene.setMap`, checkpoints, encounters) would have to remove portals too.
- **Separate `PortalSet` and `PortalStateChanged` events.** They would reduce, undo and filter identically.
- **Portals GM-only, with a GM-mediated "knock" for players.** It fails FR-GM-18, which lists both GM and player as actors.
- **Hiding locked from players** (show closed). It fails "players understand its current state", and a GM who wants a surprise can leave the door closed and refuse it at the table.
- **Requiring a player's token next to the door.** It needs a reach rule that depends on the grid and token size. It is a follow-up if tables ask for it.

## Consequences

- `Wall`, `Command` and `DomainEvent` grow. Old data parses unchanged; older servers cannot read rooms that used portals.
- A player's state now holds some walls. Client code that treated any wall as GM-only drawing must check `portal`.
- Designating portals on a fogged board resyncs players. That happens during map setup, rarely during play.

## Amendment: terrain and tactical movement

Closed/locked portals participate in swept-footprint movement collision; open portals permit passage. Window sight behavior is preserved. The terrain ruler is local advisory feedback and does not certify movement. See [ADR 0046](0046-terrain-tactical-movement.md), proposed and awaiting Real-Time Architecture review.
