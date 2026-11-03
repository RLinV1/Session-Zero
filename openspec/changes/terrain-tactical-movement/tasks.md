# Tasks

## 1. Contracts and geometry
- [x] 1.1 Record ADR 0046 and compatible bounded terrain contracts; verify schema and legacy tests.
- [x] 1.2 Implement sparse layer operations, swept square collisions and proportional interval cost; verify adversarial geometry tests.
- [x] 1.3 Integrate ordered movement, editing, guarded undo and lifecycle fences; verify decision/reducer tests.

## 2. Privacy and preparation
- [x] 2.1 Implement conservative viewer projection and filtered replay metadata; verify concealment and replay tests.
- [x] 2.2 Add atomic owner-authorized library preparation compare-and-swap to memory and Postgres stores; verify conflicts and persistent integration.
- [x] 2.3 Include base in placement/encounters and all layers in checkpoints; verify reset, undo, restart and isolation tests.

## 3. Interface
- [x] 3.1 Add private terrain preparation with brush/rectangle and explicit geometry reset; verify editor tests and browser flows.
- [x] 3.2 Add synchronized live painting, temporary effects and filtered overlays; verify GM/player, cancellation and keyboard flows.
- [x] 3.3 Add mover ruler and one-move GM Reposition across drag, buttons and arrow keys; verify preview privacy and stale commits.

## 4. Acceptance
- [x] 4.1 Run lint, typecheck, tests, build, latency and separate-session browser acceptance; record exact results and remaining service limits.
- [ ] 4.2 Obtain Raymond's architecture review and resource-bound approval before release; record reviewer evidence.

Architecture review is intentionally open: no reviewer approval has been supplied. See verification.md for local evidence and release gates.

## 5. Manual testing follow-up
- [x] 5.1 Give Normal/Erase a translucent white preview without a Difficult symbol, preserving underlying layers.
- [x] 5.2 Replace obstruction-status text with red dashed blocked routes and faint uncertain routes.
- [x] 5.3 Keep player walls hidden and add private, authorized, concealment-safe server collision feedback with stale-reply protection.
- [x] 5.4 Verify the fixes in unit/integration tests and desktop/touch browser flows; rerun repository checks.

## 6. Ordinary GM movement through manual fog (historical; owner policy superseded by section 7)
- [x] 6.1 Apply the initial authenticated GM-only fog correction to ordinary moves, positional configuration and local/private advisory feedback; verify physical collisions, proportional Difficult cost and Reposition semantics. Section 7 supersedes its former player fog restrictions.
- [x] 6.2 Verify entry, within-fog, thin-strip crossing and exit; physical route/destination checks; concealment and rename ordering; all movement inputs; stale origin/epoch/replies and current-state drag revalidation.
- [x] 6.3 Update ADR 0046, the terrain amendment to ADR 0016 and active delta specifications; rerun Node 22.23.2 repository checks, build, strict OpenSpec validation and separate GM/player browser acceptance, recording service limitations.

## 7. Restore ordinary owner movement through manual fog
- [x] 7.1 Remove fog collision and unused role-specific branching/parameters/callers from authoritative movement and local previews; retain authorization, current physical collision validation, proportional cost, fog knowledge checks and private advisory uncertainty.
- [x] 7.2 Verify owner/GM entry, within-fog movement, thin crossings, exit, GM placement and newly covering fog; physical restrictions, privacy/sight/reconnect/replay, all player inputs, Reposition/read-only safeguards, stale context and mid-drag revalidation.
- [x] 7.3 Reconcile ADRs and active artifacts; run Node 22.23.2 lint, typecheck, full tests, build, strict OpenSpec validation and all six separate-session terrain browser projects; record actual results and clean up isolated services.

## 8. Independent review corrections
- [x] 8.1 Bound every preview traversal iteration and reject unsafe indices on both axes; verify extreme committed origins in a killable subprocess without restricting ordinary off-map movement.
- [x] 8.2 Preserve private terrain across unit/style grid saves, include Terrain in navigation guards, and require explicit resolution before geometry changes; verify rendered editor and browser flows.
- [x] 8.3 Submit room preparation through one bounded server-authorized FIFO decision and atomic append, rejecting stale/queued changes without any event prefix; verify wire, store-failure, filtering, reload and undo coverage.
- [x] 8.4 Send only changed terrain values and selected-layer erasures; chunk larger valid preparations under the unchanged paint/cell/effect limits inside the atomic save; verify fragmented 1,000-cell and 10,000-cell cases.
- [x] 8.5 Refuse incompatible saved-library placement geometry until explicit reset; verify spacing/origin, matching/cosmetic geometry, room/library isolation and reversible atomic placement.
- [x] 8.6 Run final Node 22.23.2 lint, typecheck, full tests with disposable persistence, build, latency, strict OpenSpec and all six browser projects; record exact evidence and preservation checks.
