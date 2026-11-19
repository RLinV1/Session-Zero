# ADR 0078 — Backend audit hardening: room ceilings, image paths, names, player view

**Status:** Proposed — awaiting review by the Real-Time Architecture owner.

**Requirements:** FR-GM-15, FR-GM-23. **Changes:** `commands.ts`, `decide.ts`, `names.ts`, `protocol.ts`, `visibility.ts`, `movement.ts` in `packages/shared`; `liveRoom.ts`, `roomRegistry.ts` in `apps/server`. **Extends:** ADR 0001, ADR 0077. Source: backend security audit 2026-11-18 (M1, M3, M4, M8, L5, L6, L8).

## Decision

1. **Commit never persists an unreducible event (M1).** `LiveRoom.commit` reduces the decided events against the current state before `store.append`; a throw leaves the log untouched. Reserved ids stay handled by ADR 0077; `Id` is unchanged so stored events and existing tests parse as before.
2. **Ceilings (M3).** `MAX_TOKENS_PER_ROOM = 500`, checked in `createTokens` (create, duplicate, encounter placement). `MAX_EVENTS_PER_ROOM = 250000`, checked in `decide` against `ctx.lastSeq`. `RoomRegistry.evictIdle(idleMs)` forgets loaded rooms with no clients and no queued work; the host process decides when to call it. `participant.leave` and the GM revokes (`participant.revoke`, `participant.revokeMany`) are exempt from the event ceiling, so a seat can always be removed; the ceiling only blocks commands that grow the room.
3. **Relay and obstacles (M4).** `movementObstacles` is cached per state object (`WeakMap`). `LiveRoom.relayEphemeral` drops relays beyond 600 per room per second, on top of the per-participant limits.
4. **Image paths (M8).** In command schemas, `imageUrl` and `scene.setMap` `map.url` must be an origin-relative path (`^/(?!//)[A-Za-z0-9._/-]*$`): no scheme, host, query or backslash, so a GM can no longer point players' browsers at a third party. The `MapImage` and `Token` state schemas are unchanged, so historical events still parse. Guest rooms stay limited to `/img/` by `isBuiltinImageUrl`. Narrowing to `/uploads/<name>` and `/img/…` exactly is left for when the existing fixtures that use bare paths such as `/m.png` are moved.
5. **Names (L5).** Command and request names (token, room, display) drop control and format characters (U+200C and U+200D are kept for Persian and Indic scripts); a name left empty is refused. `normalizeName` also drops every control and format character, so "Al​ice" and "Alice" are one name. A name must contain a visible character: not whitespace, control or format, default-ignorable, a bare combining mark or the Braille blank, so U+034F, a lone joiner and U+2060 are refused.
6. **Player view (L6).** `filterStateForViewer` copies an allow-list of public fields (`PLAYER_VISIBLE_KEYS`) and then adds the filtered ones. A new `RoomState` field is GM-only until listed there.
7. **Token positions (L8).** `token.create`, `token.duplicate`, `token.move` and `token.configure` refuse a position more than 10 cells outside the map (1,000,000 units when there is no map), answering `reject.moveUnavailable`.

## Not changed

- **L3 (hidden-wall oracle through `token.move`).** Judging a move by only the walls a player can see would let them walk through hidden walls. Telling the two apart in the answer is the oracle. Accepted: a player who bumps a wall learns a wall is there, as at a real table.

## Compatibility

No event shapes change. New rejection ids: `reject.tooManyTokens`, `reject.roomLogFull` (English and zh-TW).

## Review

Changing an existing schema in `packages/shared` needs review by the Real-Time Architecture owner (CLAUDE.md).
