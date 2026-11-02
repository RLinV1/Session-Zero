// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MAP_ACCEPT, MAP_IMAGE_TYPES, MAP_IMPORT_TYPES } from "../src/net/mapFileTypes";
import { cropWalls, onCrop, toCrop } from "../src/pages/home/crops";
import { HOME_WALLS } from "../src/pages/home/homeWalls";
import { PrepareSection, WallsPanel } from "../src/pages/home/PrepareSection";

afterEach(cleanup);

/** Every coloured wall line the panel draws, as segments, in drawing order. */
function drawnSegments() {
  return [...document.querySelectorAll<SVGLineElement>("svg.walls-drawing line.wall-stroke")].map((l) => ({
    kind: l.dataset.kind,
    state: l.dataset.state,
    a: { x: Number(l.getAttribute("x1")), y: Number(l.getAttribute("y1")) },
    b: { x: Number(l.getAttribute("x2")), y: Number(l.getAttribute("y2")) },
  }));
}
const key = (s: { a: { x: number; y: number }; b: { x: number; y: number } }) => `${s.a.x},${s.a.y}-${s.b.x},${s.b.y}`;

describe("the prepare section (gm-home: The home page covers the four promises)", () => {
  it("lists the file types the library's map upload takes", () => {
    render(<PrepareSection />);
    for (const t of [...MAP_IMAGE_TYPES, ...MAP_IMPORT_TYPES]) {
      expect(screen.getByText(t.label, { selector: ".file-chip" })).toBeTruthy();
      expect(MAP_ACCEPT.split(",")).toContain(t.accept);
    }
  });

  it("has the grid demo and the walls panel", () => {
    render(<PrepareSection />);
    const slider = screen.getByRole("slider", { name: "Square size" }) as HTMLInputElement;
    expect(slider.value).toBe("70"); // opens lined up with the map's squares
    expect(screen.getByText("Lined up with the map's squares.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Walls, doors and windows" })).toBeTruthy();
  });
});

describe("the walls panel draws the inn's own walls (gm-home, FR-GM-09)", () => {
  it("draws exactly the segments the crop transform produces for every wall on the crop", () => {
    render(<WallsPanel />);
    const expected = HOME_WALLS["moor-inn"]!.map((w) => ({ a: toCrop("moor-inn", w.a), b: toCrop("moor-inn", w.b) })).filter(onCrop);
    const drawn = drawnSegments();
    expect(drawn.length).toBeGreaterThan(20);
    expect(drawn.map(key).sort()).toEqual(expected.map(key).sort());
  });

  it("draws what sight and movement run on, plus the open doors that stop neither", () => {
    render(<WallsPanel />);
    const drawn = drawnSegments();
    const open = drawn.filter((s) => s.state === "open");
    const windows = drawn.filter((s) => s.kind === "window");
    expect(open.length).toBeGreaterThan(0);
    expect(windows.length).toBeGreaterThan(0);
    // Movement stops at everything but an open door; sight also passes a window.
    expect(new Set(cropWalls("moor-inn", "movement").filter(onCrop).map(key))).toEqual(new Set(drawn.filter((s) => s.state !== "open").map(key)));
    expect(new Set(cropWalls("moor-inn").filter(onCrop).map(key))).toEqual(new Set(drawn.filter((s) => s.state !== "open" && s.kind !== "window").map(key)));
  });

  it("keys each kind it draws", () => {
    render(<WallsPanel />);
    const legend = screen.getByRole("list", { name: "Key to the drawing" });
    expect(legend.textContent).toBe("WallDoorWindowLocked");
    expect(new Set(drawnSegments().map((s) => s.kind))).toEqual(new Set(["wall", "door", "window"]));
    expect(document.querySelectorAll("svg.walls-drawing .portal-lock").length).toBeGreaterThan(0);
  });
});
