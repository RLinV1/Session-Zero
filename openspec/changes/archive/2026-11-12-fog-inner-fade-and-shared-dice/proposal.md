# Proposal

## Why

Two board effects look wrong to the table:
- **Fog and darkness edges.** Players' fog fades *outward*: about two cells of mist spill over map the GM has revealed. Line-of-sight darkness puts its soft shadow on the *lit* side of the sight edge. In both cases the concealed area keeps a hard edge while the revealed area gets dimmed.
- **Dice animations.** Only dice dragged onto the map replay for other players. Attack rolls, damage rolls and plain Roll-button rolls animate only on the roller's board; everyone else sees a result card with no dice. Combat rolls are what the table most wants to watch.

## What Changes

- **Fog fade narrows.** In the players' view (and the GM's player preview), fog stays opaque up to a region's border and fades out over just a quarter of a grid cell past it, instead of about two cells, so the dragged area is, roughly, the hidden area. Drifting noise moves the fade in and out along the border, just enough that the edge isn't a ruled line. Puffs and wisps stay inside the region and no longer reach past its border. The GM's own fog view does not change.
- **Darkness loses its fade and gets smooth edges.** With line of sight on, the darkness covers exactly the area out of sight, with a crisp edge: no shadow on the lit side and no see-through band on the dark side. It is drawn as vector shapes, with every owned token's sight merged first, so the edge stays smooth at any zoom and overlapping sight shows no seams. "Hide map from players without a token" stays fully dark.
- **Every public roll animates on every board.**
  - **Attack and damage rolls:** thrown from the attacker's token toward the target on every viewer's board, the roller's included. If either token is hidden from a viewer, that viewer's board throws the dice into the middle of their visible board instead.
  - **Plain Roll-button rolls:** thrown into the middle of each viewer's own visible board.
  - **Dice dragged onto the map:** unchanged. They land where they were let go on every board. A viewer who missed the drop message now sees the roll thrown into the middle of their board instead of only the result card.
  - **GM-only rolls:** unchanged. They stay in the GM's panel tray.
  - Reduced motion and the result card are unchanged, and other people's dice still never disable your own roll controls.
- **ADR 0014 amended.** Its rule that "everyone else shows only the result card" for a roll without a drop is superseded. No message, command, event or state changes.

## Capabilities

### New Capabilities
- `shared-roll-throws`: where each kind of public roll is thrown on each viewer's board, replacing the `board-dice-throw` rule (change `throw-dice-on-board`, not yet archived) that only the roller sees dice for a roll without a drop.

### Modified Capabilities
- `fog-of-war`: "Fog looks like mist" now fades outward over a quarter of a cell instead of about one, wavering along the border. It gains a requirement that line-of-sight darkness has a crisp, smooth edge with no fade, and that several tokens' sight merges without seams.

## Impact

- **Web only:**
  - `apps/web/src/board/fogTexture.ts` (`fogEdgeAlpha`, `FOG_FEATHER_CELLS`), `fogShader.ts` (its edge noise), `fogPuffs.ts` (puff and wisp reach), `sightMask.ts` (`darknessShapes`), `boardView.ts` (darkness drawn as shapes).
  - New dependency: `polygon-clipping` (MIT) for merging sight.
  - `apps/web/src/pages/RoomPage.tsx` (the roll throw fallback), `board/Board.tsx` (a throw aim from two board points).
  - Tests: `apps/web/test/fogEdge.test.ts`, `sightMask.test.ts`, plus new tests for the throw aim.
- **No change** to `packages/shared` schemas, the server, persistence or the visibility filters. The throw aim uses only what each viewer's filtered state already holds.
- **Docs:** ADR 0014 gets an amendment note; `docs/DESIGN.md` gets a mention if it describes either behaviour.
- **Dependency:** `throw-dice-on-board` (which introduces `board-dice-throw`) should be archived first, or archived together with this change, so the main specs read in order.
