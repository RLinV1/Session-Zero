## Why

Each checkpoint row shows Preview, Restore and Delete. Restore already opens the read-only preview (with its Restore confirmation), so Preview and Restore open the same dialog. Two buttons for one action confuse the GM about whether Restore acts at once.

## What Changes

- Remove the separate Preview button from each checkpoint row. A row offers only Restore and Delete.
- Restore keeps opening the read-only board preview; the restore happens only from the preview's Restore button.
- No change to commands, events, schemas or the server.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `checkpoints`: previewing a checkpoint is reached through its Restore button, not a separate Preview button.

## Impact

- `apps/web/src/panels/CheckpointsPanel.tsx`, `apps/web/test/checkpointsPanel.test.tsx`.
