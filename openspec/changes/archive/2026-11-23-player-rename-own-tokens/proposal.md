## Why

A player's token is their character, but only the GM can change its name. When a player wants to correct a typo, give a pre-generated character their own name, or rename a summoned companion, they have to ask the GM to do it. Players can already edit their tokens' HP, AC, conditions and attacks; the name belongs with those (FR-PL-04, FR-GM-08).

## What Changes

- **Owners can rename their tokens.** A token's owners see the **Name** field in the token editor and can save a new name. The GM can still rename any token. Everyone in the room sees the new name at once wherever the token is named (board label, roster, turn order, turn banner, chat, activity log).
- **Only the name.** Size, rotation, board position, image, controller and hidden stay GM-only, as does the editor's **Advanced** section.
- **A player's rename is kept as typed.** It is trimmed, refused when blank, and limited to 60 characters, but it is **not** numbered against other tokens. Numbering would add " 2" when a hidden token already used the name, which would tell the player that hidden token exists. The GM's renames keep the existing numbering.
- **Always on.** There is no Table rule to turn it off.

**Unchanged:** command, event and state schemas; visibility filters; ADRs. This changes a decision in `decide` and the token editor UI.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `token-names`: names stay unique, except that a player's rename of their own token is kept as typed and may match another token's name.
- `token-editor`: the Name field shows to a token's owners as well as the GM, and saving a new name is part of what an owner may save.

## Impact

- **`packages/shared`:** `decide.ts`, `token.configure`: `name` leaves the GM-only fields; a non-GM rename skips `uniqueTokenName`.
- **`apps/web`:** `panels/TokenRoster.tsx` (`TokenEditor`): Name field shown to anyone who may edit the token; a player's save sends `name` only when it changed.
- **AI seats (`apps/mcp`):** no code change. An AI holding a player seat gets the same right through `token.configure`.
- **Tests:** `packages/shared/test` (decide), `apps/server/test` (rename reaches other clients), `apps/web/test` (player editor).
- **Docs:** player-facing help that says only the GM can rename (`docs/user/`).
