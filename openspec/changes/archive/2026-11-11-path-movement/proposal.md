# Proposal

## Why

Moving a token across Difficult terrain is costed two different ways today. The ruler doubles each Difficult square entered: A → D1 → D2 → B costs 25 ft. The drag readout doubles the share of the move where the token's footprint overlaps Difficult ground: the same move costs 30 ft. The drag also ignores the diagonal rule, which is a private per-browser preference, so players can see different costs for the same move. And a drag only ever goes in a straight line, so the server refuses it if anything is in the way.

## What Changes

- **Two new GM table rules** on the Settings Table tab, with no hint text:
  - **Diagonals:** Equal cost (default) / Alternating (1, 2) / Euclidean. It replaces the private Diagonals select in the movement planner. The movement allowance stays personal.
  - **Difficult terrain applies:** On entry (default) / On exit / Both. A step costs ×2 when the square entered is Difficult (On entry), when the square left is Difficult, including the starting square (On exit), or when either is (Both, ×2 once, never ×4).
- **Per-step movement cost.** A step's base length comes from Diagonals (1 square; diagonals 1, then 1, 2, 1, 2 … under Alternating, or √2 under Euclidean). The Difficult rule decides whether it doubles. For tokens larger than one square, the whole footprint counts: the squares it leaves and the squares it lands on. This replaces the proportional footprint-overlap cost.
- **Cheapest-path drag** for tokens snapped to the grid. The drag shows the cheapest valid path to the target square under both rules, avoiding Blocked terrain, walls, and closed or locked doors and windows that the viewer knows about:
  - The GM's client knows every wall.
  - A player's client knows the walls they can see, once `visible-walls-for-players` ships; until then their paths avoid only terrain and portals.
  The readout shows the path's movement cost against the viewer's allowance. Free-placed tokens keep the straight drag.
- **Moves carry their path.** `token.move` gains an optional `via` list of points, and the server checks each leg with today's swept-route checks. `TokenMoved` carries `via` so every screen animates along the path. A refused leg refuses the whole move.
- **BREAKING (schema):** the `token.move` and `TokenMoved` fields, two new commands and events for the rules (each event records the value it replaced), and new optional `RoomState` fields. Needs a new ADR and review by the Real-Time Architecture owner.
- **Unchanged:** line-of-sight range, area templates and the Alt free-hand ruler.

## Capabilities

### New Capabilities
- `path-movement`: per-step movement cost under the Diagonals and Difficult terrain rules, the cheapest-path drag, and moves that carry and are checked along their path.

### Modified Capabilities
- `table-rules`: the Table tab gains "Diagonals" and "Difficult terrain applies", with the same GM-only, refuse-unchanged-value and shared-by-everyone rules as the existing four.

<!-- The proportional cost requirement ("Proportional private ruler") is in the in-flight `terrain-tactical-movement` change, not yet in openspec/specs. This change replaces it; reconcile when both are archived. -->

## Impact

- `packages/shared`: `state.ts` (rule fields and helpers), `commands.ts`/`events.ts` (`token.move` `via`, `TokenMoved` `via`, rule commands and events), `decide.ts` (per-leg validation), `reducer.ts`, `activityLog.ts`, `movement.ts` (step cost, path search with Alternating parity), `visibility.ts` (a `via` through concealed ground must not leak).
- `apps/server`: the movement-preview channel reports on whole paths; latency benchmark rerun.
- `apps/web`: `boardView.ts` drag path drawing and readout, `movementRuler.ts`/`MovementControls.tsx` (Diagonals removed from the private panel), `SettingsMenu.tsx` Table tab, path animation for `TokenMoved` with `via`.
- `docs/adr/`: a new ADR. `docs/DESIGN.md` command table.
- Tests: step-cost cases including the A → D1 → D2 → B example under each rule (25 / 25 / 30 ft), large tokens, Alternating parity, path search around Blocked terrain and walls, per-leg refusal over the wire, and that a player's `via` never reveals concealed geometry.
