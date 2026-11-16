import type { GridSpec, Point } from "@vtt/shared";
import { t } from "../i18n/locale";
import { EXAMPLE_SIGHT_EVENT, exampleBoard, exampleCommands, exampleCorner, key, type ExampleApi, type ExampleSub, type SightExample } from "./tutorialExample";

const tool = (name: string) => `[data-tutorial-tool="${name}"]`;
const demoButton = (name: string) => `.guest-tutorial [data-demo="${name}"]`;
const sight = (detail: SightExample) => () => void window.dispatchEvent(new CustomEvent<SightExample>(EXAMPLE_SIGHT_EVENT, { detail }));
const attr = (selector: string, name: string, value: string) => document.querySelector(selector)?.getAttribute(name) === value;

/**
 * The sub-steps of a lesson's Show me, in order. The editor ones press the real tool buttons and
 * send the draft commands those tools send, so they end with what the tools make; the others point
 * at the lesson's control (and press it where the lesson's own demo does the work).
 */
export function exampleScript(step: string, grid: GridSpec, map: { width: number; height: number }): ExampleSub[] {
  const { c0, r0 } = exampleCorner(grid, map);
  const at = (col: number, row: number): Point => ({ x: grid.offsetX + col * grid.cellSize, y: grid.offsetY + row * grid.cellSize });
  const centre = (col: number, row: number): Point => at(col + 0.5, row + 0.5);
  const A = at(c0, r0), B = at(c0 + 5, r0), C = at(c0 + 5, r0 + 3);
  const paint = (col: number, row: number, kind: "difficult" | "blocked" | null) => (api: ExampleApi) =>
    void api.command({ type: "terrain.paint", layerId: "base", context: api.draft()?.terrainContext ?? { boardEpoch: 0, revision: 0 }, paint: [{ row, start: col, end: col, kind }] });
  switch (step) {
    case "walls": return [
      { caption: "tutorial.ex.pickDraw", control: tool("draw"), press: true },
      { caption: "tutorial.ex.clickHere", at: A, click: true },
      { caption: "tutorial.ex.clickThere", at: B, click: true, run: (api) => void api.command({ type: "wall.add", walls: [{ a: A, b: B }] }) },
      { caption: "tutorial.ex.clickCorner", at: C, click: true, run: (api) => void api.command({ type: "wall.add", walls: [{ a: B, b: C }] }) },
      { caption: "tutorial.ex.pickDoor", control: tool("portal"), press: true },
      { caption: "tutorial.ex.clickWall", at: { x: B.x, y: (B.y + C.y) / 2 }, click: true, run: async (api) => {
        const wall = Object.values(api.draft()?.walls ?? {}).reverse().find((w) => key(w.a, w.b) === key(B, C));
        if (wall) await api.command({ type: "portal.set", wallId: wall.id, portal: { kind: "door", state: "closed" } });
      } },
    ];
    case "fog": return [
      { caption: "tutorial.ex.pickRect", control: tool("rect"), press: true },
      { caption: "tutorial.ex.dragArea", from: at(c0, r0), at: at(c0 + 5, r0 + 4), run: (api) => void api.command({ type: "fog.add", region: { shape: "rect", from: at(c0, r0), to: at(c0 + 5, r0 + 4) } }) },
      { caption: "tutorial.ex.playerView", control: tool("playerview"), press: true, skip: () => attr(tool("playerview"), "aria-pressed", "true") },
    ];
    case "terrain": return [
      { caption: "tutorial.ex.pickDifficult", control: tool("difficult"), press: true },
      { caption: "tutorial.ex.paintCell", at: centre(c0, r0), click: true, run: paint(c0, r0, "difficult") },
      { caption: "tutorial.ex.paintNext", at: centre(c0 + 1, r0), click: true, run: paint(c0 + 1, r0, "difficult") },
      { caption: "tutorial.ex.pickBlocked", control: tool("blocked"), press: true },
      { caption: "tutorial.ex.paintCell", at: centre(c0, r0 + 1), click: true, run: paint(c0, r0 + 1, "blocked") },
      { caption: "tutorial.ex.paintNext", at: centre(c0 + 1, r0 + 1), click: true, run: paint(c0 + 1, r0 + 1, "blocked") },
      { caption: "tutorial.ex.pickEraser", control: tool("normal"), press: true },
      { caption: "tutorial.ex.eraseCell", at: centre(c0 + 1, r0 + 1), click: true, run: paint(c0 + 1, r0 + 1, null) },
    ];
    case "sight": return [
      // A wall and a door first, so the view has something to stop at.
      { caption: "tutorial.ex.wallsBlock", at: A, run: async (api) => { for (const command of exampleCommands("walls", api.draft()!, grid, map).filter((command) => command.type === "wall.add")) await api.command(command); } },
      { caption: "tutorial.ex.addTest", control: tool("sight-add"), at: centre(c0 + 2, r0 + 1), click: true, run: sight({ op: "place", at: centre(c0 + 2, r0 + 1) }) },
      { caption: "tutorial.ex.losOn", control: tool("sight-on"), press: true, skip: () => attr(tool("sight-on"), "aria-checked", "true") },
      { caption: "tutorial.ex.moveTest", from: centre(c0 + 2, r0 + 1), at: centre(c0 + 3, r0 + 2), click: true, run: sight({ op: "move", dx: 1, dy: 1 }) },
    ];
    case "grid": {
      const size = document.querySelector<HTMLInputElement>(`${tool("grid-cellSize")} input`)?.value ?? String(grid.cellSize);
      const offset = document.querySelector<HTMLInputElement>(`${tool("grid-offsetX")} input`)?.value ?? String(grid.offsetX);
      return [
        { caption: "tutorial.ex.gridSize", control: `${tool("grid-cellSize")} input`, input: String(Math.min(2000, Number(size) * 1.2)) },
        { caption: "tutorial.ex.gridSize", control: `${tool("grid-cellSize")} input`, input: size },
        { caption: "tutorial.ex.gridOffset", control: `${tool("grid-offsetX")} input`, input: String(Number(offset) + grid.cellSize / 4) },
        { caption: "tutorial.ex.gridOffset", control: `${tool("grid-offsetX")} input`, input: offset },
      ];
    }
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
