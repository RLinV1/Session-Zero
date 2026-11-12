## Why

The GM runs every turn that isn't a player's, but the turn banner, with its **End turn** button, only ever shows to a token's owner. A GM who wants to hand the turn on from the top of the screen, as players do, has to reach for the initiative controls instead. Some GMs want the banner on every turn; others don't, so it is a choice.

The Settings tab that holds this kind of personal choice is called **Controls**, which fits the arrow-key switch but not a banner. **Preferences** names what the tab holds.

## What Changes

- **GM turn banner on every turn, as a setting.** A new switch in Settings, **Turn banner on every turn**, shown to the GM only and off by default. While it is on, the GM gets the turn banner on every token's turn, naming the token and the round, with **Show on board** and **End turn**. End turn ends that token's turn, which the server already allows the GM to do. Players are unaffected: they still get the banner only on their own tokens' turns.
- **Controls tab renamed to Preferences.** Same place in the dialog, same arrow-key switch, now with the GM's banner switch beneath it.
- The choice is saved in this browser and shared by every room, like the other settings in that tab.

**Unchanged:** commands, events, schemas, server and visibility rules. This is web-only.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `turn-notice`: the GM gets the banner on every turn when they choose to.
- `client-settings`: the Controls tab is renamed Preferences and holds the GM's turn banner switch.

## Impact

- **`apps/web`:** `ui/TurnBanner.tsx` (`turnBannerToken` takes the GM's choice), `ui/clientSettings.ts` (`gmTurnBanner`, default off), `ui/SettingsMenu.tsx` (tab renamed, the switch for the GM), English and zh-TW strings.
- **Tests:** `turnBanner.test.ts`, a new `turnBannerSetting.test.tsx`, and the tab names in `clientSettings.test.tsx` and `autoRemoveDefeated.test.tsx`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
