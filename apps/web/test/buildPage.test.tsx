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
/** A button by its words, or by its name when it's an icon. */
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => (b.textContent?.trim() || b.getAttribute("aria-label") || "").startsWith(label));
/** The one Publish button, on the bar that appears once something is chosen. */
const publishNow = () => host.querySelector<HTMLButtonElement>(".build-publish-bar button.primary") ?? undefined;
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
    expect(heading?.textContent).toBe("Review");
    expect(host.querySelector("#build-notes-fix")?.getAttribute("aria-pressed")).toBe("true");
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
    // Fixes show first; the notes are one switch away.
    expect(host.querySelector(".build-group.build-flag")).toBeNull();
    await click(host.querySelector("#build-notes") ?? undefined);
    const note = host.querySelector(".build-group.build-flag")!;
    expect(note.querySelector("dt")?.textContent).toBe("AC");
    expect(note.querySelector("dd")?.textContent).toBe("around 14 maybe");
    expect(text().indexOf("To fix")).toBeLessThan(text().indexOf("Creatures and characters"));
    expect(text().indexOf("Notes from your AI")).toBeLessThan(text().indexOf("Creatures and characters"));
  });

  it("shows flagged creatures before the others", async () => {
    await open(detail({ items: [goblin({ key: "a" }, { name: "Plain" }), goblin({ key: "b", flags: [{ field: "hp", message: "unclear" }] }, { name: "Flagged" })] }));
    const names = [...host.querySelectorAll(".build-roster-name")].map((h) => h.textContent);
    expect(names).toEqual(["Flagged", "Plain"]);
  });

  it("shows blanks as blank rather than as a number", async () => {
    await open(detail({ items: [goblin({}, { hp: null })] }));
    expect([...host.querySelectorAll(".build-plate")].map((p) => p.textContent)).toContain("HPblank");
  });

  it("renders markup in a name as plain text", async () => {
    await open(detail({ items: [goblin({}, { name: "<img src=x onerror=alert(1)>" })] }));
    expect(host.querySelector(".build-roster img[src='x']")).toBeNull();
    expect(text()).toContain("<img src=x onerror=alert(1)>");
  });

  it("marks a visible token's name as seen by players, and a hidden one as hidden", async () => {
    await open(detail({ items: [goblin(), map({ gridStatus: "confirmed" }), encounter([
      { creatureKey: "goblin", name: "Scout", square: { column: 1, row: 1 }, hidden: false },
      { creatureKey: "goblin", name: "Lurker", square: null, hidden: true },
    ])] }));
    const rows = [...host.querySelectorAll(".build-board-token")];
    const scout = rows.find((li) => li.textContent?.startsWith("Scout"))!;
    const lurker = rows.find((li) => li.textContent?.startsWith("Lurker"))!;
    expect(scout.textContent).toContain("Visible");
    expect(text()).toContain("Players see the name of every visible token.");
    expect(lurker.textContent).toContain("Hidden");
    // A token with no square waits under its own heading, off the map.
    expect(lurker.closest("ul")?.previousElementSibling?.textContent).toBe("Not placed yet 1");
    expect(host.querySelectorAll(".build-plot .build-mark")).toHaveLength(1);
    expect(host.querySelector(".build-plot .build-mark-hidden")).toBeNull();
  });

  it("says why an encounter can't be published, and offers no box for it", async () => {
    await open(detail({ items: [goblin(), map(), encounter()] }));
    expect(text()).toContain("Can't be published yet. Confirm the grid on Cave first.");
    expect(host.querySelector("#build-encounter-panel .build-board-head input[type=checkbox]")).toBeNull();
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
    const boxes = [...host.querySelectorAll<HTMLInputElement>(".build-roster-row input[type=checkbox]")];
    await click(boxes[0]);
    await click(publishNow());
    expect(builds.publish).toHaveBeenCalledWith("b1", { creatures: ["a"], maps: [], encounters: [], reviewed: { "creature/a": "2026-11-09T00:00:00Z", "creature/b": "2026-11-09T00:00:00Z", profile: "5 ft" } });
  });

  it("says what the AI changed since the person looked, and won't publish it until they've checked it", async () => {
    builds.cancelPass.mockResolvedValue(undefined);
    builds.publish.mockResolvedValue({ published: { assets: 0, creatures: [{ key: "goblin", id: "c1" }], maps: [], encounters: [] } });
    await open(detail({ items: [goblin()] }));
    await click(button("Choose everything"));
    builds.get.mockResolvedValue(detail({ items: [goblin({ updatedAt: "2026-11-09T00:05:00Z" }, { hp: 99, maxHp: 99 })] }));
    await click(button("Cancel pass"));
    expect(text()).toContain("Changed by your AI since you looked");
    expect(publishNow()?.disabled).toBe(true);
    await click(button("I've checked it"));
    expect(text()).not.toContain("Changed by your AI since you looked");
    await click(publishNow());
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
    await click(button("Choose everything"));
    await click(publishNow());
    expect(builds.publish).not.toHaveBeenCalled();
    expect(text()).toMatch(/Blank values stay blank/);
  });

  it("publishing repeats the rights notice", async () => {
    await open(detail({ items: [goblin()] }));
    const section = host.querySelector("#build-publish");
    expect(section?.textContent).toContain(RIGHTS_NOTICE);
  });

  it("shows the server's reasons when publishing fails", async () => {
    builds.publish.mockRejectedValue(new Error("encounter ambush: Goblin: It would stand across a wall."));
    await open(detail({ items: [goblin()] }));
    await click(button("Choose everything"));
    await click(publishNow());
    expect(host.querySelector("[role=alert]")?.textContent).toContain("across a wall");
  });

  it("offers a room for a published encounter", async () => {
    builds.publish.mockResolvedValue({ published: { assets: 0, creatures: [], maps: [], encounters: [{ key: "ambush", id: "t1", name: "Bridge ambush" }] } });
    await open(detail({ items: [goblin()] }));
    await click(button("Choose everything"));
    await click(publishNow());
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
    expect(publishNow()).toBeUndefined();
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
    const attacks = [{ name: "Bite", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: null }];
    await render(<DraftCreatureEditor data={creatureData({ hp: null, attacks }) as never} files={[]} onSave={onSave} onCancel={() => {}} />);
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ hp: null, maxHp: 7, attacks: [{ name: "Bite", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: null }] }));
  });

  it("the creature editor builds mixed dice with the dice builder, with no text field (dice-pool)", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const attacks = [{ name: "Bite", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: null }];
    await render(<DraftCreatureEditor data={creatureData({ attacks }) as never} files={[]} onSave={onSave} onCancel={() => {}} />);
    expect(host.querySelector(".build-attack input[type=text], .build-attack input:not([type])[aria-label*='damage']")).toBeNull();
    const damage = [...host.querySelectorAll("label.checkbox")].find((l) => l.textContent === "Attack 1 damage")!.querySelector("input")!;
    await act(async () => { damage.click(); });
    const addDie = [...host.querySelectorAll("button")].filter((b) => b.textContent === "+ Die").at(-1)!;
    await act(async () => { addDie.click(); });
    await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      attacks: [{ name: "Bite", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: { terms: [{ count: 1, sides: 6 }, { count: 1, sides: 4 }], modifier: 0 } }],
    }));
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
    await click(host.querySelector(".build-wall-list button[aria-label^='Remove line']") ?? undefined);
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
    expect(publishNow()?.hasAttribute("disabled")).toBe(true);
    await click(button("I've checked it"));
    await click(publishNow());
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
    await click(publishNow());
    expect(builds.publish).not.toHaveBeenCalled();
    expect(text()).toContain("openings left for you publish as the file had them");
    await click(button("Publish anyway"));
    expect(builds.publish).toHaveBeenCalled();
  });
});

describe("the build page reads as the owner's, not the AI's (FR-GM-27, design review 2026-11-10)", () => {
  it("says what's in the draft and what's left, with a way to Publish", async () => {
    await open(detail({ items: [goblin({ flags: [{ field: "hp", message: "unclear" }] }), map()] }));
    // The rail: the draft as one bar, then each part of the page as a link with its count.
    expect([...host.querySelectorAll(".build-meter-row")].map((r) => r.textContent)).toEqual(["needs a fix1", "ready1", "published0"]);
    const links = [...host.querySelectorAll<HTMLAnchorElement>(".build-rail-links a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links.slice(0, 4)).toEqual([["To fix1", "#build-issues"], ["Notes from your AI1", "#build-notes"], ["Maps1", "#build-maps"], ["Creatures1", "#build-creatures"]]);
    expect(host.querySelector(".build-rail-links .build-rail-urgent")?.textContent).toBe("1");
    const summary = host.querySelector(".build-summary");
    expect(summary?.textContent).toBe("Fix what's listed, check each item, then publish what you choose.");
    expect(summary?.querySelector("a")?.getAttribute("href")).toBe("#build-publish");
  });

  it("groups issues under words, names each item and links to its card, in the owner's words", async () => {
    await open(detail({ items: [goblin({ flags: [{ field: "maxHp", message: "two numbers on the sheet" }] }), map()] }));
    const switches = [...host.querySelectorAll(".build-queue .seg button")].map((b) => b.textContent);
    expect(switches).toEqual(["To fix 1", "Notes from your AI 1"]);
    const links = () => [...host.querySelectorAll<HTMLAnchorElement>(".build-group-title a")].map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links()).toEqual([["Cave", "#build-map-cave"]]);
    expect(host.querySelector("#build-map-cave")).toBeTruthy();
    expect(text()).toContain("Its grid is waiting for you. Check it on the map below, then confirm it.");
    await click(host.querySelector("#build-notes") ?? undefined);
    expect(links()).toEqual([["Goblin", "#build-creature-goblin"]]);
    expect([...host.querySelectorAll(".build-group.build-flag dt")].map((d) => d.textContent)).toEqual(["Max HP"]);
    expect(text()).toContain("two numbers on the sheet");
    expect(text()).not.toMatch(/the GM|save_map|left for the user/);
  });

  it("asks before removing a draft item, naming it", async () => {
    builds.removeItem.mockResolvedValue(undefined);
    await open(detail({ items: [goblin()] }));
    await click(host.querySelector(".build-roster-row .build-check input") ?? undefined);
    await click(button("Remove from draft"));
    expect(builds.removeItem).not.toHaveBeenCalled();
    expect(document.querySelector("dialog[open] h2")?.textContent).toBe("Remove Goblin from this draft?");
    await click([...host.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Remove"));
    expect(builds.removeItem).toHaveBeenCalledWith("b1", "creature", "goblin");
  });

  it("removes several chosen draft items with one confirmation that names them", async () => {
    builds.removeItem.mockResolvedValue(undefined);
    await open(detail({ items: [goblin({ key: "a" }, { name: "Rimehand" }), goblin({ key: "b" }, { name: "White-coat" }), goblin({ key: "c" }, { name: "Scree Goat" })] }));
    const boxes = [...host.querySelectorAll<HTMLInputElement>(".build-roster-row .build-check input")];
    await click(boxes[0]);
    await click(boxes[2]);
    expect(host.querySelector(".build-publish-bar")?.textContent).toBe("2 chosenClearRemove from draftPublish 2");
    await click(button("Remove from draft"));
    const dialog = document.querySelector("dialog[open]")!;
    expect(dialog.querySelector("h2")?.textContent).toBe("Remove 2 items from this draft?");
    expect([...dialog.querySelectorAll(".build-usage li")].map((li) => li.textContent)).toEqual(["Rimehand creature", "White-coat creature"]);
    await click([...dialog.querySelectorAll("button")].find((b) => b.textContent === "Remove"));
    expect(builds.removeItem.mock.calls).toEqual([["b1", "creature", "a"], ["b1", "creature", "b"]]);
  });

  it("shows a publish in progress, and sends nothing twice", async () => {
    let finish: (value: unknown) => void = () => {};
    builds.publish.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await open(detail({ items: [goblin()] }));
    await click(button("Choose everything"));
    await click(publishNow());
    expect(button("Publishing…")?.hasAttribute("disabled")).toBe(true);
    expect(button("Remove from draft")?.hasAttribute("disabled")).toBe(true);
    await act(async () => { finish({ published: { assets: 0, creatures: [], maps: [], encounters: [] } }); });
    expect(builds.publish).toHaveBeenCalledTimes(1);
  });

  it("brings an error into view and focuses it", async () => {
    builds.publish.mockRejectedValue(new Error("Something changed since you looked at it."));
    await open(detail({ items: [goblin()] }));
    await click(button("Choose everything"));
    await click(publishNow());
    expect(document.activeElement?.getAttribute("role")).toBe("alert");
    expect(document.activeElement?.textContent).toBe("Something changed since you looked at it.");
  });

  it("keeps the selection in view while ticking items", async () => {
    await open(detail({ items: [goblin()] }));
    expect(host.querySelector(".build-publish-bar")).toBeNull();
    await click(host.querySelector(".build-check input") ?? undefined);
    expect(host.querySelector(".build-publish-bar")?.textContent).toBe("1 chosenClearRemove from draftPublish 1");
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

describe("a build page that reads in parts (FR-GM-27, build page layout 2026-11-11)", () => {
  const fold = (id: string) => host.querySelector(`#${id}`)?.closest("details");
  const manyNotes = Array.from({ length: 7 }, (_, i) => ({ field: `note${i}`, message: "unclear" }));

  it("keeps the work open and folds what's read now and then, each with what it holds in a few words", async () => {
    await open(detail({ items: [goblin({ flags: manyNotes }), map()] }));
    // Review, maps, creatures and encounters are always open; they aren't folds at all.
    expect(fold("build-issues")).toBeNull();
    expect(fold("build-maps")).toBeNull();
    expect(fold("build-access")?.open).toBe(false);
    expect(fold("build-files")?.open).toBe(false);
    expect(fold("build-profile")?.open).toBe(false);
    expect(fold("build-access")?.querySelector(".build-fold-summary")?.textContent).toMatch(/^Pass works until/);
    expect(fold("build-files")?.querySelector(".build-fold-summary")?.textContent).toBe("1 file");
    expect(host.querySelector(".build-viewer .build-section-sum")?.textContent).toBe("1 map, 1 grid to confirm");
    expect(host.querySelector(".build-rail-pass")?.textContent).toMatch(/^Pass works until/);
  });

  it("keeps the access section open when there is no working pass, and files open when there are none", async () => {
    await open(detail({ build: { ...detail().build, passExpiresAt: null }, files: [], items: [goblin()] }));
    expect(fold("build-access")?.open).toBe(true);
    expect(fold("build-access")?.querySelector(".build-fold-summary")?.textContent).toBe("No working pass");
    expect(fold("build-files")?.open).toBe(true);
  });

  it("follows a link to what it names: a folded section opens, the notes come up, a creature is shown", async () => {
    await open(detail({ items: [goblin({ key: "a" }, { name: "Plain" }), goblin({ key: "b", flags: manyNotes }, { name: "Noted" }), map()] }));
    const game = fold("build-profile")!;
    expect(game.open).toBe(false);
    await click(host.querySelector(".build-rail-links a[href='#build-profile']") ?? undefined);
    expect(game.open).toBe(true);

    await act(async () => { location.hash = "#build-notes"; dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(host.querySelector("#build-notes")?.getAttribute("aria-pressed")).toBe("true");

    expect(host.querySelector(".build-detail h3")?.textContent).toBe("Noted");
    await act(async () => { location.hash = "#build-creature-a"; dispatchEvent(new HashChangeEvent("hashchange")); });
    expect(host.querySelector(".build-detail h3")?.textContent).toBe("Plain");
    history.replaceState(null, "", "/");
  });

  it("says a fix's shared instruction once for its item, not on every line", async () => {
    await open(detail({ items: [goblin(), map({ gridStatus: "confirmed", grid: { cellSize: 70, offsetX: 0, offsetY: 0 } }), encounter([
      { creatureKey: "goblin", name: "Scout", square: null, hidden: false },
      { creatureKey: "goblin", name: "Lurker", square: null, hidden: true },
    ])] }));
    const group = [...host.querySelectorAll(".build-group.build-problem")].find((g) => g.textContent?.includes("Bridge ambush"))!;
    expect([...group.querySelectorAll(".build-group-list li")].map((li) => li.textContent)).toEqual(["Scout has no square yet.", "Lurker has no square yet."]);
    expect(group.querySelector(".small-print")?.textContent).toBe("Place it in the encounter's editor, or remove it.");
    expect(group.querySelector(".build-group-title a")?.textContent).toBe("Bridge ambush");
    expect(group.querySelector(".build-group-count")?.textContent).toBe("2");
  });

  it("names flagged fields as people know them on a card", async () => {
    await open(detail({ items: [goblin({ flags: [{ field: "imageFileId", message: "a or b" }, { field: "armorClass", message: "Guard" }, { field: "terrain", message: "paint it" }, { field: "Hot Broth", message: "a heal" }] })] }));
    const fields = [...host.querySelectorAll(".build-detail .build-flags dt")].map((d) => d.textContent);
    expect(fields).toEqual(["Art", "AC", "Terrain", "Hot Broth"]);
  });

  it("folds what wasn't carried over, and lays labelled lines out as a list", async () => {
    await open(detail({ items: [goblin({ notCarriedOver: "Move: 6.\nGear: rope, lantern.\nBonds matter." })] }));
    const carried = host.querySelector<HTMLDetailsElement>(".build-carried")!;
    expect(carried.open).toBe(false);
    expect([...carried.querySelectorAll("dt")].map((d) => d.textContent)).toEqual(["Move", "Gear"]);
    expect(carried.querySelector(".build-fact-plain")?.textContent).toBe("Bonds matter.");
  });

  it("shows the game's notes as labelled lines, in sentence case", async () => {
    await open(detail({ profile: { ...detail().profile!, notes: "CORE ROLL: 2d6 + trait.\nSIGHT: the weather sets it." }, items: [goblin()] }));
    expect([...(fold("build-profile")?.querySelectorAll("dt") ?? [])].map((d) => d.textContent)).toEqual(["Core roll", "Sight"]);
    expect(fold("build-profile")?.querySelector(".build-fold-summary")?.textContent).toBe("Lanternfall. One square is 5 ft.");
  });

  it("puts like things together: characters, then creatures, then pieces, and numbers in counting order", async () => {
    const guide = goblin({ key: "sela" }, { name: "Sela", isPlayerCharacter: true });
    const wolf = goblin({ key: "wolf" }, { name: "White-coat" });
    const clock = goblin({ key: "clock" }, { name: "Storm Clock", ac: null, attacks: [] });
    const goat = goblin({ key: "goat" }, { name: "Scree Goat" });
    const tokens = [
      { creatureKey: "clock", hidden: true, square: null },
      { creatureKey: "wolf", name: "White-coat 10", hidden: true, square: { column: 1, row: 1 } },
      { creatureKey: "sela", hidden: false, square: { column: 2, row: 2 } },
      { creatureKey: "goat", hidden: true, square: { column: 3, row: 3 } },
      { creatureKey: "wolf", name: "White-coat 2", hidden: true, square: { column: 4, row: 4 } },
    ];
    await open(detail({ items: [clock, wolf, goat, guide, map({ gridStatus: "confirmed", grid: { cellSize: 70, offsetX: 0, offsetY: 0 } }), encounter(tokens)] }));
    expect([...host.querySelectorAll(".build-roster-name")].map((h) => h.textContent)).toEqual(["Sela", "Scree Goat", "White-coat", "Storm Clock"]);
    expect([...host.querySelectorAll(".build-roster-group h3")].map((h) => h.textContent)).toEqual(["Player characters", "Creatures", "Pieces"]);
    expect([...host.querySelectorAll(".build-board-token .build-token-name")].map((s) => s.textContent)).toEqual(["Sela", "Scree Goat", "White-coat 2", "White-coat 10", "Storm Clock"]);
    // On the map, a player character is filled, a piece is square, and a hidden token is drawn dashed.
    expect([...host.querySelectorAll(".build-plot .build-mark")].map((g) => g.getAttribute("class"))).toEqual([
      "build-mark build-mark-character", "build-mark build-mark-creature build-mark-hidden", "build-mark build-mark-creature build-mark-hidden", "build-mark build-mark-creature build-mark-hidden",
    ]);
  });

  it("follows the adventure with its maps, and keeps a file's variants together", async () => {
    const mapOn = (key: string, name: string) => item({ kind: "map", key, data: { name, fileId: "f1", proposedGrid: null, gridStatus: "confirmed", grid: { cellSize: 70, offsetX: 0, offsetY: 0 } } });
    const scene = (key: string, name: string, mapKey: string) => item({ kind: "encounter", key, data: { name, mapKey, tokens: [] } });
    await open(detail({
      files: [file({ id: "t2", kind: "token", name: "hauler-b.webp" }), file({ id: "m1", name: "tarn.png" }), file({ id: "t1", kind: "token", name: "hauler-a.webp" })],
      items: [mapOn("tarn", "Greywater Tarn"), mapOn("road", "The Switchbacks"), mapOn("spare", "A Spare Map"), scene("s2", "Scene 2", "tarn"), scene("s10", "Scene 10", "spare"), scene("s1", "Scene 1", "road")],
    }));
    expect([...host.querySelectorAll(".build-strip-name")].map((h) => h.textContent)).toEqual(["The Switchbacks", "Greywater Tarn", "A Spare Map"]);
    expect([...host.querySelectorAll(".build-tabs [role=tab] > span:first-child")].map((h) => h.textContent)).toEqual(["Scene 1", "Scene 2", "Scene 10"]);
    expect([...host.querySelectorAll(".build-file-name")].map((s) => s.textContent)).toEqual(["tarn.png", "hauler-a.webp", "hauler-b.webp"]);
  });

  it("lists fixes in the order of the cards they're about", async () => {
    const mapOn = (key: string, name: string) => item({ kind: "map", key, data: { name, fileId: "f1", proposedGrid: null, gridStatus: "confirmed", grid: { cellSize: 70, offsetX: 0, offsetY: 0 } } });
    const scene = (key: string, name: string) => item({ kind: "encounter", key, data: { name, mapKey: "cave", tokens: [{ creatureKey: "goblin", hidden: true, square: null }] } });
    await open(detail({ items: [goblin(), mapOn("cave", "Cave"), scene("b", "Scene 2"), scene("a", "Scene 1")] }));
    expect([...host.querySelectorAll(".build-group.build-problem .build-group-title a")].map((h) => h.textContent)).toEqual(["Scene 1", "Scene 2"]);
  });

  it("shows the token editor as a table: headings once, each creature's name once, and saves in the AI's order", async () => {
    const wolf = goblin({ key: "wolf" }, { name: "White-coat" });
    const tokens = [
      { creatureKey: "wolf", name: "White-coat 2", hidden: true, square: { column: 4, row: 4 } },
      { creatureKey: "goblin", hidden: false, square: null },
      { creatureKey: "wolf", name: "White-coat 1", hidden: true, square: { column: 1, row: 1 } },
    ];
    const ambush = encounter(tokens);
    builds.editEncounter.mockResolvedValue({ item: ambush });
    await open(detail({ items: [goblin(), wolf, map({ gridStatus: "confirmed", grid: { cellSize: 70, offsetX: 0, offsetY: 0 } }), ambush] }));
    await click(button("Edit tokens"));
    const editor = host.querySelector("dialog[open] .build-form")!;
    expect(editor.querySelectorAll(".build-token-head")).toHaveLength(1);
    expect([...editor.querySelectorAll(".build-token-of")].map((s) => s.textContent)).toEqual(["Goblin", "White-coat", ""]);
    expect([...editor.querySelectorAll<HTMLInputElement>("input[aria-label$='name on the board']")].map((i) => i.value)).toEqual(["", "White-coat 1", "White-coat 2"]);
    expect(editor.querySelector("button[aria-label='Remove White-coat 1']")).toBeTruthy();
    expect(editor.textContent).not.toMatch(/RemoveRemove/);
    await click([...editor.querySelectorAll("button")].find((b) => b.textContent === "Save"));
    const saved = builds.editEncounter.mock.calls[0]![2] as { tokens: { name?: string }[] };
    expect(saved.tokens.map((t) => t.name ?? null)).toEqual(["White-coat 2", null, "White-coat 1"]);
  });

  it("has no Remove on each item: choosing is one selection, and the bar acts on it", async () => {
    await open(detail({ items: [goblin({ key: "a" }, { name: "Rimehand" }), goblin({ key: "b" }, { name: "White-coat" })] }));
    expect(host.querySelectorAll(".build-roster-row button")).toHaveLength(2);
    expect([...host.querySelectorAll(".build-roster-row button")].every((b) => b.classList.contains("build-roster-pick"))).toBe(true);
    expect([...host.querySelectorAll(".build-detail button")].map((b) => b.textContent)).toEqual(["Edit"]);
    expect([...host.querySelectorAll(".build-roster-row .build-check input")].map((i) => i.getAttribute("aria-label"))).toEqual(["Choose Rimehand", "Choose White-coat"]);
  });

  it("lights a token on the map while its name is pointed at, and lets the rest fall back", async () => {
    await open(detail({ items: [goblin(), map({ gridStatus: "confirmed", grid: { cellSize: 70, offsetX: 0, offsetY: 0 } }), encounter([
      { creatureKey: "goblin", name: "Scout", square: { column: 1, row: 1 }, hidden: false },
      { creatureKey: "goblin", name: "Lurker", square: { column: 3, row: 2 }, hidden: true },
    ])] }));
    const lurker = [...host.querySelectorAll(".build-board-token")].find((li) => li.textContent?.startsWith("Lurker"))!;
    await act(async () => { lurker.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    const lit = host.querySelector(".build-plot .build-mark.is-lit")!;
    expect(lit.classList.contains("build-mark-hidden")).toBe(true);
    expect(lit.querySelector(".build-mark-ring")).toBeTruthy();
    await act(async () => { lurker.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })); });
    expect(host.querySelector(".build-plot .is-lit")).toBeNull();
  });

  it("offers to choose only what's ready, and says how many are chosen", async () => {
    await open(detail({ items: [goblin(), map()] }));
    expect(host.querySelector("#build-publish .build-section-sum")?.textContent).toBe("0 of 2 chosen");
    await click(button("Choose what's ready (1)"));
    expect(host.querySelector("#build-publish .build-section-sum")?.textContent).toBe("1 of 2 chosen");
    expect(host.querySelector<HTMLInputElement>(".build-roster-row .build-check input")?.checked).toBe(true);
  });

  it("offers one Start a room after publishing, with the encounters as a choice", async () => {
    builds.publish.mockResolvedValue({ published: { assets: 0, creatures: [], maps: [], encounters: [
      { key: "s2", id: "t2", name: "Scene 2" }, { key: "s1", id: "t1", name: "Scene 1" }, { key: "s10", id: "t10", name: "Scene 10" },
    ] } });
    await open(detail({ items: [goblin()] }));
    await click(button("Choose everything"));
    await click(publishNow());
    const section = host.querySelector("#build-start")!.closest("section")!;
    expect([...section.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Start a room"]);
    expect([...section.querySelectorAll("label")].map((l) => l.textContent)).toEqual(["Scene 1", "Scene 2", "Scene 10"]);
    expect(section.querySelector<HTMLInputElement>("input[type=radio]:checked")?.value).toBe("t1");
  });

  it("still offers a room when coming back to a build that published encounters", async () => {
    builds.published.mockResolvedValue({ published: [{ type: "encounter", id: "e1", name: "Scene 1", rooms: [], creatures: [], encounters: [] }] });
    await open(detail({ build: { ...detail().build, status: "closed" } }));
    expect(host.querySelector("#build-start")?.textContent).toBe("Start a room");
    expect(text()).toContain("Scene 1 is in your library.");
  });

  it("groups what a build published by kind, said once, with names in counting order", async () => {
    builds.published.mockResolvedValue({ published: [
      { type: "creature", id: "c2", name: "White-coat", rooms: [], creatures: [], encounters: [] },
      { type: "asset", id: "a1", name: "Greywater Tarn", rooms: [], creatures: [], encounters: [{ id: "e1", name: "Scene 2" }] },
      { type: "asset", id: "a2", name: "Mira Hale", rooms: [], creatures: [{ id: "c3", name: "Mira Hale" }], encounters: [] },
      { type: "encounter", id: "e10", name: "Scene 10", rooms: [], creatures: [], encounters: [] },
      { type: "encounter", id: "e1", name: "Scene 2", rooms: [], creatures: [], encounters: [] },
      { type: "creature", id: "c1", name: "Brother Aldric", rooms: [], creatures: [], encounters: [] },
      { type: "asset", id: "a3", name: "Loose sketch", rooms: [], creatures: [], encounters: [] },
    ] });
    await open(detail({ items: [goblin()] }));
    const list = fold("build-published")!;
    expect([...list.querySelectorAll(".build-published-group h3")].map((h) => h.textContent)).toEqual(["Encounters (2)", "Maps (1)", "Creatures (2)", "Token art (1)", "Art and maps (1)"]);
    expect([...list.querySelectorAll(".build-published-group")][0]!.textContent).toContain("Scene 2");
    expect([...list.querySelectorAll(".build-published-name > span")].map((s) => s.textContent)).toEqual(["Scene 2", "Scene 10", "Greywater Tarn", "Brother Aldric", "White-coat", "Mira Hale", "Loose sketch"]);
    expect(list.textContent).not.toMatch(/art or map|creatureScene|\bcreature\b/);
    expect(list.querySelector(".build-fold-summary")?.textContent).toBe("2 encounters, 1 map, 2 creatures, 1 token art, 1 other file");
  });

  it("removes from the library through one action: choose one or more, then remove them together", async () => {
    const pub = (type: PublishedBuildItem["type"], id: string, name: string, used: Partial<PublishedBuildItem> = {}): PublishedBuildItem => ({ type, id, name, rooms: [], creatures: [], encounters: [], ...used });
    builds.published.mockResolvedValue({ published: [
      pub("encounter", "e1", "Scene 1"), pub("encounter", "e2", "Scene 2"),
      pub("creature", "c1", "Rimehand"), pub("creature", "c2", "White-coat"),
    ] });
    builds.removePublished.mockResolvedValue({ removed: 3 });
    await open(detail({ items: [goblin()] }));
    const list = fold("build-published")!;
    // Before choosing: names only, and one way in.
    expect(list.querySelectorAll(".build-published-grid button, .build-published-grid input")).toHaveLength(0);
    expect([...list.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Remove from library"]);

    await click(button("Remove from library"));
    const toggle = list.querySelector("button[aria-pressed]")!;
    expect([toggle.textContent, toggle.getAttribute("aria-pressed")]).toEqual(["Cancel", "true"]);
    const removeNow = () => list.querySelector<HTMLButtonElement>(".build-publish-bar button.danger")!;
    expect([removeNow().textContent, removeNow().disabled]).toEqual(["Remove", true]);

    // A heading chooses its whole kind; a name chooses itself.
    const groupBox = [...list.querySelectorAll<HTMLInputElement>("h3 input")][0]!;
    await click(groupBox);
    const names = [...list.querySelectorAll<HTMLInputElement>(".build-published-grid input")];
    expect(names.map((n) => n.checked)).toEqual([true, true, false, false]);
    await click(names[3]);
    expect(host.querySelector(".build-publish-bar")?.textContent).toContain("3 chosen");
    const creatures = [...list.querySelectorAll<HTMLInputElement>("h3 input")][1]!;
    expect(creatures.indeterminate).toBe(true);

    expect(removeNow().textContent).toBe("Remove 3");
    await click(removeNow());
    expect([...host.querySelectorAll("dialog[open] .confirm p")][0]?.textContent).toContain("These 3 items will be removed");
    builds.published.mockResolvedValue({ published: [pub("creature", "c1", "Rimehand")] });
    await click([...host.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Remove"));
    expect(builds.removePublished).toHaveBeenCalledWith("b1", ["e1", "e2", "c2"]);
    // Done: back to names only.
    expect(button("Remove from library")).toBeTruthy();
    expect(fold("build-published")!.querySelectorAll(".build-published-grid input")).toHaveLength(0);
  });

  it("stops choosing on Cancel or Escape, and keeps what was chosen if the confirmation is closed", async () => {
    builds.published.mockResolvedValue({ published: [{ type: "creature", id: "c1", name: "Rimehand", rooms: [], creatures: [], encounters: [] }] });
    await open(detail({ items: [goblin()] }));
    await click(button("Remove from library"));
    await click(fold("build-published")!.querySelector(".build-published-grid input") ?? undefined);
    await click(button("Remove 1"));
    await click([...host.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "Keep"));
    expect(fold("build-published")!.querySelector<HTMLInputElement>(".build-published-grid input")?.checked).toBe(true);
    await act(async () => { fold("build-published")!.querySelector(".build-published-groups")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(button("Remove from library")).toBeTruthy();
  });

  it("keeps a note that has one label as the AI wrote it", async () => {
    await open(detail({ items: [goblin({ notCarriedOver: "Note: one line only." })] }));
    expect(host.querySelector(".build-carried .build-text")?.textContent).toBe("Note: one line only.");
  });
});
