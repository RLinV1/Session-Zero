// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildDetail, BuildFileView, BuildItemView, PublishedBuildItem } from "@vtt/shared";

const builds = vi.hoisted(() => ({
  list: vi.fn(), start: vi.fn(), get: vi.fn(), newPass: vi.fn(), cancelPass: vi.fn(), upload: vi.fn(), editCreature: vi.fn(), renameMap: vi.fn(),
  confirmGrid: vi.fn(), editEncounter: vi.fn(), removeItem: vi.fn(), publish: vi.fn(), published: vi.fn(), removePublished: vi.fn(), discard: vi.fn(),
  setChoices: vi.fn(), saveMapSetup: vi.fn(),
}));
vi.mock("../src/net/api", async (original) => ({ ...(await original<typeof import("../src/net/api")>()), api: { builds } }));
vi.mock("../src/account/RequireAccount", () => ({ RequireAccount: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../src/account/AccountPages", () => ({ AccountMenu: () => null }));
vi.mock("../src/ui/SiteHeader", () => ({ SiteHeader: () => null, HubNav: () => null }));

import { RemoveDialog, BuildPage, GridOverlay } from "../src/pages/build/BuildPage";
import { PassPanel } from "../src/pages/build/PassPanel";
import { DraftCreatureEditor } from "../src/pages/build/DraftEditors";
import { buildMessage, uploadKindFor, RIGHTS_NOTICE } from "../src/pages/build/buildCopy";
import { t } from "../src/i18n/locale";

// jsdom has no <dialog> methods.
HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function close() { this.removeAttribute("open"); };

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  for (const fn of Object.values(builds)) fn.mockReset();
  builds.published.mockResolvedValue({ published: [] });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = async (element: React.ReactNode) => {
  await act(async () => { root.render(element); });
  await act(async () => { await Promise.resolve(); });
};
const text = () => host.textContent ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(label));
const click = async (el: Element | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await act(async () => { await Promise.resolve(); });
};

const file = (over: Partial<BuildFileView> = {}): BuildFileView => ({
  id: "f1", kind: "map", name: "cave.png", width: 700, height: 700, sizeBytes: 100, fromUvtt: false, grid: null, walls: 0, detection: null, url: "/uploads/cave.webp", published: false, board: null, ...over,
});
const item = (over: Partial<BuildItemView> & Pick<BuildItemView, "kind" | "key" | "data">): BuildItemView => ({
  flags: [], notCarriedOver: "", editedByUser: false, published: false, updatedAt: "2026-11-09T00:00:00Z", ...over,
});
const creatureData = (over: Record<string, unknown> = {}) => ({ name: "Goblin", isPlayerCharacter: false, size: 1, hp: 7, maxHp: 7, ac: 13, attacks: [], conditions: [], color: "#336699", imageFileId: null, ...over });
const goblin = (over: Partial<BuildItemView> = {}, data: Record<string, unknown> = {}) => item({ kind: "creature", key: "goblin", data: creatureData(data), ...over });
const map = (over: Record<string, unknown> = {}) => item({ kind: "map", key: "cave", data: { name: "Cave", fileId: "f1", proposedGrid: { cellSize: 70, offsetX: 0, offsetY: 0 }, gridStatus: "proposed", grid: null, ...over } });
const encounter = (tokens: unknown[] = [{ creatureKey: "goblin", square: { column: 1, row: 2 }, hidden: true }]) => item({ kind: "encounter", key: "ambush", data: { name: "Bridge ambush", mapKey: "cave", tokens } });

const detail = (over: Partial<BuildDetail> = {}): BuildDetail => ({
  build: { id: "b1", name: "Hollow Coast", status: "open", createdAt: "2026-11-09T00:00:00Z", updatedAt: "2026-11-09T00:00:00Z", passExpiresAt: "2099-01-01T00:00:00Z", closesAt: "2026-11-23T00:00:00Z", choices: { aiGrid: false, aiWalls: false } },
  profile: { name: "Lanternfall", features: { hitPoints: true, armorClass: true, attacks: true, conditions: true }, unitsPerCell: 5, unitLabel: "ft", notes: "", flags: [] },
  files: [file()],
  items: [],
  ...over,
});
const open = async (d: BuildDetail) => {
  builds.get.mockResolvedValue(d);
  await render(<BuildPage buildId="b1" />);
};

describe("the message for the AI (FR-GM-26)", () => {
  it("holds the right address and the pass", () => {
    const pass = `szb_${"a".repeat(43)}`;
    const message = buildMessage("https://sessionzero.codes", pass);
    expect(message).toContain("https://sessionzero.codes/mcp/build");
    expect(message).toContain(pass);
    expect(message).toMatch(/whose build/);
    expect(message).toMatch(/Don't invent/);
  });

  it("is shown with the warning that the pass appears once", async () => {
    await render(<PassPanel pass="szb_abc" onClose={() => {}} />);
    expect(text()).toMatch(/shown only once/);
    expect(host.querySelector("textarea")?.value).toContain("szb_abc");
    expect(host.querySelector("textarea")?.value).toContain("/mcp/build");
  });
});

describe("what kind a dropped file is (FR-GM-26)", () => {
  it("reads UVTT files by name wherever they land", () => {
    expect(uploadKindFor("crypt.UVTT", "token")).toBe("uvtt");
    expect(uploadKindFor("crypt.dd2vtt", "map")).toBe("uvtt");
    expect(uploadKindFor("crypt.df2vtt", "map")).toBe("uvtt");
  });

  it("otherwise goes by where it was dropped", () => {
    expect(uploadKindFor("goblin.png", "token")).toBe("token");
    expect(uploadKindFor("cave.png", "map")).toBe("map");
  });
});

describe("arriving from the AI builds tab (FR-GM-27, AI builds redesign 2026-11-10)", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("lands on the part of the page its link names once the draft has loaded, with focus on its heading", async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    history.replaceState(null, "", "/builds/b1#build-issues");
    await open(detail({ items: [map()] }));
    const heading = host.querySelector("#build-issues");
    expect(heading?.textContent).toBe("Needs your attention");
    expect(document.activeElement).toBe(heading);
    expect(scrolled.mock.contexts[0]).toBe(heading);
  });

  it("focuses a section's heading when the link names the section", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    history.replaceState(null, "", "/builds/b1#build-publish");
    await open(detail({ items: [goblin()] }));
    expect(document.activeElement?.id).toBe("build-publish-title");
  });

  it("stays at the top without one", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    history.replaceState(null, "", "/builds/b1");
    await open(detail({ items: [map()] }));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
});

describe("reviewing a build (FR-GM-27)", () => {
  it("lists what needs attention first, with each flag's reason", async () => {
    await open(detail({ items: [goblin({ flags: [{ field: "ac", message: "around 14 maybe" }] }), map()] }));
    expect(text()).toContain("Needs your attention");
    expect(text()).toContain("ac: around 14 maybe");
    expect(text().indexOf("Needs your attention")).toBeLessThan(text().indexOf("Creatures and characters"));
  });

  it("shows flagged creatures before the others", async () => {
    await open(detail({ items: [goblin({ key: "a" }, { name: "Plain" }), goblin({ key: "b", flags: [{ field: "hp", message: "unclear" }] }, { name: "Flagged" })] }));
    const names = [...host.querySelectorAll(".build-list h3")].map((h) => h.textContent);
    expect(names).toEqual(["Flagged", "Plain"]);
  });

  it("shows blanks as blank rather than as a number", async () => {
    await open(detail({ items: [goblin({}, { hp: null })] }));
    expect(host.querySelector(".build-stats")?.textContent).toContain("HP blank");
  });

  it("renders markup in a name as plain text", async () => {
    await open(detail({ items: [goblin({}, { name: "<img src=x onerror=alert(1)>" })] }));
    expect(host.querySelector(".build-list img[src='x']")).toBeNull();
    expect(text()).toContain("<img src=x onerror=alert(1)>");
  });

  it("marks a visible token's name as seen by players, and a hidden one as hidden", async () => {
    await open(detail({ items: [goblin(), map({ gridStatus: "confirmed" }), encounter([
      { creatureKey: "goblin", name: "Scout", square: { column: 1, row: 1 }, hidden: false },
      { creatureKey: "goblin", name: "Lurker", square: null, hidden: true },
    ])] }));
    const rows = [...host.querySelectorAll(".build-tokens li")].map((li) => li.textContent);
    expect(rows[0]).toContain("Players see this name");
    expect(rows[1]).toContain("Hidden");
    expect(rows[1]).toContain("not placed");
  });

  it("says why an encounter can't be published, and offers no box for it", async () => {
    await open(detail({ items: [goblin(), map(), encounter()] }));
    expect(text()).toContain("Can't be published yet. Confirm the grid on Cave first.");
    const card = [...host.querySelectorAll(".build-card")].find((c) => c.textContent?.includes("Bridge ambush"))!;
    expect(card.querySelector("input[type=checkbox]")).toBeNull();
  });

  it("draws the proposed grid over the map and confirms what's in the fields", async () => {
    builds.confirmGrid.mockResolvedValue({ item: map({ gridStatus: "confirmed" }) });
    await open(detail({ items: [map()] }));
    expect(host.querySelector(".build-map pattern")?.getAttribute("width")).toBe("70");
    await click(button("Confirm grid"));
    expect(builds.confirmGrid).toHaveBeenCalledWith("b1", "cave", { cellSize: 70, offsetX: 0, offsetY: 0 });
  });

  it("offers the detected grid when there's a suggestion", async () => {
    await open(detail({ files: [file({ detection: { status: "suggested", suggestion: { cellSize: 64, offsetX: 3, offsetY: 4 } } })], items: [map({ proposedGrid: null, gridStatus: "none" })] }));
    expect(button("Use the detected grid")).toBeTruthy();
    expect((host.querySelector(".build-fields input") as HTMLInputElement).value).toBe("64");
  });

  it("publishes only what's selected", async () => {
    builds.publish.mockResolvedValue({ published: { assets: 0, creatures: [{ key: "a", id: "c1" }], maps: [], encounters: [] } });
    await open(detail({ items: [goblin({ key: "a" }), goblin({ key: "b" })] }));
    const boxes = [...host.querySelectorAll<HTMLInputElement>(".build-list input[type=checkbox]")];
    await click(boxes[0]);
    await click(button("Publish selected"));
    expect(builds.publish).toHaveBeenCalledWith("b1", { creatures: ["a"], maps: [], encounters: [], reviewed: { "creature/a": "2026-11-09T00:00:00Z", "creature/b": "2026-11-09T00:00:00Z", profile: "5 ft" } });
  });

  it("says what the AI changed since the person looked, and won't publish it until they've checked it", async () => {
    builds.cancelPass.mockResolvedValue(undefined);
    builds.publish.mockResolvedValue({ published: { assets: 0, creatures: [{ key: "goblin", id: "c1" }], maps: [], encounters: [] } });
    await open(detail({ items: [goblin()] }));
    await click(button("Select all"));
    builds.get.mockResolvedValue(detail({ items: [goblin({ updatedAt: "2026-11-09T00:05:00Z" }, { hp: 99, maxHp: 99 })] }));
    await click(button("Cancel pass"));
    expect(text()).toContain("Changed by your AI since you looked");
    expect(button("Publish selected")?.disabled).toBe(true);
    await click(button("I've checked it"));
    expect(text()).not.toContain("Changed by your AI since you looked");
    await click(button("Publish selected"));
    expect(builds.publish).toHaveBeenCalledWith("b1", expect.objectContaining({ reviewed: { "creature/goblin": "2026-11-09T00:05:00Z", profile: "5 ft" } }));
  });

  it("doesn't call the person's own edit a change by the AI", async () => {
    builds.editCreature.mockResolvedValue({ item: goblin({ updatedAt: "2026-11-09T00:07:00Z", editedByUser: true }) });
    await open(detail({ items: [goblin()] }));
    builds.get.mockResolvedValue(detail({ items: [goblin({ updatedAt: "2026-11-09T00:07:00Z", editedByUser: true })] }));
    await click(button("Edit"));
    await act(async () => { document.querySelector("dialog[open] form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(text()).not.toContain("Changed by your AI since you looked");
  });

  it("asks first when something chosen still has flags", async () => {
    await open(detail({ items: [goblin({ flags: [{ field: "hp", message: "unclear" }] })] }));
    await click(button("Select all"));
    await click(button("Publish selected"));
    expect(builds.publish).not.toHaveBeenCalled();
    expect(text()).toMatch(/Blank values stay blank/);
  });

  it("publishing repeats the rights notice", async () => {
    await open(detail({ items: [goblin()] }));
    const section = host.querySelector("#build-publish");
    expect(section?.textContent).toContain(t(RIGHTS_NOTICE));
  });

  it("shows the server's reasons when publishing fails", async () => {
    builds.publish.mockRejectedValue(new Error("encounter ambush: Goblin: It would stand across a wall."));
    await open(detail({ items: [goblin()] }));
    await click(button("Select all"));
    await click(button("Publish selected"));
    expect(host.querySelector("[role=alert]")?.textContent).toContain("across a wall");
  });

  it("offers a room for a published encounter", async () => {
    builds.publish.mockResolvedValue({ published: { assets: 0, creatures: [], maps: [], encounters: [{ key: "ambush", id: "t1", name: "Bridge ambush" }] } });
    await open(detail({ items: [goblin()] }));
    await click(button("Select all"));
    await click(button("Publish selected"));
    expect(button("Start a room")).toBeTruthy();
  });

  it("explains how to give a character to a player, and copies its notes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    builds.published.mockResolvedValue({ published: [{ type: "creature", id: "c1", name: "Oswin", rooms: [], creatures: [], encounters: [] }] });
    await open(detail({ items: [goblin({ notCarriedOver: "Spells: Light" }, { name: "Oswin", isPlayerCharacter: true })] }));
    expect(text()).toMatch(/set who controls it/);
    await click(button("Copy notes"));
    expect(writeText).toHaveBeenCalledWith("Spells: Light");
  });

  it("asks before a new pass ends the live one, then says the old one stopped", async () => {
    builds.newPass.mockResolvedValue({ pass: "szb_second", expiresAt: "2099-01-01T00:00:00Z" });
    await open(detail());
    await click(button("New pass"));
    expect(builds.newPass).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open]")?.textContent).toContain("The pass your AI has now stops working at once.");
    await click(button("Make a new pass"));
    expect(host.querySelector("textarea")?.value).toContain("szb_second");
    expect(text()).toContain("Your earlier pass has stopped working.");
  });

  it("makes a pass straight away when there is no live one", async () => {
    builds.newPass.mockResolvedValue({ pass: "szb_first", expiresAt: "2099-01-01T00:00:00Z" });
    await open(detail({ build: { ...detail().build, passExpiresAt: null } }));
    await click(button("New pass"));
    expect(builds.newPass).toHaveBeenCalled();
    expect(text()).not.toContain("Your earlier pass has stopped working.");
  });

  it("cancels the pass", async () => {
    builds.cancelPass.mockResolvedValue(undefined);
    await open(detail());
    await click(button("Cancel pass"));
    expect(builds.cancelPass).toHaveBeenCalledWith("b1");
  });

  it("says when the build will close", async () => {
    await open(detail());
    expect(text()).toMatch(/this build closes on November 2[23]/);
  });

  it("asks before discarding", async () => {
    builds.discard.mockResolvedValue(undefined);
    await open(detail());
    await click(button("Discard this build"));
    expect(builds.discard).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open] h2")?.textContent).toBe("Discard Hollow Coast?");
    await click([...host.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Discard"));
    expect(builds.discard).toHaveBeenCalledWith("b1");
  });

  it("reads as not found for someone else's build", async () => {
    const { ApiError } = await import("../src/net/api");
    builds.get.mockRejectedValue(new ApiError("No such build.", 404));
    await render(<BuildPage buildId="b1" />);
    expect(text()).toContain("Build not found");
  });

  it("shows a closed build's published list and nothing to edit", async () => {
    builds.published.mockResolvedValue({ published: [{ type: "creature", id: "c1", name: "Goblin", rooms: [], creatures: [], encounters: [] }] });
    await open(detail({ build: { ...detail().build, status: "closed" }, items: [goblin({ published: true })] }));
    expect(text()).toMatch(/This build is closed/);
    expect(text()).toContain("In your library from this build");
    expect(button("Discard this build")).toBeUndefined();
    expect(button("Publish selected")).toBeUndefined();
  });
});

describe("the small pieces of the build page (FR-GM-27)", () => {
  it("draws no grid until there's a size", async () => {
    await render(<GridOverlay file={file()} grid={null} />);
    expect(host.querySelector("svg")).toBeNull();
  });

  it("lists rooms in use before removing, and says no room is deleted", async () => {
    const used: PublishedBuildItem = { type: "asset", id: "a1", name: "Cave", rooms: [{ id: "r1", name: "Tuesday game" }], creatures: [], encounters: [{ id: "e1", name: "Ambush" }] };
    const onConfirm = vi.fn();
    await render(<RemoveDialog items={[used]} onClose={() => {}} onConfirm={onConfirm} />);
    expect(text()).toContain("Tuesday game");
    expect(text()).toContain("the map for Ambush");
    expect(text()).toContain("no room is deleted");
    await click(button("Remove"));
    expect(onConfirm).toHaveBeenCalledWith(["a1"]);
  });

  it("the creature editor sends a blank as null and reads dice", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const attacks = [{ name: "Bite", toHit: { count: 1, sides: 20, modifier: 4 }, damage: null }];
    await render(<DraftCreatureEditor data={creatureData({ hp: null, attacks }) as never} files={[]} onSave={onSave} onCancel={() => {}} />);
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ hp: null, maxHp: 7, attacks: [{ name: "Bite", toHit: { count: 1, sides: 20, modifier: 4 }, damage: null }] }));
  });

  it("the creature editor refuses text that isn't dice", async () => {
    const onSave = vi.fn();
    const attacks = [{ name: "Bite", toHit: { count: 1, sides: 20, modifier: 4 }, damage: null }];
    await render(<DraftCreatureEditor data={creatureData({ attacks }) as never} files={[]} onSave={onSave} onCancel={() => {}} />);
    const damage = host.querySelector("input[aria-label='Attack 1 damage']") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(damage, "lots");
      damage.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(onSave).not.toHaveBeenCalled();
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Bite");
  });
});

describe("walls, doors and windows in review (FR-GM-27, ADR 0053)", () => {
  // A UVTT map of 10 by 10 squares of 70 pixels: one wall, one opening in it, and one more opening.
  const board = {
    walls: [
      { a: { x: 0, y: 140 }, b: { x: 140, y: 140 } },
      { a: { x: 140, y: 140 }, b: { x: 210, y: 140 }, uvttPortal: { closed: true } },
      { a: { x: 280, y: 0 }, b: { x: 280, y: 70 }, uvttPortal: { closed: false } },
    ],
    fog: [],
  };
  const uvttFile = file({ fromUvtt: true, walls: 3, board, grid: { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" } });
  const setup = {
    openings: [{ number: 1, kind: "door" as const, state: "locked" as const }, { number: 2, kind: "leave" as const, reason: "Could be an archway." }],
    lines: [{ from: { column: 4, row: 2 }, to: { column: 6, row: 2 }, kind: "wall" as const }],
    marks: [{ square: { column: 7, row: 7 }, reason: "Curved cave wall." }],
  };
  const shop = (over: Partial<BuildItemView> = {}) => item({
    kind: "map", key: "shop",
    data: { name: "Chandlery", fileId: "f1", proposedGrid: null, gridStatus: "confirmed", grid: uvttFile.grid, gridBy: "file", setup },
    ...over,
  });
  const choose = async (select: HTMLSelectElement | null, value: string) => {
    expect(select).toBeTruthy();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, value);
      select!.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  it("shows the two choices on the build page, and only the owner's page changes them", async () => {
    builds.setChoices.mockResolvedValue({ build: detail().build });
    await open(detail());
    const boxes = [...host.querySelectorAll<HTMLInputElement>(".build-choices input[type=checkbox]")];
    expect(boxes.map((b) => b.checked)).toEqual([false, false]);
    await click(boxes[0]);
    expect(builds.setChoices).toHaveBeenCalledWith("b1", { aiGrid: true, aiWalls: false });
  });

  it("draws every wall, door, window and opening, numbered, and marks what the AI set", async () => {
    await open(detail({ files: [uvttFile], items: [shop()] }));
    const kinds = [...host.querySelectorAll(".build-walls-drawn path[data-kind]")].map((p) => p.getAttribute("data-kind"));
    // The drawn wall, the door the AI made, the opening left as the file has it, and the file's wall.
    expect(kinds.sort()).toEqual(["door", "opening", "wall", "wall"]);
    expect([...host.querySelectorAll(".build-walls-drawn text")].map((t) => t.textContent)).toEqual(["1", "2", "!"]);
    expect(host.querySelector("[data-ai-set]")?.getAttribute("data-ai-set")).toBe("2");
    expect(text()).toContain("Opening 1 at column 2, row 2");
    expect(text()).toContain("Set by your AI");
  });

  it("lists what the AI left for the owner, with its reasons", async () => {
    await open(detail({ files: [uvttFile], items: [shop()] }));
    expect(text()).toContain("Could be an archway.");
    expect(text()).toContain("Left for you at column 7, row 7");
    expect(text()).toContain("Curved cave wall.");
  });

  it("changes an opening, sending the whole setup", async () => {
    builds.saveMapSetup.mockResolvedValue({ item: shop({ editedByUser: true }) });
    await open(detail({ files: [uvttFile], items: [shop()] }));
    await choose(host.querySelector("select[aria-label='Opening 1 state']"), "closed");
    // With the version the page showed, so a change made since is refused rather than overwritten.
    expect(builds.saveMapSetup).toHaveBeenCalledWith("b1", "shop", { ...setup, openings: [{ number: 1, kind: "door", state: "closed" }, setup.openings[1]] }, "2026-11-09T00:00:00Z");
  });

  it("removes one line, or everything the AI set", async () => {
    builds.saveMapSetup.mockResolvedValue({ item: shop({ editedByUser: true }) });
    await open(detail({ files: [uvttFile], items: [shop()] }));
    await click([...host.querySelectorAll(".build-wall-list button")].find((b) => b.textContent === "Remove"));
    expect(builds.saveMapSetup).toHaveBeenLastCalledWith("b1", "shop", { ...setup, lines: [] }, "2026-11-09T00:00:00Z");
    await click(button("Remove everything your AI set"));
    expect(builds.saveMapSetup).toHaveBeenLastCalledWith("b1", "shop", { openings: [], lines: [], marks: [] }, "2026-11-09T00:00:00Z");
  });

  const cavePattern = () => host.querySelector(".build-map pattern")?.getAttribute("width");
  // Any action reloads the build; cancelling the pass is the plainest one.
  const refreshWith = async (d: BuildDetail) => {
    builds.get.mockResolvedValue(d);
    builds.cancelPass.mockResolvedValue(undefined);
    await click(button("Cancel pass"));
  };

  it("redraws the grid when the AI changes it, so what's drawn is what publishes", async () => {
    await open(detail({ items: [plain({ gridStatus: "proposed", grid: null })] }));
    expect(cavePattern()).toBe("70");
    await refreshWith(detail({ items: [plain({ gridStatus: "confirmed", gridBy: "agreement", proposedGrid: { cellSize: 72, offsetX: 0, offsetY: 0 }, grid: { cellSize: 72, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" } })] }));
    expect(cavePattern()).toBe("72");
    expect((host.querySelector(".build-fields input") as HTMLInputElement).value).toBe("72");
  });

  it("keeps the owner's typed grid, and says it isn't saved", async () => {
    await open(detail({ items: [plain({ gridStatus: "proposed", grid: null })] }));
    const field = host.querySelector(".build-fields input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "75");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await refreshWith(detail({ items: [plain({ gridStatus: "proposed", grid: null, proposedGrid: { cellSize: 72, offsetX: 0, offsetY: 0 } })] }));
    expect(cavePattern()).toBe("75");
    expect(text()).toContain("The grid in the fields isn't saved. Publishing uses 72-pixel squares at offset (0, 0)");
    await click(button("Put the saved grid back"));
    expect(cavePattern()).toBe("72");
  });

  it("holds publishing back when the AI changed the square size, until the owner has looked", async () => {
    builds.publish.mockResolvedValue({ published: { assets: 1, creatures: [], maps: [{ key: "cave", id: "m1" }], encounters: [] } });
    const cave = plain({ gridBy: "agreement" });
    await open(detail({ items: [cave] }));
    const profile = { ...detail().profile!, unitsPerCell: 10 };
    await refreshWith(detail({ items: [cave], profile }));
    expect(text()).toContain("Game profile: one square is now 10 ft");
    await click(host.querySelector(".build-check input") ?? undefined);
    expect(button("Publish selected")?.hasAttribute("disabled")).toBe(true);
    await click(button("I've checked it"));
    await click(button("Publish selected"));
    expect(builds.publish).toHaveBeenCalledWith("b1", expect.objectContaining({ reviewed: expect.objectContaining({ profile: "10 ft" }) }));
  });

  const plain = (data: Record<string, unknown>) => item({ kind: "map", key: "cave", data: { name: "Cave", fileId: "f1", proposedGrid: { cellSize: 70, offsetX: 0, offsetY: 0 }, gridStatus: "confirmed", grid: { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" }, ...data } });

  it("says when detection and the AI agreed on a grid", async () => {
    await open(detail({ items: [plain({ gridBy: "agreement" })] }));
    expect(text()).toContain("Grid set by detection and your AI");
  });

  it("says when the AI's grid differs from detection's", async () => {
    await open(detail({ items: [plain({ gridStatus: "proposed", grid: null, gridDiffers: { cellSize: 72, offsetX: 0, offsetY: 0 } })] }));
    expect(text()).toContain("Your AI's grid differs from detection");
  });

  it("asks first before publishing a map with openings or places left for the owner", async () => {
    builds.publish.mockResolvedValue({ published: { assets: 1, creatures: [], maps: [{ key: "shop", id: "m1" }], encounters: [] } });
    await open(detail({ files: [uvttFile], items: [shop()] }));
    await click(host.querySelector(".build-check input") ?? undefined);
    await click(button("Publish selected"));
    expect(builds.publish).not.toHaveBeenCalled();
    expect(text()).toContain("openings left for you publish as the file had them");
    await click(button("Publish anyway"));
    expect(builds.publish).toHaveBeenCalled();
  });
});

describe("the build page reads as the owner's, not the AI's (FR-GM-27, design review 2026-11-10)", () => {
  it("says what's in the draft and what's left, with a way to Publish", async () => {
    await open(detail({ items: [goblin({ flags: [{ field: "hp", message: "unclear" }] }), map()] }));
    const summary = host.querySelector(".build-summary");
    expect(summary?.textContent).toBe("Your AI has saved 1 map and 1 creature. 1 thing needs fixing, and it left 1 note for you. Check each item, then publish what you choose.");
    expect(summary?.querySelector("a")?.getAttribute("href")).toBe("#build-publish");
  });

  it("groups issues under words, names each item and links to its card, in the owner's words", async () => {
    await open(detail({ items: [goblin({ flags: [{ field: "maxHp", message: "two numbers on the sheet" }] }), map()] }));
    const titles = [...host.querySelectorAll(".build-issues-title")].map((h) => h.textContent);
    expect(titles).toEqual(["To fix (1)", "Notes from your AI (1)"]);
    const links = [...host.querySelectorAll<HTMLAnchorElement>("a.build-issue-item")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([["Cave", "#build-map-cave"], ["Goblin", "#build-creature-goblin"]]);
    expect(host.querySelector("#build-map-cave")).toBeTruthy();
    expect(text()).toContain("Max HP: two numbers on the sheet");
    expect(text()).toContain("Its grid is waiting for you. Check it on the map below, then confirm it.");
    expect(text()).not.toMatch(/the GM|save_map|left for the user/);
  });

  it("asks before removing a draft item, naming it", async () => {
    builds.removeItem.mockResolvedValue(undefined);
    await open(detail({ items: [goblin()] }));
    await click(button("Remove"));
    expect(builds.removeItem).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open] h2")?.textContent).toBe("Remove Goblin from this draft?");
    await click([...host.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Remove"));
    expect(builds.removeItem).toHaveBeenCalledWith("b1", "creature", "goblin");
  });

  it("shows a publish in progress, and sends nothing twice", async () => {
    let finish: (value: unknown) => void = () => {};
    builds.publish.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await open(detail({ items: [goblin()] }));
    await click(button("Select all"));
    await click(button("Publish selected"));
    expect(button("Publishing…")?.hasAttribute("disabled")).toBe(true);
    expect(button("Remove")?.hasAttribute("disabled")).toBe(true);
    await act(async () => { finish({ published: { assets: 0, creatures: [], maps: [], encounters: [] } }); });
    expect(builds.publish).toHaveBeenCalledTimes(1);
  });

  it("brings an error into view and focuses it", async () => {
    builds.publish.mockRejectedValue(new Error("Something changed since you looked at it."));
    await open(detail({ items: [goblin()] }));
    await click(button("Select all"));
    await click(button("Publish selected"));
    expect(document.activeElement?.getAttribute("role")).toBe("alert");
    expect(document.activeElement?.textContent).toBe("Something changed since you looked at it.");
  });

  it("keeps the selection in view while ticking items", async () => {
    await open(detail({ items: [goblin()] }));
    expect(host.querySelector(".build-publish-bar")).toBeNull();
    await click(host.querySelector(".build-check input") ?? undefined);
    expect(host.querySelector(".build-publish-bar")?.textContent).toBe("1 selectedReview and publish");
  });

  it("offers no grid to confirm on a UVTT map, whose grid is exact", async () => {
    const uvtt = file({ fromUvtt: true, grid: { cellSize: 50, offsetX: 0, offsetY: 0, unitsPerCell: 5, unitLabel: "ft" } });
    await open(detail({ files: [uvtt], items: [map({ gridStatus: "confirmed", gridBy: "file", grid: uvtt.grid, proposedGrid: null })] }));
    expect(text()).toContain("Grid from the UVTT file: 50-pixel squares.");
    expect(button("Confirm grid")).toBeUndefined();
    expect(host.querySelector(".build-fields")).toBeNull();
  });

  it("goes back to AI builds, not the first library tab", async () => {
    await open(detail());
    expect(host.querySelector(".small-print a")?.getAttribute("href")).toBe("/library?tab=builds");
  });
});
