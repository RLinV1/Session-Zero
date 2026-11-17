// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioSnapshot } from "@vtt/shared";
const studio = vi.hoisted(() => ({ snapshot: vi.fn(), context: vi.fn() }));
vi.mock("../src/net/api", async (original) => ({ ...(await original<typeof import("../src/net/api")>()), api: { studio } }));
import { StudioWebsite } from "../src/studio/StudioWebsite";
import { preparationFixture, STUDIO_BUILD_ID, STUDIO_MAP_ID } from "./studioPreparationFixture";
import { stubMapEditorEnvironment } from "./mapEditorHarness";

beforeEach(() => {
  stubMapEditorEnvironment(); vi.useFakeTimers();
  studio.snapshot.mockReset(); studio.context.mockReset();
  studio.snapshot.mockResolvedValue(preparationFixture()); studio.context.mockResolvedValue({});
  Object.defineProperty(document, "hidden", { value: false, configurable: true });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tick = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

describe("website saved Studio adapter (FR-GM-27)", () => {
  it("polls actual saved data without replacing the camera/focus and pauses hidden/teardown work", async () => {
    const view = render(<StudioWebsite buildId={STUDIO_BUILD_ID} files={[]} />);
    await tick(0);
    const svg = view.getByTestId("studio-map");
    fireEvent.keyDown(svg, { key: "+" });
    const camera = svg.getAttribute("viewBox");
    const layer = view.getByRole("checkbox", { name: "Base terrain" });
    act(() => layer.focus());
    const saved = preparationFixture(); saved.scene.walls.push({ id: "new-wall", a: { x: 300, y: 5 }, b: { x: 400, y: 5 } });
    studio.snapshot.mockResolvedValue(saved);
    await tick(5000);
    expect(view.container.querySelectorAll('[data-layer="walls"]>g')).toHaveLength(3);
    expect(svg.getAttribute("viewBox")).toBe(camera);
    expect(document.activeElement).toBe(layer);
    expect(studio.snapshot).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "hidden", { value: true });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(20_000);
    expect(studio.snapshot).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, "hidden", { value: false });
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await tick(0);
    expect(studio.snapshot).toHaveBeenCalledTimes(3);
    view.unmount(); await tick(10_000);
    expect(studio.snapshot).toHaveBeenCalledTimes(3);
  });

  it("pauses failures until explicit Retry while retaining the last saved scene", async () => {
    const view = render(<StudioWebsite buildId={STUDIO_BUILD_ID} files={[]} />);
    await tick(0);
    studio.snapshot.mockRejectedValue(new Error("offline"));
    await tick(5000);
    expect(view.getByTestId("studio-map")).toBeTruthy();
    expect(view.getByText(/last saved view; retry/)).toBeTruthy();
    await tick(20_000); act(() => window.dispatchEvent(new Event("focus"))); await tick(0);
    expect(studio.snapshot).toHaveBeenCalledTimes(2);
    studio.snapshot.mockResolvedValue(preparationFixture());
    fireEvent.click(view.getByRole("button", { name: "Retry connection" })); await tick(0);
    expect(studio.snapshot).toHaveBeenCalledTimes(3);
    expect(view.queryByText(/last saved view; retry/)).toBeNull();
  });

  it("rejects an old in-flight snapshot after explicit context selection", async () => {
    const view = render(<StudioWebsite buildId={STUDIO_BUILD_ID} files={[]} />);
    await tick(0);
    let oldResponse: ((value: StudioSnapshot) => void) | undefined;
    studio.snapshot.mockImplementationOnce(() => new Promise<StudioSnapshot>((resolve) => { oldResponse = resolve; }));
    await tick(5000);
    const next = preparationFixture();
    next.context = { sourceFileId: STUDIO_MAP_ID, mapKey: "courtyard", encounterKey: null };
    next.scene.mapName = "Courtyard"; next.scene.encounterName = null; next.scene.tokens = [];
    studio.snapshot.mockResolvedValue(next);
    await act(async () => { fireEvent.change(view.getByRole("combobox", { name: "Active map" }), { target: { value: "map:courtyard" } }); });
    expect(studio.context).toHaveBeenCalledWith(STUDIO_BUILD_ID, next.context);
    expect((view.getByRole("combobox", { name: "Active map" }) as HTMLSelectElement).value).toBe("map:courtyard");
    await act(async () => oldResponse?.(preparationFixture()));
    expect((view.getByRole("combobox", { name: "Active map" }) as HTMLSelectElement).value).toBe("map:courtyard");
    expect(view.container.querySelector("[data-token-index]")).toBeNull();
  });
});
