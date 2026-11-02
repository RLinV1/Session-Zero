// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { GmDashboardPage } from "../src/pages/GmDashboardPage";

function stubRooms(rooms: { hosting: unknown[]; playing: unknown[] }) {
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/me/rooms") return json(rooms);
    if (url === "/api/library/encounters") return json([]);
    return new Response("{}", { status: 404 });
  });
}

beforeEach(() => {
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "tony@example.com", displayName: "Tony" } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
});

describe("the dashboard with no rooms (design-language: Empty states show the next step, gm-dashboard)", () => {
  it("shows a picture, says there are no rooms yet, and offers creating one", async () => {
    stubRooms({ hosting: [], playing: [] });
    render(<GmDashboardPage />);
    const hosting = screen.getByRole("region", { name: "Hosting" });
    const text = await within(hosting).findByText(/No rooms yet/);
    const empty = text.closest(".empty-state") as HTMLElement;
    const picture = empty.querySelector("img")!;
    expect(picture.getAttribute("src")).toBe("/img/ambient/empty-rooms.webp");
    expect(picture.getAttribute("alt")).toBe("");
    expect(within(empty).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(within(empty).getByRole("button", { name: "Create a room" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Room name"));
  });

  it("keeps the sentence and action when the picture cannot load", async () => {
    stubRooms({ hosting: [], playing: [] });
    render(<GmDashboardPage />);
    const text = await screen.findByText(/No rooms yet/);
    const empty = text.closest(".empty-state") as HTMLElement;
    fireEvent.error(empty.querySelector("img")!);
    await waitFor(() => expect(empty.querySelector("img")).toBeNull());
    expect(within(empty).getByRole("button", { name: "Create a room" })).toBeTruthy();
  });

  it("lists rooms as cards with their name in full", async () => {
    const room = { id: "r1", name: "The Sunken Crypt, session three", preset: "dnd5e", lastActiveAt: new Date().toISOString() };
    stubRooms({ hosting: [room], playing: [] });
    render(<GmDashboardPage />);
    const name = await screen.findByText("The Sunken Crypt, session three");
    const card = name.closest(".room-card") as HTMLElement;
    expect(within(card).getByRole("button", { name: "Open" }).className).not.toContain("primary");
    expect(screen.queryByText(/No rooms yet/)).toBeNull();
  });
});
