// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { t } from "../src/i18n/locale";
import { GuestRoomProvider } from "../src/ui/GuestRoom";
import { GuestTutorial } from "../src/ui/GuestTutorial";

const connection = {} as RoomConnection;
const room = (tokens: Record<string, unknown> = {}) => ({ tokens, fog: {}, rolls: [], scene: { grid: {}, map: null }, walls: {} }) as unknown as RoomState;
const demo = (state: RoomState): ReactElement => (
  <GuestRoomProvider value={{ guest: true, idleDays: 30 }}>
    <button type="button">board</button>
    <GuestTutorial roomId="r1" connection={connection} state={state} selfId="gm" invites={0} restart={0} reveal={() => {}} />
  </GuestRoomProvider>
);

describe("the demo's focus (guest-gm-hosting: A guest room offers an interactive demo)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("leaves focus alone when a step is reached by acting elsewhere, and announces it", () => {
    localStorage.setItem("vtt.tutorial.r1", "4"); // Place a token
    const { rerender } = render(demo(room()));
    const outside = screen.getByRole("button", { name: "board" });
    outside.focus();
    rerender(demo(room({ a: { position: { x: 1, y: 1 } } })));
    expect(screen.getByRole("heading").textContent).toBe(t("tutorial.move.title"));
    expect(document.activeElement).toBe(outside);
    expect(screen.getByRole("status").textContent).toBe(t("tutorial.move.title"));
  });

  it("moves focus to the question, then to the step heading after Yes", () => {
    render(demo(room()));
    expect(document.activeElement).toBe(screen.getByRole("heading"));
    fireEvent.click(screen.getByRole("button", { name: t("tutorial.yes") }));
    expect(screen.getByRole("heading").textContent).toBe(t("tutorial.table.title"));
    expect(document.activeElement).toBe(screen.getByRole("heading"));
  });

  it("offers each editor lesson and keeps the card usable in the editor's dialog", async () => {
    localStorage.setItem("vtt.tutorial.r1", "grid");
    const reveal = vi.fn();
    render(<GuestRoomProvider value={{ guest: true, idleDays: 30 }}>
      <dialog open className="map-editor" aria-label="Edit map"><button type="button" data-tutorial="grid">Grid</button></dialog>
      <GuestTutorial roomId="r1" connection={connection} state={room()} selfId="gm" invites={0} restart={0} reveal={reveal} />
    </GuestRoomProvider>);
    const heading = screen.getByRole("heading", { name: t("tutorial.grid.title") });
    await waitFor(() => expect(heading.closest("dialog.map-editor")).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: t("tutorial.showMe") }));
    expect(reveal).toHaveBeenLastCalledWith("grid", true);
    fireEvent.click(screen.getByRole("button", { name: t("tutorial.next") }));
    expect(reveal).toHaveBeenLastCalledWith("walls");
    expect(screen.getByRole("heading").textContent).toBe(t("tutorial.walls.title"));
    const escape = createEvent.keyDown(screen.getByRole("button", { name: t("tutorial.next") }), { key: "Escape", cancelable: true });
    fireEvent(screen.getByRole("button", { name: t("tutorial.next") }), escape);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("does not let a saved grid change finish the walls lesson", () => {
    localStorage.setItem("vtt.tutorial.r1", "walls");
    const initial = room();
    const { rerender } = render(demo(initial));
    rerender(demo({ ...initial, scene: { ...initial.scene, grid: { ...initial.scene.grid, cellSize: 80 } } }));
    expect(screen.getByRole("heading").textContent).toBe(t("tutorial.walls.title"));
    rerender(demo({ ...initial, walls: { wall: { id: "wall", a: { x: 0, y: 0 }, b: { x: 70, y: 0 } } } }));
    expect(screen.getByRole("heading").textContent).toBe(t("tutorial.fog.title"));
  });
});
