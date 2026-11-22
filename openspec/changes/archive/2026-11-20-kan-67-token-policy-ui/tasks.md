## 1. Choice and command

- [x] 1.1 Add `TOKEN_POLICY_CHOICES`, `offersTokenPolicy`, `adjustedMessage` and a `tokenPolicy` argument to `prepCommand` in `mapPrep.ts`; verify with `apps/web/test/mapTokenPolicy.test.ts`.
- [x] 1.2 Add the radio group to the prepare sheet in `GmPanel.tsx`, shown only when a map and tokens exist, with "Scale to fit" first; verify `npm run typecheck` passes.
- [x] 1.3 Style radios with the existing checkbox rule in `styles.css`; verify visually in the real app (task 3.1).

## 2. Confirmation and Undo

- [x] 2.1 After Apply, show "N tokens adjusted" with Undo from the latest `MapSet` entry's `tokenChanges`; verify in the real app (task 3.1).

## 3. Verification

- [x] 3.1 Drive the real app with the Playwright MCP: room with a map and tokens, replace the map, check the three choices, the count message, Undo, and that the choice is hidden with no tokens and with no map. Record results at the end of this file.
- [x] 3.2 Run `npm run lint && npm run typecheck && npm test`, then `openspec validate kan-67-token-policy-ui --strict`.

Note on 3.1: real app on the merged tree (PR 86 plus main), one GM browser. With no map, and with a map but no tokens, no choice or message appeared. With a map and two tokens (one hidden, added over the socket because clicking the canvas to place tokens did not register in this browser): the three radios showed with Scale to fit first; Recenter reported "2 tokens adjusted" and its Undo restored the map ("GM undid the map replacement and 2 token positions"); Keep reported 1; Scale reported 2. The activity log counts matched the messages. The prepare sheet lives inside the sidebar, which auto-collapsed after an upload and hid the sheet until reopened; that is existing behaviour, not changed here. A second player browser was not run.

Note on 3.1: real app on the merged tree (PR 86 plus main), one GM browser. With no map, and with a map but no tokens, no choice or message appeared. With a map and two tokens (one hidden, added over the socket because clicking the canvas to place tokens did not register in this browser): the three radios showed with Scale to fit first; Recenter reported "2 tokens adjusted" and its Undo restored the map ("GM undid the map replacement and 2 token positions"); Keep reported 1; Scale reported 2. The activity log counts matched the messages. The prepare sheet lives inside the sidebar, which auto-collapsed after an upload and hid the sheet until reopened; that is existing behaviour, not changed here. A second player browser was not run.
