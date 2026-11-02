// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Route } from "../src/router";
import { applyStoredLayer, layerFor, reloadThemeChoice, useRouteLayer } from "../src/theme";

function Probe({ route }: { route: Route }) {
  useRouteLayer(route);
  return null;
}

const root = () => document.documentElement;

function systemPrefers(theme: "light" | "dark") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("light") ? theme === "light" : theme === "dark",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  systemPrefers("dark");
  reloadThemeChoice();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  root().removeAttribute("data-theme");
  root().removeAttribute("data-layer");
});

describe("theme and layer follow the route (design-language: Light and dark outside the table)", () => {
  it("puts each route in its layer", () => {
    expect(layerFor({ page: "home" })).toBe("home");
    expect(layerFor({ page: "signin" })).toBe("entry");
    expect(layerFor({ page: "join", inviteCode: "abc123" })).toBe("entry");
    expect(layerFor({ page: "notFound" })).toBe("entry");
    expect(layerFor({ page: "gmDashboard" })).toBe("hub");
    expect(layerFor({ page: "library" })).toBe("hub");
    expect(layerFor({ page: "room", roomId: "r" })).toBe("table");
    expect(layerFor({ page: "encounterEdit", roomId: "r" })).toBe("table");
  });

  it("carries a stored light choice to the dashboard", () => {
    localStorage.setItem("vtt.theme", "light");
    reloadThemeChoice();
    render(<Probe route={{ page: "gmDashboard" }} />);
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(root().getAttribute("data-layer")).toBe("hub");
  });

  it("keeps the table dark whatever was chosen", () => {
    localStorage.setItem("vtt.theme", "light");
    reloadThemeChoice();
    const view = render(<Probe route={{ page: "gmDashboard" }} />);
    view.rerender(<Probe route={{ page: "room", roomId: "x" }} />);
    expect(root().getAttribute("data-theme")).toBe("dark");
    expect(root().getAttribute("data-layer")).toBe("table");
    view.rerender(<Probe route={{ page: "gmDashboard" }} />);
    expect(root().getAttribute("data-theme")).toBe("light");
  });

  it("follows the system when storage cannot be read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    systemPrefers("light");
    reloadThemeChoice();
    render(<Probe route={{ page: "library" }} />);
    expect(root().getAttribute("data-theme")).toBe("light");
  });

  it("applies the stored choice before React renders", () => {
    localStorage.setItem("vtt.theme", "light");
    applyStoredLayer({ page: "signin" });
    expect(root().getAttribute("data-theme")).toBe("light");
    expect(root().getAttribute("data-layer")).toBe("entry");
    applyStoredLayer({ page: "room", roomId: "x" });
    expect(root().getAttribute("data-theme")).toBe("dark");
  });
});
