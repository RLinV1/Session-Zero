# Tasks

## 1. Setting and banner

- [x] 1.1 Add `gmTurnBanner` (default `false`) to `ui/clientSettings.ts`, with its own field check so an older saved value falls back alone. Verify: `npm run typecheck`.
- [x] 1.2 Let `turnBannerToken(state, you, gmEveryTurn)` name the active token for the GM when the choice is on, and pass the setting from `TurnBanner`. Verify: `turnBanner.test.ts` covers the GM with the choice on and off, and a player unaffected by it; `turnBannerSetting.test.tsx` shows the banner appearing for the GM when the setting turns on and End turn sending the token's id.

## 2. Settings

- [x] 2.1 Rename the Controls tab to Preferences (key `preferences`, English "Preferences", zh-TW 偏好設定), and the browser note's wording. Verify: the tab lists in `clientSettings.test.tsx` and `autoRemoveDefeated.test.tsx` read Preferences.
- [x] 2.2 Add the GM-only switch **Turn banner on every turn** and its hint to the Preferences tab, in English and zh-TW. Verify: `npm run lint` (no literal text).

## 3. Verify

- [x] 3.1 `npm run lint && npm run typecheck && npm test`.
- [ ] 3.2 In the running app: as GM, open Settings, see Preferences and the switch; turn it on, start an encounter and see the banner on a goblin's turn; End turn from it; as a player, see no switch and no banner on others' turns.
