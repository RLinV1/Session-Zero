# Design

## Context

See proposal.md for why. The constraints that shaped the approach:

- The server rolls (`decide` with an injected random source) and the result reaches clients as a `DiceRoll` inside room state, already filtered per viewer. By the time anything can animate, the values are fixed. The animation has to arrive at them, not produce them.
- `DicePanel` renders only the latest roll; the full log is a modal. It is rendered for both roles; `isGm` only adds the private toggle. On a phone it lives in its own tab, so it unmounts and remounts as the tab changes.
- The board is PixiJS, and CLAUDE.md keeps Pixi code in `board/`. The side panel is plain React and CSS.
- The home page's demo rolls in the browser with the same `parseDiceExpression` and `rollDice`, on two grounds (light and dark), and its spec wants all motion behind `prefers-reduced-motion`.

## Goals / Non-Goals

**Goals:**
- One tray component that both the room and the home page use, fed a finished roll.
- Dice that read as real dice at 32 to 80 px, with the result unambiguous at rest.
- Everyone at the table sees the same dice come to rest in the same attitude.

**Non-Goals:**
- Physics. Dice do not collide with each other or the tray walls.
- Dice on the board. The throw happens in the Dice panel; nothing is drawn over the map.
- A percentile pair for d100, or per-player dice colours.
- Throwing initiative scores or any roll not made through `dice.roll`.

## Decisions

### CSS 3D and SVG faces, not WebGL
Each die is a `transform-style: preserve-3d` element whose faces are small absolutely positioned elements placed with `matrix3d`, each holding an SVG polygon and its numerals. Back faces are culled with `backface-visibility`. Colours come from CSS custom properties, so the private GM colours and the home page's two grounds are a few lines of CSS.

Alternatives: three.js with a physics engine (the usual "3D dice" libraries) adds several hundred kB and a second rendering context beside Pixi, and a physics throw still has to be forced onto the server's values after the fact. Drawing the dice in the Pixi board would tie a panel feature to the board and put dice over the map. Both were rejected. The CSS approach costs no dependency, and at twenty dice of twenty faces it is 400 small elements, well within what the browser composites smoothly.

### Geometry from vertices, tested numerically
Each standard body is defined by its vertex list alone (tetrahedron, cube, octahedron, pentagonal trapezohedron with its apex height solved so every kite is planar, dodecahedron, icosahedron). Faces are found by a brute-force convex hull: a plane through three corners is a face when all other corners lie on one side of it. With at most twenty corners this runs once per body and needs no hand-written face tables. Each face gets an orthonormal frame (u, v, n) with n outward and u × v = n. The frame keeps numerals from rendering mirrored and makes culling work. The rotation that brings a face to the viewer, upright, is the transpose of that frame. Unit tests check the frames, the numbering (opposite faces sum to N + 1) and, for every standard die and a spread of odd sizes, that the numerals nearest the viewer at rest are the rolled value.

The d4 is the exception. Seen straight down its top corner, a tetrahedron is three steep, similarly shaded faces that read as one flat triangle; this was tried and rejected in the browser. It rests corner-up and is then tipped back 40° so it reads as a pyramid, with the result printed at the tip of each face.

### The throw is precomputed and ends exactly at rest
The throw is sampled keyframes rather than CSS easing, because a bounce is not an easing curve: a drop, three shrinking bounces, a slide that bleeds off speed, and a separate shadow that shrinks and fades with height. The tumble is extra rotations composed in front of the rest transform (`rotateX(a) rotateY(b) rotateZ(c) <rest>`) and wound down to zero. Transform lists with matching functions interpolate function by function, so the angles unwind through full turns, and the last frame is the rest pose itself. The die never snaps. The Web Animations API runs it; its `finished` promise is the landing signal, and cancelling on unmount or on a newer roll rejects that promise harmlessly.

Alternative: spin to a random orientation and snap to the result. It was rejected because the snap is visible.

### Seeded by roll id
The resting tilt of each die and the throw path come from a small seeded generator keyed by the roll's id. Every client therefore shows the same dice at the same angles, and a re-render never reshuffles a die already on the table. This is presentation code, so it is outside the determinism rule for `decide` and `reduce`. Nothing it produces reaches state.

### Painted lighting, one bright face
Faces are shaded once, Lambert-style from a light over the viewer's shoulder, at the resting pose, and turn with the die during the throw. Relighting every face every frame would be up to 400 style writes per frame for a twenty-die roll; in a one-second tumble the painted light is not noticeable. The result face gets a small extra lift so it stands out among a d20's many visible faces.

### Landing state lives in the panel
`DicePanel` remembers the id of the roll that has landed, initialised to the latest roll when the panel mounts. A roll is thrown exactly when the latest roll differs from it. That one rule covers joining, reloading, reconnecting and phone tab switches (remounts), and a newer roll replacing one in the air (the tray is keyed by roll id). The latest-roll row renders a placeholder while the dice are in the air, hidden from assistive technology, and gets a new key when they land. The polite live region therefore sees one addition, the result, and announces it once.

### A plain roll shape for the tray
The tray takes `{ id, sides, dice, gmOnly }` rather than a room `DiceRoll`, so the home page can feed it a roll made in the browser. The room derives `sides` by parsing the roll's expression, which the server already parsed. The tray lives in `ui/` because both `panels/` and `pages/` use it. Its layout is memoised on those values, not object identity, because the room re-renders the panel on every state change.

## Risks / Trade-offs

- [Background tabs stop producing frames, so a throw does not advance there] → The row keeps saying "rolling" until the tab is visible again, then the dice land at once. The full result is in Roll history throughout.
- [Thirteen or more dice make d20 numerals too small to read at sidebar width] → The row lists every die's value; the dice show the spread of the roll.
- [A second roll arriving mid-throw cuts the first one short, and its result is never announced as the latest] → It is listed in Roll history. Rapid overlapping rolls are rare at a table.
- [Odd sizes on borrowed bodies are not real dice (a d100 as a d20 printed 43)] → The rolled value is always what faces the viewer; the other numerals are there for the look of it.
- [A browser without the Web Animations API] → The tray reports the dice as landed at once, as under reduced motion.

## Migration Plan

Client-only. There is no data, schema or protocol change, so rolling back is reverting the web changes.
