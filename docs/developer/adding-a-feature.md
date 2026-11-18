# Adding a Feature

Most features follow one path through the layers. This guide walks through it using shared
drawings (`drawing.add` / `drawing.remove`, ADR 0064) as the worked example. The `implement-fr`
skill in `.claude/skills/` automates the same steps.

Before you start, plan the change with OpenSpec (see [Workflow](workflow.md)). If you change
an **existing** schema in `packages/shared`, you also need an ADR and review by the
Real-Time Architecture owner.

## 1. Schemas: `packages/shared/src/commands.ts` and `events.ts`

Commands are named `noun.verb`. Events are named in the past tense. Every field is
validated with zod, because commands cross a trust boundary.

```ts
// commands.ts — what a client may ask for
z.object({ type: z.literal("drawing.add"), drawing: DrawingShape }),
z.object({ type: z.literal("drawing.remove"), drawingId: Id }),

// events.ts — what happened
z.object({ type: z.literal("DrawingAdded"), drawing: Drawing }),
/** Carries the whole drawing as it was (invariant 6). */
z.object({ type: z.literal("DrawingRemoved"), drawing: Drawing }),
```

An event that changes or deletes data **carries what it replaced** (`previous`, `from`, or
the whole entity). That is what makes undo, the activity log and replay possible.

## 2. `decide`: authorization first, then validation

`decide(state, actor, command, ctx)` in `decide.ts` returns events or a rejection. It's pure:
no `Date`, no `Math.random`, no I/O. New ids come from `ctx.newId()`, and dice randomness
from `ctx.random`.

```ts
case "drawing.remove": {
  const drawing = state.drawings[command.drawingId];
  if (!drawing) return notFound("drawing");
  if (!can.removeDrawing(actor, drawing)) return forbidden();   // authorization
  return accept({ type: "DrawingRemoved", drawing });           // carries the old value
}
```

Rejection text people read is a catalog id (`sharedMsg("reject.drawingOffMap")`), added to
`packages/shared/src/i18n/messages/en/` and `zh-TW/`. See [Localization](localization.md).

## 3. `reduce`: apply the event

`reduce(state, event)` in `reducer.ts` returns the next state. It's pure and must never
fail on an event that `decide` produced.

```ts
case "DrawingAdded":
  return { ...state, drawings: { ...state.drawings, [event.drawing.id]: event.drawing } };
```

If the feature should be undoable, add the event's inverse in `undo.ts`. If people should
see it in the activity log, add a line in `activityLog.ts`.

## 4. Visibility: `visibility.ts`

Decide who may see the new data, and update **both** filters:

- `filterStateForViewer`, for snapshots (`welcome`, resync, REST);
- `filterEventForViewer`, for each event as it's broadcast.

Drawings are public, so their events `pass`. A GM-only feature would hide the data from
players in the state filter and return `redacted` (or a trimmed event) in the event filter.
Getting only one of the two right is the most common leak.

## 5. Tests

| Where | What |
| --- | --- |
| `packages/shared/test/<feature>.test.ts` | `decide` and `reduce` with the fixtures: who may do it, what's refused, what the event carries, the filters for GM and player |
| `apps/server/test/<feature>.test.ts` | If it crosses the wire: several clients over real sockets, reconnect, and what each viewer receives |
| `apps/web/test/` | UI behaviour and pure web helpers |

Put the requirement ID in the `describe`: `describe("shared drawings over the wire (FR-TAC-04)")`.
See [Testing](testing.md).

## 6. UI: `apps/web`

Send commands through the connection, never by changing state locally:

```ts
const result = await connection.command({ type: "drawing.add", drawing: shape });
```

The board redraws from the new state when the event arrives. Rules for UI code:

- Pixi code stays in `apps/web/src/board/`. React components never touch Pixi objects.
- All text people read goes through `t()`. Lint fails on literal text in components.
- `can.*` helpers decide what to *show*, not what's allowed. The server decides.
- Board positions are map-image pixels, never screen pixels.

## 7. Before the PR

```bash
npm run lint && npm run typecheck && npm test
```

Ask for the `sync-reviewer` and `visibility-auditor` reviews (`.claude/agents/`) on anything
touching state, events, the pipeline or the filters.

## Checklist

- [ ] Command and event schemas, with replaced values on change events
- [ ] `decide`: authorization, validation, ids from `ctx`
- [ ] `reduce` case
- [ ] Both visibility filters
- [ ] Undo inverse and activity log line, if they apply
- [ ] Rejection and UI text in English and zh-TW catalogs
- [ ] Shared unit tests and, if it crosses the wire, a server integration test
- [ ] ADR if an existing schema changed
- [ ] `lint`, `typecheck`, `test` pass
