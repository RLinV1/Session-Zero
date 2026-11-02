import type { GuideStep } from "../../ui/guide";

/**
 * The map editor's guide, one tour per step (map-editor-step-guides). Targets are found by
 * selector inside the editor dialog, and the tour skips any that are not on screen (a control
 * shown only in some states), so one list serves the room and the library editor.
 */
const s = (target: string, selector: string, title: string, body: string): GuideStep => ({
  target, selector: `.map-editor ${selector}`, title, body,
});

const MAP: GuideStep[] = [
  s("map-preview", ".map-editor-stage", "The map", "What the table will play on. It stays private until you apply it."),
  s("map-upload", '.map-editor-hud[aria-label="Map"] .upload-button', "Upload", "Choose a map image or a UVTT file."),
  s("map-library", '[data-guide="map-library"]', "From library", "Or pick a map you saved before."),
  s("map-save-library", '[data-guide="map-save-library"]', "Keep a copy", "Tick this to save uploads to your library too."),
  s("map-export", '[data-guide="map-export"]', "Export", "Download the applied map, walls and all, as a UVTT file."),
];

const GRID: GuideStep[] = [
  s("grid-canvas", ".map-grid-canvas", "Place the grid", "Click two opposite corners of one square: A, then B."),
  s("grid-sample", ".grid-sample-count", "Sample size", "Measure 1, 3 or 5 squares at once for a more exact fit."),
  s("grid-anchors", ".grid-anchor-controls", "Fine-tune", "Pick A or B, then nudge it with the arrow keys."),
  s("grid-zoom", ".map-grid-zoom", "Zoom", "Zoom in to line up the corners."),
  s("grid-advanced", ".grid-advanced", "Advanced", "Type exact cell size and offsets, and style the grid lines."),
  s("grid-scale", ".grid-scale", "Scale", "How far one square is, like 5 ft."),
  s("grid-suggestion", ".grid-suggestion", "Suggestion", "A grid found automatically. Check it against the map."),
];

const WALLS: GuideStep[] = [
  s("walls-canvas", ".wall-canvas", "The walls", "Walls block sight. Drag to pan and scroll to zoom."),
  s("walls-tools", '[aria-label="Wall tool"]', "Tools", "Draw and erase walls, add doors and windows, or sample a colour."),
  s("walls-detection", "[data-guide=walls-detection]", "Detect walls", "Find walls automatically. Results open in a preview to apply or discard."),
  s("walls-selected", '.map-editor-hud[aria-label="Wall tools"] select', "Selected", "Pick any wall, door or window here to edit it."),
  s("walls-clear", '.map-editor-hud[aria-label="Wall tools"] .danger', "Clear walls", "Remove every wall on this map."),
];

const FOG: GuideStep[] = [
  s("fog-canvas", ".wall-canvas", "The fog", "Fogged parts are hidden from players."),
  s("fog-tools", '[aria-label="Fog tool"]', "Tools", "Fog a rectangle or polygon, reveal an area, or move and reshape fog."),
  s("fog-player-view", '.map-editor-hud[aria-label="Fog tools"] button[aria-pressed]', "Player view", "See the map as players do."),
  s("fog-whole", '[data-guide="fog-whole"]', "Fog whole map", "Hide everything, then reveal what the players find."),
  s("fog-list", '[aria-label="Fogged regions"]', "Fogged regions", "Reveal any region with one click."),
];

const SIGHT: GuideStep[] = [
  s("sight-tokens", ".sight-token-panel", "Test tokens", "Try sight with stand-ins. Only you see them, and they aren't saved."),
  s("sight-add", "[data-guide=sight-add]", "Add token", "Then click the map to place one."),
  s("sight-preview", ".map-editor-sight-preview", "Preview", "Drag tokens to see what they see. Click a door to open or close it here."),
  s("sight-popup", ".sight-popup", "Seen tokens", "How many other test tokens this one sees."),
  s("sight-toggle", "[data-guide=sight-toggle]", "Line of sight", "Players see only what their own tokens can see."),
  s("sight-range", '[aria-label="Sight range"]', "Range", "Unlimited, or a distance limit."),
  s("sight-slider", 'input[aria-label="Sight range in squares"]', "Distance", "Drag to set the range in squares."),
  s("sight-exact", ".sight-range-exact", "Exact distance", "Or type it in the map's own units."),
];

/** Keyed by the editor step's key. */
export const EDITOR_GUIDES: Record<string, GuideStep[]> = { map: MAP, grid: GRID, walls: WALLS, fog: FOG, sight: SIGHT };
