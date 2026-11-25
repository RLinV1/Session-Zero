# Proposal

## Why

"Reduced animations" is one on/off switch, and turning it on gives up more than many viewers want. It removes the hit and miss feedback and token slides along with the showy strike effects, but still draws a still ring for every strike. Viewers need a middle step that drops the attack effects but keeps the table readable, and a true "no animations" step for people who want nothing moving. The switch also still reads a GM table-wide flag (`RoomState.reducedEffects`) that no UI can set since the GM switch was removed. A room where it was turned on earlier stays reduced for everyone, and nobody can turn it off.

## What Changes

- **BREAKING (client setting):** The Graphics tab's "Reduced animations" switch becomes an **Animations** choice: **Full**, **Reduced** or **None**, defaulting to Full. A browser that saved the switch on keeps that choice as **Reduced**.
- The device's `prefers-reduced-motion: reduce` forces **None** and can't be overridden. While it applies, the choice shows None, can't be changed, and explains why.
- **Reduced:** no strike animation and no still ring for it. Hits and misses show a still ring with no label and no token shake. The "Miss" text is gone. Damage numbers are plain, fading and still. The nuke shows today's still centre ring with plain numbers. Dice behave as today's reduced mode (no throw, the result card appears with no slide). Tokens still slide. A defeated token fades over 200 ms. The board never pans or zooms to an attack. Pings, conditions, fog and CSS transitions behave as today's reduced mode.
- **None:** the same as Reduced, except there is no hit or miss ring, no damage numbers and nothing for the nuke. Tokens jump instead of sliding, and a defeated token disappears at once.
- The attack editor's animation preview, and the home page's attack demo, aren't shown on Reduced or None. The Animation Editor's preview keeps playing every animation in full at every level, because it's where people make animations.
- Clients stop reading the GM table-wide flag `RoomState.reducedEffects`. Its command, event and state field are left as they are. Nothing in the shared contract changes.

## Capabilities

### New Capabilities
- `animation-levels`: the three-level Animations setting, how the device preference forces it, the migration from the old switch, and what every board effect does at each level. Other specs' "reduced motion" means the Reduced or None level.

### Modified Capabilities
- `client-settings`: the "Reduced animations compose with existing preferences" requirement is replaced. The level composes with the device preference only, and the room flag is ignored.
- `board-attack-effects`: the "Reduced motion" requirement is rewritten for the two levels, and the GM table-wide setting is removed. Reduced-level sound cues no longer depend on a still marker being drawn.
- `token-slide`: a move jumps only at the None level, not at Reduced.
- `attack-rolls`: the attack editor's preview stage is hidden at Reduced and None, instead of showing the still version.
- `library-animations`: the Animation Editor's preview always plays the whole animation, whatever the level. That's the behaviour the code already has.
- `area-effects`: resolve damage numbers are plain on Reduced and absent on None.
- `gm-nuke`: the blast shows the still marker and plain numbers on Reduced, and nothing on None. The stale requirement that a Reduced animations control sits below Detonate is dropped.

## Impact

- **Web only.** `apps/web/src/ui/clientSettings.ts` (new field and migration), `ui/SettingsMenu.tsx`, `ui/motion.ts`, `board/effects.ts` (`effectiveReducedMotion`, `attackPlan`), `board/boardView.ts`, `board/EffectsOverlay.tsx`, `board/Board.tsx`, `board/nukeFx.ts`, `board/nukeHealth.ts`, `board/fx.ts`, `ui/Die3D.tsx`, `panels/AttackPanel.tsx`, `panels/attackEditorContext.ts`, `panels/RoomPanel.tsx`, `pages/home/AttackStage.tsx`, and the i18n catalogs (English and zh-TW).
- **No changes to the shared contract or the server:** `packages/shared` and `apps/server` are untouched, so no ADR is needed. ADR 0038's "effective reduced motion" note becomes out of date, and design.md records the new rule.
- **Tests:** web unit tests for settings migration, the level helper, the overlay and the attack editor preview. Existing tests that set `reducedEffects: true` on room state to get reduced visuals have to switch to the client setting.
- **In-flight change `auto-remove-defeated-tokens`:** its death-animation requirement still names the GM flag. It needs reconciling before that change is archived.
