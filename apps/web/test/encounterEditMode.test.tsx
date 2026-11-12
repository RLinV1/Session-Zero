// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncounterEditSession, EncounterSummary } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import * as router from "../src/router";
import { EncounterEditBar } from "../src/pages/encounterEdit/EncounterEditBar";
import { ENCOUNTER_EDITING, FULL_ROOM, shownTab } from "../src/pages/encounterEdit/roomFeatures";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { panelTabs } from "../src/panels/RoomPanel";
import { createRoomWith, emptyRoomDetails, RoomDetailsFields, roomDetailsReady } from "../src/pages/RoomDetailsFields";
import { DEFAULT_TOOL_OPTIONS, ToolRail } from "../src/ui/ToolRail";
import { TOKEN, fakeConnection, room, stubMapEditorEnvironment } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => <section>Checkpoints</section> }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => <section>Encounter templates</section> }));

beforeEach(() => stubMapEditorEnvironment());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("template-editing mode shows only map, fog and token tools (encounter-templates, ADR 0033)", () => {
  it("offers the Tokens and Manage tabs, falling back from a remembered Play or Dice tab", () => {
    expect(panelTabs(true, ENCOUNTER_EDITING.tabs).map((t) => t.label)).toEqual(["Tokens", "Manage"]);
    expect(panelTabs(true, FULL_ROOM.tabs).map((t) => t.label)).toEqual(["Play", "Tokens", "Dice", "Manage"]);
    expect(shownTab("play", ENCOUNTER_EDITING)).toBe("tokens");
    expect(shownTab("dice", ENCOUNTER_EDITING)).toBe("tokens");
    expect(shownTab("gm", ENCOUNTER_EDITING)).toBe("gm");
    expect(shownTab("play", FULL_ROOM)).toBe("play");
  });

  it("hides the table's chrome, chat and notices", () => {
    expect(ENCOUNTER_EDITING).toMatchObject({ tableChrome: false, chat: false, notices: false, tableAdmin: false, mapAndWalls: false });
  });

  it("puts only Select on the tool rail, with nothing to clear", () => {
    const rail = (selectOnly: boolean) => render(
      <ToolRail active="select" options={DEFAULT_TOOL_OPTIONS} isGm onSelect={() => {}} onOptions={() => {}} onClear={() => {}} selectOnly={selectOnly} />,
    );
    rail(true);
    const tools = within(screen.getByRole("toolbar", { name: "Board tools" }));
    expect(tools.getByRole("button", { name: "Select" })).toBeTruthy();
    for (const name of ["Measure", "Draw", "AoE", "Eraser", "Clear all my marks"]) expect(tools.queryByRole("button", { name })).toBeNull();
    cleanup();
    rail(false);
    expect(screen.getByRole("button", { name: "Measure" })).toBeTruthy();
  });

  it("offers grid and fog, keeping wall editing in the map editor", () => {
    const fake = fakeConnection();
    render(
      <GmPanel
        connection={fake.connection} state={room()} token={TOKEN}
        gridDraft={toGridDraft(room().scene.grid)} hasGridDraft={false}
        onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true}
        gridApplying={false} gridError={null} onReviewDeparture={() => {}}
        features={ENCOUNTER_EDITING}
      />,
    );
    expect(screen.queryByText("Checkpoints")).toBeNull();
    expect(screen.queryByText("Encounter templates")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change Map" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage Walls" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    const editor = screen.getByRole("dialog", { name: "Edit map" });
    expect(within(editor).getAllByRole("tab").map((t) => t.textContent)).toEqual(["1 · Grid", "2 · Fog"]);
    fireEvent.click(within(editor).getByRole("tab", { name: "2 · Fog" }));
    expect(within(editor).getByRole("button", { name: "Fog whole map" })).toBeTruthy();
  });
});

describe("saving, discarding and closing a temporary room (encounter-templates, ADR 0033)", () => {
  const existing: EncounterEditSession = { roomId: "room-1", templateId: "t1", templateName: "Crypt guards", mapAssetId: "m1" };
  const fresh: EncounterEditSession = { roomId: "room-1", templateId: null, templateName: null, mapAssetId: "m1" };
  const summary = (name: string): EncounterSummary => ({
    id: "t1", name, mapName: "Crypt", mapAssetId: "m1", tokenCount: 2, fogCount: 0,
    createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z",
  });

  function mount(session: EncounterEditSession, seq = 5) {
    vi.spyOn(api.library.encounterEdits, "get").mockResolvedValue(session);
    const save = vi.spyOn(api.library.encounterEdits, "save").mockResolvedValue(summary(session.templateName ?? "Crypt guards"));
    const remove = vi.spyOn(api.rooms, "remove").mockResolvedValue();
    const navigate = vi.spyOn(router, "navigate").mockImplementation(() => {});
    const onLeaving = vi.fn();
    const view = render(<EncounterEditBar roomId="room-1" seq={seq} onLeaving={onLeaving} />);
    const rerender = (next: number) => view.rerender(<EncounterEditBar roomId="room-1" seq={next} onLeaving={onLeaving} />);
    return { save, remove, navigate, onLeaving, rerender };
  }

  it("saves an edited template in place and shows it saved", async () => {
    const { save, rerender } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    expect(screen.getByText("Saved")).toBeTruthy();
    rerender(6);
    expect(screen.getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("room-1", {}));
    await screen.findByText("Saved");
  });

  it("asks a new template's name on its first save", async () => {
    const { save } = mount(fresh);
    await screen.findByRole("heading", { name: "New encounter" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = screen.getByRole("dialog", { name: "Name this encounter" });
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Template name"), { target: { value: "  Crypt guards " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("room-1", { name: "Crypt guards" }));
    await screen.findByRole("heading", { name: "Crypt guards" });
  });

  it("sends one save when Save is pressed twice before the first finishes (FR-GM-13)", async () => {
    const { save } = mount(fresh);
    await screen.findByRole("heading", { name: "New encounter" });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = screen.getByRole("dialog", { name: "Name this encounter" });
    fireEvent.change(within(dialog).getByLabelText("Template name"), { target: { value: "Crypt guards" } });
    const submit = within(dialog).getByRole("button", { name: "Save" });
    // Both clicks land before React re-renders the button as disabled.
    act(() => {
      submit.click();
      submit.click();
    });
    await screen.findByRole("heading", { name: "Crypt guards" });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("closes without a prompt when saved, deleting the temporary room", async () => {
    const { remove, navigate, onLeaving } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/library"));
    expect(onLeaving).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("room-1");
  });

  it("asks before closing with unsaved changes: Keep editing stays, Discard leaves unsaved", async () => {
    const { save, remove, navigate, rerender } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    rerender(7);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const prompt = screen.getByRole("dialog", { name: "Save changes?" });
    fireEvent.click(within(prompt).getByRole("button", { name: "Keep editing" }));
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Save changes?" })).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/library"));
    expect(save).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("room-1");
  });

  it("saves then leaves when the close prompt's Save is chosen", async () => {
    const { save, remove, rerender } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    rerender(7);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Save changes?" })).getByRole("button", { name: "Save" }));
    });
    await waitFor(() => expect(remove).toHaveBeenCalledWith("room-1"));
    expect(save).toHaveBeenCalledWith("room-1", {});
  });

  it("discards straight away when nothing changed, and asks first when something did", async () => {
    const { remove, rerender } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    rerender(9);
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("dialog", { name: "Discard changes?" })).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard changes?" })).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("room-1"));
  });
});

describe("the shared room details form (gm-dashboard, ADR 0033)", () => {
  it("asks for the room name, the GM's name, and the game when there is a choice", () => {
    const onChange = vi.fn();
    render(<RoomDetailsFields value={emptyRoomDetails("Crypt guards")} onChange={onChange} />);
    expect((screen.getByLabelText("Room name") as HTMLInputElement).value).toBe("Crypt guards");
    expect(screen.getByLabelText("Room name").getAttribute("maxLength")).toBe("80");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Dana" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ roomName: "Crypt guards", displayName: "Dana" }));
  });

  it("is ready only with a room name and a display name", () => {
    expect(roomDetailsReady({ ...emptyRoomDetails("Room"), displayName: "Dana" })).toBe(true);
    expect(roomDetailsReady({ ...emptyRoomDetails("  "), displayName: "Dana" })).toBe(false);
    expect(roomDetailsReady(emptyRoomDetails("Room"))).toBe(false);
  });

  it("creates the room with this browser's credential and an optional template", async () => {
    const create = vi.spyOn(api, "createRoom").mockResolvedValue({ roomId: "r9", participantId: "p9", inviteCode: "abc" });
    const details = { ...emptyRoomDetails("Session 4"), displayName: "Dana" };
    expect(await createRoomWith(details, "t1")).toBe("r9");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ roomName: "Session 4", displayName: "Dana", templateId: "t1", guestToken: expect.any(String) }));
    await createRoomWith(details);
    expect(create.mock.calls[1]![0]).not.toHaveProperty("templateId");
  });
});

describe("open a template in a room (encounter-templates, ADR 0033)", () => {
  const existing: EncounterEditSession = { roomId: "temp-1", templateId: "t1", templateName: "Crypt guards", mapAssetId: "m1" };

  function mount(session: EncounterEditSession) {
    vi.spyOn(api.library.encounterEdits, "get").mockResolvedValue(session);
    const save = vi.spyOn(api.library.encounterEdits, "save").mockResolvedValue({
      id: "t1", name: "Crypt guards", mapName: "Crypt", mapAssetId: "m1", tokenCount: 1, fogCount: 0,
      createdAt: "2026-10-13T00:00:00.000Z", updatedAt: "2026-10-13T00:00:00.000Z",
    });
    const create = vi.spyOn(api, "createRoom").mockResolvedValue({ roomId: "real-1", participantId: "p1", inviteCode: "abc" });
    const remove = vi.spyOn(api.rooms, "remove").mockResolvedValue();
    const navigate = vi.spyOn(router, "navigate").mockImplementation(() => {});
    const view = render(<EncounterEditBar roomId="temp-1" seq={5} onLeaving={() => {}} />);
    const rerender = (seq: number) => view.rerender(<EncounterEditBar roomId="temp-1" seq={seq} onLeaving={() => {}} />);
    return { save, create, remove, navigate, rerender };
  }
  const fillAndOpen = (fields: { roomName?: string; displayName?: string }) => {
    const dialog = screen.getByRole("dialog", { name: "Open in a room" });
    if (fields.roomName !== undefined) fireEvent.change(within(dialog).getByLabelText("Room name"), { target: { value: fields.roomName } });
    if (fields.displayName !== undefined) fireEvent.change(within(dialog).getByLabelText("Your name"), { target: { value: fields.displayName } });
    return dialog;
  };

  it("is not offered before a new template's first save", async () => {
    mount({ ...existing, templateId: null, templateName: null });
    await screen.findByRole("heading", { name: "New encounter" });
    expect(screen.queryByRole("button", { name: "Open in a room" })).toBeNull();
  });

  it("names the room after the template, sends an edited name, then deletes the temporary room", async () => {
    const { create, remove, navigate } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    fireEvent.click(screen.getByRole("button", { name: "Open in a room" }));
    const dialog = screen.getByRole("dialog", { name: "Open in a room" });
    expect((within(dialog).getByLabelText("Room name") as HTMLInputElement).value).toBe("Crypt guards");
    fillAndOpen({ roomName: "Session 4 - Crypt", displayName: "Dana" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open room" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/r/real-1"));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ roomName: "Session 4 - Crypt", displayName: "Dana", templateId: "t1" }));
    expect(remove).toHaveBeenCalledWith("temp-1");
  });

  it("starts the GM's name as the account's (create-room-form-defaults)", async () => {
    accountStore.setState({ status: "signedIn", account: { id: "a1", email: "dana@example.com", displayName: "Dana" } });
    try {
      mount(existing);
      await screen.findByRole("heading", { name: "Crypt guards" });
      fireEvent.click(screen.getByRole("button", { name: "Open in a room" }));
      const dialog = screen.getByRole("dialog", { name: "Open in a room" });
      expect((within(dialog).getByLabelText("Your name") as HTMLInputElement).value).toBe("Dana");
      expect(within(dialog).getByLabelText("Your name").getAttribute("placeholder")).toBeNull();
    } finally {
      accountStore.setState({ status: "loading" });
    }
  });

  it("sends nothing for a blank name or Cancel", async () => {
    const { create } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    fireEvent.click(screen.getByRole("button", { name: "Open in a room" }));
    const dialog = fillAndOpen({ roomName: "   ", displayName: "Dana" });
    expect((within(dialog).getByRole("button", { name: "Open room" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(within(dialog).getByLabelText("Room name").closest("form")!);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await Promise.resolve();
    expect(create).not.toHaveBeenCalled();
  });

  it("saves unsaved changes before the room is made", async () => {
    const { save, create, rerender } = mount(existing);
    await screen.findByRole("heading", { name: "Crypt guards" });
    rerender(8);
    fireEvent.click(screen.getByRole("button", { name: "Open in a room" }));
    const ask = screen.getByRole("dialog", { name: "Save before opening?" });
    await act(async () => {
      fireEvent.click(within(ask).getByRole("button", { name: "Save" }));
    });
    expect(save).toHaveBeenCalledWith("temp-1", {});
    const dialog = fillAndOpen({ displayName: "Dana" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Open room" }));
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(save.mock.invocationCallOrder[0]!).toBeLessThan(create.mock.invocationCallOrder[0]!);
  });
});
