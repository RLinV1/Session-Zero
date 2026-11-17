// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real pages need the server; these stand in so the test is about the app's route wiring.
vi.mock("../src/pages/HomePage", () => ({ HomePage: () => <main><h1>Home page</h1></main> }));
vi.mock("../src/pages/RoomPage", () => ({
  RoomPage: ({ roomId }: { roomId: string }) => {
    if (roomId === "broken") throw new TypeError("undefined is not an object (evaluating 'e.terms.map') Wolf secret");
    return <main><h1>Room {roomId}</h1></main>;
  },
}));

const { App } = await import("../src/App");
const { navigate } = await import("../src/router");

beforeEach(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  vi.spyOn(console, "error").mockImplementation(() => {});
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("room failure screen (room-error-recovery)", () => {
  it("shows a way back instead of a blank page, with no error details", async () => {
    window.history.replaceState(null, "", "/r/broken");
    render(<App />);
    const heading = await screen.findByRole("heading", { name: "Something went wrong showing this room" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
    expect(document.body.textContent).not.toMatch(/terms\.map|Wolf secret|TypeError/);
    expect(console.error).toHaveBeenCalled();
  });

  it("lets browser Back reach the previous page without a reload", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "Home page" });
    act(() => navigate("/r/broken"));
    await screen.findByRole("heading", { name: "Something went wrong showing this room" });
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    expect(await screen.findByRole("heading", { name: "Home page" })).toBeTruthy();
  });

  it("opens a different room normally after one failed", async () => {
    window.history.replaceState(null, "", "/r/broken");
    render(<App />);
    await screen.findByRole("heading", { name: "Something went wrong showing this room" });
    act(() => navigate("/r/other"));
    expect(await screen.findByRole("heading", { name: "Room other" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Something went wrong/ })).toBeNull();
  });
});
