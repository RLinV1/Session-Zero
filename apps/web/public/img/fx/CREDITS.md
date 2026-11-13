# Effect textures

Greyscale textures for the board's attack animations (ADR 0038): `slash-arc`, `glow`,
`impact-burst`, `shockwave-ring`, `smoke-puff`, `energy-streak`, `lightning`, `ice-shard`,
`fire-billow`, `fireball-flight`, `explosion-blast`, `beam`, `sonic-wave`, `tornado`, `dagger`, `shadow-wisp`, `shadow-wraith`, `arrow`,
`arcane-orb`, `toxic-cloud` and `mushroom-cloud`, and the particle sprites `particle-spark`, `particle-star`,
`particle-square`, `particle-shard` and `particle-ring`. Grey on pure black, without alpha, so the
renderer can tint them with an animation's own colours and draw them additively, where black adds
nothing (`src/board/fxTextures.ts`, `src/board/fxParticles.ts`). The exceptions are the thrown props
with their own transparency, drawn plainly over the effect: `tnt`, the explosion's bundle, in
colour, `poison-vial`, the poison's bottle, and `debris-1` to `debris-4`, the rubble a tornado
lifts, both greyscale and tinted; and the nuke's `nuke-bomb` and `nuke-billow`, in colour, the
billow also drawn dark as its smoke. The poison's
`poison-splash`, `poison-bubble`, `poison-drop`, `poison-puddle` and `skull-wisp` are ordinary
grey-on-black textures, as are the tornado's `dust-swirl`, the nuke's `blast-wave` and the smite's `holy-sigil` and
`holy-pillar`.

All forty-three were generated for this project with ChatGPT's built-in image generation on
2026-10-28, in eleven rounds: the first eight; five made for shapes that had been borrowing art
made for something else; five for shadow strike, arrow volley, bolt, poison cloud and the nuke,
and five particle sprites; the shadow wraith for the shadow strike's afterimages; a flying fireball; an explosion blast; the TNT bundle; six for the poison; five for the tornado; three for the nuke; then two for the holy smite. They are
generated illustrations, not works attributed to a human artist. No other project artwork was
reused for them.

The first thirteen were captured from ChatGPT's image viewer at about 630 px, converted to
greyscale, given an exact black background and a faded outer edge, and resized to 512 px webp.
The last thirteen were processed the same way from the 1254 px originals inside the ChatGPT page,
and saved at the size they are drawn: 256 px (wisp, wraith, arrow, orb, toxic cloud), 384 px
(mushroom cloud, flying fireball), 512 px (explosion blast) and 128 px (particles). The TNT bundle
kept ChatGPT's transparent background and its colour; it was cropped to the bundle and saved at
192 px.

## Prompt set

Shared direction: "One texture for a 2D game spell effect, centred on a pure black background,
white and light grey only (no colour), soft glowing edges, no text, frame or watermark, square."

- Slash arc: a single crescent sword-slash arc, a thick bright core tapering to thin wispy ends.
- Glow: a soft round glow, brightest at the centre and fading smoothly to black.
- Impact burst: a starburst impact flash, sharp rays of uneven length from a bright core. ChatGPT
  offered two versions; this is the one with the softer core.
- Shockwave ring: a thin bright ring with a soft inner haze and a dark centre.
- Smoke puff: a soft billowy smoke puff, wispy edges, mottled inside.
- Energy streak: a horizontal energy streak, bright on the left, fading and fraying to the right.
- Lightning: a jagged lightning bolt with small branches, running left to right.
- Ice shard: one sharp faceted crystal shard pointing right, with a bright edge.

Second round (fireball, meteor and explosion; beam; sonic; tornado; dagger and whirlwind):

- Fire billow: a roiling ball of fire, a white-hot core inside turbulent licking flames, its edges
  breaking into wisps.
- Beam: a straight horizontal energy beam running edge to edge across the whole width, a thin
  white-hot core inside a soft glow with faint swirling energy, the same along its whole length so
  it can repeat left to right.
- Sonic wave: a single curved shockwave arc shaped like a closing bracket, a bright rippling crest
  with two fainter echoes behind it on its left, the arc opening to the left.
- Tornado: a tornado funnel seen from the side, wide at the top and narrowing to a point at the
  bottom, made of swirling wispy wind streaks.
- Dagger: a single throwing dagger pointing right, a slim steel blade with a bright sharp edge and a
  glinting tip, a short wrapped grip on the left.

Third round (shadow strike, arrow volley, bolt, poison cloud, nuke):

- Shadow wisp: a ghostly wisp of shadowy spirit flame rising and curling, ragged smoky tendrils
  trailing off it.
- Arrow: a single arrow in flight pointing right, a slim shaft with feather fletching on the left
  and a sharp glinting arrowhead, faint motion streaks behind it.
- Arcane orb: a crackling orb of arcane energy, a bright core wrapped in small branching lightning
  tendrils and swirling sparks.
- Toxic cloud: a cloud of bubbling toxic gas, round bubbles of different sizes rising out of
  drifting vapour.
- Mushroom cloud: the mushroom cloud of a huge explosion seen from the side, a wide billowing cap
  on a rising column of fire and smoke, a ring of dust spreading at its base.

Particle sprites. Shared direction: "One particle sprite for a 2D game effect, centred on a pure
black background, white and light grey only (no colour), soft glowing edges, no text, frame or
watermark, square, the particle filling most of the image."

- Spark: a single hot ember spark, a bright round core with a soft glow and a few faint flickering
  wisps.
- Star: a single four-pointed twinkling star sparkle with long thin bright rays and a small glowing
  centre.
- Square: a single small glowing square chunk of hot debris, slightly rough chipped edges, brighter
  at its centre.
- Shard: a single sharp glowing glass splinter, long and thin, pointing right, with a bright edge.
- Ring: a single thin glowing ring like the outline of a bubble, with a soft sheen on one side.

Fourth round (shadow strike's afterimages):

- Shadow wraith: the head and shoulders of a hooded shadow wraith seen from the front, made of
  wispy smoke, its hood outline glowing faintly, its face a dark void with two small bright glowing
  eyes.

Fifth round (fireball in flight):

- Flying fireball: a blazing fireball flying to the right, a dense round ball of roiling flame on the
  right with tongues of fire streaming back from it to the left and breaking into wisps and embers.

Sixth round (the explosion's blast). The first try came back photoreal, so it was asked again in a
stylized tabletop-game look; only the second is used.

- Explosion blast: a big explosion seen from above, a bright core bursting outward in jagged tongues
  of flame, a few debris streaks and a ring of puffy smoke around it, in a stylized 2D tabletop game
  VFX style, hand-painted, with clean readable shapes, bold flame silhouettes and only a light touch
  of realism.

Seventh round (the thrown bomb). A round cast-iron bomb came first; the user asked for TNT instead,
so only the second is used.

- TNT bundle: a game sprite of a TNT dynamite bundle for a 2D fantasy tabletop game, cool and
  somewhat realistic but still stylized: three thick red paper dynamite sticks with darker red
  stripes and no lettering, strapped together with two bands of rough twine, one short twisted fuse
  rising from the middle stick and curling to the upper right, its end glowing faintly orange. Lit
  from the upper left with a crisp rim highlight, transparent background, no ground shadow.

Eighth round (the poison). ChatGPT also designed the poison's flight and timing, in text, before the
pictures were made: a lob peaking at a quarter of the distance, about 300 degrees of clockwise turn,
drips, vapour and bubbles behind it; a shatter into shards, a splash and drops; a cloud that blooms,
sheds bubbles, forms two skulls and drips before fading. A round flask came first; the user found it
too cute and asked for something evil, so only the second bottle is used. The bottle was cropped to
its transparent outline at 160 px; the rest were processed like the others: splash 256 px, bubble
and drop 128 px, skull wisp and puddle 192 px.

- Poison vial: a sinister poison bottle for a dark fantasy tabletop game, greyscale so it can be
  tinted: thick cracked dark glass shaped like a horned skull, caged in black thorny iron filigree,
  a jagged bone stopper, poison oozing from a crack, the glowing liquid lighting its eye sockets.
  Transparent background.
- Shared direction for the rest: the usual grey-on-black rules, "stylized hand-painted game VFX
  with a light touch of realism, menacing not cute".
- Poison splash: a splash of thick corrosive venom seen from above, a central blob bursting outward
  into jagged splattered tongues and flying droplets.
- Poison bubble: a single toxic bubble about to burst, a thin bright oily rim, a sharp highlight,
  sickly swirls of vapour inside, a thick drip hanging from its bottom.
- Skull wisp: a wisp of toxic vapour rising and twisting into a screaming skull, its bottom trailing
  off into ragged smoky tendrils.
- Poison drop: a single elongated drop of venom falling straight down, a heavy rounded bottom and a
  long stringy tail.
- Poison puddle: a corrosive puddle of venom seen from above, eaten-away edges, bubbling and hissing.

Ninth round (the tornado). Four realistic pieces came first (a plank, a rock, a clump of grass, a
roof shingle); the user found them too realistic and asked for generic debris, so only the second
grid is used. Each chunk was cropped from its quadrant to its own transparent outline at 64 px; the
dust swirl was processed like the others at 256 px.

- Debris (one image, cut into `debris-1` to `debris-4`): a 2x2 grid of four generic debris
  particle sprites, simple stylized chunks of rubble, not any recognisable object, jagged angular
  fragments of varied shape, flat hand-painted shading with a light rim highlight, greyscale so the
  game can tint them, transparent background.
- Dust swirl: a swirling ring of dust and grit kicked up at the base of a tornado, seen from above,
  spiralling streaks curling around an empty calm centre, small flecks of grit thrown outward.

Tenth round (the nuke). The bomb and the billow kept ChatGPT's transparent backgrounds and were
cropped to their outlines (160 px and 192 px); the blast wave was processed like the others at
320 px.

- Nuke bomb: a game sprite of a falling atomic bomb, a fat rounded steel casing with rivets and
  weathered olive and grey paint, a yellow and black hazard band with a radiation trefoil and no
  lettering, a boxy tail fin assembly at the top, nose pointing straight down, transparent
  background.
- Nuke billow: a single puff of a nuclear fireball cloud, a dense billowing cauliflower-like lump,
  hot orange and yellow fire in its underside and core darkening to sooty brown and charcoal at its
  upper edges, transparent background.
- Blast wave: the blast wave of a huge explosion racing outward across the ground seen from above, a
  thin bright ring of compressed air at the front, a churning band of dust and debris behind it,
  faint ripples of the sound wave ahead of it, the centre dark.

Eleventh round (the holy smite), processed like the others: the circle at 320 px, the pillar at
256 px. Shared direction plus "radiant and sacred".

- Holy sigil: an ornate holy magic circle seen straight from above, two thin bright concentric rings
  with a band of rune-like glyphs between them and no real letters, a radiant eight-pointed star and
  sunburst lines in the middle, small sparkles along the rings.
- Holy pillar: a vertical column of divine holy light striking straight down from the sky, a narrow
  blinding white core inside soft rays and drifting sparkles, widening at the bottom where it hits
  the ground in a bright splash of light.

Pierce blade (`pierce-blade`, 2026-11-13, for the pierce animation, ADR 0067): generated for this
project with ChatGPT's built-in image generation from the prompt below, then converted to greyscale,
the near-black lifted to exact black, the outer edge faded, and resized to 768 × 256 px webp (it is
three times as wide as it is tall, the one long texture). A generated illustration, not a work
attributed to a human artist.

- Pierce blade: a single slim bladed thrusting weapon pointing straight to the right, seen from the
  side: a long narrow double-edged blade tapering to a needle-sharp point, a bright polished edge and
  a small star-like glint at the tip, a simple short crossguard and a short plain grip, no
  decoration; behind it, trailing to the left, thin speed streaks of motion blur, brightest just
  behind the tip and fading out to the left. Monochrome grey and white on plain pure black.
