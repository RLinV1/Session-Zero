# Tasks

## 1. Token editor

- [x] 1.1 In `apps/web/src/panels/TokenRoster.tsx`, make the editor form's submit call `save()` directly when there are changes and no upload is running, and narrow `confirming` to `"delete" | null`; remove the "Save changes to X?" block. Verify: `tokenEditor.test.tsx` gains a case "Save sends the change with no prompt (token-editor)" asserting one `token.update` command after one click and no "Confirm" button.
- [x] 1.2 Keep the delete confirmation in the token editor and `board/TokenCard.tsx` as is. Verify: an existing or new test in `tokenRosterActions.test.tsx` / `tokenCard.test.tsx` shows Delete still opens a confirmation and Keep sends nothing.
- [x] 1.3 Update `apps/web/test/tokenAttacksUi.test.tsx`, which clicks Confirm after Save, and verify it passes.

## 2. Encounter template replace

- [x] 2.1 In `apps/web/src/panels/EncounterPanel.tsx`, make the row's Replace button call `replace(template)` directly and remove the `confirmingReplace` state and its Modal. Leave the Apply dialog ("Replace this room's board with X?") untouched. Verify: `libraryEncounterEdit.test.tsx` "offers a per-row Replace …" is rewritten so one click on "Replace Crypt guards" calls `replaceFromRoom` with no dialog, and the Apply test still finds its dialog.
- [x] 2.2 Show the replace result visibly in the section (the status is screen-reader-only today), since there is no dialog any more to show that something happened. Verify: the test above asserts the text "Replaced encounter template "Crypt guards" …" is visible.

## 3. Strings

- [x] 3.1 Remove `roster.saveQ`, `roster.confirm`, `roster.confirmChanges`, `enc.replaceQ`, `enc.replaceLead`, `enc.replaceBody` and `enc.replace` from `apps/web/src/i18n/en` and `zh-TW` only where a grep shows nothing else uses them. Verify: `npm run typecheck` passes (the catalogs are typed) and `npm run lint` reports no missing keys.

## 4. Verify

- [x] 4.1 `npm run lint && npm run typecheck && npm test`.
- [x] 4.2 In the running app (`npm run dev`): edit a token's HP and Save, and see it apply with one click; delete a token and see the confirmation; Replace a template and see the result message with no dialog; Apply a template and see the dialog still opens.
