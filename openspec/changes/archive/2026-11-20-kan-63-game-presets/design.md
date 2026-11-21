## Context

See proposal.md for motivation. Today every room is implicitly D&D 5e: `ConditionId` is the 5e list plus "concentrating"; tokens carry HP/AC (`TokenStats`) and optional named attacks; `dice.roll` accepts attack context, and `roll.rule` / `roll.applyDamage` drive rulings (ADR 0010, 0011); `DEFAULT_GRID` is 5 ft per square. Rooms are created by `POST /api/rooms`, which appends `RoomCreated { name }` (and an `EncounterApplied` when created from a template, ADR 0024).

## Goals / Non-Goals

**Goals:**
- One place that defines a preset; everything else reads features, not preset ids.
- Server-side enforcement of turned-off features.
- Zero behaviour change for existing rooms and for anyone who keeps the default.

**Non-Goals:**
- Changing an existing room's preset (would need a migration story for conditions and rolls already on the board).
- Per-game condition sets beyond "D&D list" and "none", custom stat blocks, or system-specific dice.
- Presets chosen per encounter or per map.

## Decisions

### 1. Registry of plain data in `packages/shared/src/gamePresets.ts`

```ts
interface GamePreset {
  id: string;                 // stable, persisted: "free"
  name: string;               // "Free Mode"
  description: string;
  features: { attacks: boolean; conditions: boolean; armorClass: boolean };
  conditions: readonly ConditionId[];   // which conditions the editor offers
  grid: { unitsPerCell: number; unitLabel: string };
}
export const GAME_PRESETS: readonly GamePreset[] = [DND5E, FREE];  // registry order = form order
export const DEFAULT_PRESET_ID = "free";
export const GamePresetId = z.string().refine(isPresetId, "Unknown game preset");
export function presetOf(state: Pick<RoomState, "preset">): GamePreset;
```

Callers ask `presetOf(state).features.attacks`, never `state.preset === "free"`. A new game adds one object to the array (and, if it needs a feature that does not exist yet, a new flag — that is a feature change, not a preset change). `GamePresetId` is a refined string rather than a `z.enum` so the schema does not need editing per preset.

*Alternative:* store the whole configuration in the room. Rejected: the preset id plus a versioned registry is enough, keeps events small, and lets a fixed bug in a preset's defaults reach existing rooms.

### 2. Persistence: `RoomCreated.preset`, `RoomState.preset`

`RoomCreated` gains optional `preset`. `reduce` sets `state.preset = event.preset ?? "free"`; `RoomState.preset` defaults to `"free"` in `emptyRoomState`. Old logs replay as Free Mode. No command changes the preset, so `CheckpointRestored` and `EncounterApplied` (table-only) cannot. Changing `RoomCreated` and `RoomState` needs ADR 0027 and Real-Time Architecture review.

### 3. Grid defaults from the preset

The create-room route sets the initial grid from `preset.grid` by appending a `GridSet` after `RoomCreated` only when it differs from `DEFAULT_GRID` (so D&D rooms log exactly what they log today). The GM can still edit units afterwards.

### 4. Enforcement in `decide`

With `features.attacks` off: reject `dice.roll` carrying attack context, `roll.rule`, `roll.applyDamage`, and `token.create` / `token.configure` with non-empty `attacks`. With `features.conditions` off: reject `token.setConditions` with a non-empty list and `token.create` / `token.configure` with conditions. With `features.armorClass` off: reject a stats change that sets AC to a non-null value. `encounter.apply` in a room without a feature strips that feature's data (conditions, attacks, AC) from the applied tokens, deterministically, so a D&D template still loads into a Free Mode room. Rejections use code `invalid` with a message naming the feature ("Attack rolls are off in Free Mode.").

### 5. Web reads features

A `usePreset(state)` helper; the Attack section, rulings, condition pickers and markers, AC fields and "Save as creature" attack lists render only when their feature is on. The top bar shows the preset name as a small text badge after the room title; the GM dashboard's room list (which already loads room summaries) gets `preset` added to its summary and shows the name on each card. The Create room form uses a radio group generated from `GAME_PRESETS` (name + description).

### 6. Free Mode only, for now

The GM asked (2026-10-09) for Free Mode only to begin with. Free Mode turns every feature on with a 5 ft grid, so it is today's behaviour under a name. The feature flags, enforcement and stripping stay in place for the next preset and are tested with a test-only preset that turns features off. The create-room choice appears once there are two presets.

## Risks / Trade-offs

- [A feature hidden in the UI but missed in `decide`] → Enforcement tests per command in `gamePresets.test.ts`; the server integration test sends forged commands.
- [Library creatures with attacks/conditions placed in Free Mode] → The Add token path drops those fields client-side in Free Mode; the server rejects if they are still sent, with a clear message.
- [Room summary for the dashboard] → Read from the room's first event or loaded state; if the summary route has no state handy, store the preset on the room row. Decide during 2.2 from what the route already reads.

## Migration Plan

Additive with defaults: old rooms are D&D. Deploy web and server together. Rollback: rooms created as Free Mode would replay as D&D on an old server (the field is ignored), which only re-enables features — no data loss.
