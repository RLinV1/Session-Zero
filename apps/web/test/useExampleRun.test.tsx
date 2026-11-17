// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExampleRun } from "../src/ui/useExampleRun";
import { EXAMPLE_API_EVENT, type ExampleApi } from "../src/ui/tutorialExample";
import { applyToDraft, type MapDraft } from "../src/pages/mapEditor/mapDraft";
import { DEFAULT_GRID } from "@vtt/shared";

describe("animated Show me (guest-gm-hosting)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 100, y: 100, left: 100, top: 100, right: 180, bottom: 140, width: 80, height: 40, toJSON() {} });
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => { cleanup(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("does not revive a run stopped while its previous sample is being cleared", async () => {
    const share = document.createElement("button");
    share.className = "share-button";
    document.body.append(share);
    const opened = vi.fn();
    share.onclick = opened;
    const { result } = renderHook(() => useExampleRun());
    await act(async () => {
      const pending = result.current.start("invite");
      result.current.stop();
      await vi.runAllTimersAsync();
      await pending;
    });
    expect(opened).not.toHaveBeenCalled();
    expect(result.current.run.playing).toBe(false);
    expect(result.current.run.cursor).toBeNull();
  });

  it("starts the pointer away from the first control, so its first move is visible", async () => {
    const share = document.createElement("button");
    share.className = "share-button";
    document.body.append(share);
    const { result } = renderHook(() => useExampleRun());
    await act(async () => { void result.current.start("invite"); await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.run.cursor).not.toBeNull();
    expect(result.current.run.cursor).not.toMatchObject({ x: 140, y: 120 });
    await act(async () => { result.current.stop(); await vi.runAllTimersAsync(); });
  });

  it("cleans the command just applied when reduced-motion playback is interrupted before its next tick", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const button = document.createElement("button");
    button.dataset.tutorialTool = "draw";
    document.body.append(button);
    let draft: MapDraft = { mapUrl: "/map", walls: {}, fog: {}, lineOfSight: false, isometric: false, sightRange: null };
    let id = 0;
    const { result } = renderHook(() => useExampleRun());
    const api: ExampleApi = {
      session: {}, grid: DEFAULT_GRID, map: { width: 700, height: 700 }, draft: () => draft,
      command: async (command) => {
        draft = applyToDraft(draft, command, () => `sample-${++id}`)!;
        if (command.type === "wall.add") queueMicrotask(() => result.current.stop());
      },
    };
    const lend = (event: Event) => { (event as CustomEvent<{ api: ExampleApi | null }>).detail.api = api; };
    window.addEventListener(EXAMPLE_API_EVENT, lend);
    try {
      await act(async () => { void result.current.start("walls"); await vi.runAllTimersAsync(); });
      expect(Object.keys(draft.walls)).toHaveLength(1);
      await act(async () => { void result.current.clear("walls"); await vi.runAllTimersAsync(); });
      expect(draft.walls).toEqual({});
    } finally { window.removeEventListener(EXAMPLE_API_EVENT, lend); }
  });
});
