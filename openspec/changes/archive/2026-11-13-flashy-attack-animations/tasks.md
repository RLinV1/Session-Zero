## 0. Branch and ADR

- [x] 0.1 Work on branch `feat/flashy-attack-animations` (off `main`); use conventional commits `type(scope): subject (FR-ID)` throughout; verify `git branch --show-current`
- [ ] 0.2 Write `docs/adr/0038-attack-styles-nuke-and-animations.md` covering `AnimationDef`, `AttackContext.style` and `animation`, `AttackPreset.animation`, `nuke.detonate`, `MapNuked`, `MapNukeUndone`, the undo rule and the `library_animations` table; get Real-Time Architecture owner sign-off; verify it is linked from `docs/DESIGN.md` if that file lists ADRs

## 1. Shared contract

- [x] 1.1 Add `AnimationDef` (bounded zod) and `AttackStyle` in `packages/shared`; add optional `style` and `animation` to `AttackContext`, optional `animation` to `AttackPreset`; verify old rolls and attacks without them still parse (fixture test) and out-of-range defs are rejected
- [x] 1.2 Add `nuke.detonate` (with optional `nuke`-shape animation) and `MapNuked` / `MapNukeUndone` events; verify `npm run typecheck`
- [x] 1.3 Handle `nuke.detonate` in `decide`: GM only, `presetRefusal`, amount 1–999, epicenter on the map, one `TokenStatsSet` per token with HP (floor at `MIN_HP`, hidden tokens included), then `MapNuked`; verify unit tests for "Everyone takes damage", "player cannot nuke", forged amount, wrong animation shape and "nothing to damage"
- [x] 1.4 In `decide` for `dice.roll`, copy the actor token's matching named attack animation into `AttackContext.animation` and ignore any client-supplied one; verify "matching attack", "unmatched label" and "forged animation" tests
- [x] 1.5 Handle both new events in `reduce`; verify a determinism test
- [x] 1.6 `visibility.ts`: pass `MapNuked` / `MapNukeUndone` to all viewers unchanged; verify a player's filtered batch lacks the hidden token's stats and contains `MapNuked`
- [x] 1.7 `undo.ts`: add `MapNuked` to `REVERSIBLE_EVENT_TYPES`, its inverse, and extend `canUndo`; verify undo restores HP and is refused after a later HP edit
- [x] 1.8 `activityLog.ts`: label "GM detonated a nuke (N)"; verify with an `activityLog.test.ts` case

## 2. Server

- [x] 2.1 Prisma model and migration `0016_library_animations`; verify `prisma validate` and that the migration applies
- [x] 2.2 `LibraryStore` methods (list, find, create, update, delete, count per owner) in the memory and Postgres stores; verify a shared store test run against the memory store
- [x] 2.3 Routes `/api/library/animations` (GM-only, owner-scoped, 100 cap, `AnimationDef` validated, 404 for another GM); verify integration tests for "Create and list", "Out-of-range definition", "Another GM's animation", "Player credential rejected"
- [x] 2.4 Add `describe("map nuke (FR-TAC-06)")` integration tests (confirm the FR ID against README): GM nuke reaches all clients in one batch, a player's forged command is rejected, a hidden token never leaks to a player, reconnect does not replay; verify `npm test --workspace=@vtt/server -- -t "map nuke"`

## 3. Web: animations and effects

- [x] 3.1 `npm install pixi-filters --workspace=@vtt/web`; verify `npm run typecheck` with Pixi 8
- [x] 3.2 `effectPresets.ts`: built-in `AnimationDef`s for melee, ranged, magic and the nuke; verify a unit test that each parses as `AnimationDef`
- [x] 3.3 `effects.ts`: `attackEffectFor` returns the animation (roll animation, else style built-in, else inferred) and a nuke effect for `MapNuked`; verify unit tests for each style, inference at 1 and 6 cells, custom animation precedence, hidden-token rules and reload no-replay
- [x] 3.4 New `board/fx.ts`: one renderer for every shape (`Graphics`, a blurred additive copy for glow, `ShockwaveFilter`, flash, shake); filters removed on end; reduced-motion variants; wire into `BoardView`; verify filters are gone after a blast and token positions are unchanged
- [x] 3.5 `EffectsOverlay.tsx`: stop drawing the old DOM strike, keep hit/miss/damage numbers and conditions; add nuke damage numbers from before/after HP of visible tokens; verify existing overlay tests still pass

## 4. Web: UI

- [x] 4.1 Attack panel uses the saved attack animation or automatic style; manual Melee/Ranged/Magic controls removed at the user's request.
- [x] 4.2 GM nuke control (GM only): amount field, click-to-set epicenter (default map centre), animation select (built-in or library), confirm dialog; verify players never see the control
- [x] 4.3 `net/api.ts` client for library animations; verify typecheck
- [x] 4.4 Library page Animations tab: list with search, create, rename, duplicate, delete, duplicate-from-built-in; verify a component test for list and search
- [x] 4.5 Animation editor form and preview stage (`board/animationPreview.ts` plus a thin React component) with Play running unsaved values, nothing sent to any room; verify the "Preview unsaved changes", "Preview touches nothing" and "Nuke preview" scenarios
- [x] 4.6 Attack editors (`AttackListEditor`, creature attacks): pick a library animation for a named attack and copy it in; remove it to restore the style; refuse `nuke` shape; verify "Library edit does not change the attack"

## 5. Verification

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [x] 5.2 Verify in the running app with the Playwright MCP: each style plays, a library animation plays for a player, the nuke plays for GM and a player, a hidden token shows no number, reduced motion variant works, undo restores HP, the editor preview plays unsaved values

## 6. Visible nuke drop and animation budget

- [x] 6.1 Show a steel bomb with fins and a radiation band falling into the centre of each viewer's board, followed by an orange mushroom cloud and ground fire.
- [x] 6.2 Size the blast from the viewport, independently of map size, zoom and pan; replace screen filters and per-frame cloud paths with 52 sprites sharing one cached fire texture.
- [x] 6.3 Limit heavy effects to 30 fps, one simultaneous nuke, bounded sparks and 12 visible condition emitters with one canvas each; stop particles in hidden tabs and release blast objects on hide/end.
- [x] 6.4 Delay screen shake and damage labels until impact; place Reduced animations underneath Detonate.
- [x] 6.5 Verify fire visibility, viewport framing, cleanup, overflow and frame cost in a browser; run lint, typecheck, unit tests and production build.

## 7. Widespread nuclear impact

- [x] 7.1 Widen the mushroom cap to roughly 70% of the board width, thicken the stem and replace the thin ground line with overlapping banks of fire.
- [x] 7.2 Add a fast-growing fireball, 24 rolling fire/dust clouds expanding across the viewport, a stronger flash and thicker shock rings; keep cached textures and the 30fps budget.
- [x] 7.3 Verify impact and aftermath visually, remeasure render cost and run relevant tests, lint, typecheck and build.

## 8. Dedicated animation editor

- [x] 8.1 Extract the editor from the narrow library popup into a full-screen map-editor shell with persistent Save/Cancel and Appearance, Timing & power and Motion sections.
- [x] 8.2 Keep a large two-token preview mounted beside settings, with labelled attacker/target tokens, Play, Stop, reduced preview and idle/30fps rendering.
- [x] 8.3 Protect unsaved drafts, retain failed saves and support desktop/laptop/phone layouts with no horizontal scrolling.
- [x] 8.4 Verify two-token playback, unsaved preview, save, cancel and responsive layouts in the browser; run regression tests, lint, typecheck and build.

## 9. Static previews in the animation library

- [x] 9.1 Render one recognizable still per definition into library cards; refresh edited definitions and retain previews across visits.
- [x] 9.2 Generate visible cards serially with a shared offscreen renderer, yield between requests, bound image caching and safely release the context on exit.
- [x] 9.3 Verify all 20 shapes, cached revisits, image dimensions and zero per-card canvases in the browser; run cache/UI tests, lint, typecheck and build.

## 10. Rendering budgets and browser settings

- [x] 10.1 Reuse cached particle textures and pooled sprites, compact expired particles in place, and render reduced markers only at appearance/removal.
- [x] 10.2 Cull condition effects outside the viewport, coalesce camera measurements with a trailing update, use CSS for bounded condition loops, and pause hidden pages.
- [x] 10.3 Add More → Settings for every viewer, with persistent High/Balanced/Low graphics, local reduced animations, and future music/sound volume preferences.
- [x] 10.4 Match settings sliders to the existing rust range controls with accessible labels, aligned values, keyboard interaction and narrow-screen layouts.
- [x] 10.5 Raise the broad mushroom cloud while retaining widespread fire and dust; right-align confirmation actions in Detonate, Cancel order.
- [x] 10.6 Restore a visible d20 to-hit action for GM/player attackers without named attacks and correct the obsolete browser-only saving message.
- [x] 10.7 Complete final browser verification, compare render cost, and pass lint, typecheck, full tests and production build.

## 11. Automatic range variety and attack areas

- [x] 11.1 Keep nearby/diagonal default attacks melee; vary distant defaults deterministically by roll id across travelling effects.
- [x] 11.2 Replace the AoE radius with an optional `maxTargets` (2-10) on saved attacks; no server-copied roll metadata or templates; document in ADR 0039.
- [x] 11.3 Offer "Can attack multiple targets" and a count in the shared attack editor; show it in attack summaries.
- [x] 11.4 In the attack panel, let the roller tick extra targets up to the count; roll once per target, and after Hits roll damage at every target that was hit.
- [ ] 11.5 Verify editor/panel behavior visually, round-trip the contract across clients, and pass lint, typecheck, tests and build.
