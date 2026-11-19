# ADR 0077 — Reserved entity ids

**Status:** Proposed — awaiting review by the Real-Time Architecture owner.

**Requirements:** FR-GM-15 (authorization and validation on the server). **Changes:** `decide` in `packages/shared/src/decide.ts`; adds `isReservedKey` to `packages/shared/src/state.ts`. **Extends:** ADR 0001 (event model).

## Context

`Id` was any string of 1 to 64 characters, and `decide` looks entities up by plain property access on records such as `state.tokens[command.tokenId]`. A GM could send `token.setHidden { tokenId: "constructor" }`. The lookup returned `Object`'s own function, `decide` accepted the command and emitted an event whose `tokenId` was `undefined`, the server appended it, and `reduce` then threw. The event was already in the log, so the room could never be loaded again (backend security audit 2026-11-18, M1).

## Decision

1. **`isReservedKey` names every id present on `Object.prototype`** (`constructor`, `__proto__`, `toString`, `hasOwnProperty`, and so on). `Id` itself is unchanged, so such a command still parses and is refused by `decide`, as existing tests expect.
2. **`decide` returns `not_found` for a command that carries a reserved id** in any field named `id`, `ids`, `to`, `from`, or ending in `Id` or `Ids`, before any lookup. This covers callers that do not go through the `Command` schema.
3. No event or command shape changes.

## Compatibility

No schema changes, so stored events parse as before. Ids the server generates are UUIDs.

## Alternatives rejected

- **`Object.hasOwn` at every lookup.** About fifty sites, easy to miss one in a later feature. The guard sits at one entry point instead.
- **Null-prototype records.** `reduce` builds state by object spread, which restores the prototype.

## Review

Changing an existing schema in `packages/shared` needs review by the Real-Time Architecture owner (CLAUDE.md).
