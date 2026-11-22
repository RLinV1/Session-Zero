## Why

When the GM replaces a room's map, the choice of what happens to tokens already on the table ("Scale to fit", "Keep positions", "Recenter") sits inline at the top of the Grid step, above the grid tools, where it is easy to miss and crowds the editor. The choice only matters at the moment the map is applied, so it should be asked then.

## What Changes

- Pressing Apply map in a room that already has a map and at least one token opens a dialog asking what to do with the tokens already on the table, with the same three choices and "Scale to fit" selected.
- The dialog has Apply map and Cancel. Apply map sends the map, grid and chosen policy in one command, as today; Cancel closes the dialog and keeps the draft.
- The inline "Tokens already on the table" fieldset is removed from the Grid step.
- With no map or no tokens, Apply map applies straight away, with no dialog and no policy, as today.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `map-token-policy-ui` (still in change `kan-67-token-policy-ui`): the choice moves from the Apply step into a dialog opened by Apply map.

## Impact

- `apps/web/src/pages/GmPanel.tsx` (map editor Grid step and Apply), a small dialog component reusing the app's existing dialog pattern, web tests. No shared schema, server or command changes.
