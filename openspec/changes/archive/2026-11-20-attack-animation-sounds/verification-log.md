# Verification log: animation sounds

Started 2026-10-29, branch `feat/animation-preview-art`. Covers `apps/web/src/board/fxSound.ts`,
`fxSoundRecipes.ts` and their hooks in `boardView.ts` and `animationPreview.ts`.

## Environment

- The user's own dev servers on :3001 and :5173 were left alone.
- Isolated servers from `.claude/launch.json`: `server-isolated` (:3101, in-memory store,
  `SEED_DEV_ACCOUNT=1`) and `web-isolated` (Vite on :5273, proxying to :3101).
- Browser: the built-in browser pane. Signed in on :5273 as the seeded dev account from
  `apps/server/src/identity/devAccount.ts`. Created one throwaway room, "Sound check", with no
  tokens; it disappears when :3101 stops.
- Nothing can be heard from the browser pane by the checker, so playback was checked by rendering
  (offline) and by counting the audio nodes the page made.
- No money or paid credits were spent. The account's Claude plan showed no credit balance and
  extra usage off.
- Second pass (recordings), with the user's approval of the exact list: downloaded 41 MP3s
  (16 MB) from BigSoundBank (`https://bigsoundbank.com/UPLOAD/mp3/<number>.mp3`) and two zips
  (292 KB) from OpenGameArt (StarNinjas) into the session scratchpad, never into the repo. Each
  BigSoundBank sound page was read before download and says "CC0 (public domain): Free and
  royalty-free"; the site licence page says CC0 1.0 Universal; the StarNinjas page says CC0. Only
  the 44 trimmed clips (968 KB) and `CREDITS.md` went into `apps/web/public/sfx`.

## Automated checks

| Step | Result |
| --- | --- |
| `apps/web/test/fxSound.test.ts` (new) | 13 pass |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass: shared 720, server 488 (41 skipped), web 897, bench 2 |

## Browser steps

| # | Step | Result |
| --- | --- | --- |
| 1 | In the :5273 page, `window.AudioContext` swapped for an `OfflineAudioContext` that reports "running"; each shape's default sound played through a fresh `fxSound.ts` module and rendered at 22.05 kHz; loudness measured in 10 ms windows | 20 of 20 render with no NaN and peak below 1.0 (0.22 to 0.95). 19 of 20 have their biggest loudness jump in the window of the impact frame (+20 ms lead). Volley's biggest jump was its bow twangs (0.21 s), not its landing (0.80 s). |
| 2 | Raised volley's landing (thunks 0.18 to 0.40, ticks 0.10 to 0.22, added a 180 to 80 Hz thump), also in `docs/SOUND-PLAN.md`; rendered again | Volley's biggest jump now at 0.81 s (expected 0.80). Volley with count 2 and 2.6 s: 1.59 s (expected 1.58). Fireball at 0.5 s: 0.27 s (expected 0.27). |
| 3 | Reloaded, signed in, wrapped `AudioContext` to count contexts and sources; opened Asset library, Animations | The animation thumbnails rendered and no audio context was made: thumbnails are silent. |
| 4 | New animation (slash), clicked Play | The click created the context, state "running"; 2 noise sources and 3 oscillators (2 tones and a vibrato) were made, as in the slash recipe. No console errors. |
| 5 | Clicked Play again 1 s later | Nothing was scheduled. Cause: a just-created context's clock had not started, so the same-shape merge (measured on the audio clock) took it for the same attack. Fixed: the merge now uses page time. Added a test. After the fix, two plays 1 s apart each scheduled their layers. |
| 6 | Created the room "Sound check", Manage, Map nuke, Detonate | The board made 31 noise sources and 6 oscillators: exactly the nuke recipe (24 ember crackles, 2 echo booms and the other layers). No console errors. |

## Second pass: themes and recordings

| # | Step | Result |
| --- | --- | --- |
| 7 | Measured every downloaded recording (length, loud region, onsets; then a 50 ms loudness strip for the files with several events) to pick each cut | Cut points chosen per clip, e.g. the thunderclap at 4.05 s of Thunder #2, the first of two bow releases in Archery |
| 8 | Cut, mono, -1 dBFS peak, fades, MP3 96 kbps; measured each finished clip | 47 clips, 988 KB; 3 left unused by the recipes were deleted (44 clips, 968 KB) |
| 9 | `apps/web/test/fxSound.test.ts` | 16 pass, including: every clip played is shipped and has a CC0 row with source page and author in `CREDITS.md`; every clip hit lands on its beat; clips play once loaded |
| 10 | Offline render of all 20 shapes with their clips at :5273 (fresh engine per shape, clips loaded first) | 44 of 44 clips decode; no NaN; peaks 0.56 to 0.92; stereo width up to 0.28 where spread is used. Smite's loudest jump read 140 ms late: its rising chord was nearly as loud as the strike. |
| 11 | Thunder clip hit corrected to its measured 0.105 s; every riser now drops out 30 ms before its beat; claw, dagger, poison, slam, shadow and tornado rebalanced so the hit is not masked | Loudness jump into the hit: 7 to 23 dB for most shapes; slam from 2 to 5 dB, shadow from -4 to 5 dB; claw and tornado stay continuous by design |
| 12 | `npm run lint`, `npm run typecheck`, `npm test` | pass: shared 720, server 488 (41 skipped), web 900, bench 2 |
| 13 | Signed in again on :5273, Asset library, Animations, New animation, Play twice (3 s apart), counting `AudioBufferSourceNode.start` | All 44 `/sfx/*.mp3` fetched, none failed. The second play started the three slash clips (sword swish 0.52 s, sword cut 0.79 s, sword clash 0.90 s). No console errors from the sound code; the console's WebSocket and 500 errors date from when the :3101 server was stopped, and the current `/api` requests all return 200. |

## Third pass: the shadow wraith

| # | Step | Result |
| --- | --- | --- |
| 14 | Cut four more clips from recordings already in the scratchpad (no new download): two 2 s whisper murmurs from Whisper #1 (0.75-2.75 s, 12.85-14.85 s, the densest whispering in the file), that file's 9.85-10.75 s reversed, and Tibetan Bowl Struck #1 0.03-1.20 s reversed | 48 clips, 1.0 MB; `CREDITS.md` regenerated, the reversed ones marked "reversed" |
| 15 | Engine: a fixed stereo `pan` per layer; recipe helper: bandpass formants on tones. Shadow recipe rewritten (glide moan and whispers, inhale, growl, shriek, slice, dissolving wail and whisper); reduced cue a short slowed whisper | `fxSound.test.ts` 16 pass |
| 16 | Offline render of shadow at :5273 | Peak 0.72, no NaN. Bed fades in and holds near -23 dB; the moment before the hit read -13 dB because the dark whoosh peaked there and the slowed growl ran into the strike |
| 17 | Whoosh moved earlier and down (0.6 to 0.58, 0.55 to 0.4), growl shortened (0.5 to 0.38 s); rendered at 1.4 s and 2.8 s | 1.4 s: inhale -16 dB at 0.83 s, breath -19 dB, slice -11 dB at 0.93 s. 2.8 s: swell -16 dB, breath -28 dB, hit -10 dB at 1.84 s. Peak 0.73 / 0.75 |
| 18 | `npm run lint`, `npm run typecheck`, `npm test` | pass: shared 720, server 488 (41 skipped), web 900, bench 2 |

## Fourth pass: dice

| # | Step | Result |
| --- | --- | --- |
| 19 | Synthesized dice clacks first (the user declined a download at first): `scheduleDice` on `THROW_CONTACTS`, hooked into `ThrownDice` and `DiceTray`; offline render of 1, 3 and 10 dice | 4 strikes per die, no NaN. Every strike sounded 6 ms late: the master limiter's lookahead. Scheduling now subtracts it (all sounds, attacks too); afterwards the first strike sounds within 0.1 ms of its contact |
| 20 | The user then asked for the recordings. Each page read first ("CC0 (public domain): Free and royalty-free", Joseph SARDIN): BigSoundBank #0581 Two dice on wooden table, #0582 Four dice on wooden table, #0583 Four dice in hand; downloaded (2.4 MB) to the scratchpad | Saved outside the repo |
| 21 | Listed every strike in the two table recordings (2 ms windows), cut clacks, taps, a clatter, a rattle and a roll; checked each finished clip's first strike | Three cuts started after their strike (the 2 ms onsets were late); recut from 1 ms peak levels: every clack now strikes 5.3 to 5.6 ms in, taps 1.4 to 5.4 ms. 10 clips; `CREDITS.md` regenerated (58 clips, cut times now to the millisecond) |
| 22 | Recorded strike per contact, synthesized stand-in skipped once the clips load; offline render with clips | 1 die: 7 clips, 0 oscillators; 3 dice: 23; 10 dice: 72 clips, peak 0.38. Loudness: rattle at 0.1 s, near silence in the air, clatter from 0.4 s, rolling tail to 1.6 s |
| 23 | Home page demo, real AudioContext, Roll clicked (the pane was hidden, so the page was told it was visible for this check) | Two trays of two dice: 2 rattles, clacks in pairs 60 ms apart, taps and rolls, all recorded, no stand-ins, no console errors |
| 24 | "Deeper": dice at 0.74 to 0.88 speed, a synthesized table thump under each landing, rattle, clatter and roll at 0.85; spectrum measured before and after (4096-point FFTs over the throw) | 1 die: centroid 1,714 to 548 Hz, energy under 300 Hz 13% to 58%; 4 dice: 1,236 to 714 Hz, 39% to 55%. First strike still at 410.9 ms (contact 411 ms); peak 0.41 |
| 25 | `npm run lint`, `npm run typecheck`, `npm test` | pass: shared 720, server 488 (41 skipped), web 909, bench 2 |

## Fifth pass: the held die

| # | Step | Result |
| --- | --- | --- |
| 26 | Two stretches of unbroken shaking (5.18-5.72 s, 6.08-6.72 s) cut from Four dice in hand, already in the scratchpad; 5 ms fades only | 60 clips; `CREDITS.md` regenerated, both "held die" |
| 27 | `fxSound.test.ts` (tracker rules, rattle start, idle jiggle, stop) and new `diceThrowHandleSound.test.tsx` (pick-up, every move, release, Escape, a die that cannot be picked up). jsdom here has no `PointerEvent`; the handle test stands in a mouse event with a pointer id | 31 and 3 pass |
| 28 | Home page at :5273 (pane hidden, so the page was told it was visible), audio unlocked by a real click on the intro text, then the real `startDiceShake` fed 600 ms of shaking, 1.6 s still, then stopped | 8 rattles during the shake, 50-70 ms apart, from both clips at 0.81-0.88 speed, scheduled 2-5 ms ahead; 1 jiggle while still; none after the stop |
| 29 | `npm run lint`, `npm run typecheck`, `npm test` | pass: shared 720, server 488 (41 skipped), web 918, bench 2 |

## Cleanup

- Done: stopped `server-isolated` and `web-isolated` (both rounds); the test rooms and sessions went with the in-memory store.
- The downloaded originals stay in the session scratchpad only (`sfx-src/`, `sfx-src/bsb-dice/`), outside the repo.
