# VTT — CSE 416

Browser virtual tabletop. Product spec: `README.md` (requirements are referenced by ID, e.g. FR-PL-02).
Team design doc: `docs/DESIGN.md`. Event model: `docs/adr/0001-event-model.md`; transport and guest identity:
`docs/adr/0002-transport-and-identity.md`; tactical state: `docs/adr/0003-tactical-state.md` —
read these before touching sync, auth, or state.
The team plans changes with OpenSpec (`/opsx:propose`, `openspec/`).

## Layout
- `packages/shared` — THE CONTRACT: zod schemas for state/commands/events/protocol, `decide`, `reduce`, visibility filters. Pure TS, no I/O.
- `apps/server` — Express + Socket.IO. `domain/liveRoom.ts` is the command pipeline. `store/` is persistence (memory, Postgres via Prisma, Redis seq, S3 assets).
- `apps/web` — React panels + PixiJS board (`board/boardView.ts`). `net/roomConnection.ts` is the sync client.
- `apps/mcp` — lets users' own AI apps hold player seats over MCP. An ordinary client of the room server: REST and Socket.IO only, never `apps/server` code (ADR 0052). `/mcp/build` holds the AI game builder's tools, which reach one private draft through a build pass (ADR 0053).
- `services/vision` — (planned) Python/OpenCV grid detection and wall parsing.

## Commands
```bash
npm install
npm run dev         # server :3001 + web :5173 (proxies /api, /socket.io, /uploads)
npm run dev:db      # same, on docker compose Postgres + Redis (migrates first; survives restarts)
npm run dev:mcp     # the AI seat server on :3002, for a room server on :3001 (not part of npm run dev)
npm test            # vitest: shared unit tests + server multi-client integration tests
npm run typecheck
npm run lint
npm test --workspace=@vtt/server -- -t "reconnect"   # run one test by name
npm run test:bench --workspace=@vtt/server         # ephemeral latency benchmark alone (runs last in npm test)
```
Run `npm run lint && npm run typecheck && npm test` before declaring any task done.

## Invariants — never violate
1. Persistent state changes ONLY via: `Command` → `decide()` → events → `store.append` → `reduce()` → broadcast. Nothing else mutates `RoomState`.
2. `reduce` and `decide` are pure and deterministic (no `Date`, `Math.random`, I/O). IDs come from `DecideContext.newId`.
3. Every payload sent to a client that contains room data goes through `filterStateForViewer` / `filterEventForViewer` — snapshots, events, REST responses, ephemeral relays.
4. Ephemeral messages (pings, previews, rulers, AoE aim) are never persisted and never get a seq.
5. Events are append-only. Undo = a new compensating event. Never delete/rewrite history.
6. Events that change existing data carry the replaced value (`previous`, `from`, full deleted entity).
7. Authorization is decided on the server. Client-side `can.*` checks are UI hints only.
8. Board positions are board coordinates (map image pixels), never screen pixels.

## Adding a feature (the standard pattern)
1. Add/extend the `Command` and `DomainEvent` schemas in `packages/shared`.
2. Handle the command in `decide` (authorization first), the event in `reduce`.
3. If it involves hidden info, update both filters in `visibility.ts`.
4. Unit tests in `packages/shared/test`, an integration test in `apps/server/test` if it crosses the wire.
5. UI in `apps/web`, sending commands through `RoomConnection.command`.

Changes to existing schemas in `packages/shared` need an ADR in `docs/adr/` and review by the Real-Time Architecture owner.

## Conventions
- TypeScript strict; no `any`. zod for anything crossing a trust boundary — DESIGN.md §2 wants runtime payload validation for FR-GM-15 and the README §8 forged-payload tests; Express has none built in, so zod supplies it.
- Commands `noun.verb`; events `PastTense`.
- Reference the FR ID in tests (`describe("... (FR-PL-02)")`) and PR titles.
- Keep PixiJS code in `board/`; React components never touch Pixi objects directly.
- UI text goes through `t()` (`apps/web/src/i18n`, English and zh-TW catalogs); no literal text in components — lint enforces it. Server text people read is a catalog id too (ADR 0054). Terms follow `docs/GLOSSARY-zh-TW.md`.
