# Proposal

## Why

When "Auto-remove defeated tokens" is off (ADR 0049), a token at 0 HP or below stays on the board looking exactly like a healthy one. The table can't tell at a glance who is down, and with `token-no-stacking` a downed token stops occupying its square, so the board needs to show which tokens those are (FR-TAC-07).

## What Changes

- A token whose HP the viewer holds and is 0 or below is drawn **downed**: its art (image or color disc) mostly greyscale (75%), with a small red X over it.
- The downed look replaces the Unconscious condition's partial grey when both apply. Other condition effects (tilt, fade, badges) still apply.
- The marker follows what each viewer is allowed to know. With "Hide HP from Players" on (ADR 0057), a player gets no HP for tokens they don't own, so those tokens show no marker for them. The GM and the token's owners always see it. Nothing new is sent to clients.
- The defeat fall animation of an auto-removed token is unchanged.
- Web client only: no command, event, state or filter changes.

## Capabilities

### New Capabilities
- `downed-token-marker`: how the board shows a token at 0 HP or below, and to whom.

### Modified Capabilities
<!-- None: no existing requirement changes. -->

## Impact

- `apps/web/src/board/effects.ts` (`artStyleFor` gains a downed input and stronger greyscale), `apps/web/src/board/boardView.ts` (`drawToken` redraw key and the X decoration, `drawConditionLook`).
- Tests in `apps/web/test`.
- No server, shared-contract or visibility changes. With option A nothing is newly revealed: the marker is computed only from HP the viewer already holds.
