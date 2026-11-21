## Context

Attack strikes and the nuke are drawn by `playStrike` / `playNuke` (`apps/web/src/board/fx.ts`, `nukeFx.ts`), started from `BoardView.playStrikeFx` / `playNukeFx` on the board and from `AnimationPreview.play` in the library editor. The library's thumbnails call the same renderers and fast-forward them. Settings already stores a 0–100 `soundVolume` that nothing used.

## Decisions

- **Recorded clips over synthesis, each shape with a theme.** A first, all-synth version sounded synthetic, so each shape got a real-world theme and is now built from recorded clips of it (`public/sfx`, 44 MP3 clips, about 1 MB), with synthesized tone and noise kept for sub-bass, risers, hums and the holy chord. Every clip is cut from a CC0 recording (BigSoundBank, Joseph SARDIN; OpenGameArt, StarNinjas); `public/sfx/CREDITS.md` gives each clip's source page, author, licence and cut, and a test checks that every clip played is shipped and credited. Clips are mono, peak-normalized MP3 (decodable in every browser); pitch and speed changes happen at playback (`rate`), so one clip serves several shapes. The cue sheet, with every beat read off the drawing code, is `docs/SOUND-PLAN.md`; `fxSoundRecipes.ts` is its table in code.
- **A clip's hit lands on the beat.** Each clip has its measured hit time (`SFX_CLIPS`), and a hit clip starts that much (divided by its playback rate) before its beat; one whose lead-in would start before the animation begins part-way into the clip. Rising and held beds start at their `at` instead, like synth layers.
- **Clips load in the background.** The engine fetches and decodes every clip when it is created (on the first gesture after the board or editor mounts). A clip not decoded yet, or that failed, is left out of that play; the synth layers still sound.
- **Drama.** Risers drop out 30 ms before their beat, a breath of silence before the hit. The biggest sounds (thunder, bells, gong, the nuke) also send to a second, 3.5 s hall reverb, and crowds (arrows, rubble, forks) are spread across the stereo field.
- **Timed by fractions of the duration.** A layer's start is a fraction of the animation's duration, and hits the drawing spaces by count, spin or trail use the same formulas as the drawing, so sound stays on the frame at any duration or count. Risers and held beds stretch exactly with the duration; one-shot hits stretch only a little.
- **Scheduled once, on the audio clock.** The whole play is scheduled when the effect starts (20 ms ahead), not chased frame by frame: the renderer runs on wall-clock time, so the two stay together even when frames drop.
- **Hooked at the callers, not in the renderer.** `withSound(run, def, reduced)` wraps the `RunningFx` in `BoardView` and `AnimationPreview`. The thumbnails call the renderer directly and stay silent. A wrapped effect destroyed before its duration (evicted, replaced by a nuke, page hidden, editor stopped) fades its sound over 80 ms; one that ends on its own keeps its tail.
- **Relative to each shape's defaults.** Size above the shape's default raises gain and lowers pitch slightly; shake above its default adds weight to the low-end layers. The built-ins therefore sound exactly as planned.
- **Browser audio policy.** The context is created and resumed on the first pointer or key event after the board or editor mounts. A sound requested while the context is not running is skipped, never queued, so nothing plays late in a burst.
- **Limits.** Six plays at once (a play counts until its reverb tail is over); the same shape again within 60 ms of page time is skipped (one attack at several targets).

- **Dice follow their keyframes.** The dice are keyframed, not simulated, so their contacts are known in advance: `THROW_CONTACTS` in `diceGeometry.ts`, shared by the keyframes and `scheduleDice`. The whole throw is scheduled once, when the animations start. Dice throws have their own allowance (four at once), so the roll before an attack never takes the attack's place.

## Risks

- A viewer who has not clicked or typed in the page yet hears nothing: the browser forbids it.
- The clips come from free libraries, so some themes are approximations: the biggest explosion recorded is a bird-scaring cannon, made huge by layering it with a thunderclap played at half speed and synthesized sub-bass.
- The clips add about 1 MB to the first load of a page that plays an animation.
