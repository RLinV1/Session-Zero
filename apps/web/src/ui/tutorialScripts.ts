import { cellAt, type GridSpec, type Point } from "@vtt/shared";
import { t } from "../i18n/locale";
import { EXAMPLE_GRID_EVENT, EXAMPLE_SIGHT_EVENT, exampleBoard, exampleCommands, exampleCorner, key, type ExampleApi, type ExampleSub, type SightExample } from "./tutorialExample";
import { TUTORIAL_GRID, TUTORIAL_MAP } from "./tutorialMap";

const tool = (name: string) => `[data-tutorial-tool="${name}"]`;
const demoButton = (name: string) => `.guest-tutorial [data-demo="${name}"]`;
const sight = (detail: SightExample) => () => void window.dispatchEvent(new CustomEvent<SightExample>(EXAMPLE_SIGHT_EVENT, { detail }));
const attr = (selector: string, name: string, value: string) => document.querySelector(selector)?.getAttribute(name) === value;

/**
 * The sub-steps of a lesson's Show me, in order. The editor ones press the real tool buttons and
 * send the draft commands those tools send, so they end with what the tools make; the others point
 * at the lesson's control (and press it where the lesson's own demo does the work).
 */
export function exampleScript(step: string, grid: GridSpec, map: { url?: string; width: number; height: number }): ExampleSub[] {
  const lessonGrid = map.url === TUTORIAL_MAP.url ? TUTORIAL_GRID : grid;
  const { c0, r0 } = exampleCorner(lessonGrid, map);
  const at = (col: number, row: number): Point => ({ x: lessonGrid.offsetX + col * lessonGrid.cellSize, y: lessonGrid.offsetY + row * lessonGrid.cellSize });
  const centre = (col: number, row: number): Point => at(col + 0.5, row + 0.5);
  const A = at(c0, r0), B = at(c0 + 5, r0), C = at(c0 + 5, r0 + 4);
  const paint = (col: number, row: number, kind: "difficult" | "blocked" | null) => (api: ExampleApi) => {
    const cell = cellAt(centre(col, row), grid);
    return void api.command({ type: "terrain.paint", layerId: "base", context: api.draft()?.terrainContext ?? { boardEpoch: 0, revision: 0 }, paint: [{ row: cell.row, start: cell.col, end: cell.col, kind }] });
  };
  switch (step) {
    case "walls": return [
      { caption: "tutorial.ex.pickDraw", control: tool("draw"), press: true },
      { caption: "tutorial.ex.clickHere", at: A, click: true },
      { caption: "tutorial.ex.clickThere", at: B, click: true, run: (api) => void api.command({ type: "wall.add", walls: [{ a: A, b: B }] }) },
      { caption: "tutorial.ex.clickCorner", at: C, click: true, run: (api) => void api.command({ type: "wall.add", walls: [{ a: B, b: C }] }) },
      { caption: "tutorial.ex.pickDoor", control: tool("portal"), press: true },
      { caption: "tutorial.ex.clickWall", at: at(c0 + 5, r0 + 1.5), click: true, run: async (api) => {
        const wall = Object.values(api.draft()?.walls ?? {}).reverse().find((w) => key(w.a, w.b) === key(B, C));
        if (wall) await api.command({ type: "wall.add", walls: [{ a: at(c0 + 5, r0 + 1), b: at(c0 + 5, r0 + 2), portal: { kind: "door", state: "closed" } }] });
      } },
    ];
    case "fog": return [
      { caption: "tutorial.ex.pickRect", control: tool("rect"), press: true },
      { caption: "tutorial.ex.dragArea", from: at(c0, r0), at: at(c0 + 5, r0 + 4), run: (api) => void api.command({ type: "fog.add", region: { shape: "rect", from: at(c0, r0), to: at(c0 + 5, r0 + 4) } }) },
      { caption: "tutorial.ex.playerView", control: tool("playerview"), press: true, skip: () => attr(tool("playerview"), "aria-pressed", "true") },
    ];
    case "terrain": return [
      { caption: "tutorial.ex.pickDifficult", control: tool("difficult"), press: true },
      { caption: "tutorial.ex.paintCell", at: centre(c0 + 1, r0 + 2), click: true, run: paint(c0 + 1, r0 + 2, "difficult") },
      { caption: "tutorial.ex.paintNext", at: centre(c0 + 2, r0 + 2), click: true, run: paint(c0 + 2, r0 + 2, "difficult") },
      { caption: "tutorial.ex.pickBlocked", control: tool("blocked"), press: true },
      { caption: "tutorial.ex.paintCell", at: centre(c0 + 3, r0 + 2), click: true, run: paint(c0 + 3, r0 + 2, "blocked") },
      { caption: "tutorial.ex.paintNext", at: centre(c0 + 4, r0 + 2), click: true, run: paint(c0 + 4, r0 + 2, "blocked") },
      { caption: "tutorial.ex.pickEraser", control: tool("normal"), press: true },
      { caption: "tutorial.ex.eraseCell", at: centre(c0 + 1, r0 + 2), click: true, run: paint(c0 + 1, r0 + 2, null) },
    ];
    case "sight": return [
      // A wall and a door first, so the view has something to stop at.
      { caption: "tutorial.ex.wallsBlock", at: A, run: async (api) => { for (const command of exampleCommands("walls", api.draft()!, lessonGrid, map).filter((command) => command.type === "wall.add")) await api.command(command); } },
      { caption: "tutorial.ex.addTest", control: tool("sight-add"), at: centre(c0 + 2, r0 + 1), click: true, run: sight({ op: "place", at: centre(c0 + 2, r0 + 1) }) },
      { caption: "tutorial.ex.losOn", control: tool("sight-on"), press: true, skip: () => attr(tool("sight-on"), "aria-checked", "true") },
      { caption: "tutorial.ex.moveTest", from: centre(c0 + 2, r0 + 1), at: centre(c0 + 7, r0 + 1), click: true, run: sight({ op: "move", dx: 5, dy: 0 }) },
    ];
    case "grid": return [
      { caption: "tutorial.ex.gridStart", control: tool("grid-restart"), press: true },
      { caption: "tutorial.ex.gridSize", control: tool("grid-sample-1"), press: true },
      { caption: "tutorial.ex.gridCorner", control: "dialog.map-editor[open] .map-grid-canvas", at: at(c0 + 1, r0 + 1), click: true, run: () => { window.dispatchEvent(new CustomEvent(EXAMPLE_GRID_EVENT, { detail: at(c0 + 1, r0 + 1) })); } },
      { caption: "tutorial.ex.gridOpposite", control: "dialog.map-editor[open] .map-grid-canvas", at: at(c0 + 2, r0 + 2), click: true, run: () => { window.dispatchEvent(new CustomEvent(EXAMPLE_GRID_EVENT, { detail: at(c0 + 2, r0 + 2) })); } },
      { caption: "tutorial.ex.gridApply", control: tool("grid-apply"), press: true },
    ];
    case "invite": return [
      { caption: "tutorial.ex.openMore", control: '[data-tour="guide"] > button', press: true, skip: () => !!document.querySelector('.share-button, dialog.share-modal[open]') },
      { caption: "tutorial.ex.clickShare", control: ".share-button", press: true, skip: () => !!document.querySelector("dialog.share-modal[open]") },
      { caption: "tutorial.ex.copyLink", control: 'dialog.share-modal[open] [data-tutorial="invite"]', click: true },
    ];
    case "map": return [
      { caption: "tutorial.ex.editMap", control: "[data-tutorial-editor-open]", press: true },
      { caption: "tutorial.ex.editTools", control: 'dialog.map-editor[open] [role="tablist"]' },
      { caption: "tutorial.ex.closeMap", control: "dialog.map-editor[open] .modal-close", press: true },
      { caption: "tutorial.ex.changeMap", control: "[data-tutorial-change-open]", press: true },
      { caption: "tutorial.ex.pickMap", control: 'dialog.map-editor[open] [data-guide="map-library"]', click: true },
    ];
    case "token": return [
      { caption: "tutorial.ex.addToken", control: '[data-tutorial="token"] button', press: true },
      { caption: "tutorial.ex.nameToken", control: tool("token-name"), input: t("tutorial.demo.token") },
      { caption: "tutorial.ex.chooseSquare", control: tool("token-place"), press: true },
      { caption: "tutorial.ex.placeToken", control: ".board canvas", board: true, at: () => exampleBoard()?.place ?? null, click: true },
      { caption: "tutorial.ex.stopPlacing", control: ".placement-bar button", press: true },
    ];
    case "move":
      exampleBoard()?.focus();
      return [{ caption: "tutorial.ex.dragToken", control: ".board canvas", board: true, from: () => exampleBoard()?.token?.position ?? null, at: () => exampleBoard()?.destination ?? null }];
    case "roll": return [{ caption: "tutorial.ex.clickRoll", control: '[data-tutorial="roll"]', press: true }];
    case "encounter": return [{ caption: "tutorial.ex.runFight", control: demoButton("encounter"), press: true }];
    case "attack": return [{ caption: "tutorial.ex.rollAttack", control: demoButton("attack"), press: true }];
    case "ruling": return [{ caption: "tutorial.ex.clickHit", control: '[data-tutorial="ruling"]', press: true }];
    case "damage": return [
      { caption: "tutorial.ex.rollDamage", control: demoButton("damage"), press: true, skip: () => !document.querySelector(demoButton("damage")) },
      { caption: "tutorial.ex.clickApply", control: '.ruling-buttons [data-tutorial="damage"]', press: true },
    ];
    default: return [];
  }
}
