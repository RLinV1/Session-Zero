# Design

## Context

- `AttackDice` (`packages/shared/src/attackPresets.ts`) is a `z.preprocess(upgradeAttackDice, …)`, so anything that is **parsed** reads the old `{ count, sides, modifier }` as one term. That covers commands, saved creatures (`postgresRoomStore.ts:1557` parses `TokenAttacks`) and AI drafts (`build.ts` `DraftDice`).
- Two stored reads are **not** parsed, only cast:
  - `PostgresRoomStore.loadEvents` (`postgresRoomStore.ts:320`, `r.payload as unknown as DomainEvent`). It feeds `LiveRoom` construction and reload (`liveRoom.ts:130, 554`) and the history and replay routes (`routes.ts:395, 410, 422`). The first-event read for room summaries (`:466`) uses the same cast.
  - The encounter template read (`toEncounterRecord`, `row.data as unknown as EncounterRecord["data"]`). `encounter.apply` itself is safe: `resolveEncounter` (`apps/server/src/domain/encounterTemplates.ts`) parses the data through `EncounterTemplateData`, whose tokens use `TokenAttacks`, so applied tokens are already upgraded. The other readers of the record (`http/encounterEdits.ts`, `http/build.ts`) take the cast data as-is, so upgrading in the mapper is a safeguard that gives them the current shape too.
- Tokens with attacks enter state through many events: `TokenCreated`, batch creates, staged and carried tokens, saved-scene tables, encounter application, and `TokenAttacksSet` (`attacks` and `previous`). They all embed `Token` / `TokenAttacks`.
- The web side trusts state: `presetsForToken` returns `token.attacks` as-is, and `attackStats`, `presetSummary` and `AttackForm` call `attackExpression` → `formatExpression` → `e.terms.map`.
- `App.tsx` renders one route element (`<RoomPage key={route.roomId} …/>`, lazy-loaded). There is no error boundary anywhere in `apps/web/src`, so a render throw unmounts the root. That is why browser Back showed nothing until a reload.

## Goals / Non-Goals

**Goals:**
- Rooms with pre-ADR-0061 attacks load and work in every browser, with no data migration and no rewritten events.
- No new event is ever written with old-shape dice.
- One bad value can't black out the app: the room fails with a recoverable screen, and navigation keeps working.

**Non-Goals:**
- Parsing every stored event through the full `DomainEvent` schema. Old events may fail today's stricter rules for unrelated reasons, and `room-load-isolation` would then refuse whole rooms.
- Explaining why Firefox didn't crash on the same room.
- A general client-side validation layer for snapshots.

## Decisions

1. **Upgrade on read, with one pure shared function.** Add `upgradeStoredAttacks(value)` next to `upgradeAttackDice` in `attackPresets.ts`. It walks a JSON value and, for every object with an `attacks` array (tokens) and for `TokenAttacksSet`'s `attacks` / `previous`, replaces each preset's `toHit` / `damage` with `upgradeAttackDice(…)`. It returns the input unchanged (same reference) when nothing needed upgrading, so loads of modern rooms pay one walk and no copies. It is pure and deterministic, so it fits invariant 2, though it runs before `reduce`, not inside it.
   - *Alternative: upgrade inside `reduce`.* Rejected. Tokens enter state through many reducer arms, and missing one reintroduces the bug. `reduce` should also stay ignorant of storage history.
   - *Alternative: a one-off SQL/Prisma migration that rewrites payloads.* Rejected. It violates invariant 5 (append-only history) and wouldn't cover encounter templates exported or imported later.
   - *Alternative: full `DomainEvent.parse` on load.* Rejected; see Non-Goals.
2. **Call it at the store boundary.** `loadEvents` (both stores, so tests and production share one path), the first-event summary read, and the encounter template mapper all pass payloads through `upgradeStoredAttacks`. The memory store holds already-parsed events, but calling the function there too means a test can seed an old-shape event and exercise the real path.
3. **Web formatters read defensively.** `presetsForToken` maps each preset's dice through `readPool` (already used for browser-stored settings). A preset whose dice are unreadable keeps its name but has `toHit` / `damage` set to `null`, so it shows no formula and the roll button stays disabled, as for an attack without that roll today. This doesn't replace Decision 1. It keeps a future bad value from taking down the panel.
4. **Error boundary at the route, keyed by the route.** A small class component `RouteErrorBoundary` in `apps/web/src/ui/` wraps the element `App` renders for each route, with `key` set to the current path. Navigating, including browser Back, mounts a fresh boundary, so the library renders without a reload. For room routes the fallback is the room failure screen (text via `t()`, ids added to the English and zh-TW catalogs, terms per `docs/GLOSSARY-zh-TW.md`) with Reload and Back to home. It focuses its heading and logs the error with `console.error`. It shows no error text.
   - *Alternative: one boundary at the root in `main.tsx`.* Rejected. It would need its own reset on navigation and would hide the router too.
5. **Amend ADR 0061** with an "Amendment: where old dice are upgraded" section. Stored events and encounter templates are upgraded on load by `upgradeStoredAttacks`, and writers built from stored data emit the current shape. The ADR is under review already, so this goes to the same Real-Time Architecture owner.

## Risks / Trade-offs

- **Walk cost on every room load.** It is one linear pass over event JSON, which load already does, and it allocates only where something changes. → Acceptable. If profiling disagrees, the walk can skip event types that cannot hold tokens.
- **Other old shapes might exist** beyond attack dice (other stored fields cast unparsed). → Out of scope here; the boundary from Decision 4 limits the damage. The tasks include a grep over `as unknown as` reads to list them for a follow-up.
  Follow-up candidates (task 2.5): stored JSON that `PostgresRoomStore` still casts without parsing, none of which holds named attacks:
  - map boards: `findLibraryMapBoard` (`row.board`) and the asset mapper (`row.board`, `row.grid`);
  - dice-look faces: the face update read and the dice-look mapper (`row.faces`);
  - library animation definitions: `row.def`.

  Each would need its own check that older rows still match today's schema.
- **Undo of an old `TokenAttacksSet`** restores `previous`. Since `previous` is upgraded on load, the compensating event carries the current shape. → This is desired, and a test covers it.
- **Replay and history** now show upgraded dice for old events. The meaning is identical and the formula text is the same (`1d20+4`). → No visible change.
