# Tasks

## 1. Dice geometry

- [x] 1.1 `ui/diceGeometry.ts`: the six standard bodies from vertex lists, faces found by a convex-hull search, an outward right-handed (u, v, n) frame per face, and the rotation that brings a face forward and upright. Verify with `test/diceGeometry.test.ts`: face and corner counts, frame handedness, opposite faces summing to N + 1, and every result face of every standard die landing forward and upright.
- [x] 1.2 Number dice of any size: a d2 or d3 on a d6, other sizes on the next body up, a d20 printed with the rolled value past twenty; a d4 read at its top corner and tipped 40° into a pyramid. Verify the "rolled value nearest the viewer" test for d2 through d1000, and the d4 test that the result corner is the top of the pyramid.

## 2. The tray

- [x] 2.1 `ui/DiceTray.tsx`: CSS 3D dice with SVG faces, shading painted at rest with the result face lifted, 6 and 9 underlined, die size by dice count with a `scale` option, fed a plain `{ id, sides, dice, gmOnly }`. Verify in the room that d3, d4, d6, d8, d10, d12, d20 and d100 rolls rest showing exactly the values in the roll row.
- [x] 2.2 The throw: sampled drop, three bounces, slide and an unwinding tumble on the Web Animations API, seeded by roll id, landing signalled by `finished`, cancelled on unmount or a newer roll; reduced motion or a missing API reports landed at once. Verify by pausing a 3d20 throw at 250 ms (dice entering from above, clipped by the tray) and 450 ms (staggered, bouncing, tumbling), then finishing it: the dice show the rest pose with no jump.
- [x] 2.3 Tray styles, with class names that do not collide with the home page's global `.die`, a shadow token, and the private GM colours. Verify a GM-only 2d6 lands as slate dice with amber numerals.

## 3. Room Dice panel

- [x] 3.1 Throw each new latest roll for every participant, and remember the landed roll id from mount so nothing replays. Verify with a GM tab and a player tab on separate origins: a public roll is thrown in both; after a reload the latest roll is at rest with no animation; on a 375px phone, switching Play → Dice shows it at rest.
- [x] 3.2 Hold the result: a "rolling" placeholder row while the dice are in the air, replaced by a new row node when they land, with the total popping in. Verify the placeholder is `aria-hidden` inside the polite live region, the tray is `aria-hidden`, and the landed row is a fresh node.
- [x] 3.3 GM-only rolls. Verify a private 2d12 lands for the GM with the "GM only" badge, while the player's row goes straight from their own last roll to the GM's next public roll.
- [x] 3.4 Layout. Verify 20d20 fits the desktop sidebar in rows and 8d6 fits a 375px phone with no horizontal page scroll.

## 4. Home page demo

- [x] 4.1 Replace the demo's interval-driven flat tumble with the tray at 1.3× and withhold the total and breakdown until landing; delete the orphaned `.die`, `.dice-faces`, `tumble` and `land` styles. Verify 2d6+3 shows "Rolling…" mid-throw, then 13 and "6 + 4 + 3" matching the dice, and that an invalid expression still shows the parser's own message.
- [x] 4.2 Both grounds and widths. Verify on the light and dark grounds that the tray, dice and shadows are clearly visible, and at 400px (one column) and 1280px (two columns) with no horizontal page scroll.
- [x] 4.3 Reduced motion. Verify, with reduced motion emulated, that 3d8+1 shows its total at once, never renders "Rolling…", and starts no animation.

## 5. Verify

- [x] 5.1 Roll d2, d3, d4, d5, d6, d7, d8, d9, d10, d12, d20, d100, d1000, 20d20, 1d20+5 and 2d6-1 in the room on a fresh load. Verify no console errors and that each row matches its dice.
- [x] 5.2 `npm run lint && npm run typecheck && npm test` clean (web 57, shared 74, server 40 with 8 skipped).
