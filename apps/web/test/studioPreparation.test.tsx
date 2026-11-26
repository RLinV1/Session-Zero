// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneStudio } from "../src/studio/SceneStudio";
import { studioChanges } from "../src/studio/StudioDiff";
import type { StudioRevisionView } from "@vtt/shared";
import { preparationFixture, STUDIO_ART_ID, STUDIO_MAP_ID } from "./studioPreparationFixture";
import { stubMapEditorEnvironment } from "./mapEditorHarness";

beforeEach(() => stubMapEditorEnvironment());
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const media = { [STUDIO_MAP_ID]: "data:image/webp;base64,bWFw", [STUDIO_ART_ID]: "data:image/webp;base64,YXJ0" };

function savedRevision(): StudioRevisionView {
  return { scene: preparationFixture().scene, objects: [], target: { mapKey: "chapel", encounterKey: "sentries" },
    revision: { id: "44444444-4444-4444-8444-444444444444", parentId: null, actor: "owner", at: "2026-11-17T00:00:00Z" } };
}

describe("saved preparation shared renderer (FR-GM-27)", () => {
  it("draws canonical source/effective openings, clipped edge Base terrain and native tiny-token centers", () => {
    const snapshot = preparationFixture();
    const { container, getByText } = render(<SceneStudio snapshot={snapshot} media={media} locale="en" onContext={vi.fn()} />);
    expect(container.querySelector('[data-testid="studio-source-image"]')?.getAttribute("href")).toBe(media[STUDIO_MAP_ID]);
    expect(container.querySelectorAll('[data-layer="walls"]>g')).toHaveLength(2);
    expect(container.querySelector('[data-kind="door"]')?.getAttribute("data-portal-state")).toBe("open");
    expect(container.querySelectorAll('[data-terrain="difficult"]')).toHaveLength(2);
    expect(container.querySelector('[data-terrain="difficult"] rect')?.getAttribute("x")).toBe("-40");
    expect(container.querySelector('[data-layer="terrain"]')?.parentElement?.getAttribute("clip-path")).toContain("bounds");
    const token = container.querySelector('[data-token-index="0"]')!;
    expect(token.getAttribute("data-hidden")).toBe("true");
    expect(token.querySelector("circle")?.getAttribute("cx")).toBe(String(snapshot.scene.tokens[0]!.center!.x));
    expect(token.querySelector("image")?.getAttribute("href")).toBe(media[STUDIO_ART_ID]);
    expect(getByText("Grid awaiting confirmation; inspect it here before owner review.")).toBeTruthy();
    expect(getByText("Unclear archway", { selector: "li" })).toBeTruthy();
  });

  it("retains camera and focused layer control after a saved batch, refused save and language switch", () => {
    const snapshot = preparationFixture();
    const onContext = vi.fn();
    const view = render(<SceneStudio snapshot={snapshot} media={media} locale="en" onContext={onContext} />);
    const svg = view.getByTestId("studio-map");
    fireEvent.keyDown(svg, { key: "+" }); fireEvent.keyDown(svg, { key: "ArrowRight" });
    const camera = svg.getAttribute("viewBox");
    const checkbox = view.getByRole("checkbox", { name: "Walls and openings" });
    act(() => checkbox.focus());
    const next = structuredClone(snapshot);
    next.scene.walls.push({ id: "wall-new", a: { x: 100, y: 100 }, b: { x: 200, y: 100 } });
    next.outcomes.push({ id: "44444444-4444-4444-8444-444444444444", at: "2026-11-17T00:00:00Z", operation: "setup", targetKey: "chapel", status: "refused", code: "permission" });
    view.rerender(<SceneStudio snapshot={next} media={media} locale="en" onContext={onContext} />);
    expect(view.getByTestId("studio-map")).toBe(svg);
    expect(svg.getAttribute("viewBox")).toBe(camera);
    expect(document.activeElement).toBe(checkbox);
    expect(view.container.querySelectorAll('[data-layer="walls"]>g')).toHaveLength(3);
    expect(view.getAllByText(/Refused by owner permissions/)).toHaveLength(2);
    view.rerender(<SceneStudio snapshot={next} media={media} locale="zh-TW" onContext={onContext} />);
    expect(svg.getAttribute("viewBox")).toBe(camera);
    expect(document.activeElement).toBe(checkbox);
    expect(view.getByRole("checkbox", { name: "牆與開口" })).toBe(checkbox);
    expect(view.getAllByText(/擁有者權限拒絕/)).toHaveLength(2);
  });

  it("switches explicit context without moving data and only lists encounters for that map", async () => {
    const snapshot = preparationFixture();
    const onContext = vi.fn(async () => {});
    const { getByRole, queryByRole } = render(<SceneStudio snapshot={snapshot} media={media} locale="en" onContext={onContext} />);
    expect(queryByRole("option", { name: "Guards" })).toBeNull();
    await act(async () => { fireEvent.change(getByRole("combobox", { name: "Active map" }), { target: { value: "map:courtyard" } }); });
    expect(onContext).toHaveBeenCalledWith({ sourceFileId: STUDIO_MAP_ID, mapKey: "courtyard", encounterKey: null });
    expect(snapshot.context.mapKey).toBe("chapel");
    expect(snapshot.scene.tokens[0]?.square).toEqual({ column: 1, row: 1 });
  });

  it("retains terrain metadata but never paints it onto a changed grid, and explains detector failure", () => {
    const snapshot = preparationFixture();
    snapshot.scene.terrainState = "otherGrid";
    snapshot.scene.detection = { status: "error", suggestion: null, error: "execution_failed", attempt: 3 };
    const { container, getByText } = render(<SceneStudio snapshot={snapshot} media={media} locale="en" onContext={vi.fn()} />);
    expect(container.querySelector("[data-terrain]")).toBeNull();
    expect(getByText(/Saved terrain belongs to a different grid/)).toBeTruthy();
    expect(getByText(/Retrying the connection does not rerun detection/)).toBeTruthy();
    expect(snapshot.scene.terrain).toHaveLength(2);
  });

  it("describes a revised grid and places an erased cropped cell on its original grid", () => {
    const base = savedRevision();
    base.scene.terrain = [{ row: 0, start: -1, end: -1, kind: "difficult" }];
    const next: StudioRevisionView = { ...base, scene: { ...base.scene, grid: { ...base.scene.grid!, offsetX: 30 }, terrain: [] } };
    const changes = studioChanges(base, next, "en");
    expect(changes).toContainEqual(expect.objectContaining({ label: "Grid changed" }));
    expect(changes).toContainEqual(expect.objectContaining({ label: "1 terrain cell · Difficult → Normal",
      cells: [{ minX: -40, minY: 5, maxX: 10, maxY: 55 }] }));
    next.scene.terrain = base.scene.terrain;
    expect(studioChanges(base, next, "zh-TW").map(({ label }) => label)).toEqual(["格線已變更", "基礎地形使用不同的格線。"]);
  });

  it("reports an imported portal's review flag without reporting a portal-state change", () => {
    const door = { id: STUDIO_MAP_ID, layer: "geometry", kind: "door", state: "open", bounds: { minX: 60, minY: 5, maxX: 110, maxY: 5 } } as const;
    const base = { ...savedRevision(), objects: [door] };
    const next = { ...base, objects: [{ ...door, label: "Check the hinge." }] };
    expect(studioChanges(base, next, "en").map(({ label }) => label)).toEqual(["Flagged Door for review · Check the hinge."]);
  });

  it("keeps read-authorized saved content after a refused context action and exposes protected preview failure", async () => {
    const snapshot = preparationFixture();
    const { getByRole, getByTestId, getByText } = render(<SceneStudio snapshot={snapshot} media={media} locale="en" onContext={vi.fn(async () => { throw new Error("refused"); })} />);
    await act(async () => { fireEvent.change(getByRole("combobox", { name: "Active encounter" }), { target: { value: "" } }); });
    expect(getByRole("alert").textContent).toContain("Could not change the active context");
    expect(getByTestId("studio-map")).toBeTruthy();
    fireEvent.error(getByTestId("studio-source-image"));
    expect(getByText("The protected preview is unavailable. Retry the connection to load it.")).toBeTruthy();
  });
});
