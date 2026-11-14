// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { toGridDraft } from "../src/pages/gridDraft";
import { GmPanel } from "../src/pages/GmPanel";
import { GRID, MAP_URL, TOKEN, fakeConnection, room, stubMapEditorEnvironment } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

const signedIn = () => accountStore.setState({ status: "signedIn", account: { id: "user", email: "gm@example.com", displayName: "GM" } });
beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); accountStore.setState({ status: "loading" }); });

function mount() {
  const fake = fakeConnection();
  render(
    <GmPanel
      connection={fake.connection} state={room()} token={TOKEN}
      gridDraft={toGridDraft(GRID)} hasGridDraft={false}
      onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true}
      gridApplying={false} gridError={null} onReviewDeparture={() => {}}
    />,
  );
  return fake;
}
const editor = () => screen.getByRole("dialog", { name: "Edit map" });
const saveButton = () => within(editor()).getByRole("button", { name: "Save to library" });
/** Fogs the whole map in Edit map's draft, without saving it. */
function unsavedFog() {
  fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
  fireEvent.click(within(editor()).getByRole("tab", { name: "3 · Fog" }));
  fireEvent.click(within(editor()).getByRole("button", { name: "Fog whole map" }));
}

describe("Save to library in the Edit map header (asset-library, FR-GM-17)", () => {
  it("is on every Edit map step, and not in Change map or without a library", () => {
    signedIn(); mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    for (const tab of ["1 · Grid", "2 · Walls", "3 · Fog", "4 · Sight", "5 · Terrain"]) {
      fireEvent.click(within(editor()).getByRole("tab", { name: tab }));
      expect(saveButton()).toBeTruthy();
    }
    fireEvent.click(editor().querySelector<HTMLElement>(".modal-close")!);
    fireEvent.click(screen.getByRole("button", { name: "Change map" }));
    expect(within(screen.getByRole("dialog", { name: "Change map" })).queryByRole("button", { name: "Save to library" })).toBeNull();
    cleanup();
    accountStore.setState({ status: "signedOut" }); mount();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    expect(within(editor()).queryByRole("button", { name: "Save to library" })).toBeNull();
  });

  it("saves straight away with nothing unsaved, and says so", async () => {
    signedIn(); mount();
    const save = vi.spyOn(api, "saveMapToLibrary").mockResolvedValue({ assetId: "a1", name: "Scene 1", created: true });
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.click(saveButton());
    await within(editor()).findByText("Saved to library");
    expect(save).toHaveBeenCalledWith("r1", TOKEN, {});
    expect(screen.queryByRole("dialog", { name: "Save your changes first?" })).toBeNull();
  });

  it("shows why a save failed", async () => {
    signedIn(); mount();
    vi.spyOn(api, "saveMapToLibrary").mockRejectedValue(new Error("Your library can hold up to 200 items."));
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.click(saveButton());
    expect(await within(editor()).findByRole("alert")).toHaveProperty("textContent", "Your library can hold up to 200 items.");
  });

  it("warns about unsaved changes; Keep editing saves nothing", async () => {
    signedIn(); const fake = mount();
    const save = vi.spyOn(api, "saveMapToLibrary").mockResolvedValue({ assetId: "a1", name: "Scene 1", created: false });
    unsavedFog();
    await screen.findByText(/Unsaved changes/);
    fireEvent.click(saveButton());
    const ask = screen.getByRole("dialog", { name: "Save your changes first?" });
    expect(within(ask).getByRole("button", { name: "Save changes first" })).toBeTruthy();
    expect(within(ask).getByRole("button", { name: "Save to library without them" })).toBeTruthy();
    fireEvent.click(within(ask).getByRole("button", { name: "Keep editing" }));
    expect(save).not.toHaveBeenCalled();
    expect(fake.commands).toEqual([]);
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
  });

  it("Save changes first saves the fog to the room, then to the library", async () => {
    signedIn(); const fake = mount();
    const save = vi.spyOn(api, "saveMapToLibrary").mockResolvedValue({ assetId: "a1", name: "Scene 1", created: false });
    unsavedFog();
    await screen.findByText(/Unsaved changes/);
    fireEvent.click(saveButton());
    fireEvent.click(within(screen.getByRole("dialog", { name: "Save your changes first?" })).getByRole("button", { name: "Save changes first" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(fake.commands).toEqual([expect.objectContaining({ type: "scene.savePreparation", expectedMapUrl: MAP_URL })]);
    const order = [vi.mocked(fake.connection.command).mock.invocationCallOrder[0]!, save.mock.invocationCallOrder[0]!];
    expect(order[0]).toBeLessThan(order[1]!);
  });

  it("doesn't save to the library when saving the changes fails", async () => {
    signedIn(); const fake = mount();
    const save = vi.spyOn(api, "saveMapToLibrary").mockResolvedValue({ assetId: "a1", name: "Scene 1", created: false });
    vi.mocked(fake.connection.command).mockResolvedValueOnce({ ok: false, code: "invalid", message: "The map changed." });
    unsavedFog();
    await screen.findByText(/Unsaved changes/);
    fireEvent.click(saveButton());
    fireEvent.click(within(screen.getByRole("dialog", { name: "Save your changes first?" })).getByRole("button", { name: "Save changes first" }));
    await waitFor(() => expect(fake.connection.command).toHaveBeenCalled());
    expect(save).not.toHaveBeenCalled();
  });

  it("Save to library without them keeps the changes unsaved in the editor", async () => {
    signedIn(); const fake = mount();
    const save = vi.spyOn(api, "saveMapToLibrary").mockResolvedValue({ assetId: "a1", name: "Scene 1", created: false });
    unsavedFog();
    await screen.findByText(/Unsaved changes/);
    fireEvent.click(saveButton());
    fireEvent.click(within(screen.getByRole("dialog", { name: "Save your changes first?" })).getByRole("button", { name: "Save to library without them" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(fake.commands).toEqual([]);
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
  });
});
