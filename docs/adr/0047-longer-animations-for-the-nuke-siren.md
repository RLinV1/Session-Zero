# ADR 0047 — Longer animations for the nuke's siren

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Amends:** `docs/adr/0038-attack-styles-nuke-and-animations.md`
**Change:** none (a direct request) · **Requirements:** FR-TAC-06, FR-TAC-09

## Context

The nuke's sound opened with a falling-bomb whistle over a 0.88 s drop (`NUKE_DROP_SHARE` 0.22 of
a 4 s run). It now opens with an air-raid siren winding up, and a siren needs 2.5 to 3.5 s to be
heard as one. `AnimationDef.duration` was capped at 4 s for every shape, and the nuke's built-in
was already at that cap. Inside 4 s, a 3 s siren would leave about 1 s for the blast, which takes
3.1 s to play out (fireball, shockwave rings, mushroom cloud, page shake).

## Decision

- `AnimationDef.duration` (`packages/shared/src/animation.ts`) allows 0.2 to **8** s, for every
  shape. The animation editor's Duration slider goes to 8 s.
- The nuke's built-in (`SHAPE_DEFAULTS.nuke`, `NUKE_PRESET`) lasts 6.5 s instead of 4 s.
- `NUKE_DROP_SHARE` is 0.46 instead of 0.22: the siren winds up for 2.99 s before the blast, and
  the blast plays for 3.51 s, a little longer than the 3.12 s it had.
- The bomb falls as fast as before, only later: it waits above the screen and falls over the last
  `NUKE_FALL_SHARE` (0.135) of the run before the blast, 0.88 s at 6.5 s, from 2.11 s.
- The page shake lasts 0.77 of the blast (`duration * (1 - NUKE_DROP_SHARE) * 0.77`, 2.7 s)
  instead of 0.6 of the whole run, so a longer drop does not stretch the shake past the end. At the
  old timings the two give the same 2.4 s.
- Everything that times the blast already reads `NUKE_DROP_SHARE` (the renderer, the page shake,
  the held HP and its fallback timer, the damage numbers, the sound), so they move together.

## Consequences

- Widening a bound only: every stored animation and logged event still parses.
- A client or server built before this change rejects a definition longer than 4 s. Deploy the
  server and web together; a tab left open on the old bundle must reload to see a 6.5 s nuke.
  Rolling back after a GM has saved a longer animation would make it unreadable to the old server.
- A GM can now make any animation up to 8 s. Longer effects hold their place in the effect and
  sound budgets (`MAX_SOUNDS`, the FX budget) for longer. Each sound still ends within its
  animation plus 2.5 s.
- A custom nuke saved before this change keeps its duration but uses the new drop share, so a 4 s
  one now blasts at 1.84 s instead of 0.88 s.
- The sound cue sheet (`docs/SOUND-PLAN.md`, section 20) gives the new beats.
