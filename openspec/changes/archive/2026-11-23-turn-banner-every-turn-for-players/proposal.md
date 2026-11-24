## Why

**Turn banner on every turn** is a GM-only switch, so players only learn a turn has started when it is theirs. A player who wants to follow the fight (who is up, so they can plan) has to keep watching the initiative tracker. The banner already does this for the GM; players should be able to opt in too, without being offered an **End turn** they can't use.

## What Changes

- **The switch is for everyone in a room.** **Turn banner on every turn** in Settings → Preferences is shown to players as well as the GM, still off by default, still saved in this browser and shared by every room. It is not shown outside a room (the account pages).
- **Players with it on see the banner on every turn they can see.** The banner names the active token and the round and offers **Show on board**. A token hidden from the player still gives no banner.
- **End turn only where the viewer can end the turn.** A player gets **End turn** on the banner only while a token they own has the turn. The GM keeps **End turn** on every turn, as today.
- **Hint text** for the switch is reworded for both roles (English and zh-TW), and the user docs drop the "(GM)" label.

**Unchanged:** commands, events, schemas, server, visibility filters. The server already lets the GM or a token's owners end its turn. A player who leaves the switch off sees exactly what they see today.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `turn-notice`: the every-turn banner becomes a choice for players as well as the GM, and End turn shows only to a viewer who can end that turn.
- `client-settings`: the Preferences tab shows **Turn banner on every turn** to everyone in a room, not just the GM.

## Impact

- **`apps/web`:** `ui/TurnBanner.tsx` (`turnBannerToken` applies the choice to every role and says whether the viewer may end the turn; End turn rendered only then), `ui/SettingsMenu.tsx` (switch shown to everyone in a room), `i18n/en/common.ts` and `i18n/zh-TW/common.ts` (label and hint).
- **Tests:** `apps/web/test/turnBanner.test.ts` (the "never widens a player's banner" case flips), `apps/web/test/turnBannerSetting.test.tsx` (player cases).
- **Docs:** `docs/user/settings.md`, `docs/user/running-a-game.md`, `docs/user/getting-started.md`.
- **No change** to `packages/shared`, `apps/server`, or any ADR.
