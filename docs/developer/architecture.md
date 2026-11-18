# Architecture Tour

A practical map of the code. For the reasoning behind it, see [`../DESIGN.md`](../DESIGN.md)
§1 and ADRs [0001](../adr/0001-event-model.md) (event model),
[0002](../adr/0002-transport-and-identity.md) (transport and identity) and
[0003](../adr/0003-tactical-state.md) (tactical state).

## The packages

```
packages/shared   The contract. Pure TypeScript, no I/O. Both server and web import it.
apps/server       Express + Socket.IO. Runs the command pipeline and owns persistence.
apps/web          React panels + a PixiJS board. Sends commands, renders filtered state.
apps/mcp          MCP server for AI seats and the AI game builder. A client of apps/server.
services/vision   Python grid detection (FastAPI) and the wall-detection worker (BullMQ).
```

### `packages/shared/src`

| File | Holds |
| --- | --- |
| `commands.ts` | zod schemas for every `Command` (`noun.verb`) |
| `events.ts` | zod schemas for every `DomainEvent` (`PastTense`) |
| `state.ts` | `RoomState` and its parts |
| `protocol.ts` | Socket messages. Client → server: `command`, `ephemeral`, `resync`. Server → client: `welcome`, `event`, `redacted`, `ack`, `rejected`, `ephemeral`, `sessionEnded`. |
| `decide.ts` | `decide(state, actor, command, ctx)` → events, or a rejection. Authorization lives here. |
| `reducer.ts` | `reduce(state, event)` → next state |
| `visibility.ts` | `filterStateForViewer`, `filterEventForViewer` |
| `undo.ts` | Which events can be undone and their compensating events |
| `movement.ts`, `terrain.ts`, `sight.ts`, `geometry.ts` | Path cost, terrain, line of sight, shapes |
| `dice.ts`, `attackPresets.ts`, `attackRange.ts` | Dice pools, named attacks, range |
| `activityLog.ts`, `replay.ts` | Human-readable log lines and replay points |
| `i18n/` | Server-side message catalogs (rejections, rule labels) in English and zh-TW |

### `apps/server/src`

| Folder | Holds |
| --- | --- |
| `domain/liveRoom.ts` | The per-room FIFO queue that runs the pipeline |
| `domain/` | Room registry and lifecycle, grid and wall detection, encounter templates, build publishing |
| `ws/socket.ts` | The Socket.IO gateway: handshake auth, committed and ephemeral channels |
| `http/` | REST routes: rooms, library, creatures, encounters, animations, uploads, builds, GM settings |
| `store/` | Memory and Postgres room stores, Redis seq, S3 assets, library, identity, membership |
| `identity/` | Accounts, argon2id passwords, sessions, rate limits |
| `uvtt/` | UVTT validation (worker pool), preparation and export |

### `apps/web/src`

| Folder | Holds |
| --- | --- |
| `net/roomConnection.ts` | The sync client: `command()`, seq tracking, resync |
| `board/boardView.ts` | The PixiJS board and everything drawn on it. Pixi code stays in `board/`. |
| `board/tools.ts` | Board tool kinds and their geometry |
| `panels/` | Sidebar panels: tokens, attacks, dice, initiative, rulings, chat, scenes |
| `pages/` | Home, dashboard, library, room, map editor, encounter editor, AI builds |
| `ui/` | Shared components, Settings dialog, client settings |
| `i18n/` | Web catalogs in `en/` and `zh-TW/`, and `useT()` |
| `lighting/` | 2.5D rendering for isometric maps |

## How a command becomes state

```
web: connection.command({ type: "token.move", ... })
  │  Socket.IO "message" carrying { type: "command", ... }
  ▼
server ws/socket.ts ── zod-parse ── LiveRoom.submit(actorId, command)
  │
  ▼  (one at a time per room)
decide(state, actor, command, ctx) ──► rejected { code, message, messageId } ──► client
  │ events
  ▼
store.append(roomId, events)   ← assigns seq; (room_id, seq) is the primary key
  │
  ▼
reduce(state, event) for each event
  │
  ▼
for each connected viewer:
  filterEventForViewer(...) ──► "event" with seq (or "redacted")
ack { seq } ──► the sender
```

On connect the server sends `welcome` with `filterStateForViewer(state, viewer)`. When the
client sees a gap in seq numbers it sends `resync` and gets a fresh `welcome`. Some changes
(scene switches, sight changes, table rule changes) resync players with a filtered snapshot
instead of individual events.

## The ephemeral channel

Pings, drag and move previews, dice drops and area aim and edit previews go over the
`ephemeral` message type. The server relays them with `socket.volatile.emit`. They are never
stored and never get a seq, but they still pass visibility checks: a GM-only area's aim is
never relayed to players.

## Visibility

Hidden information is removed on the server. When you add a kind of hidden data, update
**both** filters in `visibility.ts` and test both. Today the filters cover: hidden tokens;
tokens under fog or out of sight; fog regions; walls outside what a player can see; GM-only
portals, areas and rolls; areas clipped at fog and sight; terrain (players get an effective
projection); hidden HP and AC; the hidden-map rule; inactive scenes; checkpoint names.

The `visibility-auditor` review agent (`.claude/agents/`) checks a diff for leaks.

## Persistence

| Store | Holds |
| --- | --- |
| Postgres `events` | The append-only log, keyed by `(room_id, seq)` |
| Postgres `snapshots` | Periodic state for fast load. Derived; safe to delete. |
| Postgres library, identity and membership tables | Ordinary CRUD beside the log |
| Redis | Per-room seq (`INCR`), BullMQ queues, wall-job images |
| S3 (SeaweedFS locally) | Map, token and library images |

Stored events are read back without full parsing, so a shape change to an existing event
needs an upgrade-on-read path (see `legacy-attack-dice-crash` and the ADR 0061 amendment).

## The AI seat server

`apps/mcp` speaks MCP to users' own AI apps and talks to the room server only over REST and
Socket.IO, exactly like a browser (ADR 0052). Never import `apps/server` code there. The
`/mcp/build` tools reach one private draft through a build pass (ADR 0053).
