# Proposal

## Why

Applying an encounter template (FR-GM-13) replaces every token on the board, and switching scenes (FR-GM-25) leaves each scene's tokens behind in that scene. So the party's tokens never follow the GM: after every encounter or scene change the GM recreates each player's token and re-enters its owners, HP, conditions and attacks, or relies on undo. ADR 0045 deliberately left out "automatic party transfer"; in play, that is the step GMs repeat most during a session.

## What Changes

- The apply-template confirmation and the scene switch (header switcher, Scenes section, Activate) show a **Carry to the new board** checklist of the live board's tokens. Every player-owned token is ticked by default; the GM can untick any and tick any other token.
- `encounter.apply` and `scene.switch` gain an optional `carryTokenIds`. Carried tokens are **moved**, not copied: they keep their id, owners, stats, conditions, attacks, hidden flag and saved initiative score, and leave the outgoing board (including its initiative order and token groups). A token with the same id on the incoming board is replaced.
- Carried tokens arrive **staged**: held on the new board without a position, in a new optional `TableState.staged`. A staged token gives no vision, takes no turn, cannot be moved, targeted or attacked, and is not drawn on the map.
- After the transition, the GM's board enters placement mode. **One click** places all staged tokens: the server spreads them out from that point with the existing no-stacking and wall-clearance rules, or refuses with "Not enough space". New GM-only command `token.placeStaged` and event `StagedTokensPlaced`.
- A GM-only **"Waiting to be placed"** list shows every staged token until it is placed, through reloads. The GM can tick a subset and place it with one click, so the party can be split and placement resumed at any time.
- Players see their own staged tokens in a "waiting for the GM to place you" tray; other players and non-owners see nothing of them.
- If the GM switches or applies again before placing, staged tokens appear in the next checklist, ticked.
- Applying a new map gains a fourth token choice, **Select and place**: ticked tokens (player tokens by default) wait to be placed on the new map, the rest are removed, all in one undoable action.
- Not offered when applying a template inside private scene preparation, or in temporary template-editing rooms.
- New ADR 0068, which partly reverses ADR 0045's "no automatic party transfer" and extends ADR 0050. All schema changes are additive and optional; existing events replay unchanged.

## Capabilities

### New Capabilities
- `carried-tokens`: choosing tokens to carry across a template apply or scene switch, the staged state, one-click placement, and what players see while tokens are staged.

### Modified Capabilities
- `encounter-templates`: "Apply a template to an existing room" no longer replaces every token; tokens the GM chooses to carry move to the applied board as staged tokens.

## Impact

- `packages/shared`: `TableState` (`staged`), `encounter.apply` and `scene.switch` (`carryTokenIds`), new `token.placeStaged` command and `StagedTokensPlaced` event, `decide`, `reduce`, `undo`, `visibility.ts` (both filters), `scenes.ts` (`saveScene`, `tableOf`), placement via `spreadPositions`.
- `apps/server`: `liveRoom.ts` passes the new fields through; integration tests for carrying, staging visibility, placement and undo. Postgres scene snapshots carry the new optional field without a migration.
- `apps/web`: `EncounterPanel.tsx`, `ScenesPanel.tsx` and the header scene switcher (checklist), board placement mode in `board/`, player waiting tray, `t()` strings in English and zh-TW.
- `apps/mcp`: AI seats must tolerate `staged` in snapshots; their moves on staged tokens are rejected.
- `docs/adr/0068-carry-party-tokens.md`; review by the Real-Time Architecture owner.
