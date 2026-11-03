// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyRoomState, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { ScenePreparationContext } from "../src/panels/ScenePreparationContext";
import { SceneActivationNotice, ScenesPanel, SceneSwitcher } from "../src/panels/ScenesPanel";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function() { this.open = false; };
});
afterEach(cleanup);
function setup(state: RoomState = { ...emptyRoomState("r"), activeSceneId: "tavern", sceneNames: { tavern: "Tavern", cellar: "Cellar" } }) {
  const command = vi.fn().mockResolvedValue({ ok: true });
  render(<ScenePreparationContext.Provider value={{ activeId: "tavern", preparing: false, preview: (sceneId) => command({ type: "preview", sceneId }) }}><ScenesPanel state={state} connection={{ command } as unknown as RoomConnection} /></ScenePreparationContext.Provider>);
  return command;
}
describe("scene management", () => {
  it("previews from the header selector without activating", async () => {
    const state = { ...emptyRoomState("r"), activeSceneId: "tavern", sceneNames: { tavern: "Tavern", cellar: "Cellar" } };
    const command = vi.fn().mockResolvedValue({ ok: true });
    render(<ScenePreparationContext.Provider value={{ activeId: "tavern", preparing: false, preview: (sceneId) => command({ type: "preview", sceneId }) }}><SceneSwitcher state={state} connection={{ command } as unknown as RoomConnection} /></ScenePreparationContext.Provider>);
    fireEvent.change(screen.getByRole("combobox", { name: "Viewing scene" }), { target: { value: "cellar" } });
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "preview", sceneId: "cellar" }));
  });
  it("previews a saved scene in one click", async () => {
    const command = setup();
    fireEvent.click(screen.getByRole("button", { name: "Preview Cellar" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "preview", sceneId: "cellar" }));
    expect((screen.getByRole("button", { name: "Preview Tavern" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("creates a named private scene", async () => {
    const command = setup(emptyRoomState("r"));
    expect(screen.getByText(/Prepare privately/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New scene name"), { target: { value: "Courtyard" } });
    fireEvent.click(screen.getByRole("button", { name: "Create scene" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.create", name: "Courtyard", activate: false }));
  });
  it("activates only when the GM explicitly clicks Activate", async () => {
    const state = { ...emptyRoomState("r"), activeSceneId: "cellar", sceneNames: { tavern: "Tavern", cellar: "Cellar" } };
    const command = vi.fn().mockResolvedValue({ ok: false, message: "Scene was deleted" });
    render(<ScenePreparationContext.Provider value={{ activeId: "tavern", preparing: true, preview: vi.fn() }}><SceneActivationNotice state={state} connection={{ command } as unknown as RoomConnection} /></ScenePreparationContext.Provider>);
    expect(screen.getByText("This is not the active scene.")).toBeTruthy();
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Scene was deleted");
    expect(command).toHaveBeenCalledWith({ type: "scene.switch", sceneId: "cellar" });
  });
  it("requires confirmation to delete an inactive scene", async () => {
    const command = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete Cellar" }));
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete scene" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.delete", sceneId: "cellar" }));
  });
  it("renames a scene without switching", async () => {
    const command = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rename Cellar" }));
    fireEvent.change(screen.getByLabelText("Scene name"), { target: { value: "Vault" } });
    fireEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(command).toHaveBeenCalledWith({ type: "scene.rename", sceneId: "cellar", name: "Vault" }));
  });
});
