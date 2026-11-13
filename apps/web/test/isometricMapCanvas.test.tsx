// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MapCanvas } from "../src/pages/mapEditor/MapCanvas";
import { ISO_X } from "../src/board/mapProjection";
import { GRID, pointer, stubMapEditorEnvironment } from "./mapEditorHarness";

beforeEach(stubMapEditorEnvironment);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("places sight-preview markers in map coordinates on the isometric plane (FR-GM-02)", () => {
  const onPress = vi.fn();
  render(<MapCanvas map={{ url: "/map.png", width: 800, height: 600 }} grid={GRID}
    isometric mode="place" pan={false} label="Isometric preview" onPress={onPress}>{() => null}</MapCanvas>);
  const scale = Math.min(800 / (1400 * ISO_X), 600 / 700);
  pointer("pointerDown", screen.getByRole("application", { name: "Isometric preview" }), {
    x: 400 + 50 * ISO_X * scale, y: 300 + 75 * scale,
  });
  const point = onPress.mock.calls[0]![0] as { x: number; y: number };
  expect(point.x).toBeCloseTo(500);
  expect(point.y).toBeCloseTo(350);
});
