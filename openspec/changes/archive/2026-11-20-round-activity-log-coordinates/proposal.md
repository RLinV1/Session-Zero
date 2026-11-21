## Why

The activity log prints token moves with raw floating-point board coordinates, such as "moved Goblin from (1987.9, 829.1000000000001) to (2057.3, 829.1000000000001)". The trailing digits are float noise from pan, zoom, and snapping arithmetic, and they make the log hard to read.

## What Changes

- The "moved" sentence in the activity log shows each coordinate rounded to at most 2 decimal places, with trailing zeros dropped: `829.1000000000001` → `829.1`, `2057.3456` → `2057.35`, `35` → `35`.
- Only the displayed sentence changes. Stored events keep the exact coordinates (invariants 5–6), so undo and replay are unaffected.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `room-activity-log`: move entries show coordinates rounded to 2 decimal places.

## Impact

- `packages/shared/src/activityLog.ts` (`formatActivity`) and its test. No schema, event, or server change, so no ADR is needed.
