import { describe, expect, it } from "vitest";
import { doorsTarget } from "../src/board/tools";
import { DEFAULT_TOOL_OPTIONS, toolFor, type ToolOptions } from "../src/ui/ToolRail";

describe("Terrain and Doors rail tools (board-terrain-tool, board-doors-tool)", () => {
  it("builds each tool from its remembered options", () => {
    const options: ToolOptions = { ...DEFAULT_TOOL_OPTIONS, terrain: { shape: "rect", paint: null }, doors: { mode: "lock" } };
    expect(toolFor("terrain", options)).toEqual({ kind: "terrain", shape: "rect", paint: null });
    expect(toolFor("doors", options)).toEqual({ kind: "doors", mode: "lock" });
  });

  it("falls back to defaults for options saved before the tools existed", () => {
    const old = { draw: DEFAULT_TOOL_OPTIONS.draw, area: DEFAULT_TOOL_OPTIONS.area, fog: DEFAULT_TOOL_OPTIONS.fog, measure: DEFAULT_TOOL_OPTIONS.measure } as unknown as ToolOptions;
    expect(toolFor("terrain", old)).toEqual({ kind: "terrain", shape: "brush", paint: "difficult" });
    expect(toolFor("doors", old)).toEqual({ kind: "doors", mode: "toggle" });
  });
});

describe("what a Doors-tool click does (board-doors-tool, FR-GM-18)", () => {
  it("Open/Close opens closed and locked portals and closes open ones", () => {
    expect(doorsTarget("toggle", "closed")).toBe("open");
    expect(doorsTarget("toggle", "locked")).toBe("open");
    expect(doorsTarget("toggle", "open")).toBe("closed");
  });

  it("Lock/Unlock locks open and closed portals and unlocks locked ones to closed", () => {
    expect(doorsTarget("lock", "open")).toBe("locked");
    expect(doorsTarget("lock", "closed")).toBe("locked");
    expect(doorsTarget("lock", "locked")).toBe("closed");
  });
});
