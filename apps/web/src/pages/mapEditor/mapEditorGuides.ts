import type { GuideStep } from "../../ui/guide";
import { t } from "../../i18n/locale";

/**
 * The map editor's guide, one tour per step (map-editor-step-guides). Targets are found by
 * selector inside the editor dialog, and the tour skips any that are not on screen (a control
 * shown only in some states), so one list serves the room and the library editor.
 *
 * Built when a tour opens, in the current language: the text is translated, and so are the
 * accessible names some selectors match (`aria-label` follows the language).
 */
const s = (target: string, selector: string, title: string, body: string): GuideStep => ({
  target, selector: `.map-editor ${selector}`, title, body,
});
const label = (text: string) => `[aria-label="${text.replace(/"/g, '\\"')}"]`;

const map = (): GuideStep[] => [
  s("map-preview", ".map-editor-stage", t("guide.map.preview.title"), t("guide.map.preview.body")),
  s("map-upload", `.map-editor-hud${label(t("common.map"))} .upload-button`, t("guide.map.upload.title"), t("guide.map.upload.body")),
  s("map-library", '[data-guide="map-library"]', t("guide.map.library.title"), t("guide.map.library.body")),
  s("map-save-library", '[data-guide="map-save-library"]', t("guide.map.save.title"), t("guide.map.save.body")),
  s("map-export", '[data-guide="map-export"]', t("guide.map.export.title"), t("guide.map.export.body")),
];

const grid = (): GuideStep[] => [
  s("grid-canvas", ".map-grid-canvas", t("guide.grid.canvas.title"), t("guide.grid.canvas.body")),
  s("grid-sample", ".grid-sample-count", t("guide.grid.sample.title"), t("guide.grid.sample.body")),
  s("grid-anchors", ".grid-anchor-controls", t("guide.grid.anchors.title"), t("guide.grid.anchors.body")),
  s("grid-zoom", ".map-grid-zoom", t("common.zoom"), t("guide.grid.zoom.body")),
  s("grid-advanced", ".grid-advanced", t("common.advanced"), t("guide.grid.advanced.body")),
  s("grid-scale", ".grid-scale", t("guide.grid.scale.title"), t("guide.grid.scale.body")),
  s("grid-suggestion", ".grid-suggestion", t("guide.grid.suggestion.title"), t("guide.grid.suggestion.body")),
];

const walls = (): GuideStep[] => [
  s("walls-canvas", ".wall-canvas", t("guide.walls.canvas.title"), t("guide.walls.canvas.body")),
  s("walls-tools", label(t("walls.tool")), t("common.tools"), t("guide.walls.tools.body")),
  s("walls-detection", "[data-guide=walls-detection]", t("walls.detect"), t("guide.walls.detect.body")),
  s("walls-selected", `.map-editor-hud${label(t("walls.tools"))} select`, t("guide.walls.selected.title"), t("guide.walls.selected.body")),
  s("walls-clear", `.map-editor-hud${label(t("walls.tools"))} .danger`, t("guide.walls.clear.title"), t("guide.walls.clear.body")),
];

const fog = (): GuideStep[] => [
  s("fog-canvas", ".wall-canvas", t("guide.fog.canvas.title"), t("guide.fog.canvas.body")),
  s("fog-tools", label(t("fog.tool")), t("common.tools"), t("guide.fog.tools.body")),
  s("fog-player-view", `.map-editor-hud${label(t("fog.tools"))} button[aria-pressed]`, t("fog.playerView"), t("guide.fog.player.body")),
  s("fog-whole", '[data-guide="fog-whole"]', t("fog.fogWhole"), t("guide.fog.whole.body")),
  s("fog-list", label(t("fog.regions")), t("fog.regions"), t("guide.fog.list.body")),
];

const sight = (): GuideStep[] => [
  s("sight-tokens", ".sight-token-panel", t("sight.testTokens"), t("guide.sight.tokens.body")),
  s("sight-add", "[data-guide=sight-add]", t("common.addToken"), t("guide.sight.add.body")),
  s("sight-preview", ".map-editor-sight-preview", t("common.preview"), t("guide.sight.preview.body")),
  s("sight-popup", ".sight-popup", t("guide.sight.popup.title"), t("guide.sight.popup.body")),
  s("sight-toggle", "[data-guide=sight-toggle]", t("sight.lineOfSight"), t("guide.sight.toggle.body")),
  s("sight-range", label(t("sight.rangeLabel")), t("sight.range"), t("guide.sight.range.body")),
  s("sight-slider", `input${label(t("sight.rangeSquares"))}`, t("guide.sight.slider.title"), t("guide.sight.slider.body")),
  s("sight-exact", ".sight-range-exact", t("sight.exact"), t("guide.sight.exact.body")),
];

const GUIDES: Record<string, () => GuideStep[]> = { map, grid, walls, fog, sight };

/** The guide for the editor step `step` (its key), in the current language; undefined when it has none. */
export const editorGuide = (step: string): GuideStep[] | undefined => GUIDES[step]?.();
