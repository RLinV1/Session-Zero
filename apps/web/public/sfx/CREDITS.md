# Sound effect clips

Short recorded clips for the board's attack and nuke animations, for dice thrown on the board and
in the Dice panel, and for the die held under the pointer before it is thrown. `src/board/fxSound.ts` plays them,
layered over synthesized tone and noise, from the recipes and themes in `src/board/fxSoundRecipes.ts`
(cue sheet: `docs/SOUND-PLAN.md`). Every clip is cut from a real recording released under CC0
(public domain). None needs attribution; the authors are credited here anyway, as both ask.

Downloaded on 2026-10-29. Each clip was cut from its source at the times given below, mixed to
mono, resampled to 44.1 kHz, normalized to a -1 dBFS peak, faded out over its last part (and in
over 3 ms, or 60 ms for the steady beds: fire crackle, fuse, hum, boiling, whispers, wind and
tinnitus; the two held-die rattles fade over only 5 ms at each end, as they are sliced at random), and encoded as MP3 at 96 kbps with the source's metadata removed. Clips marked
"reversed" were also played backwards, so a decay becomes a swell, and given a slow fade-in and a
12 ms cut at the end instead. Nothing else in a clip was changed; pitch and speed changes happen at
playback.

## Sources and licences

- **BigSoundBank** (57 clips): recordings by Joseph SARDIN (with Axeline T. where listed), from
  [bigsoundbank.com](https://bigsoundbank.com). Every sound page used says "CC0 (public domain):
  Free and royalty-free", and the site's [licence page](https://bigsoundbank.com/licenses.html)
  states Creative Commons CC0 1.0 Universal: share, adapt and use commercially, without
  restriction or permission. Credit is optional; the author suggests "Additional sounds: Joseph
  SARDIN - BigSoundBank.com". Files taken from each sound's MP3 at
  `https://bigsoundbank.com/UPLOAD/mp3/<number>.mp3`.
- **StarNinjas** (3 clips): [20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes)
  on OpenGameArt, by [StarNinjas](https://opengameart.org/users/starninjas), licence CC0. The page
  notes that credit is appreciated, with a link to the author's OpenGameArt profile, given here.
  Files taken from `sword_-_starninjas_1.zip` and `sword_clash_-_starninjas_0.zip` on that page.

Additional sounds: Joseph SARDIN - BigSoundBank.com. Sword sounds by
[StarNinjas](https://opengameart.org/users/starninjas).

## Clips

| Clip | Source | Author | Licence | Cut from | Used by |
| --- | --- | --- | --- | --- | --- |
| `sword-swish.mp3` | [Sword Through the Air (BigSoundBank #0128)](https://bigsoundbank.com/sword-through-the-air-s0128.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.000–0.520 s | slash |
| `sword-cut.mp3` | [Sword That Cuts (BigSoundBank #0127)](https://bigsoundbank.com/sword-that-cuts-s0127.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.050–0.840 s | slash, shadow, reduced animations |
| `sword-clash.mp3` | [sword_clash.1.ogg from 20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | StarNinjas | CC0 | 0.120–1.020 s | slash, whirlwind |
| `sword-clash-2.mp3` | [sword_clash.8.ogg from 20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | StarNinjas | CC0 | 0.100–1.000 s | whirlwind |
| `blade-swing.mp3` | [sword.4.ogg from 20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes) | StarNinjas | CC0 | 0.000–0.580 s | whirlwind, dagger |
| `whoosh-heavy.mp3` | [Whoosh #4 (BigSoundBank #1796)](https://bigsoundbank.com/whoosh-4-s1796.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.150–1.000 s | slam, shadow, fireball, tornado |
| `whoosh-light.mp3` | [Whoosh #5 (BigSoundBank #1797)](https://bigsoundbank.com/whoosh-5-s1797.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.150–0.540 s | claw, dagger, poison |
| `arrow-whoosh.mp3` | [Whoosh #2 (BigSoundBank #0573)](https://bigsoundbank.com/whoosh-2-s0573.html) | Joseph SARDIN | CC0 1.0 (public domain) | 8.180–8.680 s | projectile, volley |
| `beast-growl.mp3` | [Grunts (BigSoundBank #0486)](https://bigsoundbank.com/grunts-s0486.html) | Joseph SARDIN | CC0 1.0 (public domain) | 2.050–3.350 s | claw, shadow |
| `cloth-tear.mp3` | [Cloth (BigSoundBank #0013)](https://bigsoundbank.com/cloth-s0013.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.820–1.120 s | claw |
| `punch.mp3` | [Punch #5 (BigSoundBank #2460)](https://bigsoundbank.com/punch-5-s2460.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.080–0.780 s | claw, reduced animations |
| `hammer-concrete.mp3` | [Hammer fall on concrete (BigSoundBank #1108)](https://bigsoundbank.com/hammer-fall-on-concrete-s1108.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.120–1.220 s | slam, explosion |
| `stones-fall.mp3` | [Fall of Stone (BigSoundBank #1022)](https://bigsoundbank.com/fall-of-stone-s1022.html) | Joseph SARDIN | CC0 1.0 (public domain) | 13.150–14.100 s | slam, meteor, explosion, tornado |
| `stones-fall-2.mp3` | [Fall of Stone (BigSoundBank #1022)](https://bigsoundbank.com/fall-of-stone-s1022.html) | Joseph SARDIN | CC0 1.0 (public domain) | 14.900–15.500 s | slam, meteor, explosion, tornado, nuke |
| `whisper.mp3` | [Whisper #1 (BigSoundBank #3255)](https://bigsoundbank.com/whisper-1-s3255.html) | Joseph SARDIN & Axeline T. | CC0 1.0 (public domain) | 9.850–10.750 s | shadow, poison, reduced animations |
| `bow-release.mp3` | [Archery (BigSoundBank #0549)](https://bigsoundbank.com/archery-s0549.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.080–0.530 s | projectile, volley |
| `arrow-thunk.mp3` | [An arrow on a target (BigSoundBank #0548)](https://bigsoundbank.com/an-arrow-on-a-target-s0548.html) | Joseph SARDIN | CC0 1.0 (public domain) | 1.570–2.020 s | projectile, volley |
| `arrow-thunk-2.mp3` | [An arrow on a target (BigSoundBank #0548)](https://bigsoundbank.com/an-arrow-on-a-target-s0548.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.120–0.570 s | volley, dagger |
| `knife-twang.mp3` | [Knife blade #7 (BigSoundBank #2580)](https://bigsoundbank.com/knife-blade-7-s2580.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.300–1.500 s | dagger |
| `fire-ignite.mp3` | [Gasoline fire #1 (BigSoundBank #1340)](https://bigsoundbank.com/gasoline-fire-1-s1340.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.000–2.200 s | fireball, reduced animations |
| `fire-roar.mp3` | [Gasoline Fire #2 (BigSoundBank #1341)](https://bigsoundbank.com/gasoline-fire-2-s1341.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.000–2.400 s | fireball, meteor, nuke |
| `fire-crackle.mp3` | [Big Branching Fire #1 (BigSoundBank #0987)](https://bigsoundbank.com/big-branching-fire-1-s0987.html) | Joseph SARDIN | CC0 1.0 (public domain) | 3.000–6.000 s | fireball |
| `blast.mp3` | [Explosion #2 (BigSoundBank #1808)](https://bigsoundbank.com/explosion-2-s1808.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.000–0.330 s | fireball, meteor, explosion, nuke |
| `thunder-crack.mp3` | [Thunder #2 (BigSoundBank #3113)](https://bigsoundbank.com/thunder-2-s3113.html) | Joseph SARDIN & Axeline T. | CC0 1.0 (public domain) | 3.980–5.080 s | slam, shadow, fireball, meteor, explosion, bolt, chain, smite, nuke, reduced animations |
| `thunder-roll.mp3` | [Thunder #4 (BigSoundBank #3115)](https://bigsoundbank.com/thunder-4-s3115.html) | Joseph SARDIN & Axeline T. | CC0 1.0 (public domain) | 1.100–7.600 s | meteor, explosion, chain, nuke |
| `fuse-sizzle.mp3` | [Slow wick 1 (BigSoundBank #1306)](https://bigsoundbank.com/slow-wick-1--s1306.html) | Joseph SARDIN | CC0 1.0 (public domain) | 1.700–4.700 s | explosion |
| `arc-crackle.mp3` | [Short welds (BigSoundBank #0952)](https://bigsoundbank.com/short-welds-s0952.html) | Joseph SARDIN | CC0 1.0 (public domain) | 2.750–3.750 s | bolt, chain, beam |
| `electric-shock.mp3` | [Electric shock (BigSoundBank #0134)](https://bigsoundbank.com/electric-shock-s0134.html) | Joseph SARDIN | CC0 1.0 (public domain) | 18.550–18.950 s | bolt, chain, reduced animations |
| `whip-crack.mp3` | [Whip crack #1 (BigSoundBank #2949)](https://bigsoundbank.com/whip-crack-1-s2949.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.200–0.800 s | bolt, chain |
| `blaster.mp3` | [Star Wars Blaster #2 (BigSoundBank #1758)](https://bigsoundbank.com/star-wars-blaster-2-s1758.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.000–0.570 s | beam |
| `transformer-hum.mp3` | [Neon or transformer #1 (BigSoundBank #2118)](https://bigsoundbank.com/neon-or-transformer-1-s2118.html) | Joseph SARDIN | CC0 1.0 (public domain) | 3.000–6.000 s | beam |
| `ice-crack.mp3` | [Cracking ice #1 (BigSoundBank #2205)](https://bigsoundbank.com/cracking-ice-1-s2205.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.250–1.850 s | frost |
| `ice-crack-2.mp3` | [Cracking ice #2 (BigSoundBank #2206)](https://bigsoundbank.com/cracking-ice-2-s2206.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.150–1.250 s | frost, reduced animations |
| `glass-burst.mp3` | [Glass Burst (BigSoundBank #0148)](https://bigsoundbank.com/glass-burst-s0148.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.000–1.880 s | frost |
| `glass-break.mp3` | [Broken Glass of Champagne (BigSoundBank #1591)](https://bigsoundbank.com/broken-glass-of-champagne-s1591.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.050–1.050 s | poison |
| `singing-bowl.mp3` | [Tibetan Bowl Struck #1 (BigSoundBank #1110)](https://bigsoundbank.com/tibetan-bowl-struck-s1110.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.050–6.050 s | frost, smite |
| `splash.mp3` | [Splash, Small #1 (BigSoundBank #1529)](https://bigsoundbank.com/splash-small-1-s1529.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.040–1.040 s | poison |
| `boiling.mp3` | [Big broth in a pot (BigSoundBank #0491)](https://bigsoundbank.com/big-broth-in-a-pot-s0491.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.000–3.000 s | poison |
| `church-bell.mp3` | [Bell 1 O'clock (BigSoundBank #3446)](https://bigsoundbank.com/bell-1-o-clock-s3446.html) | Joseph SARDIN & Axeline T. | CC0 1.0 (public domain) | 0.080–4.580 s | smite, reduced animations |
| `gong.mp3` | [Gong, very strong (BigSoundBank #1485)](https://bigsoundbank.com/gong-very-strong-s1485.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.050–5.050 s | smite, sonic |
| `bass-tom.mp3` | [Bass Tom, #1 (BigSoundBank #2338)](https://bigsoundbank.com/bass-tom-1-s2338.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.060–1.260 s | sonic |
| `wind-strong.mp3` | [Strong wind #4 (BigSoundBank #0154)](https://bigsoundbank.com/strong-wind-4-s0154.html) | Joseph SARDIN | CC0 1.0 (public domain) | 3.000–6.000 s | whirlwind, tornado, nuke, reduced animations |
| `wind-howl.mp3` | [Whistling of the Wind #2 (BigSoundBank #0155)](https://bigsoundbank.com/whistling-of-the-wind-2-s0155.html) | Joseph SARDIN | CC0 1.0 (public domain) | 18.400–21.400 s | shadow, meteor, frost, tornado |
| `tinnitus.mp3` | [Tinnitus (BigSoundBank #1388)](https://bigsoundbank.com/tinnitus-s1388.html) | Joseph SARDIN | CC0 1.0 (public domain) | 4.000–7.000 s | nuke |
| `whisper-murmur.mp3` | [Whisper #1 (BigSoundBank #3255)](https://bigsoundbank.com/whisper-1-s3255.html) | Joseph SARDIN & Axeline T. | CC0 1.0 (public domain) | 0.750–2.750 s | shadow |
| `whisper-murmur-2.mp3` | [Whisper #1 (BigSoundBank #3255)](https://bigsoundbank.com/whisper-1-s3255.html) | Joseph SARDIN & Axeline T. | CC0 1.0 (public domain) | 12.850–14.850 s | shadow |
| `whisper-reversed.mp3` | [Whisper #1 (BigSoundBank #3255)](https://bigsoundbank.com/whisper-1-s3255.html) | Joseph SARDIN & Axeline T. | CC0 1.0 (public domain) | 9.850–10.750 s, reversed | shadow |
| `bowl-reversed.mp3` | [Tibetan Bowl Struck #1 (BigSoundBank #1110)](https://bigsoundbank.com/tibetan-bowl-struck-s1110.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.030–1.200 s, reversed | shadow |
| `dice-clack-1.mp3` | [Two dice on wooden table (BigSoundBank #0581)](https://bigsoundbank.com/two-dice-on-wooden-table-s0581.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.095–0.145 s | dice throws |
| `dice-clack-2.mp3` | [Two dice on wooden table (BigSoundBank #0581)](https://bigsoundbank.com/two-dice-on-wooden-table-s0581.html) | Joseph SARDIN | CC0 1.0 (public domain) | 4.124–4.204 s | dice throws |
| `dice-clack-3.mp3` | [Four dice on wooden table (BigSoundBank #0582)](https://bigsoundbank.com/four-dice-on-wooden-table-s0582.html) | Joseph SARDIN | CC0 1.0 (public domain) | 8.027–8.082 s | dice throws |
| `dice-clack-4.mp3` | [Four dice on wooden table (BigSoundBank #0582)](https://bigsoundbank.com/four-dice-on-wooden-table-s0582.html) | Joseph SARDIN | CC0 1.0 (public domain) | 4.952–4.997 s | dice throws |
| `dice-tap-1.mp3` | [Two dice on wooden table (BigSoundBank #0581)](https://bigsoundbank.com/two-dice-on-wooden-table-s0581.html) | Joseph SARDIN | CC0 1.0 (public domain) | 11.917–12.067 s | dice throws |
| `dice-tap-2.mp3` | [Two dice on wooden table (BigSoundBank #0581)](https://bigsoundbank.com/two-dice-on-wooden-table-s0581.html) | Joseph SARDIN | CC0 1.0 (public domain) | 14.201–14.351 s | dice throws |
| `dice-tap-3.mp3` | [Two dice on wooden table (BigSoundBank #0581)](https://bigsoundbank.com/two-dice-on-wooden-table-s0581.html) | Joseph SARDIN | CC0 1.0 (public domain) | 9.276–9.426 s | dice throws |
| `dice-clatter.mp3` | [Four dice on wooden table (BigSoundBank #0582)](https://bigsoundbank.com/four-dice-on-wooden-table-s0582.html) | Joseph SARDIN | CC0 1.0 (public domain) | 4.998–5.398 s | dice throws |
| `dice-shake.mp3` | [Four dice in hand (BigSoundBank #0583)](https://bigsoundbank.com/four-dice-in-hand-s0583.html) | Joseph SARDIN | CC0 1.0 (public domain) | 0.550–0.850 s | dice throws |
| `dice-roll.mp3` | [Two dice on wooden table (BigSoundBank #0581)](https://bigsoundbank.com/two-dice-on-wooden-table-s0581.html) | Joseph SARDIN | CC0 1.0 (public domain) | 4.470–5.050 s | dice throws |
| `dice-rattle.mp3` | [Four dice in hand (BigSoundBank #0583)](https://bigsoundbank.com/four-dice-in-hand-s0583.html) | Joseph SARDIN | CC0 1.0 (public domain) | 5.180–5.720 s | held die |
| `dice-rattle-2.mp3` | [Four dice in hand (BigSoundBank #0583)](https://bigsoundbank.com/four-dice-in-hand-s0583.html) | Joseph SARDIN | CC0 1.0 (public domain) | 6.080–6.720 s | held die |
