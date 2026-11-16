import { DEFAULT_GRID } from "@vtt/shared";

/** The artwork and every lesson share these board coordinates (18 by 12 squares). */
export const TUTORIAL_MAP = { url: "/img/tutorial-practice.svg", width: 1260, height: 840 };
export const TUTORIAL_GRID = { ...DEFAULT_GRID, cellSize: 70, offsetX: 0, offsetY: 0, lineColor: "#ffc857", lineOpacity: 0.8, lineWidth: 2 };
export const TUTORIAL_SCENE_NAME = "Interactive demo practice";
export const TUTORIAL_WALLS = [
  { a: { x: 140, y: 140 }, b: { x: 1120, y: 140 } },
  { a: { x: 1120, y: 140 }, b: { x: 1120, y: 700 } },
  { a: { x: 1120, y: 700 }, b: { x: 140, y: 700 } },
  { a: { x: 140, y: 700 }, b: { x: 140, y: 140 } },
  { a: { x: 420, y: 280 }, b: { x: 420, y: 560 } },
  { a: { x: 420, y: 560 }, b: { x: 770, y: 560 } },
];
