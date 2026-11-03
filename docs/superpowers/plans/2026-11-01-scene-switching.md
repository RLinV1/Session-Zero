# Scene switching implementation plan

> Execute with superpowers:executing-plans, using the approved scene-switching design.

Goal: keep named live scenes in one room and automatically preserve their progress.
Architecture: GM-only inactive snapshots plus the existing active board, persisted through commands/events.
Stack: TypeScript, zod, React, Socket.IO, Vitest.
Spec: ../specs/2026-11-01-scene-switching-design.md

Constraints: branch feat/scene-switching, 20 scenes, 60-character names, no new dependencies, player-filtered snapshots, backward-compatible historical replay.

## Tasks

- [ ] Kernel: add scenes.ts snapshot/list helpers, optional scene state, scene.create/rename/switch/delete and events. Test round trip, validation, authorization, old rooms, filtering, asset references, undo boundaries and replay. Watch tests fail before implementing.
- [ ] UI: ScenesPanel under GM Manage, safe pending/error states, rename/delete dialogs and confirmation, disabled current scene switch/delete. Reset board identity and grid drafts on switches. Test scene management commands and errors.
- [ ] Wire verification: two clients, hidden inactive content, restoring old scene and persisted reload, ordinary checkpoint/template behavior. Run lint, typecheck, all tests and build, review diff, commit feat: add persistent scene switching.

## Review focus

Inactive snapshots must never reach players. Same-map scenes still reset local UI. Changing scenes invalidates board undo. Historical logs without scene fields replay. Assets in inactive boards remain referenced. Tokens do not transfer across scenes.

## Ledger

Approved design and execution: user said yes go for it. Independent branch starts at 98fa91b. Main checkout untouched except planning documents and this untracked edit helper. Worktree commands require elevation because app-created directories are outside the original sandbox writable roots.


## Validation and review record

- Kernel suite: 805 cases passed, including new scene round-trip, authorization, secrecy, replay, limits and stale-editor guard coverage.
- Socket suite: scene round trip, filtered client state, reconnect, stored-log reload, checkpoint compatibility and revocation passed. Full server suite: 509 passed, 43 skipped and one existing 15-second UVTT owner-quota timeout; the same timeout reproduces on unchanged main.
- Full web suite initially passed 906 cases; four exact-payload assertions in two editor test files required the new expectedSceneId. Both files then passed all 17 cases. The earlier six affected editor/scene files passed 88 cases after their guard assertions were updated.
- Chromium browser spec passed create → switch → return → reload. Playwright MCP separately captured the header switcher and management panel with actual maps and preserved tokens.
- Independent review found stale same-map drafts and grid acknowledgement invalidation. Both were fixed, covered by scene/draft tests and reviewed again with no remaining substantive findings.
- Both features remain independent branches from 98fa91b. CSS additions use separate insertion points to avoid an unnecessary merge conflict with the ruler branch.
