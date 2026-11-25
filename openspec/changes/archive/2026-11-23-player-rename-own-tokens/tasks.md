# Tasks

## 1. Server rule (packages/shared)

- [x] 1.1 In `decide.ts` `token.configure`, remove `name` from `gmFields`, and for a non-GM actor set the new name to `changes.name.trim()` instead of `uniqueTokenName(...)`; GM renames unchanged. Verify with the tests in 1.2
- [x] 1.2 Add decide unit tests in `packages/shared/test` (`describe("player renames own token (FR-PL-04)")`): owner rename is accepted and emits `TokenAppearanceSet` with unchanged size/rotation and `previous`; non-owner refused; blank refused; hidden "Dragon" + player rename "Dragon" stays "Dragon"; visible "Goblin" + player rename "Goblin" stays "Goblin"; GM rename to "Dragon" with a hidden "Dragon" gives "Dragon 2"; player sending size or rotation still refused. Run `npm test --workspace=@vtt/shared`
- [x] 1.3 Check that the player's reply and filtered event for the hidden "Dragon" case are identical to the no-hidden-token case (a `filterEventForViewer` assertion in the same test file)

## 2. Integration (apps/server)

- [x] 2.1 Add an integration test in `apps/server/test`: a player renames their own token over Socket.IO, the GM and another player receive the new name; a rename of a token they don't own is refused. Run `npm test --workspace=@vtt/server -- -t "rename"`

## 3. Token editor (apps/web)

- [x] 3.1 In `TokenEditor` (`panels/TokenRoster.tsx`), show the Name field to anyone who may edit the token (keep `autoFocus` on Name for the GM and on HP for a player), and add `name` to `changes` for a player only when the trimmed draft differs; size, rotation and Advanced stay `isGm`. Verify the editor title and Save-disabled state still behave
- [x] 3.2 Add a web test: a player opening their own token's editor sees Name, HP, Max, AC and Conditions and no Advanced or Control & visibility; changing the name and saving sends `token.configure` with `changes: { name }` only

## 4. Docs and checks

- [x] 4.1 Update the player-facing help in `docs/user/` that describes what players can edit on their tokens, to include the name
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and confirm all pass
- [x] 4.3 Run the `sync-reviewer` and `visibility-auditor` agents on the diff and address their findings
