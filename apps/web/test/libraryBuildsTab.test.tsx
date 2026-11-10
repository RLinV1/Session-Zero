// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { LibraryPage } from "../src/pages/LibraryPage";

beforeEach(() => {
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "dana@example.com", displayName: "Dana" } });
  vi.spyOn(api.library, "list").mockResolvedValue([]);
  vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
  vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
  vi.spyOn(api.builds, "list").mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  accountStore.setState({ status: "loading" });
  history.replaceState(null, "", "/");
});

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
