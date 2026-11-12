// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { BuildDetail, BuildItemView, BuildSummary } from "@vtt/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { LibraryPage } from "../src/pages/LibraryPage";
import { RIGHTS_NOTICE } from "../src/pages/build/buildCopy";
import { t } from "../src/i18n/locale";

// jsdom has no <dialog> methods. Closing fires "close", as a browser does: the pass waits for it.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (fromNow: number) => new Date(Date.now() + fromNow).toISOString();
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" });
const build = (over: Partial<BuildSummary> = {}): BuildSummary => ({
  id: "b1", name: "Hollow Coast", status: "open", createdAt: at(-DAY), updatedAt: at(-HOUR), passExpiresAt: at(20 * HOUR), closesAt: at(13 * DAY),
  choices: { aiGrid: false, aiWalls: false }, ...over,
});

// What each build's draft holds, by build id, as its page reads it. Empty unless a test says.
let drafts: Record<string, BuildItemView[]> = {};
/** Builds whose AI hasn't saved a game profile yet. */
let noProfile = new Set<string>();
const draftItem = (over: Partial<BuildItemView> & Pick<BuildItemView, "kind" | "key" | "data">): BuildItemView => ({
  flags: [], notCarriedOver: "", editedByUser: false, published: false, updatedAt: "2026-11-09T00:00:00Z", ...over,
});
const creature = (key: string, over: Partial<BuildItemView> = {}) => draftItem({
  kind: "creature", key, ...over,
  data: { name: key, isPlayerCharacter: false, size: 1, hp: 7, maxHp: 7, ac: 13, attacks: [], conditions: [], color: "#336699", imageFileId: null },
});
/** A map whose grid waits for the owner: something to fix. */
const mapAwaitingGrid = draftItem({ kind: "map", key: "cave", data: { name: "Cave", fileId: "f1", proposedGrid: { cellSize: 70, offsetX: 0, offsetY: 0 }, gridStatus: "proposed", grid: null } });
const detailOf = (id: string): BuildDetail => ({
  build: build({ id }),
  profile: noProfile.has(id) ? null : { name: "Lanternfall", features: { hitPoints: true, armorClass: true, attacks: true, conditions: true }, unitsPerCell: 5, unitLabel: "ft", notes: "", flags: [] },
  files: [{ id: "f1", kind: "map", name: "cave.png", width: 700, height: 700, sizeBytes: 100, fromUvtt: false, grid: null, walls: 0, detection: null, url: "/uploads/cave.webp", published: false, board: null }],
  items: drafts[id] ?? [],
});

beforeEach(() => {
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "dana@example.com", displayName: "Dana" } });
  vi.spyOn(api.library, "list").mockResolvedValue([]);
  vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
  vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
  vi.spyOn(api.builds, "list").mockResolvedValue([]);
  drafts = {};
  noProfile = new Set();
  vi.spyOn(api.builds, "get").mockImplementation(async (id) => detailOf(id));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  accountStore.setState({ status: "loading" });
  history.replaceState(null, "", "/");
});

const openTab = async (list: BuildSummary[]) => {
  vi.mocked(api.builds.list).mockResolvedValue(list);
  history.replaceState(null, "", "/library?tab=builds");
  render(<LibraryPage />);
  // The list, then the drafts read after it.
  await act(async () => { await Promise.resolve(); });
  await act(async () => { await new Promise((done) => setTimeout(done, 0)); });
};
const dialog = (name: string) => screen.getByRole("dialog", { name });
const newBuildDialog = async () => {
  fireEvent.click(screen.getByRole("button", { name: "New build" }));
  return dialog("New build");
};
const card = (name: string) => screen.getByRole("link", { name }).closest("li") as HTMLElement;

describe("finding AI builds in the library (FR-GM-26, design review 2026-11-10)", () => {
  it("opens on AI builds from its own address, the way back from a build page", async () => {
    history.replaceState(null, "", "/library?tab=builds");
    render(<LibraryPage />);
    expect(screen.getByRole("tab", { name: "AI builds" }).getAttribute("aria-selected")).toBe("true");
    expect(await screen.findByText("You haven't started an AI build yet.")).toBeTruthy();
  });

  it("keeps AI builds in the address, so a reload lands back there", () => {
    history.replaceState(null, "", "/library");
    render(<LibraryPage />);
    fireEvent.click(screen.getByRole("tab", { name: "AI builds" }));
    expect(location.pathname + location.search).toBe("/library?tab=builds");
    fireEvent.click(screen.getByRole("tab", { name: "Maps" }));
    expect(location.pathname + location.search).toBe("/library");
  });
});

describe("starting an AI build (FR-GM-26, AI builds redesign 2026-11-10)", () => {
  it("starts from New build in the toolbar, as other tabs do, not from a form on the page", async () => {
    await openTab([build()]);
    expect(screen.queryByLabelText("Name of this build")).toBeNull();
    const form = await newBuildDialog();
    const name = within(form).getByLabelText("Name of this build");
    expect(document.activeElement).toBe(name);
    expect(within(form).getByText(t(RIGHTS_NOTICE))).toBeTruthy();
    expect((within(form).getByRole("button", { name: "Start build" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the chosen map setup as the build's two choices, both off unless chosen (ADR 0053)", async () => {
    const start = vi.spyOn(api.builds, "start").mockResolvedValue({ build: build({ id: "b9", name: "Lanternfall" }), pass: "szb_new", expiresAt: at(DAY) });
    await openTab([]);
    const form = await newBuildDialog();
    expect((within(form).getByRole("radio", { name: /^You set up maps/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(form).getByRole("radio", { name: /^Your AI sets grids, walls, doors and windows/ }));
    const boxes = within(form).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true]);
    fireEvent.click(within(form).getByRole("radio", { name: /^Your AI sets grids It/ }));
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    fireEvent.change(within(form).getByLabelText("Name of this build"), { target: { value: "Lanternfall" } });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Start build" })); });
    expect(start).toHaveBeenCalledWith("Lanternfall", { aiGrid: true, aiWalls: false });
  });

  it("still takes each choice on its own, which no preset matches", async () => {
    const start = vi.spyOn(api.builds, "start").mockResolvedValue({ build: build(), pass: "szb_new", expiresAt: at(DAY) });
    await openTab([]);
    const form = await newBuildDialog();
    fireEvent.click(within(form).getByRole("checkbox", { name: /^Let my AI set walls, doors and windows/ }));
    expect((within(form).getAllByRole("radio") as HTMLInputElement[]).some((r) => r.checked)).toBe(false);
    fireEvent.change(within(form).getByLabelText("Name of this build"), { target: { value: "Walls only" } });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Start build" })); });
    expect(start).toHaveBeenCalledWith("Walls only", { aiGrid: false, aiWalls: true });
  });

  it("then shows the pass with what happens next, and lists the new build with its working pass", async () => {
    // As the server sends it: the summary is read before the first pass exists.
    vi.spyOn(api.builds, "start").mockResolvedValue({ build: build({ id: "b9", name: "Lanternfall", passExpiresAt: null }), pass: "szb_new", expiresAt: at(DAY) });
    await openTab([]);
    const form = await newBuildDialog();
    fireEvent.change(within(form).getByLabelText("Name of this build"), { target: { value: "Lanternfall" } });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Start build" })); });
    expect(screen.queryByRole("dialog", { name: "New build" })).toBeNull();
    const pass = dialog("Give this to your AI");
    expect((within(pass).getByRole("textbox") as HTMLTextAreaElement).value).toContain("szb_new");
    expect(within(within(pass).getByRole("list", { name: "What happens next" })).getAllByRole("listitem")).toHaveLength(3);
    expect(within(pass).getByRole("link", { name: "Open the build page" }).getAttribute("href")).toBe("/builds/b9");
    expect(card("Lanternfall").textContent).toContain("Pass works");
    expect(card("Lanternfall").textContent).toContain("Nothing saved yet.");
  });

  it("keeps a failed start in the dialog, next to its action", async () => {
    vi.spyOn(api.builds, "start").mockRejectedValue(new Error("You already have 3 builds open."));
    await openTab([]);
    const form = await newBuildDialog();
    fireEvent.change(within(form).getByLabelText("Name of this build"), { target: { value: "Lanternfall" } });
    await act(async () => { fireEvent.click(within(form).getByRole("button", { name: "Start build" })); });
    expect(within(dialog("New build")).getByRole("alert").textContent).toBe("You already have 3 builds open.");
  });

  it("turns New build off at the open-build limit and says why", async () => {
    await openTab([build({ id: "b1" }), build({ id: "b2", name: "Two" }), build({ id: "b3", name: "Three" })]);
    const button = screen.getByRole("button", { name: "New build" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const reason = document.getElementById(button.getAttribute("aria-describedby") ?? "");
    expect(reason?.textContent).toMatch(/^3 of 3 builds are open/);
  });

  it("leaves New build on below the limit", async () => {
    await openTab([build({ id: "b1" }), build({ id: "b2", name: "Two" }), build({ id: "b3", name: "Old", status: "closed" })]);
    const button = screen.getByRole("button", { name: "New build" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute("aria-describedby")).toBe(false);
    expect(screen.getByText("2 of 3 open")).toBeTruthy();
  });
});

describe("the builds in progress (FR-GM-26, AI builds redesign 2026-11-10)", () => {
  it("shows each open build's pass, map setup and closing date, from what the list holds", async () => {
    const soon = at(DAY);
    await openTab([
      build({ id: "b1", name: "Hollow Coast" }),
      build({ id: "b2", name: "Sunken Archive", passExpiresAt: at(-HOUR), choices: { aiGrid: true, aiWalls: true } }),
      build({ id: "b3", name: "Gloomwood Fair", passExpiresAt: null, closesAt: soon, choices: { aiGrid: true, aiWalls: false } }),
    ]);
    const hollow = card("Hollow Coast").textContent ?? "";
    expect(hollow).toContain("Pass works");
    expect(hollow).toContain("You set up maps");
    expect(hollow).not.toMatch(/Closes \w+ \d+Last/);
    expect(card("Sunken Archive").textContent).toContain("Pass ended");
    expect(card("Sunken Archive").textContent).toContain("AI sets grids and walls");
    const gloomwood = card("Gloomwood Fair");
    expect(gloomwood.textContent).toContain("No pass");
    expect(gloomwood.textContent).toContain("AI sets grids");
    expect(within(gloomwood).getByText(`Closes ${day(soon)}`).className).toContain("build-chip-warn");
    expect(within(card("Hollow Coast")).queryByText(/^Closes /)).toBeNull();
  });

  it("offers one next step: open a build whose AI can work, or make a new pass", async () => {
    await openTab([build({ id: "b1", name: "Hollow Coast" }), build({ id: "b2", name: "Sunken Archive", passExpiresAt: at(-HOUR) })]);
    expect(within(card("Hollow Coast")).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Open Hollow Coast"]);
    expect(within(card("Sunken Archive")).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Make a new pass for Sunken Archive"]);
    fireEvent.click(screen.getByRole("button", { name: "Open Hollow Coast" }));
    expect(location.pathname).toBe("/builds/b1");
  });

  it("makes a new pass from the card and shows it", async () => {
    const newPass = vi.spyOn(api.builds, "newPass").mockResolvedValue({ pass: "szb_fresh", expiresAt: at(DAY) });
    await openTab([build({ id: "b2", name: "Sunken Archive", passExpiresAt: at(-HOUR) })]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Make a new pass for Sunken Archive" })); });
    expect(newPass).toHaveBeenCalledWith("b2");
    expect((within(dialog("Give this to your AI")).getByRole("textbox") as HTMLTextAreaElement).value).toContain("szb_fresh");
    expect(card("Sunken Archive").textContent).toContain("Pass works");
  });

  it("shows a failed new pass on its own card", async () => {
    vi.spyOn(api.builds, "newPass").mockRejectedValue(new Error("This build is closed."));
    await openTab([build({ id: "b2", name: "Sunken Archive", passExpiresAt: null }), build({ id: "b1", name: "Hollow Coast", passExpiresAt: null })]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Make a new pass for Sunken Archive" })); });
    expect(within(card("Sunken Archive")).getByRole("alert").textContent).toBe("This build is closed.");
    expect(within(card("Hollow Coast")).queryByRole("alert")).toBeNull();
  });

  it("keeps closed builds folded away, and opens them for a search that finds one", async () => {
    await openTab([build({ id: "b1", name: "Hollow Coast" }), build({ id: "b2", name: "Old Lanternfall", status: "closed" })]);
    const closed = screen.getByText("Closed builds (1)").closest("details") as HTMLDetailsElement;
    expect(closed.open).toBe(false);
    expect(within(screen.getByRole("list", { name: "In progress" })).queryByText("Old Lanternfall")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search by name" }), { target: { value: "lantern" } });
    expect(closed.open).toBe(true);
    expect(screen.queryByRole("link", { name: "Hollow Coast" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "In progress" })).toBeNull();
  });

  it("counts each draft as its page does, and sends the owner to fix what it lists first", async () => {
    drafts = { b1: [mapAwaitingGrid, creature("goblin", { flags: [{ field: "ac", message: "around 14 maybe" }] }), creature("orc", { published: true })] };
    await openTab([build({ id: "b1", name: "Hollow Coast" })]);
    const hollow = card("Hollow Coast");
    expect([...hollow.querySelectorAll(".build-stats span")].map((s) => s.textContent)).toEqual([
      "1 map and 1 creature not yet published", "1 published", "1 note from your AI",
    ]);
    expect(within(hollow).getByText("1 to fix").className).toContain("build-chip-warn");
    fireEvent.click(within(hollow).getByRole("button", { name: "Fix 1 thing in Hollow Coast" }));
    expect(location.pathname + location.hash).toBe("/builds/b1#build-issues");
  });

  it("sends the owner to publish once nothing needs fixing, and still offers a pass that has ended", async () => {
    drafts = { b1: [creature("goblin"), creature("orc")] };
    await openTab([build({ id: "b1", name: "Hollow Coast", passExpiresAt: at(-HOUR) })]);
    const buttons = within(card("Hollow Coast")).getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(buttons).toEqual(["Review and publish 2 in Hollow Coast", "Make a new pass for Hollow Coast"]);
    fireEvent.click(screen.getByRole("button", { name: "Review and publish 2 in Hollow Coast" }));
    expect(location.pathname + location.hash).toBe("/builds/b1#build-publish");
  });

  it("leaves a missing game profile to the AI until it has saved something (found in the browser check)", async () => {
    noProfile = new Set(["empty", "started"]);
    drafts = { started: [creature("goblin")] };
    await openTab([build({ id: "empty", name: "Gloomwood Fair", passExpiresAt: null }), build({ id: "started", name: "Hollow Coast" })]);
    const empty = card("Gloomwood Fair");
    expect(empty.textContent).toContain("Nothing saved yet.");
    expect(within(empty).queryByText(/to fix$/)).toBeNull();
    expect(within(empty).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Make a new pass for Gloomwood Fair"]);
    // Once it has, the build page lists the missing profile to fix, and so does the card.
    expect(within(card("Hollow Coast")).getByRole("button", { name: "Fix 1 thing in Hollow Coast" })).toBeTruthy();
  });

  it("puts the builds that need their owner first", async () => {
    drafts = { ready: [creature("goblin")], broken: [mapAwaitingGrid] };
    await openTab([
      build({ id: "idle", name: "Idle" }),
      build({ id: "ended", name: "Ended", passExpiresAt: at(-HOUR) }),
      build({ id: "ready", name: "Ready" }),
      build({ id: "broken", name: "Broken" }),
    ]);
    const names = [...screen.getByRole("list", { name: "In progress" }).querySelectorAll("h3")].map((h) => h.textContent);
    expect(names).toEqual(["Broken", "Ready", "Ended", "Idle"]);
  });

  it("keeps a card whose draft can't be read, without counts", async () => {
    drafts = { b1: [creature("goblin")] };
    vi.mocked(api.builds.get).mockImplementation(async (id) => {
      if (id === "b2") throw new Error("unreadable");
      return detailOf(id);
    });
    await openTab([build({ id: "b1", name: "Hollow Coast" }), build({ id: "b2", name: "Sunken Archive" })]);
    expect(card("Hollow Coast").querySelector(".build-stats")).not.toBeNull();
    expect(card("Sunken Archive").querySelector(".build-stats")).toBeNull();
    expect(within(card("Sunken Archive")).getByRole("button", { name: "Open Sunken Archive" })).toBeTruthy();
  });

  it("moves focus to the card's main step when the new-pass link beside it goes", async () => {
    drafts = { b1: [creature("goblin")] };
    vi.spyOn(api.builds, "newPass").mockResolvedValue({ pass: "szb_fresh", expiresAt: at(DAY) });
    await openTab([build({ id: "b1", name: "Hollow Coast", passExpiresAt: at(-HOUR) })]);
    const link = screen.getByRole("button", { name: "Make a new pass for Hollow Coast" });
    link.focus();
    await act(async () => { fireEvent.click(link); });
    expect(screen.queryByRole("button", { name: "Make a new pass for Hollow Coast" })).toBeNull();
    fireEvent.click(within(dialog("Give this to your AI")).getByRole("button", { name: "Close" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Review and publish 1 in Hollow Coast" }));
  });

  it("explains how builds work on a first visit, and keeps it folded after", async () => {
    await openTab([]);
    expect((screen.getByText("How AI builds work").closest("details") as HTMLDetailsElement).open).toBe(true);
    cleanup();
    await openTab([build()]);
    expect((screen.getByText("How AI builds work").closest("details") as HTMLDetailsElement).open).toBe(false);
  });
});
