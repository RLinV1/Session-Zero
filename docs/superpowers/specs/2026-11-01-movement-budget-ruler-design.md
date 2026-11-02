# Personal movement-budget ruler

Proposed branch: `feat/movement-budget-ruler`. Commit messages use `feat:` / `test:` / `docs:` as appropriate. Start independently from the same base as scene switching.

## Intent

Extend the existing personal Measure tool so a player can judge a move against an allowance. Measurements and drawings remain local; shared AoE behavior stays unchanged.

## Approaches

Recommended: extend the local Measure tool with an editable movement allowance and distance-rule selection. This completes the planning interaction without imposing a particular game's turn rules or extending shared token schemas.

Alternative: add server-enforced per-token speed and movement spent each turn. That requires decisions about dashing, teleporting, forced movement, out-of-turn movement and GM overrides, beyond the requested ruler.

## Proposed behavior

- In Measure mode, show a movement allowance input in the map's units and a distance-rule selector. Remember these settings locally for this room. Default allowance: six grid cells (30 ft on the default grid).
- When a controllable token is selected, use its center as the measurement origin; otherwise keep the existing point-to-point measurement interaction.
- Display distance / allowance and remaining or excess distance in text, with color as supporting feedback. For example: `20 / 30 ft · 10 ft remaining` or `40 / 30 ft · 10 ft over`.
- Offer equal-cost diagonals, alternating diagonal costs (1 then 2 cells), and Euclidean distance. Preserve the existing default of equal-cost diagonals. Free measurement uses straight-line distance.
- A token's size must not introduce an artificial offset into the measurement origin. Use board coordinates and grid units so results remain correct under pan, zoom and different map scales.
- Validate allowance as finite, positive and at most 100,000 map units. Invalid input shows a usable field error and does not replace the last valid setting. Recover safely from invalid local storage.
- A ruler previews one prospective move. It does not accumulate movement across moves or reset on initiative turns, and it does not prohibit token movement. Walls continue to use the existing server movement checks.
- Touch and keyboard-accessible controls use existing UI patterns. Feedback includes text and readable contrast. Hide ruler controls when another board tool is active.
- Send no ruler data to other clients and write no room events for measurements or allowance settings.

## Implementation constraints

Keep the change in web measurement geometry, board marks/rendering, Measure controls and local settings. Do not change attack-range calculations when adding ruler-specific distance rules: existing callers keep their current defaults. No new dependencies or shared state schema changes are needed. Update the project requirements description to distinguish the personal movement planner from the obsolete shared-ruler wording.

## Verification

Test straight and diagonal distances under each rule; alternating diagonal parity; grid offsets, units and token sizes; exact-budget and over-budget feedback; valid and invalid persisted settings; selected-token origin and ordinary point measurement; personal-only behavior and existing measurement callers. Run lint, typecheck, the full test suite and build before completion.

## Approval

Approved by the user in chat on 2026-11-01: planning-only allowance, no per-turn movement tracking.
