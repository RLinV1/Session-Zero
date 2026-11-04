## Why

The GM panel's Encounter templates section was cramped, and a new account with no templates saw a plain "Save" that failed with a server error when the room had no library map (FR-GM-13, ADR 0024).

## What Changes

- Save is disabled with an explanation until the room has a map; the empty state tells the GM how to save a first template.
- Template rows (this panel and the library Encounters tab) show the template's map thumbnail, looked up from the library by `mapAssetId`. No schema change.
- Panel redesign: short hint (detail in a tooltip), full-width name input, icon Save and Apply buttons, name over a muted summary; "Update existing" select only when templates exist. Accessible names ("Encounter name", "Save to", "Apply <name>") unchanged.
- Not done: the Prepare scene modal's template list (`SceneSetupModal.tsx`, another change) has no thumbnails yet; wall counts are not shown (`EncounterSummary` has none).

## Impact

`apps/web/src/panels/EncounterPanel.tsx`, `apps/web/src/pages/LibraryEncounters.tsx`, `LibraryPage.tsx`, `styles.css`, `apps/web/test/encounterPanelEmpty.test.tsx`.
