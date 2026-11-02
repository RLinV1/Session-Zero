## Why

After Detect walls finishes, the result shows as a small preview in the Walls side panel and as an overlay on the editing canvas, and the GM must scroll the panel to press Apply. The preview image sits in a grey placeholder box until it loads, and the overlay looks like a stray shape on the map. The checkpoint preview already shows the better pattern: look in a modal, then confirm or cancel.

## What Changes

- When detection finishes with at least one wall, the Walls step opens a modal "Detected walls" showing the map with the detected walls drawn over it, the count, and Apply and Discard buttons.
- Apply is the existing apply action (into the editor draft); Discard drops the result and adds nothing. Escape and Close discard. Focus returns to Detect walls.
- The detected-wall overlay on the canvas, the side-panel preview figure and its placeholder are removed. Detection controls stay in the side panel.
- The step-through review of doubtful walls and erasing detected walls on the canvas are replaced by pink-haloed doubtful walls in the preview and an "Apply confident walls only" button.

Non-goals: new detection options, schema changes, server changes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `map-editor`: detection results are reviewed in a modal preview.

## Impact

`apps/web`: `WallSetup.tsx`, `WallCanvas.tsx`, `styles.css`, `test/mapEditorWalls.test.tsx`. No shared, server or vision changes.
