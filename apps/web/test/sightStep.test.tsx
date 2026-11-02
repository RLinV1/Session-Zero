// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, EMPTY_STATS, type LibraryAsset, type RoomState } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { GmPanel } from "../src/pages/GmPanel";
import { toGridDraft } from "../src/pages/gridDraft";
import { LibraryMapEditor } from "../src/pages/mapEditor/LibraryMapEditor";
import { GRID, fakeConnection, room, stubMapEditorEnvironment, TOKEN } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

beforeEach(() => {
  stubMapEditorEnvironment();
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: false });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); accountStore.setState({ status: "loading" }); });

function mount(state: RoomState = room()) {
  const fake = fakeConnection();
  render(<GmPanel connection={fake.connection} state={state} token={TOKEN} gridDraft={toGridDraft(state.scene.grid)} hasGridDraft={false}
    onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true} gridApplying={false} gridError={null} onReviewDeparture={() => {}} />);
  return fake;
}
const editor = () => screen.getByRole("dialog", { name: "Edit map" });
const withPlayer = (state: RoomState) => {
  state.participants.p1 = { id: "p1", role: "player", displayName: "Pia" };
  return state;
};
const token = { id: "hero", name: "Hero", position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#ffffff", imageUrl: null, assetId: null, ownerIds: [], hidden: false, stats: EMPTY_STATS, conditions: [] };
const openSight = () => { fireEvent.click(screen.getByRole("button", { name: "Edit map" })); fireEvent.click(within(editor()).getByRole("tab", { name: "5 · Sight" })); };
const lineOfSightBox = () => within(editor()).getByRole("radio", { name: /^On$/ });
const limited = () => within(editor()).getByRole("radio", { name: /^Limited$/ });
const unlimited = () => within(editor()).getByRole("radio", { name: /^Unlimited$/ });
// jsdom has no SVG geometry for a click, so tests place through the map's keyboard path.
const placeInCentre = () => fireEvent.keyDown(document.querySelector(".map-editor-sight-preview")!, { key: "Enter" });

describe("map editor Sight step (FR-GM-19)", () => {
  it("has a tab after Fog and asks for a map when there is none", async () => {
    vi.spyOn(api.uvtt, "prepare").mockResolvedValue({ id: "opaque", revision: 1, map: { url: "/uploads/import.png", width: 800, height: 600 }, grid: GRID, walls: [], diagnostics: [] });
    vi.spyOn(api.uvtt, "discard").mockResolvedValue();
    mount(room({ withMap: false }));
    fireEvent.change(screen.getByLabelText("Upload battle map"), { target: { files: [new File(["json"], "map.dd2vtt")] } });
    await screen.findByText(/Unsaved changes: only you see them/);
    const tabs = within(editor()).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["1 · Map", "2 · Grid", "3 · Walls", "4 · Fog", "5 · Sight"]);
    fireEvent.click(within(editor()).getByRole("tab", { name: "5 · Sight" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Apply this map?" })).getByRole("button", { name: "Discard" }));
    expect(await screen.findByText("Apply a map before setting up sight.")).toBeTruthy();
  });

  it("shows the grid on Sight, Walls and Fog, and one Show-menu Grid choice carries over and sends nothing (FR-GM-19)", () => {
    const fake = mount(withPlayer(room())); openSight();
    const lines = () => editor().querySelectorAll(".map-editor-grid-lines line").length;
    const menu = () => within(editor()).getByRole("button", { name: "Show" });
    const gridBox = () => { if (!within(editor()).queryByRole("group", { name: "Show on your view" })) fireEvent.click(menu()); return within(editor()).getByRole("checkbox", { name: "Grid" }) as HTMLInputElement; };
    const step = (name: string) => fireEvent.click(within(editor()).getByRole("tab", { name }));
    const preview = () => document.querySelector(".map-editor-sight-preview .map-editor-grid-lines")!;
    expect(lines()).toBeGreaterThan(0);
    expect(preview().getAttribute("pointer-events")).toBe("none");
    expect(gridBox().checked).toBe(true);
    fireEvent.click(gridBox());
    expect(lines()).toBe(0);
    step("3 · Walls");
    expect(gridBox().checked).toBe(false);
    expect(lines()).toBe(0);
    step("4 · Fog");
    expect(lines()).toBe(0);
    fireEvent.click(gridBox());
    expect(lines()).toBeGreaterThan(0);
    step("3 · Walls");
    expect(lines()).toBeGreaterThan(0);
    step("5 · Sight");
    expect(lines()).toBeGreaterThan(0);
    expect(fake.commands).toEqual([]);
  });

  it("keeps the Add token button a plus while placing, and Escape or a second press stops placing", () => {
    mount(withPlayer(room())); openSight();
    const add = () => within(editor()).getByRole("button", { name: "Add token" });
    expect(add().getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(add().getAttribute("aria-pressed")).toBe("true");
    placeInCentre();
    expect(add().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(add());
    expect(add().getAttribute("aria-pressed")).toBe("true");
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(add().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(add());
    fireEvent.click(add());
    expect(add().getAttribute("aria-pressed")).toBe("false");
  });

  it("zooms the preview with +, - and Fit like Walls and Fog, sending nothing", () => {
    const fake = mount(withPlayer(room())); openSight();
    const svg = () => document.querySelector(".map-editor-sight-preview")!;
    const zoom = within(within(editor()).getByRole("group", { name: "Zoom" }));
    const before = svg().getAttribute("viewBox");
    fireEvent.click(zoom.getByRole("button", { name: "+" }));
    expect(svg().getAttribute("viewBox")).not.toBe(before);
    fireEvent.click(zoom.getByRole("button", { name: "Fit" }));
    expect(svg().getAttribute("viewBox")).toBe(before);
    fireEvent.click(zoom.getByRole("button", { name: "+" }));
    fireEvent.click(zoom.getByRole("button", { name: "−" }));
    expect(svg().getAttribute("viewBox")).toBe(before);
    expect(fake.commands).toEqual([]);
  });

  it("sends line of sight and the range only on Save changes", async () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(lineOfSightBox());
    fireEvent.click(limited());
    fireEvent.change(within(editor()).getByLabelText("Sight range in ft"), { target: { value: "60" } });
    expect(within(editor()).getByText("ft")).toBeTruthy();
    expect(fake.commands).toEqual([]);
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([
      { type: "scene.setLineOfSight", enabled: true },
      { type: "scene.setSightRange", range: 60 },
    ]));
  });

  it("previews sight with test tokens only, added, moved and removed without sending anything", () => {
    const state = room({ walls: [{ id: "w", a: { x: 250, y: 0 }, b: { x: 250, y: 600 } }] });
    state.tokens = { hero: { ...token, position: { x: 100, y: 300 } } };
    const fake = mount(state); openSight();
    const panel = within(within(editor()).getByRole("complementary", { name: "Test tokens" }));
    expect(document.querySelectorAll(".sight-preview-token")).toHaveLength(0);
    expect(screen.queryByLabelText("Preview as")).toBeNull();
    const popup = () => editor().querySelector<HTMLElement>(".sight-popup");
    expect(popup()).toBeNull();

    // It opens asking for a first token.
    expect(panel.queryByRole("button", { name: "Token 1" })).toBeNull();
    expect(within(editor()).getByText("Click the map to place a test token.")).toBeTruthy();
    expect(within(editor()).queryByRole("button", { name: /centre/ })).toBeNull();
    placeInCentre();
    expect(within(editor()).queryByText("Click the map to place a test token.")).toBeNull();
    fireEvent.click(panel.getByRole("button", { name: "Add token" }));
    expect(within(editor()).getByText("Click the map to place another token.")).toBeTruthy();
    placeInCentre();
    // Both start on square centres (50 px squares), the second one square right of the first.
    const centres = [...document.querySelectorAll(".sight-test-token circle")].map((c) => [c.getAttribute("cx"), c.getAttribute("cy")]);
    expect(centres).toEqual([["425", "325"], ["475", "325"]]);
    // The first token was shown on its own; the second joined it, as everyone was shown.
    expect(popup()).toBeNull();
    fireEvent.click(panel.getByRole("checkbox", { name: "Show Token 2's sight" }));
    expect(popup()?.textContent).toBe("Token 1 sees 1 of 1 other token.");

    // Token 2 starts a square right of Token 1; five squares left puts it behind the wall.
    const second = within(editor()).getByRole("button", { name: /^Token 2\./ });
    for (let i = 0; i < 5; i++) fireEvent.keyDown(second, { key: "ArrowLeft" });
    expect(popup()?.textContent).toBe("Token 1 sees 0 of 1 other token.");

    fireEvent.click(panel.getByRole("button", { name: "Remove Token 2" }));
    expect(popup()).toBeNull();
    expect(fake.commands).toEqual([]);
  });

  it("opens and closes a door for the preview only", () => {
    const fake = mount(room({ walls: [{ id: "d", a: { x: 250, y: 0 }, b: { x: 250, y: 600 }, portal: { kind: "door", state: "locked" } }] })); openSight();
    const panel = within(within(editor()).getByRole("complementary", { name: "Test tokens" }));
    placeInCentre();
    fireEvent.click(panel.getByRole("button", { name: "Add token" }));
    placeInCentre();
    const second = within(editor()).getByRole("button", { name: /^Token 2\./ });
    for (let i = 0; i < 5; i++) fireEvent.keyDown(second, { key: "ArrowLeft" });
    fireEvent.click(panel.getByRole("checkbox", { name: "Show Token 2's sight" }));
    const popup = () => editor().querySelector<HTMLElement>(".sight-popup")?.textContent;
    expect(popup()).toBe("Token 1 sees 0 of 1 other token.");
    fireEvent.keyDown(within(editor()).getByRole("button", { name: /^Door, locked\./ }), { key: "Enter" });
    expect(popup()).toBe("Token 1 sees 1 of 1 other token.");
    // A pointer press and release on the door, as MapCanvas delivers it, closes it again.
    const hit = within(editor()).getByRole("button", { name: /^Door, open\./ }).querySelector(".sight-portal-hit")!;
    fireEvent.pointerDown(hit, { button: 0, pointerId: 1 });
    fireEvent.pointerUp(hit, { button: 0, pointerId: 1 });
    expect(popup()).toBe("Token 1 sees 0 of 1 other token.");
    expect(fake.commands).toEqual([]);
  });

  it("Select all, the empty map, pressing a token and Close decide whose sight is shown", () => {
    mount(room({ walls: [{ id: "w", a: { x: 250, y: 0 }, b: { x: 250, y: 600 } }] })); openSight();
    const panel = within(within(editor()).getByRole("complementary", { name: "Test tokens" }));
    placeInCentre();
    fireEvent.click(panel.getByRole("button", { name: "Add token" }));
    placeInCentre();
    const svg = document.querySelector(".map-editor-sight-preview")!;
    const box = (name: string) => panel.getByRole("checkbox", { name }) as HTMLInputElement;
    const all = () => panel.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
    const popup = () => editor().querySelector<HTMLElement>(".sight-popup");
    expect(all().checked).toBe(true);
    fireEvent.click(all());
    expect([box("Show Token 1's sight").checked, box("Show Token 2's sight").checked, all().checked]).toEqual([false, false, false]);
    fireEvent.click(box("Show Token 1's sight"));
    expect(all().indeterminate).toBe(true);
    expect(popup()?.textContent).toBe("Token 1 sees 1 of 1 other token.");
    // Close hides the notice without changing what is shown, until that changes.
    fireEvent.click(within(popup()!).getByRole("button", { name: "Close" }));
    expect(popup()).toBeNull();
    expect(box("Show Token 1's sight").checked).toBe(true);
    // The empty map changes nothing.
    fireEvent.pointerDown(svg);
    expect(box("Show Token 1's sight").checked).toBe(true);
    // Pressing a token focuses it.
    fireEvent.keyDown(within(editor()).getByRole("button", { name: /^Token 2\./ }), { key: "Enter" });
    expect([box("Show Token 1's sight").checked, box("Show Token 2's sight").checked]).toEqual([false, true]);
    // Several shown: "They".
    fireEvent.click(panel.getByRole("button", { name: "Add token" }));
    placeInCentre();
    fireEvent.click(box("Show Token 1's sight"));
    expect(popup()?.textContent).toBe("They see 1 of 1 other token.");
  });

  it("draws windows in their own colour class", () => {
    mount(room({ walls: [
      { id: "d", a: { x: 250, y: 0 }, b: { x: 250, y: 300 }, portal: { kind: "door", state: "closed" } },
      { id: "win", a: { x: 250, y: 300 }, b: { x: 250, y: 600 }, portal: { kind: "window", state: "closed" } },
    ] })); openSight();
    expect(document.querySelectorAll(".sight-preview-portal")).toHaveLength(1);
    expect(document.querySelectorAll(".sight-preview-window")).toHaveLength(1);
  });

  it("the slider moves the range in whole squares", async () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(limited());
    fireEvent.change(within(editor()).getByLabelText("Sight range in squares"), { target: { value: "6" } });
    expect((within(editor()).getByLabelText("Sight range in ft") as HTMLInputElement).value).toBe("30");
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.setSightRange", range: 30 }]));
  });

  it("Discard sends nothing", async () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(lineOfSightBox());
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByText(/Unsaved changes/)).toBeNull());
    expect(fake.commands).toEqual([]);
  });

  it("Unlimited sends range null", async () => {
    const state = withPlayer(room()); state.scene.sightRange = 40;
    const fake = mount(state); openSight();
    fireEvent.click(unlimited());
    fireEvent.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fake.commands).toEqual([{ type: "scene.setSightRange", range: null }]));
  });

  it("asks before leaving Sight with unsaved changes", () => {
    const fake = mount(withPlayer(room())); openSight();
    fireEvent.click(lineOfSightBox());
    fireEvent.click(within(editor()).getByRole("tab", { name: "3 · Walls" }));
    expect(screen.getByRole("dialog", { name: "Save changes?" })).toBeTruthy();
    expect(fake.commands).toEqual([]);
  });

  it("the library map editor has no Sight step", () => {
    vi.spyOn(api.detection, "library").mockResolvedValue(null);
    vi.spyOn(api.library, "board").mockResolvedValue({ walls: [], fog: [] });
    const asset: LibraryAsset = { id: "map1", kind: "map", name: "Crypt", url: "/crypt.png", width: 700, height: 700, grid: DEFAULT_GRID, createdAt: "2026-10-18T00:00:00Z" };
    render(<LibraryMapEditor asset={asset} onClose={() => {}} onSaved={() => {}} />);
    expect(screen.queryByRole("tab", { name: /Sight/ })).toBeNull();
  });
});

describe("token dialog hand-off from the leave-step prompt (FR-GM-04)", () => {
  const replacement: LibraryAsset = { id: "new-map", kind: "map", name: "New map", url: "/uploads/new.png", width: 800, height: 600, grid: DEFAULT_GRID, createdAt: "2026-10-18T00:00:00.000Z" };
  const setup = () => {
    accountStore.setState({ status: "signedIn", account: { id: "user", email: "gm@example.com", displayName: "GM" } });
    vi.spyOn(api.library, "list").mockResolvedValue([replacement]);
    vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
    const state = room(); state.tokens.hero = token;
    return mount(state);
  };
  const prepared = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit map" }));
    fireEvent.click(screen.getByRole("button", { name: "From library" }));
    fireEvent.click(await screen.findByTitle(replacement.name));
    fireEvent.click(within(editor()).getByRole("tab", { name: "3 · Walls" }));
    return within(await screen.findByRole("dialog", { name: "Apply this map?" }));
  };

  it("Apply map opens the tokens dialog, then sends setMap with the policy and moves on", async () => {
    const fake = setup();
    const prompt = await prepared();
    fireEvent.click(prompt.getByRole("button", { name: "Apply map" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tokens already on the table" }));
    expect(fake.commands).toEqual([]);
    fireEvent.click(dialog.getByRole("radio", { name: /^Keep positions/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Apply map" }));
    await waitFor(() => expect(fake.commands).toEqual([expect.objectContaining({ type: "scene.setMap", tokenPolicy: "keep" })]));
    await waitFor(() => expect(within(editor()).getByRole("tab", { name: "3 · Walls" }).getAttribute("aria-selected")).toBe("true"));
  });

  it("Cancel in the tokens dialog sends nothing", async () => {
    const fake = setup();
    const prompt = await prepared();
    fireEvent.click(prompt.getByRole("button", { name: "Apply map" }));
    const dialog = within(await screen.findByRole("dialog", { name: "Tokens already on the table" }));
    fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(fake.commands).toEqual([]);
  });
});
