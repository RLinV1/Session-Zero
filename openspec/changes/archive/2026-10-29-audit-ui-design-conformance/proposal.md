# Proposal

## Why

`apps/web` has grown through many feature changes (attack FX, dice skins, map editor, library, GM dashboard). Nobody has checked the result as a whole against the accepted interface rules in `docs/FRONTEND-CONTRACT.md` §13 and `docs/INTERFACE.md` §11. README §6 commits us to WCAG 2.2 AA for non-canvas UI, and §8 promises usability testing with outside GMs and players. Before those tests, we need to know where the UI drifts from the design system, layout, interaction, state and accessibility rules.

## What Changes

- Run a **read-only** design-conformance audit of `apps/web` against 30 numbered principles in six groups:
  - A: visual system
  - B: layout
  - C: interaction
  - D: interface states
  - E: accessibility
  - F: architecture boundaries visible in UI code
- Two passes:
  - A static pass over the source, giving `file:line` evidence.
  - A runtime pass on isolated dev servers. It covers four viewports, keyboard-only use, computed styles, measured contrast, reduced motion, and the empty, loading, error and offline states, with a GM and a socket-script player.
- Write one report, `docs/audits/ui-design-audit-2026-10-29.md`. It contains:
  - A per-principle status table.
  - Findings ranked by severity: Blocker, Major or Minor.
  - A doc-conflicts section that keeps unbuilt or superseded features apart from violations.
  - A step-by-step verification log.
- Do **not** change any source file, test, schema, style or doc other than the new report and this change's own verification log. Each finding is a candidate for its own later change proposal.

## Capabilities

### New Capabilities

None. The audit adds no system behaviour.

### Modified Capabilities

None. The audit changes no requirement. This change sets `skip_specs: true`, because it only produces documentation. Fixes it recommends will be proposed separately, each with its own spec delta (for example against `room-ui-refinements`, `room-navigation` or `gm-dashboard`).

## Impact

- **New files**
  - `docs/audits/ui-design-audit-2026-10-29.md`. This also creates `docs/audits/`.
  - `openspec/changes/audit-ui-design-conformance/verification-log.md`, a working trace that the report's log is copied from.
- **Code**: none modified. Reads `apps/web/src/**`, `apps/web/package.json`, `docs/FRONTEND-CONTRACT.md`, `docs/INTERFACE.md`, `CLAUDE.md` and `README.md`.
- **Runtime**: starts the `server-isolated` (:3101, seeded dev account) and `web-isolated` (:5273) launch configs. The user's own dev servers and `vtt` database are not touched. Creates throwaway rooms and guest seats in the isolated server's in-memory store. Those are lost when the server stops.
- **Team**: findings touch areas owned by Antonio (board/interface direction) and Vincent (UX/accessibility). The report is input for them, not a decision.
