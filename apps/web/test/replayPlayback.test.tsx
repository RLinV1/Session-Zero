// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type ReplayResponse } from "@vtt/shared";
import { api } from "../src/net/api";
import { ReplayBar } from "../src/ui/ReplayBar";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("delivers the historical event when advancing, and clears it when stepping back", async () => {
  const point = { id: "start", kind: "start" as const, label: "Start", seq: 1, at: "2026-10-18T00:00:00Z" };
  const replay: ReplayResponse = { point, start: emptyRoomState("r1"), truncated: false, frames: [{
    kind: "event", sentence: "Grid changed", committed: { seq: 2, actorId: null, at: point.at,
      event: { type: "GridSet", grid: { ...DEFAULT_GRID, cellSize: 100 }, previous: DEFAULT_GRID } },
  }] };
  vi.spyOn(api, "replayPoints").mockResolvedValue([point]);
  vi.spyOn(api, "replay").mockResolvedValue(replay);
  const show = vi.fn();
  render(<ReplayBar roomId="r1" token="token" onShow={show} onExit={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Forward one step" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Forward one step" }));
  await waitFor(() => expect(show).toHaveBeenLastCalledWith(expect.objectContaining({ scene: expect.objectContaining({ grid: expect.objectContaining({ cellSize: 100 }) }) }), replay.frames[0]));
  fireEvent.click(screen.getByRole("button", { name: "Back one step" }));
  await waitFor(() => expect(show).toHaveBeenLastCalledWith(replay.start, null));
});
