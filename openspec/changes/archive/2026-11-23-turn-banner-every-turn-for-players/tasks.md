# Tasks

## 1. Banner logic

- [x] 1.1 Change `turnBannerToken` in `apps/web/src/ui/TurnBanner.tsx` to apply the every-turn choice to every role and return `canEnd` (GM or owner, via `can.endTurn` if its signature fits); update the doc comments and the `gmTurnBanner` comment in `clientSettings.ts`. Verify with `npm test --workspace=@vtt/web -- turnBanner`
- [x] 1.2 Render End turn in `TurnBanner` only when `onEndTurn` is set and `turn.canEnd`; verify Show on board still renders for every shown banner

## 2. Settings and strings

- [x] 2.1 In `apps/web/src/ui/SettingsMenu.tsx`, show the Turn banner on every turn switch whenever `room` is set, not only for the GM; verify it is absent on the account pages
- [x] 2.2 Reword `settings.gmTurnBannerHint` (and the label if needed) in `i18n/en/common.ts` and `i18n/zh-TW/common.ts` so it fits both roles, following `docs/GLOSSARY-zh-TW.md`; verify `npm run lint` passes the i18n checks

## 3. Tests (turn-notice, FR-GM-21)

- [x] 3.1 In `apps/web/test/turnBanner.test.ts`, replace "never widens a player's banner" with cases: a player with the switch on gets another token's turn with `canEnd: false`; their own token gives `canEnd: true`; a hidden active token still gives `null`; the GM gets `canEnd: true` on every turn
- [x] 3.2 In `apps/web/test/turnBannerSetting.test.tsx`, add a player render test: switch on → banner on Goblin's turn with Show on board and no End turn button; on their own token's turn → End turn present and calls `onEndTurn`
- [x] 3.3 Add a SettingsMenu test (or extend an existing one) that a player in a room sees the switch

## 4. Docs and checks

- [x] 4.1 Update `docs/user/settings.md` (drop "(GM)", describe End turn rule), `docs/user/running-a-game.md`, and `docs/user/getting-started.md` turn banner row
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and confirm all pass
