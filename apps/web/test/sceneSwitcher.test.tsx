// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { emptyRoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { ScenePreparationContext } from "../src/panels/ScenePreparationContext";
import { SceneSwitcher } from "../src/panels/ScenesPanel";

afterEach(cleanup);
describe("themed scene dropdown (FR-GM-25)", () => {
  it("lists scenes with a Live pill and previews the picked one", () => {
    const state = { ...emptyRoomState("r"), activeSceneId: "tavern", sceneNames: { tavern: "Tavern", cellar: "Cellar" } };
    const preview = vi.fn();
    render(<ScenePreparationContext.Provider value={{ activeId: "tavern", preparing: false, preview }}>
      <SceneSwitcher state={state} connection={{} as unknown as RoomConnection} />
    </ScenePreparationContext.Provider>);
    const trigger = screen.getByRole("button", { name: "Viewing scene" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    fireEvent.click(trigger);
    const tavern = screen.getByRole("option", { name: /Tavern/ });
    expect(within(tavern).getByText("Live")).toBeTruthy();
    expect(tavern.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: /Cellar/ }));
    expect(preview).toHaveBeenCalledWith("cellar");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape inside the panel closes it and refocuses the trigger; a press outside closes it", () => {
    const state = { ...emptyRoomState("r"), activeSceneId: "tavern", sceneNames: { tavern: "Tavern", cellar: "Cellar" } };
    render(<ScenePreparationContext.Provider value={{ activeId: "tavern", preparing: false, preview: vi.fn() }}>
      <SceneSwitcher state={state} connection={{} as unknown as RoomConnection} />
      <button type="button">Elsewhere</button>
    </ScenePreparationContext.Provider>);
    const trigger = screen.getByRole("button", { name: "Viewing scene" });
    fireEvent.click(trigger);
    const option = screen.getByRole("option", { name: /Tavern/ });
    expect(document.activeElement).toBe(option);
    fireEvent.keyDown(option, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
