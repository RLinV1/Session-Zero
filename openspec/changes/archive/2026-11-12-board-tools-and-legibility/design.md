# Design

## Context

See proposal.md for why. Current state that shapes the approach:

- **Rail tools.** `ToolRail.tsx` has a static `TOOLS` list, a `ToolOptions` record that remembers each tool's options, and `toolFor()`. `BoardTool` in `board/tools.ts` is the matching union. Fog is the model for a GM tool that sends room commands from the board: `boardView.ts` handles the gesture, draws a draft and calls `sendFog` and `fogClick`.
- **Terrain painting** lives only in `pages/mapEditor/TerrainSetup.tsx`, on its own SVG `MapCanvas`. Its stroke logic (`fill`, `begin`, `commit`: Bresenham-like brush, rectangle fill, the 10,000-cell cap, map bounds, `compressTerrain` to `PaintRun[]`, the `{ boardEpoch, revision }` context) is held in component closures. The board's toolbar opens it in a modal (`Board.tsx:916`) with `live layers`.
- **Show menu.** `BoardFilters.tsx` reads `showTerrain`, which is `useState(false)` in `Board.tsx`, and `available.terrain` is `true` for every role, so players get a menu with only that row. `boardView.ts` already defaults `showTerrain = true` internally.
- **Colours** are hard-coded in four places: `boardView.ts` (walls `0xf0a24a`, `DOOR_COLOR 0xc8873a`, `WINDOW_COLOR`, `LOCK_COLOR`, terrain `0xd5aa56` and `0xc36d74`), `TerrainCells` in `TerrainSetup.tsx` (`#d5a64d`, `#d57474`), and `styles.css` (wall drawing in the map editor, legend swatches, terrain-control accents).
- **Portal clicks.** In Select, `onPointerUp` calls `callbacks.togglePortal(id, shiftKey)`. `Board.tsx:451` turns that into `portal.setState`. `portalUnder()` only answers with the Select tool.
- **HP.** `MyTokens.tsx` sends `token.setStats` with `{ ...stats, hp: clamp(hp + delta, maxHp) }`. `TokenCard.tsx` shows HP read-only and already uses `can.editToken` and `statHidden`. `TokenStats.hp` is `int` in `[MIN_HP = -999, 9999]`.

## Goals / Non-Goals

**Goals:**
- Painting terrain on the board and painting it in the dialog share one pure stroke model, so they cannot drift apart.
- One palette source used by Pixi, the editor SVG and CSS.
- Everything goes through existing commands, so authorization, undo and visibility filtering are unchanged (invariants 1, 3, 7).

**Non-Goals:**
- No new commands or events. In particular there is no `token.adjustHp` delta command (see Risks).
- No turning walls into portals from the board.
- No change to what players receive. Walls stay GM-only, and `terrainView` filtering is unchanged.
- No Settings-dialog entries for the view filters.

## Decisions

### 1. A pure terrain-stroke helper shared by board and dialog
Move the stroke logic into `board/terrainStroke.ts`. It is pure, works on grid cells, and has no React or Pixi in it:
`startStroke(cell, opts)`, `extendStroke(stroke, cell, { shape, grid, map })` returning `{ cells, error? }`, and `strokePaint(stroke) → PaintRun[]`. `TerrainSetup` and `boardView` both call it. The dialog keeps its SVG canvas; the board draws the preview in `markLayer` as a draft, like fog.
- *Alternative:* embed `TerrainSetup`'s canvas over the board. Rejected: it would be a second zoom/pan surface on top of Pixi, which is exactly the inconvenience being removed.

### 2. New `BoardTool` kinds and remembered options
`{ kind: "terrain"; shape: "brush" | "rect"; paint: TerrainKind | null }` and `{ kind: "doors"; mode: "toggle" | "lock" }`. `ToolOptions` gains `terrain` and `doors`. They are persisted with the existing tool-option storage, and a missing or unknown saved value falls back to the defaults, the same guard used for `measure`. Strokes always target `"base"`.

### 3. boardView sends through callbacks, like fog
`callbacks.paintTerrain(layerId, paint, context)` returns the command result. The board keeps the draft drawn until the answer arrives, then clears it. On refusal, Board shows the message in its existing `refusal` banner. The context is captured when the stroke starts, from `state.boardEpoch` and `state.terrainRevision`, so a concurrent edit is refused the way the dialog's is today.
Doors: `portalUnder()` also answers when `tool.kind === "doors"`. On click, Board maps the mode and current state to the target state:
- Toggle: open → closed; closed or locked → open
- Lock: open or closed → locked; locked → closed

It then sends `portal.setState`. Hover highlighting uses the same lookup on pointer move and redraws only the portal layer.

### 4. Forced visibility is derived, not stored
Board passes `effectiveShowTerrain = showTerrain || tool.kind === "terrain"` and `effectiveShowPortals = showPortals || tool.kind === "doors"` to the view. Walls get a `wallsDimmed = tool.kind === "doors"` flag, drawn with alpha around 0.35. The Show checkboxes keep the user's own choice, so leaving the tool restores it without any bookkeeping.

### 5. Show menu
`showTerrain` initial state becomes `true`. `BoardFilters` is rendered only when `you.role === "gm"`, on desktop and in the phone Funnel popover. The map editor's own use of `BoardFilters` (with the Grid row) is unaffected.

### 6. Palette module plus CSS custom properties
`board/mapPalette.ts` (separate from the themed `ui/palette.ts`, since map colours must not follow the UI theme) exports named entries, each with an inner and an outer colour: `wall`, `door`, `window`, `lock`, `difficult`, `blocked`. Pixi uses the numeric values. `TerrainCells` and editor SVGs use the hex values. `styles.css` gets matching `--map-wall` etc. on `:root`, and the four hard-coded CSS spots read those variables. Starting values (tunable during implementation, as long as the hue families in the spec hold):

| entry | inner | outer |
|---|---|---|
| wall | `#4cc46a` green | `#0f1a12` |
| door | `#f08a24` orange | `#1a1108` |
| window | `#5dade2` light blue | `#0b1620` |
| lock | `#d0342c` red | `#1a0808` |
| difficult | `#9b4de8` purple | `#160b26` |
| blocked | `#e0525a` red | `#1f0a0c` |

Two-tone drawing means outer stroke `width + 3px` under inner stroke `width`. Terrain cells get fill alpha ~0.28, an outer cell border plus an inner border inset by 1px, and two-tone hatching from one pure helper (`terrainHatch`): Difficult single-hatched, Blocked crosshatched, no glyphs.
- *Alternative:* theme the terrain per map from sampled map colours. Rejected as overkill; the two-tone outline is the standard, cheap fix.

### 7. Door shape cues
For each portal, draw end ticks perpendicular to the segment, about 0.35 cell long, at both ends in the door or window colour with an outline. Open portals keep the 20%/80% gap, and the ticks still mark the jambs. The lock becomes a small padlock (a rounded body plus a shackle arc) instead of a dot. It is drawn at the middle, scaled with portal width and never below `PORTAL_MIN_PX`.

### 8. Rail divider
`TOOLS` gains a `group: "play" | "gm"` field. Render play tools, then `<span className="rail-divider">` if any GM tool is visible, then GM tools. The Sight toggle, which is not in `TOOLS`, renders inside the GM group. The phone flyout gets the same divider (a horizontal variant of the class if the flyout is a row).

### 9. Quick HP on TokenCard
Pull the arithmetic out of `MyTokens` into `ui/hpChange.ts`, a pure function: `applyHpDelta(stats, delta)` clamps to `[MIN_HP, maxHp ?? 9999]`. Both `MyTokens` and `TokenCard` use it. `TokenCard` receives an `onSetStats` callback. The card offers only the four fixed buttons; a typed amount was tried and dropped to keep the card compact. It shows the controls when `!readOnly && can.editToken(you, token) && token.stats.hp !== null && !statHidden(...)`.
An "Open in roster" link was tried and dropped: the card keeps only the four buttons. Nothing on selection touches the tab.

### 10. Terrain layers removed from the interface only
The rail tool, `TerrainSetup` (room and library editors) and the board no longer offer layers; every stroke paints `"base"`, and the live terrain dialog is gone. The shared contract is untouched: `terrain.effect.*` commands, `TerrainEffect*` events and `effects` in state remain, because events are append-only and removing schema needs an ADR. Existing layers are left as they are (still drawn with corner markers, still applied to movement); there is no merge.
- *Alternative:* remove layers from the contract. Rejected for this change: schema change, ADR and owner review, and old events must still reduce.

## Risks / Trade-offs

- **Read-modify-write on HP**: `token.setStats` sends the full stats computed from the client's state, so two fast edits (GM plus owner, or a double tap before the echo) can overwrite each other. → The buttons disable while a change is in flight. A follow-up `token.adjustHp { delta }` command (schema change, ADR) is the real fix and stays out of scope.
- **Defeat removal**: a −5 tap can take a token to 0 HP and remove it under "Remove tokens at 0 HP". → This is intended table behaviour and it can be undone from the activity log. No confirm step, because it would slow the common case.
- **Board strokes vs. dialog strokes**: two code paths call the helper and could still differ in preview. → Unit-test the helper (brush line, rectangle, cap, bounds), and keep the dialog's behaviour tests passing.
- **Palette change for players**: players see new door and terrain colours. → Doors become *more* distinct, and players never see walls, so the old wall/door confusion was GM-only.
- **Stranded layers**: a room with layers from before has no control to remove them except undo from the activity log. → Accepted by the table; layers are rare.
- **Merge overlap** with `terrain-panel-icons` in `TerrainSetup.tsx`; `terrain-effect-layers-in-map-editors` conflicts outright. → Land the helper extraction as its own early commit, so the other changes rebase onto a smaller diff.
- **Pointer conflicts**: the Doors tool must not start pans or token drags on a portal click. → Reuse the Select click path (pan threshold), only with a different action.

## Migration Plan

Web-only. Saved tool options without `terrain` or `doors` fall back to the defaults. Rollback is a revert; no data is touched.

## Open Questions

- Exact palette values may be tuned visually on the shipped maps during implementation, within the hue families the spec fixes.
