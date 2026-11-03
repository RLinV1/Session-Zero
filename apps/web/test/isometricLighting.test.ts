import { describe, expect, it } from "vitest";
import { blocksLight, cameraOccludes, findPath, isWalkable, project, unproject, type Building } from "../src/lighting/isometric";
const building: Building = { id: "apartment", x: 4, y: 4, width: 3, depth: 4, height: 3, color: [100, 80, 60] };
describe("isometric lighting geometry", () => {
  it("round-trips ground coordinates at every camera turn", () => {
    for (let turn = 0; turn < 4; turn++) for (const p of [{ x: 0.5, y: 0.5 }, { x: 13.5, y: 7.5 }, { x: 19.5, y: 19.5 }]) {
      const actual = unproject(project({ ...p, z: 0 }, turn), turn);
      expect(actual.x).toBeCloseTo(p.x, 8); expect(actual.y).toBeCloseTo(p.y, 8);
    }
  });
  it("blocks low light but lets rays above the roof pass", () => {
    expect(blocksLight({ x: 2, y: 6, z: 1 }, { x: 9, y: 6, z: 1 }, building)).toBe(true);
    expect(blocksLight({ x: 2, y: 6, z: 5 }, { x: 9, y: 6, z: 5 }, building)).toBe(false);
    expect(blocksLight({ x: 2, y: 2, z: 1 }, { x: 9, y: 2, z: 1 }, building)).toBe(false);
  });
  it("changes the ground shadow as the moving torch changes sides", () => {
    const floor = { x: 8, y: 6, z: 0.02 };
    expect(blocksLight(floor, { x: 2, y: 6, z: 1.5 }, building)).toBe(true);
    expect(blocksLight(floor, { x: 9, y: 6, z: 1.5 }, building)).toBe(false);
  });
  it("shortens a building shadow as the light rises", () => {
    const floor = { x: 10, y: 6, z: 0.02 };
    expect(blocksLight(floor, { x: 2, y: 6, z: 1.5 }, building)).toBe(true);
    expect(blocksLight(floor, { x: 2, y: 6, z: 10 }, building)).toBe(false);
  });
  it("hides a pole behind a foreground roof while allowing its visible top", () => {
    const copper: Building = { ...building, x: 2, y: 2, width: 5, depth: 4, height: 3.4 };
    expect(cameraOccludes({ x: 8, y: 7.5, z: 1 }, 2, [copper])).toBe(true);
    expect(cameraOccludes({ x: 8, y: 7.5, z: 2.25 }, 2, [copper])).toBe(false);
    expect(cameraOccludes({ x: 8, y: 7.5, z: 1 }, 0, [copper])).toBe(false);
  });
  it("routes around apartments instead of through their walls", () => {
    const path = findPath({ x: 2.5, y: 5.5 }, { x: 8.5, y: 5.5 }, [building]);
    expect(path.at(-1)).toEqual({ x: 8.5, y: 5.5 });
    let previous = { x: 2.5, y: 5.5 };
    for (const point of path) {
      expect(isWalkable(point, [building])).toBe(true);
      expect(Math.abs(previous.x - point.x) + Math.abs(previous.y - point.y)).toBe(1);
      previous = point;
    }
    expect(findPath(previous, { x: 5.5, y: 5.5 }, [building])).toEqual([]);
  });
});
