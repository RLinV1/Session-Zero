## Context

The server already sends every client the full participant list. `ParticipantLeft` / `ParticipantRevoked` and the `left` / `revoked` flags pass both visibility filters unchanged (ADR 0006), so every client can tell "left" from "removed" today. `ParticipantsButton` filters with `isActive`; `DepartureNotices` is mounted for the GM only and only reacts to departures seen after its first snapshot. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Show AFK entries and notices to all roles using existing state only.
- Keep the GM's notice and Review flow unchanged apart from wording.

**Non-Goals:**
- Connection presence (tab closed, network drop). Needs new server tracking; separate ticket.
- Any shared package, ADR or schema change.

## Decisions

- **Derive AFK from state:** AFK = `left && !revoked`. Alternative: new event or flag. Rejected: the data already exists and a schema change would need an ADR and architecture review.
- **Reuse `DepartureNotices` for all roles** with the Review tokens action gated on a `onReview` prop that only the GM passes. Alternative: a second player-only component. Rejected: it would duplicate the known-set/first-snapshot logic that makes reloads quiet.
- **Mount in the existing `board-notices` live region**, outside GM view-as preview gating the same way as today. While the GM previews as a player, the GM's own notices stay suppressed as now.
- **AFK rows after active rows, excluded from the count and seat total.** Alternative: count them. Rejected: the seat count tells the GM how many seats are taken, and a left seat is free (room-player-cap).
- **AFK text label plus muted style**, so the state is not colour-only (WCAG 2.2 AA). Avatar stack shows active participants only; the AFK entry lives in the popover list.

## Risks / Trade-offs

- [A player who was already departed when a client first loaded is never announced] → Intended; matches the "no replay on reload" rule.
- [Two quick departures] → The known-set diff yields one notice per player.
- [Player's notice stays until dismissed] → Same as the GM's today; it is dismissible and sits in a polite live region.
