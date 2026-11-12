## Context

- `turnBannerToken(state, you)` names the active token when the viewer owns it, and returns null for the GM.
- `initiative.endTurn` already lets the GM end any token's turn (`can.endTurn`: the GM or the token's owners).
- Personal, per-browser choices live in `clientSettings` (saved under `vtt.ui.settings`), and each field falls back to its default alone when a saved value is missing or invalid.

## Goals / Non-Goals

**Goals:** let the GM opt into the banner on every turn; rename the tab so it fits what it holds.

**Non-Goals:** a table-wide setting (this is the GM's own screen); changing what players see; new commands.

## Decisions

**A client setting, not a table rule.** Only the GM's own screen changes, so it is a per-browser choice in `clientSettings` (`gmTurnBanner`, default `false`), like the arrow-key switch, not a shared rule in the Table tab. A browser that saved settings before it existed reads the default.

**`turnBannerToken` takes the choice as a parameter.** `turnBannerToken(state, you, gmEveryTurn = false)` stays pure; `TurnBanner` reads the setting and passes it. For the GM with the choice on, the banner names the active token, whoever owns it. The GM sees every token, so there is no hidden-token case to handle. For a player the parameter changes nothing.

**Rename only the label and the tab key.** The tab key becomes `preferences` and its label "Preferences" (zh-TW 偏好設定). Nothing stores the chosen tab, so no saved value refers to the old key.

## Risks / Trade-offs

- [A GM with the switch on sees the banner across the top for the whole encounter] → Off by default, and one switch turns it off again.
