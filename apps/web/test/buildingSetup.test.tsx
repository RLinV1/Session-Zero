// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { IsometricBuilding } from "@vtt/shared";
import { BuildingSetup } from "../src/pages/mapEditor/BuildingSetup";
import { click, GRID, pointer, stubMapEditorEnvironment } from "./mapEditorHarness";

beforeEach(stubMapEditorEnvironment);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Setup({ initial = [] }: { initial?: IsometricBuilding[] }) {
  const [buildings, setBuildings] = useState<IsometricBuilding[]>(initial);
  return <BuildingSetup map={{ url: "/map.png", width: 800, height: 600 }} grid={GRID} buildings={buildings} onChange={setBuildings} />;
}

it("outlines an uploaded building and raises its textured roof by dragging (FR-GM-02)", () => {
  render(<Setup />);
  const canvas = screen.getByRole("application");
  for (const point of [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }]) click(canvas, point);
  fireEvent.click(screen.getByRole("button", { name: "Finish outline" }));
  const height = screen.getByRole("spinbutton", { name: "Building height (ft)" }) as HTMLInputElement;
  expect(height.valueAsNumber).toBe(7.5);
  const roof = screen.getByRole("button", { name: /^Building 1, height/ });
  pointer("pointerDown", roof, { x: 400, y: 300 });
  pointer("pointerMove", screen.getByRole("application"), { x: 400, y: 200 });
  pointer("pointerUp", screen.getByRole("application"), { x: 400, y: 200 });
  expect(height.valueAsNumber).toBeGreaterThan(7.5);
  fireEvent.change(height, { target: { value: "15" } });
  expect(screen.getByRole("button", { name: /^Building 1, height 3 squares/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Remove building" }));
  expect(screen.queryByRole("spinbutton", { name: "Building height (ft)" })).toBeNull();
});

it("selects an existing footprint without adding a corner after pointer capture", () => {
  render(<Setup initial={[{ id: "house", name: "House", height: 2, footprint: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 300 }, { x: 100, y: 300 }] }]} />);
  fireEvent.click(screen.getByRole("button", { name: "Outline map" }));
  const canvas = screen.getByRole("application");
  pointer("pointerDown", canvas.querySelector("[data-building-id]")!, { x: 200, y: 200 });
  pointer("pointerUp", canvas, { x: 200, y: 200 });
  expect(screen.queryByText(/1 corners/)).toBeNull();
  expect((screen.getByRole("spinbutton", { name: "Building height (ft)" }) as HTMLInputElement).valueAsNumber).toBe(10);
});
