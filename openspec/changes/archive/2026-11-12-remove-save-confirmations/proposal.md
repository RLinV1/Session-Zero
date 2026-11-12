## Why

Saving asks twice. The token editor answers **Save** with "Save changes to Goblin? Everyone in the room sees the update." and a second **Confirm**, and replacing an encounter template from a room opens a "Replace encounter template?" dialog. Both slow down the GM's most frequent edits. A confirmation should mark the actions that delete something, not every save.

## What Changes

- **Token editor saves at once.** Pressing **Save** (or Enter in a field) sends the changes; the "Save changes to X?" step and its **Back** / **Confirm** buttons go away. Deleting a token still asks first, in the token editor and on the board's token card.
- **Replacing an encounter template saves at once.** The Replace button on a template row rebuilds that template from the room's board immediately; the "Replace encounter template?" dialog goes away. The existing status message reports the result.
- **Unchanged, still confirmed:**
  - deleting anything (tokens, creatures, library assets, templates, checkpoints);
  - applying a template to the room ("Replace this room's board with X?"), which also carries the template preview and the "keep this room's map setup" choice;
  - resetting terrain;
  - the unsaved-work prompts when leaving an editor (Save / Discard / Keep editing), which guard against losing work rather than confirming a save.
- Creating a token already has no confirmation step; nothing changes there.

**Unchanged:** commands, events, schemas, server, and visibility rules. This is web-only.

## Capabilities

### New Capabilities
- `token-editor`: how the token editor saves and deletes: Save applies at once, Delete asks first.

### Modified Capabilities
- `encounter-templates`: "Replace a template from a room" no longer asks for confirmation.

## Impact

- **`apps/web`:** `panels/TokenRoster.tsx` (token editor submit and confirm state), `panels/EncounterPanel.tsx` (replace dialog), the `roster.saveQ`, `roster.confirm`, `roster.confirmChanges`, `enc.replaceQ`, `enc.replaceLead`, `enc.replaceBody`, `enc.replace` strings in the English and zh-TW catalogs where nothing else uses them.
- **Tests:** `apps/web/test/tokenAttacksUi.test.tsx` (clicks Confirm after Save), `apps/web/test/libraryEncounterEdit.test.tsx` (expects the replace dialog); new assertions in `tokenEditor.test.tsx`.
- **Risk:** replacing a library template is not part of a room's event log, so it cannot be undone from the activity log. Without the dialog, a mis-tap overwrites the template. Accepted by the product owner during exploration.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
