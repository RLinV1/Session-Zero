// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseDiceExpression } from "@vtt/shared";
import { areaShape, tokensTouchingArea } from "../src/board/tools";
import { AttackTile } from "../src/pages/home/AttackTile";
import { DiceTile, openingRoll } from "../src/pages/home/DiceTile";
import { PlaySection } from "../src/pages/home/PlaySection";
import { CROP_GRID } from "../src/pages/home/sightDemo";
import { TEMPLATE_START, TEMPLATE_TOKENS, TemplateTile } from "../src/pages/home/TemplateTile";
import TurnTile from "../src/pages/home/TurnTile";

/** Counts loads of the board's renderer: the preview stage is the attack tile's only way to it. */
const { stageLoaded } = vi.hoisted(() => ({ stageLoaded: vi.fn() }));
vi.mock("../src/ui/AnimationPreviewStage", () => {
  stageLoaded();
  return { AnimationPreviewStage: ({ children }: { children?: unknown }) => <div data-testid="preview-stage">{children as never}</div> };
});

/** Observers that fire only when the test scrolls something near. */
let observers: { callback: IntersectionObserverCallback; elements: Element[] }[] = [];
class ManualObserver {
  private entry: { callback: IntersectionObserverCallback; elements: Element[] };
  constructor(callback: IntersectionObserverCallback) {
    this.entry = { callback, elements: [] };
    observers.push(this.entry);
  }
  observe(el: Element) {
    this.entry.elements.push(el);
  }
  unobserve() {}
  disconnect() {
    this.entry.elements = [];
  }
}
function scrollNear(selector: string) {
  for (const o of observers) {
    const hits = o.elements.filter((el) => el.matches(selector));
    if (hits.length) o.callback(hits.map((target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry), o as never);
  }
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", ManualObserver);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const caughtNames = () => screen.getByRole("status").textContent;
const expected = (at: { x: number; y: number }, size: number) => {
  const names = tokensTouchingArea(areaShape("circle", at, at, size, CROP_GRID), TEMPLATE_TOKENS, CROP_GRID).map((t) => t.name);
  return names.length ? `Caught: ${names.join(", ")}.` : "Nobody is caught.";
};
const ringed = () => [...document.querySelectorAll(".token-chip.is-caught .token-label")].map((e) => e.textContent).sort();

describe("the play grid (gm-home: The home page covers the four promises)", () => {
  it("has the sight stage and exactly five tiles", () => {
    render(<PlaySection />);
    const tiles = document.querySelectorAll(".play-tile");
    expect(tiles).toHaveLength(5);
    expect([...tiles].map((t) => t.querySelector("h4")?.textContent)).toEqual(["Area templates", "Dice", "Attacks", "Turn order", "Conditions"]);
    expect(screen.getByRole("heading", { name: "They only see what their torch reaches." })).toBeTruthy();
  });
});

describe("area templates use the table's shapes and count (gm-home, FR-TAC-06)", () => {
  it("marks as caught exactly the tokens tokensTouchingArea counts, wherever it is aimed and at any size", () => {
    render(<TemplateTile />);
    expect(caughtNames()).toBe(expected(TEMPLATE_START, 15));
    expect(caughtNames()).toBe("Caught: Goblin, Goblin archer, Wolf.");
    const stage = screen.getByRole("group", { name: /Template on the map/ });
    // Three squares west and one south: the sphere reaches the party instead.
    for (const key of ["ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowDown"]) fireEvent.keyDown(stage, { key });
    const moved = { x: TEMPLATE_START.x - 3 * 70, y: TEMPLATE_START.y + 70 };
    expect(caughtNames()).toBe(expected(moved, 15));
    fireEvent.click(screen.getByRole("button", { name: "20 ft" }));
    expect(caughtNames()).toBe(expected(moved, 20));
    fireEvent.click(screen.getByRole("button", { name: "10 ft" }));
    expect(caughtNames()).toBe(expected(moved, 10));
    expect(ringed()).toEqual(tokensTouchingArea(areaShape("circle", moved, moved, 10, CROP_GRID), TEMPLATE_TOKENS, CROP_GRID).map((t) => t.name).sort());
  });
});

describe("placing the area template (gm-home: Area templates use the table's shapes)", () => {
  it("stays put while the pointer passes over, goes where it is clicked, and follows a drag", () => {
    // jsdom has no PointerEvent; a MouseEvent carries the position and buttons the tile reads.
    vi.stubGlobal(
      "PointerEvent",
      class extends MouseEvent {
        pointerId: number;
        constructor(type: string, init: PointerEventInit = {}) {
          super(type, init);
          this.pointerId = init.pointerId ?? 1;
        }
      },
    );
    render(<TemplateTile />);
    const stage = screen.getByRole("group", { name: /Template on the map/ });
    // The view is 16 x 9 squares from row 1: shown at 70 px a square, a screen pixel is a crop pixel, 70 down.
    stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1120, height: 630, right: 1120, bottom: 630, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const centre = () => {
      const c = document.querySelector(".template-area .template-centre")!;
      return { x: Number(c.getAttribute("cx")), y: Number(c.getAttribute("cy")) };
    };
    fireEvent.pointerMove(stage, { clientX: 142, clientY: 418, buttons: 0 });
    expect(centre()).toEqual(TEMPLATE_START);
    fireEvent.pointerDown(stage, { clientX: 142, clientY: 418, buttons: 1 });
    expect(centre()).toEqual({ x: 140, y: 490 }); // the nearest intersection
    expect(caughtNames()).toBe(expected({ x: 140, y: 490 }, 15));
    fireEvent.pointerMove(stage, { clientX: 352, clientY: 278, buttons: 1 });
    expect(centre()).toEqual({ x: 350, y: 350 });
    fireEvent.pointerUp(stage, { clientX: 352, clientY: 278, buttons: 0 });
    fireEvent.pointerMove(stage, { clientX: 900, clientY: 100, buttons: 0 });
    expect(centre()).toEqual({ x: 350, y: 350 });
  });
});

describe("dice run the table's engine (gm-home: Dice open on a result)", () => {
  it("opens on a settled roll made by the shared roller, then rolls what is typed", () => {
    render(<DiceTile />);
    const opening = openingRoll();
    expect(opening.dice).toHaveLength(2);
    expect(document.querySelector(".dice-total")!.textContent).toBe(String(opening.total));
    expect(screen.queryByText("Rolling…")).toBeNull();
    fireEvent.change(screen.getByLabelText("What to roll"), { target: { value: "nonsense" } });
    fireEvent.click(screen.getByRole("button", { name: "Roll" }));
    const parsed = parseDiceExpression("nonsense");
    expect(parsed.ok).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe(!parsed.ok ? parsed.message : "");
  });
});

describe("attacks load the board's renderer only near the viewport (gm-home: The board's renderer is not loaded up front)", () => {
  it("holds the stage's place and fetches nothing until the tile nears the viewport", async () => {
    render(<AttackTile />);
    await act(async () => {});
    expect(stageLoaded).not.toHaveBeenCalled();
    expect(document.querySelector(".attack-placeholder")).toBeTruthy();
    await act(async () => scrollNear(".attack-slot"));
    expect(await screen.findByTestId("preview-stage")).toBeTruthy();
    expect(stageLoaded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox", { name: "Animation" })).toBeTruthy();
  });

  it("shows a still of the stage under reduced motion, and never fetches the renderer", async () => {
    vi.resetModules();
    stageLoaded.mockClear();
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
    const { AttackTile: Tile } = await import("../src/pages/home/AttackTile");
    render(<Tile />);
    await act(async () => scrollNear(".attack-slot"));
    const still = screen.getByRole("img", { name: /fireball/ });
    expect(still.getAttribute("src")).toBe("/img/home/attack-still.webp");
    expect(stageLoaded).not.toHaveBeenCalled();
  });
});

describe("turn order runs the table's rules (gm-home, FR-GM-21)", () => {
  it("advances with Next turn through decide, and gives Mara's player the table's turn notice", () => {
    render(<TurnTile />);
    const active = () => document.querySelector(".turn-order [aria-current='true'] .turn-name")!.textContent;
    expect(active()).toBe("Goblin boss");
    expect(screen.queryByText(/turn\.$/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next turn" }));
    expect(active()).toBe("Mara");
    expect(document.querySelector(".turn-notice")!.textContent).toContain("It's Mara's turn.");
    fireEvent.click(screen.getByRole("button", { name: "Next turn" }));
    fireEvent.click(screen.getByRole("button", { name: "Next turn" }));
    fireEvent.click(screen.getByRole("button", { name: "Next turn" }));
    expect(active()).toBe("Goblin boss");
    expect(document.querySelector(".turn-bar .readout")!.textContent).toBe("Round 2");
  });
});

describe("conditions use the table's markers (FR-TAC-08)", () => {
  it("puts a condition's marker on the token when it is turned on", () => {
    render(<PlaySection />);
    const tile = document.querySelector<HTMLElement>(".tile-conditions")!;
    const markers = () => [...tile.querySelectorAll(".condition-markers [role='img']")].map((m) => m.getAttribute("aria-label"));
    expect(markers()).toEqual(["Poisoned", "Prone"]);
    const stunned = within(tile).getByRole("button", { name: "Stunned" });
    fireEvent.click(stunned);
    expect(stunned.getAttribute("aria-pressed")).toBe("true");
    expect(markers()).toEqual(["Poisoned", "Prone", "Stunned"]);
  });
});
