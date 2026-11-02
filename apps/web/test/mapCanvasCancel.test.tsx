// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapCanvas } from "../src/pages/mapEditor/MapCanvas";
import { GRID, stubMapEditorEnvironment } from "./mapEditorHarness";

beforeEach(() => stubMapEditorEnvironment());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("MapCanvas pointercancel (FR-GM-19)", () => {
  it("cancels the press in progress, so a Sight token drag does not stay stuck", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <MapCanvas map={{ url: "/m.png", width: 800, height: 600 }} grid={GRID} mode="view" pan={false} label="Map" onCancel={onCancel}>{() => null}</MapCanvas>,
    );
    const svg = container.querySelector("svg")!;
    fireEvent.pointerCancel(svg, { pointerId: 1 });
    expect(onCancel).not.toHaveBeenCalled(); // nothing was pressed
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1 });
    fireEvent.pointerCancel(svg, { pointerId: 1 });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
