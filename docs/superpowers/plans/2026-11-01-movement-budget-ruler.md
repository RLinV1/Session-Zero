# Personal movement-budget ruler implementation

Approved design: ../specs/2026-11-01-movement-budget-ruler-design.md (approval provided by user in chat).

1. Add failing geometry and settings/control tests for FR-TAC-03; retain baseline attack-range tests.
2. Implement local ruler geometry, validated per-room preferences and accessible Measure controls.
3. Connect selected controllable token origins and local budget feedback to BoardView; update requirements.
4. Run focused tests, lint, typecheck, full tests and build; review diff and commit on feat/movement-budget-ruler.

## Implementation and verification record

- Extended the personal Measure tool with local per-room allowance and distance-rule settings; no shared schemas, dependencies, network messages or turn enforcement were added.
- The seven geometry/settings/control cases pass. They cover all diagonal rules, fractional grids, exact token origins, world-grid destination snapping, token sizes, units, budget boundaries and invalid storage/input. The board integration case also passes, including the default footprint after clearing selection and no network sends.
- Independent review identified a mismatch between off-grid ruler endpoints and actual token movement. The destination now uses the shared token-center snap while retaining the exact origin, with a regression test for `(20,20)` → `(105,35)`.
- Lint, all workspace type checks, browser test types and production build passed. The shared suite passed 796 cases. The unrelated UVTT owner-quota timeout reproduces on unchanged main.
- Playwright MCP captured desktop within-budget (`15 / 30 ft`) and over-budget (`70 / 30 ft`) feedback, plus a phone viewport. The MCP browser reported no console errors for the ruler.
- The implementation stays on its independent `feat/movement-budget-ruler` branch, based on 98fa91b. Scene switching remains on `feat/scene-switching`.
