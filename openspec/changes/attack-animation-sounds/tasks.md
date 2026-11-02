## 1. Plan

- [x] 1.1 Cue sheet for all 20 shapes with beats read from `fxStrikes.ts` / `nukeFx.ts` (`docs/SOUND-PLAN.md`)

## 2. Engine

- [x] 2.1 `board/fxSoundRecipes.ts`: layer types, hit/hold/rise envelopes, count-derived spacing, recipes for every shape, reduced-animation cues
- [x] 2.2 `board/fxSound.ts`: pure `scheduleSound`, Web Audio rendering, master volume from `soundVolume`, compressor and reverb, audio unlock on first gesture, six-play cap, same-shape merge, `withSound` cut-short fade
- [x] 2.3 Start the sound with strikes and nukes in `BoardView` and with the editor preview in `AnimationPreview`; thumbnails untouched

## 3. Tests and checks

- [x] 3.1 `apps/web/test/fxSound.test.ts`: impact on the drawn impact frame for every shape, at other durations, count-driven hits, reduced cues, cap, merge, cut-short fade, silent at 0 % and without Web Audio
- [x] 3.2 Offline render of every shape in a real browser: loudest onset on the impact frame, no NaN, no clipping
- [x] 3.3 Editor Play and a board nuke on isolated dev servers (see `verification-log.md`)
- [x] 3.4 `npm run lint && npm run typecheck && npm test`

## 4. Themes and recordings

- [x] 4.1 A real-world theme per shape (`SOUND_THEMES`) and a recording plan per theme
- [x] 4.2 Confirm the licence of every source on its own page (BigSoundBank: "CC0 (public domain)" per sound and the CC0 1.0 licence page; StarNinjas: CC0 on OpenGameArt) and download only those
- [x] 4.3 Cut, mono, normalize and encode 44 clips into `public/sfx`; measure each clip's hit time
- [x] 4.4 `public/sfx/CREDITS.md`: source page, author, licence, cut and users for every clip
- [x] 4.5 Engine: clip layers aligned on their hit, background loading, stereo spread, hall reverb, a breath before each riser's beat
- [x] 4.6 Recipes rebuilt around the themes; reduced cues as short clips
- [x] 4.7 Tests: every clip played is shipped and credited, clip hits land on their beats, clips play once loaded
- [x] 4.8 Offline render of every shape with its clips; impact contrast measured

## 6. Dice

- [x] 6.1 Export the dice's contact times (`THROW_CONTACTS`, `THROW_SLIDE_FROM`) from `diceGeometry.ts`
- [x] 6.2 `scheduleDice` / `playDiceSound`: a strike per contact per die, softer per bounce, slide, own cap of four throws; synth stand-in first
- [x] 6.3 With the user's approval, download BigSoundBank's three dice recordings (CC0) and cut four clacks, three taps, a clatter, a hand rattle and a roll; credit them
- [x] 6.4 Play from `ThrownDice` (board) and `DiceTray` (Dice panel tray, home page demo); cut short when a throw is dropped
- [x] 6.5 Deeper: dice pitched 3 to 5 semitones down, a table thump under each landing
- [x] 6.6 Tests: contacts on the keyframe bounces, softer per bounce, ten-dice cap, reduced cue, recorded strikes on their beats, stand-in only until loaded, own cap

## 7. The held die

- [x] 7.1 Cut two stretches of unbroken shaking from Four dice in hand (already downloaded); credit them
- [x] 7.2 `createShakeTracker` (pure): rattles on turns and on travel, none while still, 45 ms apart at least
- [x] 7.3 `startDiceShake`: random slices of the shaking, deeper, panned with the die, a faint jiggle while still, synth clicks until loaded, a 50 ms fade at the end
- [x] 7.4 `DiceThrowHandle`: start on pick-up, every pointer sample, stop on release, Escape, lost pointer, menu, blur and unmount
- [x] 7.5 Tests: tracker rules, the rattle's start, idle and stop, the handle's wiring
