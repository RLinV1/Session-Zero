# ADR 0050 — Optional client effect id on `terrain.effect.create`

**Status:** Proposed — awaiting Real-Time Architecture review.
**Extends/amends:** ADR 0046 terrain and tactical movement.

## Decision

`terrain.effect.create` gains an optional `effectId`. `decide` uses it as the new effect's id when no existing temporary effect has that id; otherwise (absent or duplicate) it falls back to `ctx.newId()`. `decide` stays pure and deterministic, and the event still carries the created effect, so `reduce`, undo and replay are unchanged.

## Why

A room preparation save (`scene.savePreparation`) is one atomic fold, but a layer created in the draft has no server id until its create event is decided. Letting the client propose the id lets the same save paint the new layer, and avoids a second round trip. The server remains authoritative: a colliding id is silently replaced, and the 32-effect, cell-limit and authorization checks are unchanged.

## Consequences

- No event, reducer, persistence or visibility change; players still never receive effect ids.
- Library storage stays base-only (ADR 0046); only room editors create layers.
- Old clients omit the field and behave as before.

## Update (2026-11-12)

The interface no longer creates terrain layers: the board's Terrain tool and both map editors paint Base only (change `board-tools-and-legibility`, spec `board-terrain-tool`). The planned change that added layer UI to the map editors (`terrain-effect-layers-in-map-editors`) was dropped. This decision still describes the contract: `effectId` stays an optional field on `terrain.effect.create`, and layers a room already has are kept as they are.
