# Verification log: painted effect textures for strikes

Started 2026-10-28, branch `feat/animation-preview-art`. Covers the eight ChatGPT textures in
`apps/web/public/img/fx/` and their use in `fx.ts` / `fxStrikes.ts` through `fxTextures.ts`.

## Environment

- The user's own dev servers on :3001 and :5173 were left alone.
- Isolated servers from `.claude/launch.json`: `server-isolated` (:3101, in-memory store,
  `SEED_DEV_ACCOUNT=1`) and `web-isolated` (Vite on :5273, proxying to :3101).
- Browser: the built-in browser pane. Signed in on :5273 as the seeded dev account from
  `apps/server/src/identity/devAccount.ts`; nothing was saved to it, and it disappears when :3101 stops.
- A throwaway receiver (`frame-sink.mjs` in the session scratchpad, 127.0.0.1:5399) took rendered
  frames from the page and wrote them to the scratchpad. Stopped after use.

## Automated checks

| Step | Result |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass: shared 720, server 488 (41 skipped), web 880, bench 2 |
| `apps/web/test/fxStrikes.test.ts` (no textures: the vector fallback) | 61 pass, unchanged |
| `apps/web/test/fxTextures.test.ts` (new) | 24 pass |

## Browser steps

| # | Step | Result |
| --- | --- | --- |
| 1 | Library, Animations, New animation | The preview loads all eight textures (checked in the page: each 512x512). Pixi fetches them in a worker, so they do not show in the page's network list. |
| 2 | Slash, duration set to 4 s (not saved), Play | The crescent swings in over the target. Later plays drew nothing: the page reported `visibilityState: "hidden"`, so animation frames stopped and screenshots were stale. |
| 3 | Rendered every strike shape offscreen in the page at three times (in flight, early impact, late impact) and wrote the sheets to the scratchpad | All 19 shapes draw with textures: crescents for slash and claw, streak flares and glow heads for the flyers, lightning for bolt and chain, ice shards for frost, fire billows for fireball, meteor and explosion, smoke for poison, burst and rings on every impact. |
| 4 | Same sheets over a transparent background | Black squares around every sprite: the textures have no alpha. Not visible on the board or preview (opaque canvases), but a library still with no map art would show them. **Fixed:** the thumbnail stage fills the stage colour when the map art is missing. |
| 5 | Tried white textures with brightness as alpha | Rendered as hard flat discs. Later found that this run (and one after it) had loaded the textures into a second copy of `fxTextures.ts` that Vite had time-stamped after an edit, so the board drew vectors; the alpha files were never really tested. Kept the grey-on-black files (64 KB in all, against 234 KB with alpha). |
| 6 | First sheets: fireball and meteor impacts | Blown out. **Fixed:** impact glow alpha 0.8 to 0.55, fire billows 0.6/0.85 to 0.45/0.6, explosion 0.7/0.9/1 to 0.5/0.65/0.8. Re-rendered: the fireball still reads as a bright fire ball, now with billows and rays visible. |
| 7 | Crescent direction | Checked on an enlarged frame: it bulges through the target with its horns curling back toward the attacker, the same way as the vector cut. A smaller capture had looked reversed. |

## Round 2: every shape, and five new textures

Same environment, but only `web-isolated` (:5273) was needed: the frames are rendered offscreen
from the page's own modules, so no sign-in or server data was involved.

| # | Step | Result |
| --- | --- | --- |
| 8 | Gave the nine shapes that had only the shared impact parts of their own (whirlwind, slam, shadow, volley, dagger, beam, smite, sonic, tornado) and the nuke a starburst and textured shock rings; rendered them | All draw. The beam looked like a string of beads and the tornado's smoke funnel was faint. **Fixed:** glows stretched along the beam, funnel opacity up, sprite cap per effect 96 to 192. |
| 9 | Five more ChatGPT textures for shapes borrowing art made for something else: fire billow, beam, sonic wave, tornado, dagger (prompts in `apps/web/public/img/fx/CREDITS.md`) | Generated in the same ChatGPT conversation, captured from its viewer, processed like the first eight (149 KB for all thirteen). Sending them straight from the ChatGPT page to a local receiver was refused by its content security policy. |
| 10 | Rendered fireball, meteor, explosion, beam, sonic, tornado, dagger, whirlwind with them | Fire billows read well. Sonic swamped the frame, the beam was a thread, the tornado skinny, the daggers too small. **Fixed:** sonic haze at 0.3 under a thinner drawn crest, beam picture 20 widths tall in two pieces, funnel 1.4 times wider, daggers drawn 2.4 blade lengths. Re-rendered: all read as intended. |
| 11 | Checks | `npm run lint`, `npm run typecheck`, `npm test` pass: shared 720, server 488 (41 skipped), web 881, bench 2. `fxTextures.test.ts` now checks, with one stand-in texture per picture, that every shape draws parts of its own before it lands and that the nuke draws its starburst and rings. |

## Round 3: shadow strike, volley, bolt, poison, nuke, and particles

| # | Step | Result |
| --- | --- | --- |
| 12 | Ten more ChatGPT images in the same conversation: shadow wisp, arrow, arcane orb, toxic cloud, mushroom cloud, and the five particle looks (prompts in `CREDITS.md`) | All generated. The page then went hidden (the app window in the background), so screen captures would have been stale. The signed image links need ChatGPT's cookies (403 from the shell), and the page cannot reach localhost (security policy, then Chrome's private network rule). |
| 13 | Processed the originals inside the ChatGPT page instead (greyscale, black floor, faded edge, webp at the size each is drawn), copied each out as base64 with its SHA-256 | Nine matched first time; the toxic cloud's text lost its final `=` and matched once that was restored. 23 textures, 198 KB in all. |
| 14 | Rendered shadow, volley, bolt, poison, a strike in each particle look, and the nuke | Wisps on the afterimages, painted arrows, a crackling orb, a bubbling cloud, and a painted mushroom cloud glowing over the nuke's billows. Painted particles side by side with the baked ones: stars, shards and rings came out small and faint. **Fixed:** their fill factors 0.71/0.9/0.8 to 0.6/0.75/0.72. |
| 15 | Checks | `npm run lint`, `npm run typecheck`, `npm test` pass: shared 720, server 488 (41 skipped), web 882, bench 2. New tests: painted particle sprites are used once loaded, and the nuke draws its mushroom cloud. |

## Round 4: shadow strike afterimages

| # | Step | Result |
| --- | --- | --- |
| 16 | The user's screenshot of the shadow strike in the editor preview: flat dark circles with dot eyes | One more ChatGPT image, a hooded smoke wraith with glowing eyes; processed in the page at 256 px and copied out (SHA-256 matched first time). |
| 17 | Each afterimage drawn as the wraith, face on the afterimage's place, a soft white glow on its eyes (brightest on the newest); the disc, rim, eyes and wisp stay as the fallback. Rendered on the preview's courtyard map with the stage portraits | A trail of hooded wraiths from attacker to target, then the cross cuts on impact. |

## Round 5: shadow strike motion

| # | Step | Result |
| --- | --- | --- |
| 18 | User: the wraith "moves not like one"; let it move to a distance, then attack | The shape now glides (smoothstep, a slow float and one gentle curve) to a stop about 1.8 target radii short, hovers and rears back with its eyes flaring, then lunges in; the cuts land, the wraith swells and bursts into smoke. Ghosts show only in proportion to how far the wraith moved, so they gather into it while it hovers. Its strike lands at 65% instead of 50%, the built-in shadow lasts 1.4 s instead of 1 s, and its library still is taken at 60%. |
| 19 | Rendered glide, glide, hover, lunge, hit, dissolve on the courtyard map | Reads in order. At full wind-up the eye glows merged into a bar. **Fixed:** flare 0.6 to 0.25 radii. Re-rendered: two eyes. |

## Round 6: fireball throw

| # | Step | Result |
| --- | --- | --- |
| 20 | User: make the fireball more like throwing an actual fireball (screenshot: a smooth comet streak) | The fireball now flares up in the thrower's hand (20% of the time to the hit), is lobbed on a screen-up arc, leaves fast and slows a little; its trail is puffs of flame that rise, swell, cool and fade, shedding embers. |
| 21 | Rendered with the fire billows as the ball | Motion reads, but the ball was a white blob. One more ChatGPT image, a flying fireball with flames streaming back (384 px, SHA-256 matched); drawn pointing along the flight, mirrored every few frames to flicker; the white core toned down. Re-rendered: a flaming ball tilting along its arc onto the target. |

| 22 | User: make the flame a bit longer, wind-swept | Two longer, fainter copies of the painted flames (2.1x and 1.45x long) stream behind the round ball, bent up 0.16 rad toward the side the tail is on and fluttering. Rendered thrown right and thrown left: the tail lifts upward both ways. |
| 23 | User: use the new fireball for the meteor's trajectory | The meteor's fall now draws the painted flying fireball (ball 0.6 target radii, larger than the fireball's 0.5) with the same wind-swept tail and flame puffs, pointing down its path; its plunge and crater are unchanged. Rendered falling, about to hit, crater: a flaming ball diving onto the target. |

## Round 7: explosion

| # | Step | Result |
| --- | --- | --- |
| 24 | User: make the explosion more dramatic, no square particles, a more interesting throw (screen recording) | The bomb is now an iron ball with a lit fuse, lobbed on a tumbling arc with its shadow on the ground; it lands short with a puff of dust, bounces onto the target and rocks while the fuse spits sparks and a warning ring tightens and blinks faster. The built-in explosion lasts 2 s and uses spark particles instead of squares; its library still is taken at 68%. |
| 25 | Rendered lob, bounce, fuse, detonate, blast, aftermath | The bomb was too small, flat grey smoke discs and a scorch ellipse looked out of place, and there was no single blast shape. **Fixed:** bigger bomb; smoke drawn with the painted smoke puffs, rising; scorch removed. |
| 26 | One more ChatGPT image for the blast. The first came back photoreal; the user asked for a 2D tabletop look, so it was asked again in a stylized, hand-painted style (prompt in `CREDITS.md`) | Processed in the page at 512 px, copied out in two pieces (SHA-256 matched first time). |
| 27 | Rendered with it | The blast washed out to a white disc under the fire billows and glows, and the lob left the top of the frame. **Fixed:** the painted blast drawn in orange with a smaller yellow copy at its heart, the fire flash and glow only in its first third; lob half as high; one extra shockwave instead of two on top of the impact's own rings. Re-rendered: flame tongues, flying chunks and the puffy smoke ring all show. |
| 28 | Checks | `npm run lint`, `npm run typecheck`, `npm test` pass: shared 720, server 488 (41 skipped), web 882, bench 2. |
| 29 | User: a ChatGPT bomb for the explosion, cool and somewhat realistic | ChatGPT drew a riveted cast-iron bomb on a transparent background. Before it was wired in, the user asked for TNT instead. |
| 30 | One more ChatGPT image: a three-stick dynamite bundle with twine straps and a fuse, transparent background (prompt in `CREDITS.md`) | Cropped to the bundle in the page, 192 px webp with alpha. The first copy out decoded with the wrong SHA-256; re-encoded and copied again, it matched. |
| 31 | Drawn as a plain (not additive) sprite on its own layer over the effect, spinning end over end through the lob and bounce (1.5 turns plus the spin setting, the way it was thrown), landing upright and rocking; the fuse sparks follow the tip as it turns. The iron ball stays as the fallback. User asked mid-way to make it rotate in the air. | Rendered at 10%, 25%, 40% of the lob, bounce, settled, fuse: upside down, tilted, upside down again, landing upright on the target with the warning ring. |
| 32 | Checks | `fxTextures.test.ts` expected every painted sprite to be additive. **Fixed:** the TNT is expected plain, and the explosion must draw it before it lands. `npm run lint`, `npm run typecheck`, `npm test` pass. |

## Round 8: poison

| # | Step | Result |
| --- | --- | --- |
| 33 | User: make the poison better, no plain circles; ask ChatGPT for more textures (screen recording; its temporary file was already gone, so the code was the reference) | The plain circles were the cloud's bubbles (filled discs, rings and dot highlights) and the glowing orb in flight. |
| 34 | ChatGPT drew a round greyscale flask; the user asked for the flight path to be designed with ChatGPT too, then found the flask too cute and asked for evil | ChatGPT's text design: lob peaking at a quarter of the distance, about 300 degrees of clockwise turn (fast, slow over the top, fast), slight wobble, a stretch while falling, a shrinking shadow; drips, vapour and bubbles behind it; landing at 55%; a shatter into 5 to 8 shards, a splash 1.2 token widths across and 8 to 12 drops; a cloud blooming to 1.5 widths by 78%, bubbles, two skull wisps, drips, fading out by the end. |
| 35 | Six more ChatGPT images (prompts in `CREDITS.md`): an evil horned-skull bottle (transparent), splash, bubble, skull wisp, drop, puddle | Processed in the page and copied out; every SHA-256 matched first time. The ChatGPT page went to the background part-way, so the images were checked by decoding them here. |
| 36 | Poison rewritten to that design; it lands at 55% instead of 50%. The bottle is drawn plainly like the TNT, tinted with the poison's colour. The old orb, rings and circles stay as the fallback | First render: the bottle a dim blob, the skulls lost in the cloud. **Fixed:** bottle 2 token radii tall and paler, smaller glow under it; skulls larger, paler and higher, above a thinner cloud. Renders at the screen's 2x show the caged skull bottle tumbling, then the shatter, splash, cloud, bubbles and two skulls rising. |
| 37 | Checks | `fxTextures.test.ts` now expects the bottle drawn plainly and the poison to draw it before it lands. `npm run lint`, `npm run typecheck`, `npm test` pass. |

## Round 9: tornado

| # | Step | Result |
| --- | --- | --- |
| 38 | User: improve the tornado, no simple circles, ChatGPT for more material, show it lifting particles and spinning them (screen recording; its temporary file was already gone) | The circles were the dots orbiting each turn of the funnel. |
| 39 | ChatGPT drew four realistic debris pieces and a dust swirl; the user found the pieces too realistic and asked for generic debris to use as the lifted particles | A second grid of four generic greyscale rubble chunks on a transparent background, each cut from its quadrant in the page (64 px). Every SHA-256 matched first time. |
| 40 | Tornado redrawn: a dust swirl spins at its foot under the painted funnel; rubble chunks (tinted with the animation's colour, drawn plainly) are dragged in along the ground, climb the funnel lap by lap while tumbling, dimmer and smaller behind it, and are thrown off the top; on reaching the target, everything it holds is flung outward and falls. The dots stay as the fallback | First render: the chunks were tiny and dark against the bright funnel. **Fixed:** about 1.6 times larger and lighter. Re-rendered at 2x: chunks spiralling up the funnel, then flung out round the target. |
| 41 | Checks | `fxTextures.test.ts` now expects the rubble drawn plainly and the tornado to draw it before it lands. `npm run lint`, `npm run typecheck`, `npm test` pass. |

## Round 10: nuke

| # | Step | Result |
| --- | --- | --- |
| 42 | User: update the nuke with ChatGPT art; keep the many clouds forming the mushroom but improve their texture; add the sound wave from the blast if possible | The mushroom was about fifty sprites of two gradient billows baked in the page; the bomb was drawn from shapes. |
| 43 | Three ChatGPT images (prompts in `CREDITS.md`): a falling atomic bomb and a fireball cloud puff, both on transparent backgrounds, and a grey-on-black blast wave | Processed in the page and copied out; every SHA-256 matched first time. The browser pane had closed with the test server, so ChatGPT was reopened in a new tab. |
| 44 | The bomb sprite replaces the drawn bomb; every billow of the ground skirt, column and cap is the painted puff, every other one mirrored, the dust surge the same puff drawn dark as smoke; a blast wave and a fainter echo race out across the ground ahead of the fire. The baked billows and drawn bomb stay as the fallback | First render: the cap a stack of flattened puffs and the cloud orange to the end. **Fixed:** puffs squashed less, every other cap puff raised into a dome, the cloud cooling to soot as it climbs (the column stays hotter), the additive mushroom glow fading with it. Re-rendered at 2x. The nuke still does not shake the board (its shake setting is unused, as before). |
| 45 | Checks | `fxTextures.test.ts` now expects the nuke to draw its bomb, billows and blast wave. `npm run lint`, `npm run typecheck`, `npm test` pass. |

## Round 11: shaking the whole page

| # | Step | Result |
| --- | --- | --- |
| 46 | User: the editor's Shake slider (Timing & power) seems to do nothing; shake the whole tab instead | Strikes only moved the map inside the canvas, by up to 9 px for about a third of a second. The nuke already shook the whole page on the board (`board/screenShake.ts`, started by `Board.tsx`), but not in the editor's preview. |
| 47 | First wrote a separate page-shake module and test, then found `board/screenShake.ts` and its test already existed (the new test had overwritten the tracked one). **Fixed:** restored the original test, removed the duplicate module, and built on the existing one instead | `board/screenShake.ts` now also has `joltScreen`: a short jolt sharing the nuke shake's clipping, which a stronger shake takes over from and a weaker one leaves alone, skipped when the system asks for reduced motion. Effects get it through the new optional `FxHost.shakeScreen`; the board and the editor's preview pass it, the library stills do not. A strike jolts the page once as it lands (shake setting x 12 px, scaled by its impact size, up to half a second). The editor's preview now starts the nuke's own page shake at its blast, as the board does; the nuke's player, not the effect, starts it, so the board never shakes twice. The map's own shake inside the canvas stays. |
| 48 | In the browser on :5273, with the page's own modules | A slam jolted the app root up to 14.5 px as it landed; the nuke's shake moved it up to 18.4 px; afterwards the root was back in place and the page's overflow restored. |
| 49 | Checks | `screenShake.test.ts`: the two original nuke tests plus five new ones (the jolt ends at rest; weaker drops, stronger takes over; reduced motion skips it; a strike jolts once on landing and not at a zero setting; the nuke effect leaves its shake to its player). `npm run lint`, `npm run typecheck`, `npm test` pass. |
| 50 | User: still no shaking | Reproduced in the real editor on :5273 (signed in as the seeded dev account): the page behind moved, the editor did not. The editor is a native modal `<dialog>`, which the browser draws in its top layer, out of reach of the page's transform. **Fixed:** while a shake runs, every open dialog is shaken too, added on top of its own placement. A strike's full jolt also went from 12 to 16 px. |
| 51 | Reopened the editor (an editor opened before the change keeps the old code) and pressed Play on a slash at the default shake | The editor dialog itself moved, up to 6 px, then settled back. |
| 52 | Checks | New test: an open dialog is shaken with the page root, added on top, and stopped with it (`screenShake.test.ts`, 8 tests). `npm run lint`, `npm run typecheck`, `npm test` pass. |
| 53 | User: only the nuke should shake the whole interface; the rest should shake the map | Removed the strike page jolt (`joltScreen`, `FxHost.shakeScreen`). The nuke keeps its whole-page shake, now also in the editor's preview and over open dialogs. The map's shake was what made strikes hard to see: up to 9 px for a third of a second (about 4 px at the default 45%). It is now up to 16 px at full shake, scaled by the shape's impact size, easing out over up to half a second. |
| 54 | In the real editor on :5273 | A slash moved neither the page nor the editor. Play on a nuke started its shake on the page root and on the editor dialog (added on top), 0.88 s in for 2.4 s. The pane was in the background, so the shake was checked as running animations rather than watched. |
| 55 | Checks | `screenShake.test.ts`: the two original nuke tests and the open-dialog test. `fxStrikes.test.ts`: the map moves more than 8 px at full shake, less at half, not at all at zero. `npm run lint`, `npm run typecheck`, `npm test` pass. |

## Round 12: holy smite

| # | Step | Result |
| --- | --- | --- |
| 56 | User: make the holy smite dramatic, a holy circle on the ground first with a little spin, then the strike; ChatGPT for the art | Two ChatGPT images (prompts in `CREDITS.md`): a holy magic circle seen from above and a pillar of holy light. Both SHA-256 matched first time. |
| 57 | Smite redrawn: the circle draws itself out under the target and turns, a smaller copy of it counter-turning inside, motes rising off the ring; a thin shaft of light gathers from above over the last part of the wind-up; then the pillar strikes (a wide soft copy behind it) while the circle flares out and fades, still turning. It now lasts 2 s instead of 1.5 and strikes at 62% instead of 50%, its library still taken at 68%. The streak pillar and closing ring stay as the fallback | First renders: the strike a flat white disc and the target lost under the inner star. **Fixed:** inner star and glow dimmer, pillar copies dimmer, and the smite's impact switched from the full flash and disc to the light one, the pillar and circle carrying the strike. Re-rendered at 2x: circle, spin, gathering shaft, strike, pillar, fade, target visible again. |
| 58 | Checks | `npm run lint`, `npm run typecheck`, `npm test` pass (`fxTextures.test.ts` already requires the smite to draw parts of its own before it lands). |

## Round 13: latency check before commit

| # | Step | Result |
| --- | --- | --- |
| 59 | User: before committing, check whether any animation causes bad latency | Measured in the browser on :5273 against the code before today (HEAD 774fb2e, served from a scratch worktree on :5275), in a 1600x900 offscreen Pixi app at resolution 2, the attack crossing 1000 px, every shape and the nuke. Timed each frame's update and render with `gl.finish()`. |
| 60 | Sonic, the costliest | Its leading-wave haze covered the wave's whole circle, and every wave drew one: four screen-sized pictures a frame on a long attack. **Fixed:** only the leading wave is hazed; the waves behind it are crests alone. One wave measured p95 0.4 ms against about 5 ms for four. |
| 61 | Load per frame | Update code: p95 0.2 ms or less for every shape, before and after. Blurred-glow area: lower than before for every shape. Painted area at its peak: explosion 3.2 screens, meteor 2, fireball 1.8, slam 1.7, mostly the shockwave-ring picture (a square with an empty middle); the nuke 11 screens (billows 5.7, as before; painted rings 3; blast wave 2) against 7.5 for the old billows and drawn rings. |
| 62 | Frame times, warm, after a first run | Today's version is as fast as or faster than before for every shape. Nuke p95 0.2 ms, worst 0.5 ms (before: 3.2-3.6 ms, worst 12-43 ms, from its thick drawn rings). Explosion, meteor, fireball, slam, smite, poison, tornado p95 0.1-0.9 ms. Sonic about 2 ms p95, worst about 8 ms, and whirlwind about 1.4 ms p95: both the same as before. Their cost is their drawn lines (hiding the lines and their blurred halo together takes it to 0.1 ms), which today's change did not touch. Runs in the shared browser pane are noisy: single rounds of beam, frost and sonic spiked to 12-100 ms and did not repeat in the next rounds. |
| 63 | First use of the pictures | Uploading all 43 pictures to the GPU takes 3-10 ms in all. Uploading them ahead of time made no difference to an attack's first frames beyond run-to-run noise, so nothing preloads them. |
| 64 | Checks | `npm run lint`, `npm run typecheck`, `npm test` pass. |

## Cleanup

- `server-isolated` and `web-isolated` stopped; the in-memory account and data went with :3101.
- The scratchpad frame receiver stopped.
- The browser pane keeps a session cookie for localhost:5273 only.
- The baseline worktree and its temporary `web-baseline-tmp` launch entry removed; :5275 stopped.
