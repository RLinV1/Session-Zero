// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { emptyRoomState, type EncounterSummary } from "@vtt/shared";
import { api } from "../src/net/api";
import type { RoomConnection } from "../src/net/roomConnection";
import { SceneSetupModal } from "../src/panels/SceneSetupModal";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function() { this.open = true; };
  HTMLDialogElement.prototype.close = function() { this.open = false; };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function setup() {
  const state = emptyRoomState("r");
  state.activeSceneId = "private-copy";
  state.checkpoints = [{ id: "checkpoint-1", name: "Before ambush", seq: 2 }]; // exists in the room but is not offered here
  const command = vi.fn().mockResolvedValue({ ok: true });
  const onClose = vi.fn(); const onChooseMap = vi.fn();
  const props = { open: true, state, connection: { command } as unknown as RoomConnection, onClose, onChooseMap };
  const view = render(<SceneSetupModal {...props} />);
  return { ...view, props, command, onClose, onChooseMap };
}
describe("new scene setup", () => {
  it("copies the live map into the viewed private scene without activating", async () => {
    const { command, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Current map" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(command).toHaveBeenCalledWith({ type: "scene.copyCurrent", sceneId: "private-copy" });
  });
  it("offers starting points but no checkpoint restore", () => {
    setup();
    expect(screen.getByRole("button", { name: "Encounter template" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Map" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Checkpoint" })).toBeNull();
    expect(screen.queryByText("Before ambush")).toBeNull();
  });
  it("lists encounter templates and applies a selection without activating", async () => {
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([{ id: "template-1", name: "Goblin camp", mapName: "Cave" }] as EncounterSummary[]);
    const { command, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Encounter template" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply Goblin camp" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(command).toHaveBeenCalledWith({ type: "encounter.apply", templateId: "template-1" });
  });
  it("hands off to the map picker only after the setup modal closes", () => {
    const { rerender, props, onClose, onChooseMap } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Map" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onChooseMap).not.toHaveBeenCalled();
    rerender(<SceneSetupModal {...props} open={false} />);
    fireEvent(document.querySelector("dialog")!, new Event("close"));
    expect(onChooseMap).toHaveBeenCalledOnce();
  });
});
