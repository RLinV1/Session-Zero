// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILTIN_ROOM_DEFAULTS, type RoomDefaults } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { GmDashboardPage } from "../src/pages/GmDashboardPage";
import { RoomSettings } from "../src/pages/RoomSettings";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A server holding `saved` as the GM's defaults; records every PUT. */
function stubServer(saved: unknown = BUILTIN_ROOM_DEFAULTS, putStatus = 200) {
  const puts: unknown[] = [];
  const requests: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/me/rooms") return json({ hosting: [], playing: [] });
    if (url === "/api/library/encounters") return json([]);
    if (url === "/api/gm/settings" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      puts.push(body);
      return putStatus === 200 ? json(body) : json({ error: "nope" }, putStatus);
    }
    if (url === "/api/gm/settings") return json(saved);
    return new Response("{}", { status: 404 });
  });
  return { puts, requests };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "tony@example.com", displayName: "Tony" } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
});

async function openFromDashboard() {
  render(<GmDashboardPage />);
  const control = await screen.findByRole("button", { name: "Room settings" });
  // A real click focuses the button; jsdom's doesn't.
  control.focus();
  fireEvent.click(control);
  const dialog = await screen.findByRole("dialog", { name: "Room settings" });
  await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save" }).hasAttribute("disabled")).toBe(false));
  return { control, dialog };
}

describe("Room settings on the dashboard (gm-room-defaults, gm-dashboard)", () => {
  it("puts Create room in line with the Hosting heading", async () => {
    stubServer();
    render(<GmDashboardPage />);
    const heading = await screen.findByRole("heading", { name: "Hosting" });
    const row = heading.closest(".room-section-head")!;
    expect(within(row as HTMLElement).getByRole("button", { name: "Create room" })).toBeTruthy();
  });

  it("is a gear in the header's row of settings, after the navigation", async () => {
    stubServer();
    render(<GmDashboardPage />);
    const gear = await screen.findByRole("button", { name: "Room settings" });
    expect(gear.textContent).toBe("");
    expect(gear.closest(".site-actions")).toBeTruthy();
    const header = gear.closest(".site-header")!;
    const order = [...header.children].map((el) => el.className);
    expect(order.indexOf("site-nav")).toBeLessThan(order.indexOf("site-actions"));
  });

  it("shows the Table tab's controls and the two grid settings, at the built-ins the first time", async () => {
    stubServer();
    const { dialog } = await openFromDashboard();
    const d = within(dialog);
    expect((d.getByLabelText("Remove tokens at 0 HP") as HTMLSelectElement).value).toBe("all");
    for (const name of ["Hide map from players without a token", "Hide HP from Players", "Hide AC from Players"]) {
      expect((d.getByRole("switch", { name }) as HTMLInputElement).checked).toBe(false);
    }
    expect((d.getByLabelText("Diagonals") as HTMLSelectElement).value).toBe("equal");
    expect((d.getByLabelText("Difficult terrain applies") as HTMLSelectElement).value).toBe("entry");
    expect((d.getByLabelText("Distance per square") as HTMLInputElement).value).toBe("5");
    expect((d.getByLabelText("Unit label") as HTMLInputElement).value).toBe("ft");
    expect(d.getByText("ft", { selector: ".room-settings-distance span" })).toBeTruthy();
    expect(d.getByText(/apply to rooms you create from now on/)).toBeTruthy();
  });

  it("saves the choices, closes, and returns focus to the control", async () => {
    const { puts } = stubServer();
    const { control, dialog } = await openFromDashboard();
    const d = within(dialog);
    fireEvent.click(d.getByRole("switch", { name: "Hide HP from Players" }));
    fireEvent.change(d.getByLabelText("Diagonals"), { target: { value: "euclidean" } });
    fireEvent.change(d.getByLabelText("Distance per square"), { target: { value: "1.5" } });
    fireEvent.change(d.getByLabelText("Unit label"), { target: { value: "m" } });
    expect(d.getByText("m", { selector: ".room-settings-distance span" })).toBeTruthy();
    fireEvent.click(d.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toEqual([{ ...BUILTIN_ROOM_DEFAULTS, hideHp: true, diagonalRule: "euclidean", unitsPerCell: 1.5, unitLabel: "m" }]));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Room settings" })).toBeNull());
    expect(document.activeElement).toBe(control);
  });

  it("opens with what was saved", async () => {
    const saved: RoomDefaults = { ...BUILTIN_ROOM_DEFAULTS, defeatRemoval: "npc", hideAc: true, unitsPerCell: 10 };
    stubServer(saved);
    const { dialog } = await openFromDashboard();
    expect((within(dialog).getByLabelText("Remove tokens at 0 HP") as HTMLSelectElement).value).toBe("npc");
    expect((within(dialog).getByRole("switch", { name: "Hide AC from Players" }) as HTMLInputElement).checked).toBe(true);
    expect((within(dialog).getByLabelText("Distance per square") as HTMLInputElement).value).toBe("10");
  });

  it.each([
    ["a zero distance", "Distance per square", "0", /greater than 0/],
    ["an empty distance", "Distance per square", "", /greater than 0/],
    ["an empty unit label", "Unit label", "", /1 to 12 characters/],
  ])("refuses %s without sending it", async (_name, field, value, message) => {
    const { puts } = stubServer();
    const { dialog } = await openFromDashboard();
    fireEvent.change(within(dialog).getByLabelText(field), { target: { value } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(message);
    expect(puts).toEqual([]);
  });

  it("keeps the form and says so when the server refuses the save", async () => {
    stubServer(BUILTIN_ROOM_DEFAULTS, 400);
    const { dialog } = await openFromDashboard();
    fireEvent.change(within(dialog).getByLabelText("Unit label"), { target: { value: "m" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/weren't saved/);
    expect((within(dialog).getByLabelText("Unit label") as HTMLInputElement).value).toBe("m");
    expect(screen.getByRole("dialog", { name: "Room settings" })).toBeTruthy();
  });

  it("says signing in is needed, and sends nothing, without an account", () => {
    accountStore.setState({ status: "signedOut" });
    const { requests } = stubServer();
    render(<RoomSettings open onClose={() => {}} />);
    expect(screen.getByText("Sign in to save room settings.")).toBeTruthy();
    expect(requests).toEqual([]);
  });

  it("shows a load failure when the server sends defaults that don't parse", async () => {
    stubServer({ ...BUILTIN_ROOM_DEFAULTS, diagonalRule: "hex" });
    render(<RoomSettings open onClose={() => {}} />);
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be loaded/);
  });
});

describe("the room defaults API client (gm-room-defaults)", () => {
  it("rejects a response that is not a valid set of defaults", async () => {
    stubServer({ ...BUILTIN_ROOM_DEFAULTS, unitsPerCell: -1 });
    await expect(api.roomDefaults.get()).rejects.toThrow();
  });
});
