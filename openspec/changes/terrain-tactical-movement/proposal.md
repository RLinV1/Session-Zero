# Proposal

## Why
Movement on main lacks terrain and checks only a token's centre path against walls. GMs need optional prepared ground, removable live effects and a private, honest movement estimate without exposing concealed layouts. Preserve main's ordinary owner movement through manual fog while enforcing the terrain feature's physical collisions.

## What Changes
- Add sparse cell terrain: implicit Normal, Blocked and Difficult, with named temporary layers and guarded undo.
- Validate the swept square footprint against Blocked terrain, walls and portals in the ordered command pipeline; allow authorized owner and GM movement through manual fog, and retain GM-only Reposition with destination checks.
- Show a mover-only distance/cost ruler with conservative knowledge feedback.
- Prepare base terrain privately, save library grid/board atomically and place prepared terrain in one reversible action.
- Preserve terrain through reload, checkpoints and filtered replay; reset explicitly on geometry changes.

## Capabilities

### New Capabilities
- `terrain-tactical-movement`: terrain preparation, live effects, swept movement, proportional cost, privacy, lifecycle and recovery.

### Modified Capabilities
- `fog-of-war`: fog conceals content while authorized owners and GMs move through it ordinarily; preserve sight, unchanged fog and concealed route/cost uncertainty.
- `portals`: swept collision, ordinary GM restrictions and generic movement refusals.
- `asset-library`: atomic revision-checked grid/board preparation with reusable base terrain.
- `map-editor`: optional private terrain preparation tools.
- `encounter-templates`: retain base terrain while omitting temporary effects.

## Impact
Shared contracts, geometry, decisions, reducers, visibility, replay and undo; library JSON stores and preparation HTTP API; map editor, board and token controls. No SQL migration or new dependency. ADR 0046 requires Raymond's review before release. Shared-file overlap with unmerged `feat/area-effects` must be reviewed at merge time.

## Non-goals
Waypoints, routing, budgets, expiry, spell resolution, exact terrain boundaries, detection, shared rulers, animation and terrain import/export.
