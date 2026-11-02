## Why

Every attack animation and the nuke play in silence, although Settings already has a "Sound effects volume" slider that nothing uses. A sword, a fireball and a nuke should sound as different, and as real, as they look.

## What Changes

- **A themed sound for every animation shape.** Each of the 20 shapes (the 19 strikes and the nuke) gets a real-world theme (a steel longsword, a longbow volley, dynamite, chain lightning with thunder, war drums, a nuclear blast, ...) and is built from recorded clips of that theme layered over synthesized tone and noise for sub-bass, risers and hums. The cue sheet is `docs/SOUND-PLAN.md`; the themes and recipes are `apps/web/src/board/fxSoundRecipes.ts`.
- **Recorded clips, all CC0.** 60 short clips (about 1.1 MB of MP3) in `apps/web/public/sfx`, cut from public-domain (CC0) recordings on BigSoundBank (Joseph SARDIN) and OpenGameArt (StarNinjas). `public/sfx/CREDITS.md` lists, for every clip, its source page, author, licence, the part of the recording it was cut from and the shapes that use it.
- **In time with the picture.** Cue times are fractions of the animation's duration, read off the drawing code, and each clip's measured hit lands on its beat, so an impact sound lands on the impact frame at any duration a GM sets. Repeating shapes (claw, volley, daggers, chain, ...) sound once per hit, following the animation's hit count. Risers drop out just before the beat, a breath of silence before each big hit.
- **Follows the animation's settings.** Bigger and heavier (size, shake) animations sound a little lower and louder; each play varies slightly in pitch.
- **Where it plays.** On the board for every live strike and nuke a viewer sees, and in the library editor's Play preview. Library thumbnails stay silent.
- **Dice.** Dice thrown on the board, and private rolls thrown in the Dice panel's tray, clack on every bounce their keyframes make: recorded clacks and taps of real dice on a wooden table (BigSoundBank), pitched down for heavy dice, with a synthesized table thump under each landing, a rattle as they leave the hand, a clatter for a handful and a roll as each comes to rest. A synthesized stand-in plays until the recordings load. While the Dice panel's die is held under the pointer, the dice rattle in the hand: hard as it is shaken, softly as it is dragged, faintly now and then while it is held still.
- **Volume.** The existing Sound effects volume slider controls it; 0% is silent. Reduced animations plays only one short, soft clip.
- **Limits.** At most six sounds at once; one attack at several targets is heard once. An effect cut short (replaced by a nuke, evicted, page hidden, editor stopped) fades its sound out.

Client only: no schema, command, event or server change, so no ADR.

## Capabilities

### Modified Capabilities

- `board-attack-effects`: attack and nuke animations play a themed sound, and thrown dice clack as they land.

## Impact

- `apps/web`: new `board/fxSound.ts` and `board/fxSoundRecipes.ts`; `board/boardView.ts` and `board/animationPreview.ts` start the sound with the effect; `board/ThrownDice.tsx` and `ui/DiceTray.tsx` start the dice sound with the throw; `panels/DiceThrowHandle.tsx` rattles the held die; `ui/diceGeometry.ts` exports the dice's contact times; new `public/sfx/` (60 MP3 clips and `CREDITS.md`). Tests in `apps/web/test/fxSound.test.ts` and `apps/web/test/diceThrowHandleSound.test.tsx`.
- Docs: `docs/SOUND-PLAN.md`.
- The clips (about 1.1 MB) are fetched once, in the background, when the board or editor first needs audio; a clip not loaded yet is left out of that play and the synth layers still sound.
- Browsers keep audio off until the page is clicked or typed into, so a viewer who has not interacted with the page yet sees attacks without sound.
