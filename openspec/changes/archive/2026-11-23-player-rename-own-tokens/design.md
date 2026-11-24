## Context

- `token.configure` (`packages/shared/src/decide.ts:571`) already accepts `changes.name`. It checks `can.editToken` (GM or owner), then refuses a non-GM whose changes touch any of `gmFields`: name, position, size, rotation, image, owners, hidden.
- A rename is numbered with `uniqueTokenName(state, name, token.id)` (`decide.ts:609`), which compares against every token in the room, hidden ones included, and emits `TokenAppearanceSet { name, size, rotation, previous }`.
- In the web client, `TokenEditor` (`apps/web/src/panels/TokenRoster.tsx`) shows the Name field only when `isGm` (`:618`) and puts name, size and rotation into `changes` only for the GM (`:560-561`).
- Player state is filtered: hidden tokens are not in a player's `state.tokens`.

## Goals / Non-Goals

**Goals:** owners rename their own tokens; nothing the player gets back depends on hidden tokens' names.

**Non-Goals:** player control of size, rotation, position or image; a Table rule to lock renames; changes to the `TokenAppearanceSet` event or any schema.

## Decisions

**Take `name` out of `gmFields`; keep everything else.** The existing `can.editToken` check already limits renames to the GM and owners, and the blank check already runs for every rename. Alternative considered: a new `token.rename` command. It would need a schema change and an ADR for something `configure` already carries.

**A non-GM rename skips `uniqueTokenName`.** For a player, the name is `changes.name.trim()`; for the GM, it is numbered as now. The event's `size` and `rotation` are the token's current values, so `TokenAppearanceSet` is unchanged and its `previous` still allows undo. Alternative considered: numbering against only the tokens the player can see. It avoids duplicates among visible tokens but still makes numbering depend on what is hidden from whom, and the user chose to keep player renames exactly as typed.

**The 60-character cap needs no new code.** `CommandName(60)` already bounds the field in the schema.

**The editor's name goes into `changes` for anyone who may edit.** For a player, only `name` is added, and only when the trimmed draft differs from the token's name; size and rotation stay behind `isGm`. Name keeps `autoFocus` for the GM; for a player, HP keeps it, so the field order a player is used to doesn't change.

## Risks / Trade-offs

- [Two tokens can share a name, which breaks the old "names are unique" rule that the roster, turn order and activity log rely on to point at one token] → Commands and AI seat tools address tokens by id, not name. Duplicates are a display matter, and the GM can rename either token. The spec now says so (token-names).
- [A player renaming to a deleted token's name blocks the GM's undo of that deletion, with "Can't undo: another token is now named …" (`undo.ts:421-423`)] → Rare, and the message goes to the GM only, so nothing leaks to the player. The GM can rename and then undo. Accepted.
- [A hidden token and a player's token share a name until the GM reveals it] → Same as above; accepted.
- [An AI holding a player seat can rename the tokens it owns] → It already edits those tokens' HP and conditions under the same rule; consistent.
