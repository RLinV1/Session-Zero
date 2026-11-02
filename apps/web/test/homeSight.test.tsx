// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { inSight } from "@vtt/shared";
import { DIMMED_ALPHA, sightColor } from "../src/board/sightMask";
import { MAPS, cropTransform, cropWalls, fromCrop, toCrop } from "../src/pages/home/crops";
import { HOME_WALLS } from "../src/pages/home/homeWalls";
import { litArea, moveTo, squareCenter } from "../src/pages/home/sightDemo";
import { SightStage } from "../src/pages/home/SightStage";

afterEach(cleanup);

describe("the home page's line of sight runs the table's rules (gm-home, FR-GM-19)", () => {
  it("places a crop where scripts/home-maps.mjs cut it, on each axis", () => {
    // The script logs: "sun-tomb: crop at (140, 70) x1.0938 y1.0938", "forge-hall: crop at (254, 136) x1.2411 y1.2174".
    expect(cropTransform("sun-tomb")).toEqual({ scaleX: 70 / 64, scaleY: 70 / 64, left: 140, top: 70 });
    const forge = cropTransform("forge-hall");
    expect(forge).toMatchObject({ left: 254, top: 136 });
    expect(forge.scaleX).toBeCloseTo(70 / 56.4, 9);
    expect(forge.scaleY).toBeCloseTo(70 / 57.5, 9);
  });

  it("puts a known wall endpoint on its expected crop pixel, and back", () => {
    const wall = HOME_WALLS["sun-tomb"]![0]!;
    expect(wall.a).toEqual({ x: 111, y: 299 });
    const onCrop = toCrop("sun-tomb", wall.a);
    expect(onCrop.x).toBeCloseTo(111 * (70 / 64) - 140, 9);
    expect(onCrop.y).toBeCloseTo(299 * (70 / 64) - 70, 9);
    const back = fromCrop("sun-tomb", onCrop);
    expect(back.x).toBeCloseTo(111, 9);
    expect(back.y).toBeCloseTo(299, 9);
  });

  it("leaves the side chamber dark past its doorway and lights the hall", () => {
    const lit = litArea(cropWalls("sun-tomb"), squareCenter(16, 5));
    expect(inSight([lit], squareCenter(18, 1))).toBe(false); // in the chamber, behind its wall
    expect(inSight([lit], squareCenter(13, 8))).toBe(true); // across the hall
  });

  it("refuses a move onto a wall, as the table refuses a player's", () => {
    const walls = cropWalls("sun-tomb", "movement");
    // Row 4 is the hall's north wall.
    expect(moveTo(walls, squareCenter(16, 5), squareCenter(16, 4))).toEqual({ at: squareCenter(16, 5), refused: "wall" });
    expect(moveTo(walls, squareCenter(16, 5), squareCenter(16, 6))).toEqual({ at: squareCenter(16, 6), refused: null });
  });
});

describe("the line-of-sight stage (gm-home: Line of sight is operable, Visibility is shown from both sides)", () => {
  const lead = () => screen.getByRole("button", { name: /Nalani, carrying the torch/ });

  it("moves the torch bearer one square with an arrow key", () => {
    render(<SightStage />);
    expect(parseFloat(lead().style.left)).toBeCloseTo(82.5, 6); // square (16, 5)
    fireEvent.keyDown(lead(), { key: "ArrowLeft" });
    expect(parseFloat(lead().style.left)).toBeCloseTo(77.5, 6); // square (15, 5)
    expect(parseFloat(lead().style.top)).toBeCloseTo(((5.5 * 70) / 788) * 100, 6);
  });

  it("says so when a wall stops the move, and stays put", () => {
    render(<SightStage />);
    fireEvent.keyDown(lead(), { key: "ArrowUp" }); // (16, 4) is the hall's north wall
    expect(screen.getByRole("status").textContent).toBe("A wall is in the way.");
    expect(parseFloat(lead().style.left)).toBeCloseTo(82.5, 6);
  });

  it("dims the map outside sight with the board's own darkness for that map, and only in the player view", () => {
    const { container } = render(<SightStage />);
    const dim = container.querySelector(".sight-fog.is-player .sight-dim")!;
    const [r, g, b] = sightColor(MAPS.visibility.average);
    expect(dim.getAttribute("fill")).toBe(`rgb(${r}, ${g}, ${b})`);
    expect(Number(dim.getAttribute("opacity"))).toBe(DIMMED_ALPHA);
    expect(DIMMED_ALPHA).toBeLessThan(1); // dimmed, not hidden: the tomb's layout shows
    fireEvent.click(screen.getByRole("button", { name: "GM view" }));
    expect(container.querySelector(".sight-dim")).toBeNull(); // the GM sees the whole map
  });

  it("shows the hidden guardian to the GM and nothing to players", () => {
    const { container } = render(<SightStage />);
    expect(container.querySelector(".token-chip.is-hidden")).toBeNull();
    expect(container.querySelector(".sight-fog.is-player")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "GM view" }));
    expect(container.querySelector(".token-chip.is-hidden")?.textContent).toBe("Guardian (hidden)");
    expect(container.querySelector(".sight-edge")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Player view" }));
    expect(container.querySelector(".token-chip.is-hidden")).toBeNull();
  });
});
