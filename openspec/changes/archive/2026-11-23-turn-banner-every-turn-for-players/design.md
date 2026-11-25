## Context

- `turnBannerToken(state, you, gmEveryTurn)` in `apps/web/src/ui/TurnBanner.tsx` returns the active token for the GM only when the switch is on, and for a player only when they own it. `TurnBanner` renders **End turn** whenever `onEndTurn` is passed (everywhere but read-only views), which was safe because the banner only appeared to someone who could end the turn.
- The switch is `gmTurnBanner` in `clientSettings` (per browser, key `vtt.ui.settings`, default `false`), shown in `SettingsMenu` only when `room?.you.role === "gm"`.
- `can.endTurn` in `packages/shared/src/decide.ts` allows the GM or the token's owners; the server already refuses anyone else.
- A player's filtered initiative (`initiativeForPlayer` in `visibility.ts`) has no active entry while a hidden token has the turn, and hidden tokens are absent from their `state.tokens`.

## Goals / Non-Goals

**Goals:** one switch, same meaning for every role; End turn only where it would succeed.

**Non-Goals:** a different look for the viewer's own turn (possible later, separate change); a table-wide rule; any change to commands, the server or visibility.

## Decisions

**Keep the stored field name `gmTurnBanner`.** Renaming it (e.g. `turnBannerEveryTurn`) would need a carry-over like `LEGACY_ARROW_KEY_MOVE_KEY`, or GMs who turned it on would silently lose it. The name is internal; the doc comment is updated to say it applies to every role. Alternative considered: rename plus a one-time migration in `readClientSettings`. More code for no user-visible gain.

**`turnBannerToken` decides both "show" and "may end".** It becomes `turnBannerToken(state, you, everyTurn = false)` returning `{ id, name, round, canEnd } | null`:
- no encounter, or no visible active token → `null` (covers the hidden-token case for players, since filtered state has no active entry);
- viewer owns it, or is the GM → shown when the viewer owns it or `everyTurn` is on (GM still needs `everyTurn`, as today);
- otherwise → shown only when `everyTurn` is on.
`canEnd` is `you.role === "gm" || token.ownerIds.includes(you.id)`, mirroring `can.endTurn`. It stays a pure function so the existing unit tests keep working. Alternative considered: importing `can.endTurn` from `@vtt/shared` directly. Fine too, and keeps the rule in one place; use it if its signature takes `(Participant, Token)` as it does today. That is the preferred implementation; the inline check is the fallback.

**`TurnBanner` renders End turn on `onEndTurn && turn.canEnd`.** Show on board stays unconditional. The `busy`/`error` reset already keys on `round:id`, so moving between someone else's turn and the viewer's own works without change.

**Settings switch gated on `room`, not on role.** `SettingsMenu` shows the switch when `room` is set; the account pages have no room, so it stays hidden there.

## Risks / Trade-offs

- [A player with the switch on gets a screen-reader announcement on every turn] → They opted in, and the announcement is the point of the banner; off by default.
- [On another token's turn the banner looks the same as on the viewer's own, minus End turn] → Acceptable for now; a distinct style for "your turn" is listed as a non-goal for a follow-up.
- [The banner text on other tokens' turns reveals nothing new] → It names only tokens already in the player's filtered state and initiative tracker.
