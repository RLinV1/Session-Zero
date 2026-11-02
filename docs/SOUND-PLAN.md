# Attack animation sound plan (cue sheet)

This is the sound plan for the 20 board animations: the 19 strike shapes drawn by `playStrike`
(`apps/web/src/board/fx.ts`, `fxStrikes.ts`) and the nuke drawn by `playNuke` (`nukeFx.ts`). All
sound is generated in code with the Web Audio API; no audio files. Every beat time below was read
from the drawing code, not guessed: `landAt = spec.land * duration` in `playStrike`, the per-shape
`draw`/`after` functions in `fxStrikes.ts`, and `blastAt = duration * NUKE_DROP_SHARE` (0.46, in
`fxBudget.ts`) in `nukeFx.ts`.

**As built** (`apps/web/src/board/fxSound.ts`, `fxSoundRecipes.ts`), where it differs from the rules
below: a seventh simultaneous sound is skipped rather than fading out an older one; the same shape
again within 60 ms (page time) is skipped rather than played quieter; layers are not capped by node
count; replay scrubbing is not muted (the six-sound cap bounds it); a play's gain and pitch scale
against its shape's default size and shake; every riser drops out 30 ms before its beat, a breath
of silence before the hit.

**Second pass: themes and recordings.** The all-synth recipes below were the first version. Each
shape now has a real-world theme and is built from recorded CC0 clips of it (`apps/web/public/sfx`,
44 clips, about 1 MB; every source, author, licence and cut is in `public/sfx/CREDITS.md`). The synth
layers that remain add sub-bass and lock risers, hums and the holy chord to the picture. The beats
are the ones in this sheet: a clip's hit (its measured `SFX_CLIPS` hit time) lands on the beat its
synth layer had. A clip that has not loaded yet is left out of that play.

| Shape | Theme | Recorded clips |
|---|---|---|
| slash | steel longsword | sword swish, sword cut, sword clash |
| claw | snarling beast's claws | growl, whoosh, cloth tear per rake, punch |
| whirlwind | spinning blades in a rush of wind | blade swing per blade pass, strong wind up and down, two sword clashes |
| slam | warhammer onto flagstones | heavy whooshes, hammer on concrete, thunder crack two octaves down, falling stones |
| shadow | wraith of living shadow | slowed wind moan, two whisper murmurs left and right, reversed bowl and reversed whisper inhaling into the lunge, growl two octaves down, slowed whisper fading in the hall (with synth formant moans, a rising shriek and a dying wail) |
| projectile | crossbow bolt | bow release, arrow whoosh, arrow into target |
| volley | longbow volley | bow release and arrow whoosh per arrow, arrows into target, spread in stereo |
| dagger | throwing knives | blade swing per knife, whooshes, knives into wood, vibrating blade |
| fireball | hurled fire, fiery blast | gasoline ignition, whoosh, fire roar, blast, deep thunder, fire burst, crackle |
| meteor | burning rock from the sky | slowed fire roar and wind rising, blast, deep thunder, falling stones, rolling thunder |
| explosion | dynamite | fuse sizzle, landing thud, blast, deep thunder, rolling thunder, falling stones |
| bolt | lightning bolt | electric shock, welding arc, whip crack, thunder crack, shocks per fork |
| chain | chain lightning | rising arc, thunder crack, whip crack and shock per jump, rolling thunder |
| beam | humming energy beam | blaster, transformer hum, welding arc |
| frost | ice spell | icy wind, ice cracking, singing bowl ring, glass burst for the shatter |
| poison | poison vial | whoosh, breaking glass, splash, boiling, a slowed whisper from the skulls |
| smite | holy strike | a synthesized choir and singing bowl while it is cast; on the strike, all played slow and deep: a hammer on concrete, a blast, thunder crack, rolling thunder, falling stones, gong, with a soft church bell |
| sonic | war drums | bass tom per arc, slowed bass tom per impact, gong |
| tornado | twister full of stones | howling and strong wind, stone rattle, heavy whoosh, falling stones |
| nuke | nuclear blast | over a synthesized air-raid siren while the bomb falls: blast, thunder crack far down, rolling thunder, echo cracks, fire roar, tinnitus, falling rubble, aftermath wind |

Reduced animations play one short soft clip per shape (a punch, a sword cut, an electric shock,
fire, ice, wind, a bell, or a distant thunder for the nuke) instead of the synth cues listed
under rule 5.

All times are at the shape's default preset (`SHAPE_DEFAULTS` in `effectPresets.ts`). Where a
GM-edited `duration` or `count` moves a beat, the formula is given next to the number. "D" means the
animation's duration, "L" means its landing time (`land * D`), "n" means `def.count`.

## The 20 shapes at a glance

| Shape | Duration D (s) | Land fraction | Land L (s) | Hits at default count | Map shake (px) | Showpiece |
|---|---|---|---|---|---|---|
| slash | 0.9 | 0.30 | 0.27 | 1 (extra cuts follow 0.054 s apart if n > 1) | 8.0 | no |
| claw | 0.9 | 0.30 | 0.27 | 3 rakes, 0.054 s apart | 8.8 | no |
| whirlwind | 1.4 | 0.50 | 0.70 | 1 landing, then 4 blades passing 13 times a second | 7.3 | no |
| slam | 1.2 | 0.45 | 0.54 | 1, then 8 cracks all at once | 19.3 | no |
| shadow | 1.4 | 0.65 | 0.91 | 1 (two crossing cuts at the same moment) | 5.6 | no |
| projectile | 1.0 | 0.55 | 0.55 | 1 | 4.0 | no |
| volley | 1.3 | 0.60 | 0.78 | 7 arrows, all land at the same instant | 4.8 | no |
| dagger | 1.0 | 0.50 | 0.50 | 3 daggers, all land at the same instant | 4.8 | no |
| fireball | 1.4 | 0.50 | 0.70 | 1 | 14.2 | YES |
| meteor | 1.5 | 0.55 | 0.825 | 1 (then 9 stones fall back) | 18.2 | YES |
| explosion | 2.0 | 0.60 | 1.20 | 1 blast (after a thud at 0.60 s and a bounce at 0.816 s) | 19.8 | YES |
| bolt | 1.3 | 0.60 | 0.78 | 1 (then 7 forks) | 7.8 | no |
| chain | 1.5 | 0.30 | 0.45 | 5: the landing plus 4 jumps | 6.1 | YES |
| beam | 1.4 | 0.25 | 0.35 | 1, held and sustained | 4.8 | no |
| frost | 1.4 | 0.45 | 0.63 | 1 landing, 7 spikes, 1 shatter at 1.169 s | 7.3 | no |
| poison | 1.6 | 0.55 | 0.88 | 1 shatter, then about 6 bubble pops | 2.6 | no |
| smite | 2.5 | 0.62 | 1.55 | 1 | 9.5 | YES |
| sonic | 1.2 | 0.45 | 0.54 | 4 pulses, 0.09 s apart | 12.8 | no |
| tornado | 1.7 | 0.55 | 0.935 | 1 (then 15 chunks of debris fall) | 12.1 | YES |
| nuke | 6.5 | 0.46 | 2.99 | 1 | page shake 19.8 for 2.7 s | YES |

"Map shake" is `shake * 16 * sqrt(big)` pixels, easing out over `min(impactLen, 0.5)` s from L. It is
a good guide to how heavy the low end of an impact should be. The nuke shakes the whole page
instead (`screenShake.ts`: `shake * 22` px, starting at 2.99 s, lasting `0.77 * (D - L)` = 2.7 s).

## How to read the recipes

Each recipe row is one layer made from the planned engine primitives.

| Column | Meaning |
|---|---|
| Src | Tone: `sine`, `tri`, `saw`, `sq`; optional `vib rate/depth` (Hz / Hz). Noise: `white`, `pink`, `brown`. |
| Start | Fraction of the animation's duration D, then the same moment in seconds at the default D. |
| Dur | Seconds at the default duration. For a repeating layer, the length of one hit. |
| Att | Attack seconds. A plain number means: attack, then an exponential decay to silence at Dur (hits, swishes, booms). `n H` means: attack n seconds, hold at full level, fade over the last 20 % of Dur (hums, beds, pads). `R` means: ramp up for the whole Dur and stop on the beat (risers and "approaching" sounds). |
| Hz | Tone: frequency start→end. Noise: filter cutoff start→end. |
| Filter | Noise: `bp`, `lp`, `hp` and Q. Tone: optional fixed lowpass, e.g. `lp 1600`. |
| Gain | The layer's peak, 0 to 1, before the user's volume and the size/shake scaling. |
| Wet | Send to the shared reverb, 0 to 1. |
| Repeat | `xN @s`: N hits, s seconds apart. `xcount` means N = `def.count`. |

Layer gains assume a master compressor/limiter on the output (see general rules, rule 9). The `H`
and `R` envelopes are a small addition to the primitive list (an attack-hold-release shape and a
ramp-to-the-end shape); without them, split those layers in two overlapping decays.

## General rules

1. **Everything is anchored to the clock, not to events.** Pre-schedule every layer on the
   `AudioContext` clock at the moment the effect starts, using `start * D` for the offset. Do not
   chase the render loop. The renderer's clock is wall-clock (`(now - entry.started) / 1000` in
   `BoardView.startFx`), so slow frames make the picture jump ahead rather than slow down, and the
   scheduled sound stays correct. Add a fixed latency offset of about +0.02 s to every layer: the
   renderer only updates at 30 fps (24 fps on Low), so the landing frame appears 0 to 33 ms after
   the nominal beat, and sound that leads the picture by 20 ms is fine while sound that trails it
   is not.
2. **Repeat spacing scales with D.** Every sub-hit spacing in the code is a fraction of D (cut
   step `min(0.06, 0.35/n) * D`, volley stagger `0.035 * D`, dagger stagger `0.03 * D`, chain
   jump step `(0.85 D - L) / n`, sonic gap `(0.04 + trail * 0.07) * D`). When a GM changes the
   duration, multiply every `Repeat` spacing by (actual D / default D), and never go below 0.02 s.
   Layer start fractions already scale. `Dur` does not need to scale; a tail may run past the end.
3. **Pitch and timing jitter on every play.** Per play: tone frequencies (both ends of the sweep)
   times a random factor in ±4 % (±3 % for the main impact layers); noise cutoffs ±8 %; gain ±1 dB.
   Per repeat inside a layer: pitch ±2 %, start time ±6 ms (±10 ms for crowds such as volley arrows
   and dagger stabs). The main impact layer's start gets no timing jitter. Use `Math.random` only
   in the audio code, never in `shared`.
4. **Simultaneous-sound cap of about 6.** One animation play (all its layers and repeats) is one
   sound. The board itself runs at most 4 effects at once (`MAX_FX_RUNS = 4` in `boardView.ts`), but
   tails keep ringing after the picture ends, so allow 6. When a seventh starts, fade out the
   quietest, oldest non-showpiece play over 60 ms. Priority: nuke, then showpieces, then the rest.
   Also cap live oscillator and noise nodes at about 40 in total. If the same shape starts again
   within 80 ms (an attack at several targets sends several strikes at once), skip the launch
   layers of the extras and scale the extras' gain by 1/sqrt(k) so four fireballs are not four
   times as loud.
5. **Reduced animations plays only a short soft impact cue.** When `reducedMotion` is true in
   `BoardView` (OS `prefers-reduced-motion`, the client setting `reducedAnimations`, or the GM's
   table-wide `reducedEffects`), the strike is a still ring for 0.6 s (`REDUCED_FX_S`) and the nuke
   is a still ring for 0.8 s whose `onImpact` fires immediately. Play one cue, once, at that moment,
   from the table below: no travel, no sub-bass, no tails, peak gain at most 0.3, 0.5 s at most. The
   map editor's preview always plays in full (`animationPreview.ts` passes `reducedMotion: false`),
   so it plays the full sound too.
6. **Thumbnails must stay silent.** `animationThumbnail.ts` calls `playStrike` and `playNuke`
   directly and fast-forwards through the whole timeline in a few milliseconds (`for (t = 0; t <
   peak; t += 1/30) run.update(t)`), then destroys the run. If sound lived inside `fx.ts`,
   `nukeFx.ts` or a `RunningFx`, every library card would play it. So: put the hook in
   `BoardView.playStrikeFx` / `playNukeFx` (after the "token missing" checks) and in
   `AnimationPreview.play`, never in `playStrike`, `playNuke`, `makeScene` or `destroy()`. Add a
   test that rendering a thumbnail never constructs an `AudioContext`, and keep the audio module
   un-imported from `animationThumbnail.ts` and `fx.ts`.
7. **Stop correctly.** A natural end (`update` returned false, elapsed >= D) lets tails ring out
   over the reverb. A forced end (elapsed < D) fades the play's layers out over 80 ms. Forced ends
   in the code: the oldest run is evicted when a fifth starts (`startFx`); a nuke ends every other
   run, strikes included (`playNukeFx`); a change of graphics quality or reduced animations ends
   all runs (`subscribeGraphicsSettings` in `BoardView`); the board is destroyed; the editor's
   `play()` stops the previous play and `stop()` is also called when the tab goes hidden. All of
   them go through `endFx` or `AnimationPreview.stop`, which is where to cut the sound.
8. **Sound follows the picture, never the event.** A strike's sound must start where the strike is
   drawn: `playAttackEffect` -> `playStrikeFx`. `attackEffectFor` already returns null when either
   token is hidden from this viewer or missing, `Board` skips live effects when
   `suppressLiveEffects` is on, and the strike waits for its thrown dice (up to `STRIKE_WAIT_MS` = 5 s). Hooking at the `DiceRolled`
   event would leak hidden attacks to players and play too early (FR-GM-23). Do not play when
   `document.visibilityState` is hidden (the renderer does not advance in a hidden tab), and stop
   running sounds when the tab hides. Session replay (`replayFrame`) also goes through
   `playAttackEffect`; mute sound while scrubbing and keep it for normal-speed playback only.
9. **Web Audio housekeeping.** Create the `AudioContext` lazily on the first pointer or key event
   and `resume()` it there; if it is still suspended when an effect starts, skip the sound, do not
   queue it. Master chain: sound volume slider (`soundVolume`, 0 to 100, squared for a perceptual
   curve) -> `DynamicsCompressor` (threshold -10 dB, knee 6, ratio 12, attack 3 ms, release 150 ms)
   -> destination. Give every layer a 1 to 2 ms minimum attack and a 5 ms release so nothing clicks.
   Sub-bass below 60 Hz is inaudible on laptop speakers: always pair a sub layer with a 110 to
   180 Hz layer. Shared reverb: about 1.8 s decay, 15 ms pre-delay, 6 kHz lowpass; cut its tail
   with the play.
10. **Loudness tiers** (rough peak of the summed impact, after the master volume): nuke 1.0;
    explosion, meteor, slam, fireball 0.8; smite, tornado, sonic, bolt, chain, frost, whirlwind
    0.6; slash, claw, shadow, projectile, volley, dagger, beam, poison 0.45. Scale a play's gain
    by about `0.75 + 0.1 * size` and its low-end layers by `shake * sqrt(big)` (the shake column
    above), clamped to 0.6 to 1.3.

### Reduced-animations cues

Played once, at the moment the still marker appears. Wet 0 unless stated.

| Cue | Shapes | Layers |
|---|---|---|
| soft-hit | slash, claw, whirlwind, slam, shadow, projectile, volley, dagger | noise white bp 1800→900 Q1.5, Att 0.002, Dur 0.09, Gain 0.25; sine 160→90, Att 0.003, Dur 0.10, Gain 0.25 |
| soft-magic | bolt, chain, beam, frost, smite, sonic | tri 880→660, Att 0.003, Dur 0.15, Gain 0.18, Wet 0.25; noise white hp 4000 Q0.7, Att 0.002, Dur 0.05, Gain 0.10 |
| soft-fire | fireball, meteor, explosion | noise brown lp 1200→300 Q0.8, Att 0.005, Dur 0.20, Gain 0.30; sine 110→60, Att 0.005, Dur 0.18, Gain 0.25 |
| soft-air | poison, tornado | noise pink bp 600→300 Q2, Att 0.01, Dur 0.20, Gain 0.22 |
| soft-nuke | nuke | noise brown lp 400→120 Q0.8, Att 0.01, Dur 0.50, Gain 0.30; sine 70→40, Att 0.01, Dur 0.50, Gain 0.30 |

## Where sound is hooked in (what the code does)

- **One funnel on the board.** `BoardView.playAttackEffect` -> `playStrikeFx` / `playNukeFx` ->
  `startFx(run)`. The picture's clock starts on the first animation frame after `startFx`, up to
  one frame (about 17 ms) later. Start the audio schedule inside `startFx` (or just before it) with
  the +0.02 s offset from rule 1. The nuke's page shake (`shakeScreen`) starts on a timer from the
  moment `Board.playEffect` runs, so it also leads the picture by under a frame; sound sits with it.
- **Editor preview** has its own funnel: `AnimationPreview.play(def)` (always full motion, stops the
  previous play, stops on hidden tab). The nuke there has no `onImpact` callback.
- **Nuke `onImpact`** fires on the first rendered frame with `elapsed >= 2.99 s`, so up to 33 ms
  late (more on a slow frame). It also fires immediately, at construction, under reduced motion.
  It releases the held HP numbers in the UI, so nothing else should depend on the sound.
- **Strikes under reduced motion** are static (`animated: false`): `BoardView` never calls
  `update`, it only sets a 0.6 s removal timer. The ring is drawn at construction, so the cue goes
  at `playStrikeFx` time.
- **Count and duration are free for the GM** (count 1 to 12, duration 0.2 to 8 s; it was 4 s before ADR 0047). The sub-hit
  formulas in each shape section are the exact ones, so the engine can compute them from the
  def instead of hard-coding the defaults.
- The schema forbids a `nuke` shape on an attack (`StrikeAnimationDef` in `shared`), so
  `playStrike`'s "nuke drawn as a projectile" branch should never need its own sound; if it ever
  runs, use the projectile recipe.

---

# The shapes

## 1. slash

**Visual beats**
- 0.00 (0 s): a glowing crescent starts swinging in on the target; its bright head runs along the
  arc over 0.4 D (0.36 s). With the painted art the crescent eases out, so it moves fastest first.
- 0.20 (0.18 s): the head passes the target (middle of the arc).
- 0.30 (0.27 s): landing. Light impact: flash, 2 rings, 28 sparks, 8 px map shake.
- 0.55 to 1.00 (0.495 to 0.9 s): the arc fades out.
- Count n > 1: cut i starts at `i * min(0.06, 0.35/n) * D` (0.054 s apart), and every other cut is
  mirrored so they cross in an X. There is still only one landing flash at 0.30.

**Sound cues**
- Launch: a single sword swish from the start.
- Impact: a short sharp hit exactly on the flash, 0.30.
- Tail: a faint blade ring, then silence.

**Character:** crisp bright steel: swish, then one clean slice.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| swish | white | 0.02 (0.02) | 0.22 | 0.07 | 900→4200 | bp Q1.2 | 0.35 | 0.05 | xcount @0.054 |
| hit crack | white | 0.30 (0.27) | 0.12 | 0.002 | 3200→1200 | bp Q0.9 | 0.50 | 0.10 | |
| body thump | sine | 0.30 (0.27) | 0.12 | 0.003 | 190→90 | | 0.45 | 0 | |
| blade ring | tri vib 7/12 | 0.30 (0.27) | 0.45 | 0.002 | 2400→2380 | | 0.07 | 0.35 | |

## 2. claw

**Visual beats**
- Three parallel rakes (count 3), each a crescent sweeping over 0.4 D (0.36 s), starting at
  `i * 0.054 s`: 0, 0.054, 0.108 s. The rakes sit 0.62 token radii apart.
- Each rake's head crosses the target 0.2 D after it starts: **0.20 (0.18 s), 0.26 (0.234 s),
  0.32 (0.288 s)**.
- 0.30 (0.27 s): the one landing flash (light impact, 30 shard sparks, 8.8 px shake). It falls
  between the second and third rake.
- 0.55 to 1.00: the rakes fade.
- Step is `min(0.06, 0.35/n) * D`; for n of 6 or more the rakes squeeze together (0.35 D / n).

**Sound cues**
- Launch: three fast swipes, one per rake.
- Impact: a rip on each crossing (0.18, 0.234, 0.288 s) and one heavier flesh thud on the flash.
- Tail: none; it is over fast.

**Character:** a fast, savage triple tear, wetter and lower than the slash.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| rip swipe | white | 0.02 (0.02) | 0.14 | 0.02 | 1400→3800 | bp Q1.5 | 0.30 | 0.05 | xcount @0.054 |
| rip cut | white | 0.20 (0.18) | 0.08 | 0.002 | 3500→1800 | bp Q2 | 0.40 | 0.10 | xcount @0.054 |
| flesh thud | sine | 0.30 (0.27) | 0.14 | 0.003 | 150→70 | | 0.50 | 0 | |
| flesh slap | pink | 0.30 (0.27) | 0.16 | 0.004 | 1800→300 | lp Q0.8 | 0.30 | 0.10 | |

## 3. whirlwind

**Visual beats**
- 0.00 to 0.50 (0 to 0.7 s): a ring of spinning blades travels from the attacker to the target
  (path `easeIn * 0.7 + linear * 0.3`, so it speeds up); the ring grows from 50 % to 100 % size.
- Blade rate: `n * spinRate / 2pi` where `spinRate = 3 + spin * 25 = 20.5`, so 3.26 turns a second
  and **13 blade passes a second** (one every 0.0766 s) with 4 blades.
- 0.50 (0.70 s): landing. Full impact (big 1.3): flash, disc, 2 rings, 30 sparks, 7.3 px shake.
- 0.50 to 1.00 (0.7 to 1.4 s): the blades keep sweeping the target while the ring shrinks to half
  and fades (`fade = 1 - k^1.5`).

**Sound cues**
- Launch and travel: rising wind and a chop for each blade pass, getting faster in feel as the
  path accelerates.
- Impact: a metal crack and thump at 0.50.
- Tail: the wind falls in pitch and the chops fade with the ring.

**Character:** a helicopter of steel that turns into a chopping storm.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| blade chops | white | 0 (0) | 0.06 | 0.01 | 800→1800 | bp Q3 | 0.20 | 0.10 | x17 @0.0766 |
| wind up | pink | 0 (0) | 0.70 | R | 250→1400 | bp Q1.2 | 0.30 | 0.15 | |
| wind down | pink | 0.50 (0.70) | 0.70 | 0.02 | 1400→300 | bp Q1.2 | 0.28 | 0.25 | |
| impact crack | white | 0.50 (0.70) | 0.14 | 0.002 | 2800→900 | bp Q1 | 0.45 | 0.15 | |
| impact thump | sine | 0.50 (0.70) | 0.20 | 0.003 | 170→60 | | 0.50 | 0 | |

The chop layer's rate is `n * (3 + spin * 25) / 2pi` per second; recompute the spacing from the
def. 17 chops at 0.0766 s span 1.3 s.

## 4. slam

**Visual beats**
- 0.00 to 0.45 (0 to 0.54 s): the attacker leaps in an arc (height `(2 + arc*6)` token radii, peak
  at 0.225 D = 0.27 s); a shadow on the ground shrinks as it rises, a trail follows.
- 0.45 (0.54 s): touchdown. Full impact (big 1.8): flash, disc, 3 rings, 40 square sparks and
  **19.3 px map shake**, the strongest of the melee shapes.
- 0.45 to 0.67 (0.54 to 0.80 s): dust rolls out and all `count` (8) cracks race outward at the same
  time (`grow = easeOut(k * 2.5)`, finished at k = 0.4). There is no stagger between cracks.
- 0.70 to 1.00 (0.84 to 1.2 s): cracks, dust and ring fade; gravity-heavy sparks (0.7) rain down.

**Sound cues**
- Launch: a whoosh up, then a falling whoosh that builds to the touchdown.
- Impact: a huge thud and stone crack at 0.45.
- Tail: crackling fissures for about 0.25 s, then rubble patter.

**Character:** heavy and grounded; the weight is in the low end.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| leap whoosh | pink | 0 (0) | 0.28 | 0.10 | 300→1200 | bp Q1 | 0.30 | 0.10 | |
| fall whoosh | pink | 0.20 (0.24) | 0.30 | R | 1500→300 | bp Q1.2 | 0.35 | 0.10 | |
| impact thud | sine | 0.45 (0.54) | 0.55 | 0.004 | 95→32 | | 0.90 | 0.20 | |
| stone crack | brown | 0.45 (0.54) | 0.40 | 0.002 | 3500→200 | lp Q0.8 | 0.70 | 0.30 | |
| fissures | white | 0.45 (0.54) | 0.10 | 0.002 | 4000→1500 | bp Q2 | 0.20 | 0.10 | xcount @0.03 |
| rubble patter | white | 0.60 (0.72) | 0.04 | 0.001 | 3000 | hp Q0.7 | 0.12 | 0.15 | x6 @0.07 |

## 5. shadow

**Visual beats**
- 0.00 to 0.39 (0 to 0.546 s): the attacker's shadow glides at the target as a hooded wraith
  (smoothstep), stopping about 1.8 token radii short. While it moves, `count - 1` (4) ghosts smear
  behind it, `(0.03 + trail * 0.05) * D` = 0.091 s apart.
- 0.39 to 0.546 (0.546 to 0.764 s): it hovers, floats up and rears back; its eyes flare; the ghosts
  gather into it and vanish.
- 0.546 to 0.65 (0.764 to 0.91 s): it lunges across the gap (`easeIn`), ghosts stretching out.
- 0.65 (0.91 s): landing. Light impact (flash, 1 ring, 30 sparks, 5.6 px shake). Two crossing cuts
  draw across the target during the first third of the impact (0.91 to 1.07 s) and fade from
  1.08 s. The wraith bursts into smoke and dissolves over 0.6 of the impact (0.29 s).

**Sound cues**
- Launch and glide: a low airy whisper.
- Hover: a tension tone rising in pitch (eyes flaring).
- Lunge: a fast rising swoosh that ends on the hit.
- Impact: a double slice at 0.65, a low thump and a smoky exhale.

**Character:** whispery and menacing; silence-then-strike.

**Third pass (as built): a shadow spirit.** The wraith now has a voice. Glide: wind slowed to half
speed as a moan, two whispered murmurs from different parts of the recording (one each side, at
0.85 and 0.7 speed), and two sawtooth moans a semitone apart (196→165 and 208→174 Hz) through
vowel-like bandpass formants (500→420 Hz and 950 Hz). Rearing back (0.39 to 0.546): a reversed
singing bowl and a reversed whisper swell and cut off exactly as it lunges, under the beast growl
at half speed for the eye flare. Lunge: a sawtooth shriek rising 320→1150 Hz through a 900→2200 Hz
formant, dropping out 30 ms before the hit, and a slowed heavy whoosh. Hit: the double slice at
0.85 speed, a 90→38 Hz thump and a thunderclap at 0.4 speed through a 900 Hz lowpass. Dissolve: a
wail sliding 520→180 Hz, smoke, and a last whisper at 0.6 speed into the hall reverb. Reduced
animations play a short slowed whisper. Rendered, the inhale peaks at -16 dB, the breath dips to
-19 dB and the slice lands at -11 dB; at 2.8 s the dip is -28 dB and the hit -10 dB.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| glide | pink | 0 (0) | 0.65 | 0.25 H | 250→700 | bp Q3 | 0.22 | 0.45 | |
| tension tone | tri vib 6/8 | 0.30 (0.42) | 0.50 | R | 140→260 | | 0.18 | 0.50 | |
| lunge | white | 0.545 (0.763) | 0.17 | R | 800→3500 | bp Q1.5 | 0.38 | 0.15 | |
| double slice | white | 0.65 (0.91) | 0.09 | 0.002 | 3800→1500 | bp Q2 | 0.45 | 0.15 | x2 @0.03 |
| low thump | sine | 0.65 (0.91) | 0.18 | 0.003 | 120→60 | | 0.40 | 0.10 | |
| smoke exhale | pink | 0.65 (0.91) | 0.50 | 0.02 | 2200→200 | lp Q0.8 | 0.40 | 0.40 | |

## 6. projectile

**Visual beats**
- 0.00 to 0.55 (0 to 0.55 s): a glowing orb flies a shallow arc (`arc * min(0.45 dist, 7 r)`),
  accelerating (`easeIn * 0.6 + linear * 0.4`), with a trail and orbiting dots.
- 0.55 (0.55 s): landing. Full impact: flash, disc, 2 rings, 22 sparks, 4 px shake.
- Count n > 1: shot i leaves at `i * min(0.04 D, 0.6 L/(n-1))` (0.04 s apart) but **all arrive
  together at 0.55**.

**Sound cues**
- Launch: a short "pew" per shot.
- Travel: a thin rising whoosh.
- Impact: a pop with a small thump and a faint shimmer.

**Character:** clean, quick, energy-bolt "pew-pop".

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| launch zip | sine | 0 (0) | 0.12 | 0.003 | 1800→600 | | 0.30 | 0.10 | xcount @0.04 |
| travel whoosh | white | 0.05 (0.05) | 0.50 | R | 1000→2600 | bp Q2 | 0.20 | 0.10 | |
| impact pop | white | 0.55 (0.55) | 0.14 | 0.002 | 3000→1000 | bp Q1 | 0.45 | 0.10 | |
| impact thump | sine | 0.55 (0.55) | 0.14 | 0.003 | 220→90 | | 0.40 | 0 | |
| ring shimmer | sine | 0.55 (0.55) | 0.30 | 0.002 | 1320→880 | | 0.10 | 0.30 | |

## 7. volley

**Visual beats**
- 7 arrows launch `0.035 D` = 0.0455 s apart: at 0, 0.0455, 0.091, 0.1365, 0.182, 0.2275, 0.273 s
  (stagger is `min(0.035 D, 0.5 L/(n-1))`). Each flies a high arc and the later ones fly faster,
  because every arrow's flight ends at L.
- **0.60 (0.78 s): all 7 land at the same instant** and stick in the ground. They fade over the
  impact (0.52 s). Light impact: 24 sparks, 4.8 px shake.

**Sound cues**
- Launch: seven quick bow twangs, 0.0455 s apart.
- Travel: a swell of arrow whistling overhead, rising in pitch as the volley comes down.
- Impact: a cluster of thunks all at once (spread over about 40 ms so it is not a single click),
  then a quiver.

**Character:** a dense hail: a rapid pluck-pluck-pluck, a hiss from the sky, one big "thwack".

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| bow twang | tri | 0 (0) | 0.09 | 0.002 | 260→200 | | 0.22 | 0.10 | xcount @0.0455 |
| arrow rain | white | 0.08 (0.104) | 0.67 | R | 2000→3600 | bp Q3 | 0.15 | 0.15 | |
| landing thunks | brown | 0.60 (0.78) | 0.07 | 0.001 | 1400→300 | lp Q0.8 | 0.40 | 0.10 | xcount @0.006 |
| landing ticks | white | 0.60 (0.78) | 0.03 | 0.001 | 3500 | hp Q0.7 | 0.22 | 0.05 | xcount @0.006 |
| landing thump | sine | 0.60 (0.78) | 0.14 | 0.003 | 180→80 | | 0.40 | 0 | |
| shaft quiver | tri vib 28/10 | 0.60 (0.78) | 0.30 | 0.002 | 440→430 | | 0.06 | 0.20 | |

The arrows do not land one after another, so keep the thunk spacing tiny and let jitter (±10 ms)
spread them. (Raised after an offline render: at the first gains, 0.18 and 0.10 with no thump, the
landing was quieter than the bow twangs.)

## 8. dagger

**Visual beats**
- 3 daggers are thrown `0.03 D` = 0.03 s apart (0, 0.03, 0.06 s; stagger is
  `min(0.03 D, 0.4 L/(n-1))`), spinning at 3.3 turns a second on curved paths that fan out and meet
  at the target, each with ghost afterimages.
- **0.50 (0.50 s): all 3 land at the same instant**, 4 sparks each, and stay stuck in the target
  fading over the impact (0.5 s). Light impact, 4.8 px shake.

**Sound cues**
- Launch: three quick throws.
- Travel: a flutter of spinning metal.
- Impact: three stabs together, one thud.

**Character:** quick, sharp, a little spiteful.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| throw whoosh | white | 0 (0) | 0.10 | 0.015 | 1800→4500 | bp Q1.5 | 0.25 | 0.05 | xcount @0.03 |
| spin whirr | saw vib 20/80 | 0.03 (0.03) | 0.47 | R | 700→900 | lp 1800 | 0.07 | 0.10 | |
| stabs | white | 0.50 (0.50) | 0.07 | 0.001 | 2200→900 | bp Q1.8 | 0.40 | 0.10 | xcount @0.012 |
| impact thud | sine | 0.50 (0.50) | 0.10 | 0.003 | 200→90 | | 0.35 | 0 | |
| embed ring | tri vib 35/20 | 0.50 (0.50) | 0.30 | 0.002 | 3100→3000 | | 0.05 | 0.20 | |

## 9. fireball (showpiece)

**Visual beats**
- 0.00 to 0.10 (0 to 0.14 s): the fireball flares up in the thrower's hand, drawn back over the
  shoulder; it grows from 30 % to 100 % (`charge = 0.2 L`).
- 0.10 to 0.50 (0.14 to 0.70 s): it is lobbed on an arc (`arc * min(0.45 dist, 7 r)`), leaving fast
  and slowing a little (`0.7 raw + 0.3 easeOut`), trailing flame puffs and shedding embers.
- **0.50 (0.70 s): landing.** Full impact, big 2.2: flash, disc, 2 rings, 70 sparks (capped at 28 / 56 /
  70 by graphics quality: Low / Balanced / High), a rolling ball of fire that grows through the whole impact, **14.2 px
  shake**.
- 0.50 to 1.00 (0.7 to 1.4 s): the fire roll fades (`1 - k`), sparks fall.
- Count n > 1: ball i leaves at `0.14 + i * min(0.04 D, 0.6 (L - charge)/(n-1))` and all arrive
  together at 0.70.

**Sound cues**
- Launch: a soft whump as it ignites (0 to 0.14 s), a throw whoosh at 0.10.
- Travel: a roaring flame body with a flicker, rising then easing with the drop.
- Impact: a boom with a long sub-bass at 0.50, a burst of fire, a rolling billow.
- Tail: flame crackle and a settling rumble through 1.0.

**Character:** a hot, round, rolling whoomp; fire first, thunder second.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| ignite whump | brown | 0 (0) | 0.20 | 0.04 | 200→1200 | lp Q1 | 0.40 | 0.10 | |
| throw whoosh | pink | 0.10 (0.14) | 0.28 | 0.06 | 500→1800 | bp Q1.2 | 0.35 | 0.20 | |
| flame roar | brown | 0.10 (0.14) | 0.60 | 0.10 H | 1800→700 | lp Q0.7 | 0.30 | 0.20 | |
| flame body | saw vib 14/20 | 0.10 (0.14) | 0.60 | 0.10 H | 90→70 | lp 400 | 0.12 | 0.10 | |
| sub boom | sine | 0.50 (0.70) | 0.90 | 0.004 | 110→36 | | 0.85 | 0.25 | |
| mid thump | tri | 0.50 (0.70) | 0.35 | 0.004 | 170→70 | | 0.60 | 0.15 | |
| fire burst | white | 0.50 (0.70) | 0.35 | 0.002 | 9000→400 | lp Q0.7 | 0.75 | 0.30 | |
| fire billow | pink | 0.50 (0.70) | 0.90 | 0.05 | 600→250 | bp Q0.8 | 0.45 | 0.45 | |
| flame crackle | white | 0.53 (0.74) | 0.03 | 0.001 | 4000 | hp Q1 | 0.12 | 0.20 | x14 @0.045 |

**AI sound-effect prompts**

Launch clip, 0.70 s (ends where the impact clip starts):
```
Sound effect, 0.7 seconds. A magical fireball: a soft low whump of fire igniting in the first 0.15 seconds, then a rushing, crackling flame whoosh as it is thrown, with a low roaring body that flies away. No tail: cut off at full intensity. Dry, no reverb, no music, no voices, peak -3 dBFS.
```

Impact clip, 1.5 s (0.7 s of action and 0.8 s of natural fade):
```
Sound effect, 1.5 seconds. A fireball exploding on impact. The first sample is a sharp full-spectrum boom with a deep sub-bass thump, followed by a roaring ball of fire rolling outward for about 0.7 seconds, then crackling flames and embers dying away. Dry, no reverb, no music, no voices, peak -2 dBFS.
```

## 10. meteor (showpiece)

**Visual beats**
- 0.00 to 0.55 (0 to 0.825 s): a flaming rock falls from high above the target (11 radii up and
  `arc * 10` radii to the left), whoever cast it, accelerating (`easeIn * 0.6 + linear * 0.4`),
  with a long hot tail and embers. There is no charge-up and no launch from the attacker.
- **0.55 (0.825 s): impact.** Full, big 1.8: flash, disc, a rolling fireball, 3 rings, 80 sparks,
  **18.2 px shake**. Nine stones are thrown out of the crater.
- 0.55 to 1.00 (0.825 to 1.5 s): the stones arc up (peak about 0.14 s after the hit), fall back
  and settle on the ground between about 1.05 and 1.4 s while they shrink and fade; the fire fades.
- Count n > 1: meteors fan out and are staggered `i * min(0.04 D, 0.6 L/(n-1))`, all landing together.

**Sound cues**
- Travel: a roar of air and fire that swells all the way to the hit.
- Impact: a colossal boom with sub-bass and a rock burst.
- Tail: stones patter down (0.70 to 0.95), a low rumble.

**Character:** weight falling out of the sky; the last half second is all pressure.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| entry roar | brown | 0 (0) | 0.82 | R | 300→2500 | lp Q0.8 | 0.50 | 0.20 | |
| rising whistle | saw vib 9/30 | 0 (0) | 0.80 | R | 400→1400 | lp 1800 | 0.10 | 0.15 | |
| ember crackle | white | 0 (0) | 0.03 | 0.001 | 3500 | hp Q1 | 0.07 | 0.10 | x12 @0.06 |
| sub boom | sine | 0.55 (0.825) | 1.10 | 0.004 | 95→30 | | 0.95 | 0.30 | |
| mid thump | tri | 0.55 (0.825) | 0.40 | 0.004 | 150→60 | | 0.65 | 0.15 | |
| impact crack | white | 0.55 (0.825) | 0.40 | 0.002 | 10000→300 | lp Q0.7 | 0.80 | 0.30 | |
| rock burst | pink | 0.55 (0.825) | 0.70 | 0.01 | 900→250 | bp Q1 | 0.50 | 0.40 | |
| stone rain | white | 0.70 (1.05) | 0.06 | 0.001 | 2500 | bp Q1.5 | 0.16 | 0.25 | x9 @0.04 |
| tail rumble | brown | 0.55 (0.825) | 1.40 | 0.10 | 160 | lp Q0.7 | 0.35 | 0.50 | |

**AI sound-effect prompts**

Launch clip, 0.83 s:
```
Sound effect, 0.83 seconds. A huge flaming meteor falling from the sky: a roaring wall of rushing air and fire that rises steadily in volume and pitch, a thin rising whistle on top, and a few small crackling embers. No tail: cut off at the loudest point. Dry, no reverb, no music, no voices, peak -3 dBFS.
```

Impact clip, 1.8 s:
```
Sound effect, 1.8 seconds. A meteor slamming into the ground. The first sample is a colossal concussive crack with a very deep sub-bass boom that decays over about 1.2 seconds, a rolling burst of rock and fire, then about nine stones raining down and clattering between 0.2 and 0.6 seconds after the impact, ending in a low rumble. Dry, no reverb, no music, no voices, peak -1 dBFS.
```

## 11. explosion (showpiece)

**Visual beats** (a lobbed bundle of TNT, then the blast)
- 0.00 to 0.30 (0 to 0.60 s): the TNT bundle is lobbed in an arc toward a spot 1.6 radii short of
  the target. It tumbles end over end (two turns at the default spin) through the lob and the
  bounce, slowing to land upright by 0.408. Its fuse tip spits sparks the whole time; its
  shadow races along the ground.
- **0.30 (0.60 s): first touch-down**, a puff of dust (0.60 to 0.84 s).
- 0.30 to 0.408 (0.60 to 0.816 s): it bounces once, low, onto the target.
- **0.408 (0.816 s): it comes to rest upright** and rocks. A warning glow and a closing ring
  (2.6 to 0.8 radii) start.
- 0.408 to 0.60 (0.816 to 1.20 s): the warning blinks faster and faster. Bright peaks at 0.875,
  0.971, 1.025, 1.066, 1.100, 1.130, 1.156, 1.180 s (gap shrinks from 0.096 s to 0.024 s; at 30 fps
  the last ones blur into a flicker).
- **0.60 (1.20 s): detonation.** Full, big 2.4: flash, painted blast expanding for 0.8 s, a
  shockwave ring racing out over the first 0.44 s, 3 rings, 70 sparks, **19.8 px shake**, a smoke
  column rising, `2n` = 12 burning chunks flung on arcs for 0.8 s.
- 0.60 to 1.00 (1.2 to 2.0 s): everything fades (`1 - k`).

**Sound cues**
- Launch: fuse sizzle through the lob, a whirr as it tumbles.
- Travel to rest: a thud at 0.30, a lighter tok at 0.408.
- Warning: two groups of ticks that speed up: 3 slow ticks from 0.875 s, 5 very fast from 1.066 s.
- Impact: crack, sub boom and blast body on 0.60.
- Tail: fragments whizz and clack, smoke hiss.

**Character:** a fuse-lit slow-burn that pays off with a huge, round boom.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| fuse sizzle | white | 0 (0) | 1.20 | 0.02 H | 5500 | bp Q0.8 | 0.10 | 0.05 | |
| tumble whirr | tri vib 3.3/40 | 0 (0) | 0.80 | 0.10 H | 320→250 | | 0.07 | 0.05 | |
| first thud | sine | 0.30 (0.60) | 0.18 | 0.003 | 130→60 | | 0.50 | 0.05 | |
| bounce tok | sine | 0.408 (0.816) | 0.10 | 0.002 | 170→95 | | 0.30 | 0.05 | |
| ticks (slow) | sine | 0.4375 (0.875) | 0.035 | 0.002 | 1760 | | 0.12 | 0.05 | x3 @0.075 |
| ticks (fast) | sine | 0.533 (1.066) | 0.02 | 0.002 | 2400 | | 0.12 | 0.05 | x5 @0.03 |
| blast crack | white | 0.60 (1.20) | 0.45 | 0.002 | 12000→300 | lp Q0.7 | 0.85 | 0.30 | |
| sub boom | sine | 0.60 (1.20) | 1.20 | 0.004 | 90→30 | | 0.95 | 0.25 | |
| blast body | brown | 0.60 (1.20) | 0.90 | 0.01 | 3500→150 | lp Q0.8 | 0.70 | 0.40 | |
| fragments | white | 0.62 (1.24) | 0.12 | 0.005 | 3000→1500 | bp Q4 | 0.07 | 0.20 | x12 @0.035 |
| smoke tail | pink | 0.65 (1.30) | 0.90 | 0.20 | 3000→600 | lp Q0.7 | 0.20 | 0.50 | |

The tick groups fit the measured peaks: slow ticks at 0.875, 0.95, 1.025 s; fast ticks at 1.066,
1.096, 1.126, 1.156, 1.186 s. These times are fixed by the code (`warn` blinks at
`e * (8 + 40 * settle^2)`), not by `count`; they scale with D like everything else.

**AI sound-effect prompts**

Launch clip, 1.2 s:
```
Sound effect, 1.2 seconds. A bundle of dynamite with a lit fuse thrown through the air: a continuous bright sizzling and spitting fuse, a soft whirring as the bundle tumbles for the first 0.8 seconds, a dull earthy thud where it first lands at 0.6 seconds, a smaller bounce at 0.8 seconds, and small ticks that speed up (three slow, then five very fast) building tension. Cut off on the last tick, no tail. Dry, no reverb, no music, no voices, peak -3 dBFS.
```

Impact clip, 1.5 s (0.8 s of action and 0.7 s of natural fade):
```
Sound effect, 1.5 seconds. A big dynamite explosion. The first sample is a violent full-spectrum crack together with a deep sub-bass boom (30 to 90 Hz); a roar of flame for about 0.8 seconds; a pressure-wave whoomp; flying fragments whizzing and clacking from 0.05 to 0.5 seconds; and a soft smoky hiss that fades out. Dry, no reverb, no music, no voices, peak -1 dBFS.
```

## 12. bolt

**Visual beats**
- 0.00 to 0.25 (0 to 0.325 s): an arcane orb charges at the attacker, growing from 0.15 to 0.55
  radii, with 6 sparks spiralling in (`charge = 0.25 D`, not a fraction of L).
- 0.25 to 0.60 (0.325 to 0.78 s): the bolt flies, a jagged lightning line from the attacker to its
  head, redrawn and flipped every frame, with 3 ghost orbs behind it; it accelerates.
- **0.60 (0.78 s): landing.** Full impact, big 1.5: flash, disc, 2 rings, 44 sparks, 7.8 px shake;
  7 lightning forks radiate out over the impact and fade (`1 - k`).
- Count n > 1: bolt i leaves at `0.325 + i * min(0.04 D, 0.6 (L - 0.325)/(n-1))`; all land at 0.78.

**Sound cues**
- Launch: a charge hum that rises to the release at 0.25.
- Travel: a continuous electric crackle and buzz.
- Impact: a zap-crack with a thump on 0.60, then the forks sizzle.

**Character:** a spell winding up and snapping out.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| charge hum | saw vib 30/15 | 0 (0) | 0.33 | R | 120→360 | lp 1200 | 0.18 | 0.15 | |
| flight crackle | white | 0.25 (0.325) | 0.46 | 0.003 H | 2500 | hp Q0.8 | 0.22 | 0.10 | |
| flight buzz | sq vib 45/60 | 0.25 (0.325) | 0.45 | 0.05 H | 220→440 | lp 2500 | 0.09 | 0.10 | |
| impact zap | white | 0.60 (0.78) | 0.25 | 0.002 | 4500→1200 | bp Q1 | 0.65 | 0.30 | |
| impact thump | sine | 0.60 (0.78) | 0.30 | 0.003 | 160→55 | | 0.60 | 0.10 | |
| fork sizzle | pink | 0.60 (0.78) | 0.10 | 0.002 | 3000 | hp Q1 | 0.10 | 0.20 | x7 @0.02 |

## 13. chain (showpiece)

**Visual beats**
- 0.00 to 0.30 (0 to 0.45 s): a lightning line extends from the attacker to the target
  (`prog = age / 0.45`, linear), redrawn jagged each frame, a glow orb at its tip.
- **0.30 (0.45 s): the bolt reaches the target.** Full impact, big 1.2: flash, disc, 1 ring, 40
  star sparks, 6.1 px shake; a glow and 4 sparks at the node.
- The jumps: the nodes are the target plus `n` random points about 2.5 to 5.6 token radii around it.
  `step = max(0.05, (0.85 D - L) / n)` = 0.206 s (0.1375 D); jump i starts at `L + (i-1) * step` and
  takes `0.6 * step` = 0.124 s to travel.

  | Jump | Starts | Arrives |
  |---|---|---|
  | 1 | 0.30 (0.45 s) | **0.3825 (0.574 s)** |
  | 2 | 0.4375 (0.656 s) | **0.520 (0.780 s)** |
  | 3 | 0.575 (0.8625 s) | **0.6575 (0.986 s)** |
  | 4 | 0.7125 (1.069 s) | **0.795 (1.1925 s)** |

- Every arrival throws 4 sparks, flashes a glow and pulses a ring for 0.3 s. Each bolt segment
  stays lit for its travel time plus a linger of `0.6 * step + trail * 0.3 * D` = 0.349 s, then
  fades; the last bolt is still faintly lit (alpha about 0.12) when the animation ends at 1.5 s.
- n = 12 gives step 0.069 s; the jumps then run nearly as one burst.

**Sound cues**
- Launch and travel: a buzzing arc that grows louder and higher as the line extends to 0.30.
- Landing: a loud electric crack with thump and a sub at 0.30.
- Each jump: a short zip as it leaves, a whip-crack and zap as it arrives (0.3825, 0.52, 0.6575,
  0.795), getting no louder than the first.
- Tail: a thin lingering hum through the reverb.

**Character:** a storm in a small room: crack, then four ricochets.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| arc buzz | saw vib 60/40 | 0 (0) | 0.45 | R | 150→520 | lp 3000 | 0.20 | 0.20 | |
| arc crackle | white | 0 (0) | 0.45 | 0.10 H | 2500 | hp Q0.8 | 0.20 | 0.10 | |
| landing crack | white | 0.30 (0.45) | 0.30 | 0.001 | 5000→1000 | bp Q0.8 | 0.80 | 0.35 | |
| landing thump | sine | 0.30 (0.45) | 0.45 | 0.003 | 140→50 | | 0.65 | 0.20 | |
| landing sub | sine | 0.30 (0.45) | 0.70 | 0.01 | 62→38 | | 0.50 | 0.10 | |
| jump zip | white | 0.30 (0.45) | 0.12 | 0.01 | 2000→6000 | bp Q2 | 0.25 | 0.10 | xcount @0.20625 |
| arrival crack | white | 0.3825 (0.574) | 0.14 | 0.001 | 4200→1200 | bp Q1.2 | 0.50 | 0.30 | xcount @0.20625 |
| arrival zap | tri | 0.3825 (0.574) | 0.10 | 0.001 | 1800→500 | | 0.25 | 0.20 | xcount @0.20625 |
| lingering hum | tri vib 50/8 | 0.30 (0.45) | 1.00 | 0.10 H | 100→90 | | 0.07 | 0.40 | |

The repeat spacing is `step`; recompute it as `max(0.05, (0.85 D - L) / n)` for a different D or
count. If the engine can fade gain per repeat, use 0.9 per step.

**AI sound-effect prompts**

Launch clip, 0.45 s:
```
Sound effect, 0.45 seconds. A thick electric arc being struck: a buzzing, snapping lightning discharge that grows louder and higher in pitch for the whole clip, crackling. No tail: cut off at the loudest point. Dry, no reverb, no music, no voices, peak -3 dBFS.
```

Impact clip, 1.5 s:
```
Sound effect, 1.5 seconds. Chain lightning. The first sample is a loud electric crack with a deep thump, then four sharp electric zaps (short whip-cracks with a fizz that dies away) at about 0.12, 0.33, 0.54 and 0.74 seconds, and a quiet humming crackle at the end. Dry, no reverb, no music, no voices, peak -1 dBFS.
```

## 14. beam

**Visual beats**
- **0.00 (0 s): no wind-up.** The beam shoots out at once: `reach = easeOut(e / L)`, so it is at
  49 % after 0.07 s, 88 % after 0.175 s, and full at 0.25 D (0.35 s). A glow orb sits on the
  attacker; a sparkling helix winds along the beam; the width flickers (`sin(55 e)`, 8.75 Hz).
- 0.25 (0.35 s): landing. The beam end reaches the target: light impact (flash, 2 rings, 40
  sparks, 4.8 px shake); a glow and sparks keep coming from the end.
- 0.25 to 0.70 (0.35 to 0.98 s): the beam holds at full width (`holdEnd = 0.4 + 0.45 * trail` =
  0.7015 D).
- 0.70 to 1.00 (0.98 to 1.4 s): the beam thins away linearly.
- Count n > 1: beams fan out, all at the same time, narrower each.

**Sound cues**
- Launch: an instant zap with a falling sweep.
- Hold: a steady, flickering hum from 0 to 0.70, with a shimmer; a sizzle and a small thump at
  the target from 0.25.
- Tail: the hum winds down in pitch from 0.70 to 1.0.

**Character:** a sustained sci-fi laser: no build-up, a long steady beam, a wind-down.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| fire zap | saw | 0 (0) | 0.18 | 0.002 | 2400→300 | lp 3500 | 0.40 | 0.20 | |
| beam hum | saw vib 8.75/6 | 0 (0) | 0.98 | 0.04 H | 220→230 | lp 1600 | 0.20 | 0.20 | |
| beam shimmer | sine vib 8.75/40 | 0 (0) | 0.98 | 0.05 H | 1100→1500 | | 0.07 | 0.30 | |
| target sizzle | white | 0.25 (0.35) | 0.63 | 0.03 H | 3500→2500 | bp Q1.5 | 0.16 | 0.10 | |
| target thump | sine | 0.25 (0.35) | 0.12 | 0.003 | 200→100 | | 0.30 | 0 | |
| wind-down | saw | 0.70 (0.98) | 0.45 | 0.01 | 230→80 | lp 1000 | 0.18 | 0.45 | |

For n beams multiply the hum and shimmer gain by `1 + 0.15 * (n - 1)`, max 1.6.

## 15. frost

**Visual beats**
- 0.00 to 0.45 (0 to 0.63 s): an icy orb flies a gentle arc (arc 0.3), accelerating, trailing a
  glow, 4 orbiting dots and sparks.
- **0.45 (0.63 s): landing.** Light impact (flash, 2 rings, 50 sparks, 7.3 px shake). A frost
  disc spreads and `count` (7) ice spikes burst out of the ground all at once
  (`grow = easeOut(k * 4)`: most growth in the first 60 ms, finished by 0.5875 D = 0.8225 s). Six
  frost rays turn.
- 0.59 to 0.835 (0.82 to 1.169 s): the spikes stand.
- **0.835 (1.169 s): shatter.** On the first frame after k = 0.7 each spike throws 3 shard sparks
  (21 in all); the spikes shrink 40 % and fade until the end (1.4 s).

**Sound cues**
- Launch and travel: an icy hiss with a faint chime.
- Impact: a freeze crack and a short crunch per spike at 0.45; a glassy ring rings out.
- Shatter: a glass burst on 0.835 followed by a spray of tinkles, one per spike.

**Character:** cold and brittle: crunch on landing, glass on the way out.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| orb whoosh | white | 0 (0) | 0.60 | R | 2500→5500 | bp Q2.5 | 0.18 | 0.20 | |
| freeze thump | sine | 0.45 (0.63) | 0.15 | 0.003 | 180→80 | | 0.40 | 0.05 | |
| spike crunch | pink | 0.45 (0.63) | 0.07 | 0.001 | 3500→2500 | bp Q3 | 0.25 | 0.10 | xcount @0.012 |
| glass ring | tri vib 5/10 | 0.45 (0.63) | 0.70 | 0.002 | 2637→2600 | | 0.10 | 0.60 | |
| shatter burst | white | 0.835 (1.169) | 0.30 | 0.001 | 3000 | hp Q0.7 | 0.50 | 0.45 | |
| shard tinkle | sine | 0.84 (1.176) | 0.08 | 0.001 | 4000→3000 | | 0.08 | 0.50 | xcount @0.02 |

## 16. poison

**Visual beats** (painted version; the vector fallback has the same landing and ends)
- 0.00 to 0.55 (0 to 0.88 s): a poison bottle is lobbed on a high arc (`arc * min(0.5 dist,
  10 r)`), turning about 300 degrees clockwise, wobbling. It sheds 14 drips (each falls for 0.4 s)
  and 5 glowing bubbles, at flight positions 0.2, 0.35, 0.5, 0.65, 0.8 (0.176, 0.308, 0.44, 0.572,
  0.704 s, each living 0.176 s), and a ribbon of vapour.
- **0.55 (0.88 s): the bottle shatters.** Light impact (flash, 1 ring, 40 sparks, 2.6 px shake). A
  white flash, 5 to 8 glass shards and a radial splash with 8 to 12 flung drops last the first
  third of the impact (to about 1.12 s). The puddle spreads over 0.25 s.
- 0.60 to 0.78 (0.96 to 1.247 s): a toxic cloud blooms, then thins out to 1.0.
- 0.649 to 0.829 (1.04 to 1.33 s) and 0.739 to 0.937 (1.18 to 1.50 s): two skulls take shape in
  the vapour and dissolve.
- About 0.775 to 0.98 (1.24 to 1.57 s): bubbles rise from the puddle and burst. The number of
  bubbles is `clamp(n, 4, 7)`; bubble i bursts at `0.50 + 0.09 i` of the impact (plus up to 0.05
  jitter in the code), i.e. 1.24 s, 1.305, 1.37, 1.434, 1.50, 1.564 s (0.775, 0.816, 0.856,
  0.896, 0.937, 0.978 D). The last of 7 usually does not burst before the end.
- Four drops fall from the cloud and fade at about 1.23, 1.32, 1.41, 1.51 s.

**Sound cues**
- Launch: a lobbed whoosh; liquid sloshing as the bubbles trail it.
- Impact: glass break and splash on 0.55.
- Cloud: a hiss that builds as it blooms.
- Tail: wet bubble pops spaced about 0.065 s, an optional whisper per skull, optional drips.

**Character:** wet, glassy, then sickly: a bottle smash that turns into a seething cloud.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| toss whoosh | pink | 0 (0) | 0.30 | 0.08 | 400→900 | bp Q1.2 | 0.20 | 0.10 | |
| slosh bloops | sine | 0.11 (0.176) | 0.09 | 0.01 | 350→700 | | 0.10 | 0.15 | x5 @0.132 |
| glass shatter | white | 0.55 (0.88) | 0.30 | 0.001 | 3500 | hp Q0.7 | 0.55 | 0.30 | |
| venom splash | pink | 0.55 (0.88) | 0.30 | 0.01 | 2500→500 | lp Q0.8 | 0.45 | 0.20 | |
| acid hiss | white | 0.60 (0.96) | 0.60 | 0.15 H | 6000 | bp Q0.8 | 0.12 | 0.30 | |
| bubble pops | sine | 0.775 (1.24) | 0.04 | 0.001 | 700→1400 | | 0.14 | 0.15 | x(clamp(count,4,7) - 1) @0.065 |
| skull whisper (optional) | saw vib 5/6 | 0.65 (1.04) | 0.30 | 0.15 | 160→220 | lp 700 | 0.06 | 0.70 | x2 @0.14 |
| cloud drips (optional) | sine | 0.77 (1.23) | 0.05 | 0.001 | 1100→500 | | 0.07 | 0.15 | x4 @0.094 |

## 17. smite (showpiece)

**Visual beats**
- 0.00 to 0.186 (0 to 0.465 s): a holy circle (sigil) draws itself out on the ground under the
  target, growing from 35 % to 100 % (`easeOut(u / 0.3)`) and turning, with motes of light rising
  off its ring. A glow forms at the caster and grows to the strike.
- 0.186 to 0.341 (0.465 to 0.853 s): the circle holds and brightens, turning faster
  (angle grows as `u + u^2`).
- 0.341 to 0.62 (0.853 to 1.55 s): a thin shaft of light gathers above the target, widening from
  0.35 to 0.85 radii and brightening to 0.7 alpha, flickering.
- **0.62 (1.55 s): the pillar of light crashes down** at full height (18 radii) and about 3 radii
  wide. Light impact (flash, 3 rings, 50 sparks, 9.5 px shake). The circle flares outward and
  fades.
- 0.62 to 0.894 (1.55 to 2.235 s): the pillar lingers and thins (`f = 1 - k / (0.3 + 0.7 * trail)`),
  with motes of light rising from its foot.
- 0.894 to 1.00: only the fading circle and the last sparks remain.
- Count n > 1: n pillars side by side, all at the same time.

**Sound cues**
- Launch (the casting): a choir comes in at once on an E major chord, "oh" opening to "ah", a
  soprano joining above it at 0.06, and sings while the circle draws and the light gathers. It holds
  to 0.1 s before the strike and dies away under the thunder: no choir in the strike itself.
  Shimmering high air.
- Gather (0.341): a riser sweeping up for 0.7 s, ending exactly on 0.62.
- Impact: the pillar breaks the ground at 0.62, deep: a crunch of stone (0.6 speed) and a blast
  (0.5 speed), the ground booming two and a half octaves down (thunder at 0.4 speed), a heavy thump,
  the sub and a dark brown-noise rumble. The crack of the light and the bell sit low under it. A
  warm sawtooth body while the pillar lingers.
- Tail: the earth rolling (rolling thunder held from 0.62, swelling to its peak 0.7 s later), big
  rubble falling back (0.63, then three smaller falls from 0.66), the gong an octave down.

**Character:** reverent and enormous: a choir singing the spell, then the light breaking the ground
open, deep.

The default duration was 2.0 s until the casting choir went in; it is 2.5 s so the casting lasts
longer before the strike (1.55 s instead of 1.24 s). Every Start below is a share of the duration,
so the picture and the sound moved together.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| casting choir | choir x5 | 0 (0) | 1.80 | 0.12 H | E3 B3 E4 G#4 B4 | vowel oh→ah | 0.40 | 0.40 | |
| casting soprano | choir | 0.06 (0.15) | 1.65 | 0.30 H | E5 | vowel oh→ah | 0.28 | 0.40 | |
| pad root | tri vib 5.5/2 | 0 (0) | 1.80 | 0.15 H | 165 | | 0.14 | 0.70 | |
| pad fifth | tri vib 5.5/3 | 0 (0) | 1.80 | 0.15 H | 247 | | 0.10 | 0.70 | |
| pad octave | sine vib 6/4 | 0 (0) | 1.80 | 0.20 H | 330 | | 0.08 | 0.70 | |
| holy shimmer | white | 0.05 (0.125) | 1.50 | 0.90 H | 7000→9000 | bp Q6 | 0.05 | 0.60 | |
| gather riser (tone) | saw vib 12/40 | 0.341 (0.853) | 0.70 | R | 160→1400 | lp 2500 | 0.12 | 0.30 | |
| gather riser (air) | pink | 0.341 (0.853) | 0.70 | R | 500→6000 | bp Q1.5 | 0.18 | 0.30 | |
| strike sub | sine | 0.62 (1.55) | 1.40 | 0.006 | 58→36 | | 0.80 | 0.30 | |
| strike crack | white | 0.62 (1.55) | 0.35 | 0.002 | 4000→900 | bp Q0.9 | 0.70 | 0.40 | |
| ground smash | hammer-concrete x0.6 | 0.62 (1.55) | clip | | | lp 2500 | 1.00 | 0.20 | |
| ground blast | blast x0.5 | 0.62 (1.55) | clip | | | | 0.80 | 0.20 | |
| ground boom | thunder-crack x0.4 | 0.62 (1.55) | clip | | | lp 1000 | 1.00 | 0.30 | |
| ground thump | sine | 0.62 (1.55) | 0.60 | 0.004 | 90→30 | | 0.95 | 0.20 | |
| ground body | tri | 0.62 (1.55) | 0.45 | 0.004 | 130→55 | | 0.55 | 0.15 | |
| ground rumble | brown | 0.62 (1.55) | 1.20 | 0.01 | 1800→100 | lp Q0.8 | 0.45 | 0.35 | |
| earth rolling | thunder-roll x0.55 | 0.62 (1.55) | 2.00 | 0.05 H | | lp 900 | 0.55 | 0.10 | |
| rubble | stones-fall x0.75 | 0.63 (1.575) | clip | | | | 0.90 | 0.10 | |
| rubble, small | stones-fall-2 x0.8 | 0.66 (1.65) | clip | | | | 0.60 | 0.10 | x3 @0.12 |

In the recorded version the light's own thunder crack plays at 0.8 speed under lp 3000 at 0.3, the
church bell at 0.25 and the gong at 0.5 speed (an octave down) at 0.4, all under the ground break;
the synth triangle above replaces the 150→70 one.
| bell low | sine | 0.62 (1.55) | 1.60 | 0.002 | 784 | | 0.20 | 0.80 | |
| bell high | sine | 0.62 (1.55) | 1.40 | 0.002 | 1175 | | 0.14 | 0.80 | |
| pillar body | saw vib 40/6 | 0.62 (1.55) | 0.69 | 0.02 H | 110 | lp 700 | 0.20 | 0.40 | |

The pads are the casting choir's chest and end with it. The choir and pads hold to 0.8 of their 1.8 s
(1.44 s, 0.11 s before the strike), then fade out exponentially, about 24 dB down by the strike; the
thunder covers the rest. A `choir` voice is
two sawtooth singers per note, a few cents apart, each with its own vibrato (about 10 cents), one
through the vowel's first formant (oh 560 Hz opening to ah 740 Hz, Q4) and one at 0.55 the gain
through its second (950 opening to 1150 Hz, Q6); the choir sends 0.5 to 0.6 to the hall. Add a mid-bass layer
(`tri 150→70`, Gain 0.5, Dur 0.4) at 0.62 if the sub is not audible on small speakers.

**AI sound-effect prompts**

Launch clip, 1.55 s:
```
Sound effect, 1.55 seconds. A divine summoning: a holy choir comes in at once on a held major chord, "oh" opening to "ah" (no words), with soft high chimes and airy sparkle, followed in the last 0.7 seconds by a rising sweep of rushing light. No tail: cut off at the peak. Dry, no reverb, no instruments, peak -3 dBFS.
```

Impact clip, 2.5 s (0.95 s of action and a long natural fade):
```
Sound effect, 2.5 seconds. A pillar of holy light striking the ground. The first sample is a thunderous crack with a deep sub-bass boom, immediately joined by a radiant chord of bells and a warm glowing tone that holds for about half a second, sparkling shimmer, then a long gentle fade. Dry, no reverb, no music, no voices, peak -1 dBFS.
```

## 18. sonic

**Visual beats**
- 0.00 (0 s): 4 arcs (count) spread from the attacker as a cone; arc i leaves at
  `i * gap`, `gap = (0.04 + trail * 0.07) * D` = 0.09 s. A ring pulses at the attacker (3.2 Hz) and
  fades by L.
- Each arc expands linearly to the target (`R = R0 + (dist - R0) * t / L`): they reach it at
  **0.45 (0.54 s), 0.525 (0.63 s), 0.60 (0.72 s), 0.675 (0.81 s)**. The arcs go on past the target
  until they are 3 radii beyond it, then vanish.
- 0.45 (0.54 s): the landing flash is for the first arc. Full impact, big 1.3: flash, disc, 2 rings,
  24 sparks, **12.8 px shake**. The other three arrive without a flash.

**Sound cues**
- Launch: four low pulses 0.09 s apart.
- Travel: a rising pressure sweep.
- Impact: four thumps on 0.54, 0.63, 0.72, 0.81 s.
- Tail: a short resonance.

**Character:** a bass-drum cannon that you feel in your chest: wub-wub-wub-wub, then thud-thud-thud-thud.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| launch pulse | sine | 0 (0) | 0.16 | 0.005 | 180→70 | | 0.40 | 0.10 | xcount @0.09 |
| pressure sweep | pink | 0 (0) | 0.50 | 0.20 | 200→1400 | bp Q2 | 0.20 | 0.15 | |
| impact thump | sine | 0.45 (0.54) | 0.30 | 0.004 | 120→45 | | 0.80 | 0.15 | xcount @0.09 |
| impact whump | brown | 0.45 (0.54) | 0.30 | 0.01 | 1200→150 | lp Q0.8 | 0.50 | 0.35 | xcount @0.09 |
| ring resonance | tri vib 18/20 | 0.45 (0.54) | 0.70 | 0.02 | 560→520 | | 0.08 | 0.50 | |

If the engine can fade gain per repeat, use 0.85 per step (the arcs' alpha falls
`1 - 0.5 * i / n`).

## 19. tornado (showpiece)

**Visual beats**
- 0.00 to 0.11 (0 to 0.187 s): the funnel and the dust swirl round its foot fade in at the
  attacker.
- 0.00 to 0.55 (0 to 0.935 s): the funnel travels to the target (path `easeIn * 0.5 + linear * 0.5`)
  with a sway (`arc * 1.2` radii). It spins at `3 + spin * 25 = 23` rad/s (3.7 turns a second).
  Rubble chunks (`6 + 3n` = 15) are dragged in along the ground, lifted round the funnel over a
  0.9 s lap, tumbling, and thrown off near the top.
- **0.55 (0.935 s): it reaches the target.** Light impact (flash, 1 ring, 40 sparks, big 1.6,
  12.1 px shake). Every chunk it holds is flung outward (5 radii a second) and falls under gravity.
- 0.55 to 1.00 (0.935 to 1.7 s): the funnel unwinds on the spot: size falls to 15 %
  (`1 - 0.85 * easeIn(k)`), opacity `1 - k^2`; the dust swirl fades; debris falls and fades.

**Sound cues**
- Launch and travel: a rotating howl rising in pitch and volume, with a 3.7 Hz whirl in it, a
  low rumble underneath, and debris rattling inside it.
- Arrival (0.55): a gust-thump as the debris is thrown.
- Tail: the howl drops in pitch as the funnel unwinds; debris clatters down; fade.

**Character:** a big rotating wind with grit in it: a whirl that peaks on arrival, then runs out of breath.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| howl (rising) | pink | 0 (0) | 0.935 | R | 350→900 | bp Q5 | 0.35 | 0.30 | |
| howl (falling) | pink | 0.55 (0.935) | 0.90 | 0.05 | 900→250 | bp Q4 | 0.30 | 0.40 | |
| whirl (rising) | saw vib 3.7/25 | 0 (0) | 0.935 | R | 110→160 | lp 600 | 0.18 | 0.20 | |
| whirl (falling) | saw vib 3.7/25 | 0.55 (0.935) | 0.80 | 0.02 | 160→70 | lp 600 | 0.16 | 0.30 | |
| rumble | brown | 0 (0) | 1.70 | 0.60 H | 220 | lp Q0.7 | 0.40 | 0.30 | |
| debris rattle | white | 0.06 (0.10) | 0.04 | 0.001 | 2500 | bp Q2 | 0.07 | 0.15 | x15 @0.055 |
| arrival thump | sine | 0.55 (0.935) | 0.45 | 0.004 | 90→45 | | 0.65 | 0.15 | |
| arrival gust | brown | 0.55 (0.935) | 0.50 | 0.005 | 2500→200 | lp Q0.8 | 0.55 | 0.35 | |
| debris clatter | white | 0.60 (1.02) | 0.05 | 0.001 | 3000→1500 | bp Q2 | 0.12 | 0.15 | x12 @0.045 |

The whirl's vibrato rate is the spin: `(3 + spin * 25) / 2pi` Hz. The rattle count is
`6 + 3n`; the clatter count is the same.

**AI sound-effect prompts**

Launch clip, 0.94 s:
```
Sound effect, 0.94 seconds. A small tornado moving across the ground: a howling rotating wind that rises steadily in volume and pitch with a slow whirling wobble (about three and a half turns per second), a deep rumble underneath, and small bits of debris rattling inside it. No tail: cut off at the peak. Dry, no reverb, no music, no voices, peak -3 dBFS.
```

Impact clip, 1.6 s:
```
Sound effect, 1.6 seconds. A tornado arriving and unwinding. The first sample is a sudden gust with a low thump as debris is thrown out; then the howling wind drops in pitch over about 0.8 seconds as the whirl slows, with chunks of debris clattering and pattering down, fading to a light breeze. Dry, no reverb, no music, no voices, peak -2 dBFS.
```

## 20. nuke (showpiece)

The nuke is drawn by `playNuke`, not `playStrike`: `blastAt = D * 0.46` = 2.99 s, `blastLen` = 3.51 s,
at its default duration of 6.5 s. Here "t" in the code is `(elapsed - 2.99) / 3.51`; the table
converts it. Until the air-raid siren replaced the bomb's whistle the nuke lasted 4 s and blasted
at 0.22 of it (0.88 s); ADR 0047 raised the duration cap from 4 to 8 s so the siren has about 3 s.

**Visual beats**
- 0.00 to 0.46 (0 to 2.99 s): a thin orange ring closes round the target (2.5 to 1.5 bomb units)
  and the screen slowly darkens (dark red shade, 0 to 0.22 alpha) while the siren winds up.
- 0.325 to 0.46 (2.11 to 2.99 s): the bomb falls from above the screen to the target
  (`NUKE_FALL_SHARE` 0.135 of the run, 0.88 s, as fast as before the siren; `y = lerp(top, target,
  fall^2)`, so it accelerates), swaying slightly.
- **0.46 (2.99 s): `onImpact` fires.** White flash at 0.855 alpha, fading as `(1 - t/0.24 s)^2`
  to zero at 3.23 s. A starburst flare fades by 3.49 s. Up to 64 embers burst out. The screen
  darkens to 0.58 and then lightens to 0.12 by the end. The whole page shakes from 2.99 to 5.69 s
  (0.77 of the blast; strongest first, quadratic ease-out, 19.8 px).
- 0.46 to 0.484 (2.99 to 3.148 s): the cloud and fireball fade in.
- 0.46 to 0.557 (2.99 to 3.622 s): the fireball grows to full size (1.4 times the smaller screen side
  across); it fades from 0.536 (3.481 s) to 0.671 (4.359 s).
- Three shockwave rings race to the screen edge: ring 0 0.46 to 0.811 (2.99 to 5.272 s), ring 1
  0.487 to 0.838 (3.166 to 5.447 s), ring 2 0.514 to 0.865 (3.341 to 5.623 s). A blast wave of dust
  and air runs 0.46 to 0.73 (2.99 to 4.745 s) with an echo 0.514 to 0.784 (3.341 to 5.096 s).
- 0.46 to 0.811 (2.99 to 5.272 s): the mushroom cloud rises (`easeOut(t / 0.65)`); the skirt of dust
  spreads until about 4.39 s; the dust ring expands until 0.762 (4.956 s) and fades from 0.719
  (4.675 s) to the end.
- 0.811 to 0.881 (5.272 to 5.728 s): the cloud hangs at full strength; **0.881 to 1.00 (5.728 to
  6.5 s): it fades out.**
- 1.00 (6.5 s): the run ends. Reduced motion: an immediate `onImpact` and a still ring for 0.8 s.

**Sound cues**
- Fall (0 to 2.99): a dual-tone air-raid siren winds up, climbing fast and then settling on its
  top pair (574 and 689 Hz) about 2 s in, growing louder as it climbs; a low drone climbs
  underneath. The siren holds until the blast and is swallowed by it; the drone ends about 20 ms
  before it, a tiny gap of tension.
- Blast (2.99): a crack, a mid thump and a very deep boom together; a big body of noise.
- Flash (2.99 to 3.23): the ears ring (a faint high tone) from about 3.15 s.
- Rings 1 and 2: two quieter booms like echoes (3.15, 3.30).
- Rise (2.99 to 5.3): a low rumble that slowly sinks; a fire roar from 3.31 s while the fireball
  fades.
- Tail (3.9 to 6.5): falling debris from 3.91 s, wind from 4.31 s, and the reverb. Let the reverb
  tail ring past 6.5.

**Character:** dread, then a wall: the loudest, lowest, longest sound in the game.

**Recipe**

| Layer | Src | Start | Dur | Att | Hz | Filter | Gain | Wet | Repeat |
|---|---|---|---|---|---|---|---|---|---|
| siren | siren (2 saw, x1 and x1.2, vib 10/1.2, glide 0.7 s) | 0 (0) | 3.70 | 1.20 H | 140→574 | lp 900 | 0.28 | 0.25 | |
| dread drone | saw | 0 (0) | 2.99 | R | 55→110 | lp 200 | 0.20 | 0.10 | |
| blast crack | white | 0.46 (2.99) | 0.45 | 0.002 | 12000→300 | lp Q0.7 | 0.70 | 0.25 | |
| sub boom | sine | 0.46 (2.99) | 2.60 | 0.005 | 80→24 | | 0.80 | 0.20 | |
| mid thump | tri | 0.46 (2.99) | 1.60 | 0.005 | 140→50 | | 0.50 | 0.20 | |
| blast body | brown | 0.46 (2.99) | 2.20 | 0.01 | 4000→120 | lp Q0.8 | 0.60 | 0.45 | |
| echo booms | brown | 0.485 (3.15) | 0.90 | 0.01 | 600→80 | lp Q0.8 | 0.40 | 0.60 | x2 @0.15 |
| rumble | brown | 0.509 (3.31) | 2.20 | 0.30 | 260→70 | lp Q0.7 | 0.45 | 0.40 | |
| fire roar | pink | 0.509 (3.31) | 1.40 | 0.30 H | 1800→400 | lp Q0.7 | 0.30 | 0.30 | |
| ear ring | sine | 0.485 (3.15) | 1.80 | 0.05 | 7200 | | 0.04 | 0 | |
| ember crackle | white | 0.602 (3.91) | 0.03 | 0.001 | 3500 | hp Q1 | 0.08 | 0.30 | x24 @0.07 |
| smoke tail | pink | 0.694 (4.51) | 2.00 | 0.80 | 900→200 | lp Q0.7 | 0.20 | 0.60 | |

Notes: the siren is synthesized, modelled on a recording of a dual-tone air-raid siren ("Nuclear
Alarm Siren", Prestigigator, 2012) that was measured, never copied: it winds up from about 136 Hz
over some 4 s, holds two even tones at 574 and 689 Hz (6:5, a minor third) with their second
harmonics about 15 dB down and their third about 22 dB down (98 % of the energy between 500 and
1500 Hz) and a faint 10 Hz flutter, then wails down about 8 semitones and back every 10.5 s. The
3 s before the blast holds the wind-up and the top, not the wail. Each tone is a sawtooth through a
900 Hz lowpass (the second at 0.9 the gain), with a 10 Hz, 1.2 Hz vibrato, and its pitch glides to
the top with a 0.7 s time constant (`glide`, `setTargetAtTime`), fast and then settling, as a rotor
spins up; the reference's 1.3 s is compressed to fit. It sends 0.5 to the hall, holds to 0.8 of its
length (2.96 s) and fades out exponentially under the blast. The recipe places every blast-phase layer with `afterBlast(s)`,
`s` seconds after `NUKE_DROP_SHARE`, so they follow the drop if it changes again.
The "sub boom" at 24 Hz is felt more than heard, so the 140 Hz "mid thump" carries the
weight on laptop speakers. Gains here are before the master compressor, which will pull the
impact down; do not lower them to avoid clipping. Duck other sound effects and music by about
6 dB for 1.5 s from 2.99 s. Keep the "ear ring" at or below Gain 0.04: it is a deliberate
detail, but a sustained high tone is irritating.

**AI sound-effect prompts**

Launch clip, 3 s:
```
Sound effect, 3 seconds. A civil-defence air-raid siren winding up: a mechanical dual-tone siren (two tones a minor third apart) climbing fast in pitch and then settling on its top note, growing louder as it climbs, with a low rising rumble underneath. No tail, no impact: cut off at the loudest point. Dry, no reverb, no music, no voices, peak -3 dBFS.
```

Impact clip, 4.5 s (3.5 s of action and 1 s of natural fade):
```
Sound effect, 4.5 seconds. A massive nuclear detonation. The first sample is a violent full-spectrum crack, followed within 50 milliseconds by a deep sub-bass boom (30 to 80 Hz) that decays over about 2.5 seconds; a rolling roar of fire and rushing air; two quieter booming echoes about 0.15 seconds apart starting 0.15 seconds after the blast; a low rumble that slowly sinks while a faint high ringing tone hovers; and sparse fire crackles and falling debris at the end. Dry, no music, no voices, peak -1 dBFS.
```

---

# Dice throws

Dice thrown on the board, and private rolls thrown in the Dice panel's tray (and the home page's
demo), clack as they land. The dice are keyframed, not simulated (`throwKeyframes` in
`apps/web/src/ui/diceGeometry.ts`), so every die strikes the surface at the same fractions of
`THROW_MS` (1150 ms): `THROW_CONTACTS`, the drop at 0.34 and the bounces landing at 0.58, 0.74 and
0.84, each die `throwStagger(n)` ms after the one before, then a slide to rest from 0.84 to 1.0.
`scheduleDice` (`apps/web/src/board/fxSound.ts`) reads the same constants, so the sound cannot
drift from the picture.

**Per die:** a recorded clack (one of four, at random) on the drop and the first bounce, a recorded
tap (one of three) on the two small bounces, a tap 6 to 14 ms after the drop for its edge landing
before its face, a tap 20 to 60 ms after it for dice knocking together (two or more dice), and the
recorded roll as it slides to rest. Each strike's gain is the square root of the height it fell
from (1, 0.3, 0.1, 0.03 of the drop). Each die plays 0.74 to 0.88 of normal speed (three to five
semitones down: heavy dice on a solid table) and sits up to 0.4 left or right. Under the drop and
the first bounce a synthesized table thump (sine 140→85 Hz, 70 ms, and brown noise through a
700→250 Hz lowpass) adds weight.

**Per throw:** the rattle of dice leaving a hand at the start, and, for three or more dice, a
recorded clatter of four landing together under the first contact; both at 0.85 speed. A handful
is louder than one die by `n^0.75`, not `n`. At most 10 dice are voiced, and at most 4 throws
sound at once, apart from the attack sounds' allowance.

**Stand-in:** until the recordings load, each strike is synthesized instead (a click, the die
ringing near 3.3 and 5 kHz, a knock and a thump); each stand-in layer is skipped once
`dice-clack-1` has loaded.

**Reduced animations** (the dice drawn at rest): one soft clack for up to three dice, 40 ms apart.

Measured, offline: one die's spectral centroid 548 Hz with 58% of its energy under 300 Hz (1,714 Hz
and 13% before the pitch-down and thump); four dice 714 Hz and 55%. The first strike lands within
0.1 ms of its contact.

## The held die

While the Dice panel's die is held under the pointer (`DiceThrowHandle`), the dice rattle in the
hand (`startDiceShake` in `apps/web/src/board/fxSound.ts`). Every pointer sample is fed in, not
once a frame, and `createShakeTracker` turns the motion into rattles:

- **A turn** (the pointer reverses against the last direction it was really moving, faster than
  0.5 px/ms either side, a pause between strokes included): the dice hit the hand. Strength
  0.35 + 0.3 × (speed before + speed after), up to 1.
- **Travel**: every 90 px dragged at more than 0.25 px/ms, the dice roll in the hand. Strength
  0.35 × speed, 0.12 to 0.5.
- **Held still**: a faint jiggle (strength 0.12) every 0.7 to 1.3 s.
- Never two rattles within 45 ms.

Each rattle is a slice, at a random place, of one of two stretches of unbroken shaking from Four
dice in hand (BigSoundBank #0583), 80 ms long plus 70 ms for a full-strength shake, at 0.81 to 0.89
speed (the deeper dice), at half gain, placed left or right with the die on the page. Until the
clips load, two or three synthesized clicks stand in. The rattle fades out over 50 ms the moment the
hold ends: release (the throw's own sound takes over), Escape, a lost pointer, a context menu or the
window losing focus.

Measured with the real AudioContext: 600 ms of shaking (1.5 px/ms, turning every 120 ms) gave 8
rattles 50 to 70 ms apart, each scheduled 2 to 5 ms ahead; 1.6 s held still gave one jiggle; nothing
sounded after the release.
