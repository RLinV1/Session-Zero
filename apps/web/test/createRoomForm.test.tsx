// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { GmDashboardPage } from "../src/pages/GmDashboardPage";
import { JoinPage } from "../src/pages/JoinPage";

type Call = { url: string; method: string; body: unknown };

/** Answers the dashboard's loads and room creation, and records every request. */
function stubFetch() {
  const calls: Call[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push({ url, method, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
    if (url === "/api/me/rooms") return json({ hosting: [], playing: [] });
    if (url === "/api/library/encounters") return json([]);
    if (url === "/api/rooms" && method === "POST") return json({ roomId: "r1", participantId: "p1", inviteCode: "abc" });
    return json({ error: "Not found" }, 404);
  });
  return calls;
}

/** The form lives in a dialog behind the page's Create room button. */
const openCreate = () => fireEvent.click(screen.getByRole("button", { name: "Create room" }));
const roomName = () => screen.getByLabelText("Room name") as HTMLInputElement;
const yourName = () => screen.getByLabelText("Your name") as HTMLInputElement;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "tony@example.com", displayName: "Tony" } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  accountStore.setState({ status: "loading" });
  // Creating a room saves this browser's GM seat, which would make the join page say "You're the GM".
  localStorage.clear();
});

describe("create-room form starting values (FR-GM-01)", () => {
  it("fills in the account's name, leaves the room name empty, and shows no example text", () => {
    stubFetch();
    render(<GmDashboardPage />);
    openCreate();
    expect(yourName().value).toBe("Tony");
    expect(roomName().value).toBe("");
    expect(yourName().hasAttribute("placeholder")).toBe(false);
    expect(roomName().hasAttribute("placeholder")).toBe(false);
  });

  it("creates the room with the name the GM typed, without touching the account", async () => {
    const calls = stubFetch();
    render(<GmDashboardPage />);
    openCreate();
    fireEvent.change(yourName(), { target: { value: "DM Tony" } });
    fireEvent.change(roomName(), { target: { value: "Friday campaign" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create room" }));

    await waitFor(() => expect(calls.some((c) => c.url === "/api/rooms" && c.method === "POST")).toBe(true));
    const created = calls.find((c) => c.url === "/api/rooms" && c.method === "POST");
    expect(created?.body).toMatchObject({ roomName: "Friday campaign", displayName: "DM Tony" });
    expect(calls.filter((c) => c.method !== "GET" && c.url !== "/api/rooms")).toEqual([]);
    expect(accountStore.getState()).toMatchObject({ account: { displayName: "Tony" } });
  });

  it("leaves the player's name empty on the join page, even when signed in", () => {
    stubFetch();
    render(<JoinPage inviteCode="abc" />);
    expect(yourName().value).toBe("");
  });
});
