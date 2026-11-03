// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { api } from "../src/net/api";
import { LibraryPage } from "../src/pages/LibraryPage";
import { BoardEmptyState } from "../src/ui/BoardEmptyState";

beforeEach(() => {
  accountStore.setState({ status: "signedIn", account: { id: "a1", email: "dana@example.com", displayName: "Dana" } });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  accountStore.setState({ status: "loading" });
});

describe("empty states show the next step (design-language)", () => {
  it("shows an empty Maps tab its picture and text, and leaves the toolbar's Upload map as the one way in", async () => {
    vi.spyOn(api.library, "list").mockResolvedValue([]);
    vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
    vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
    render(<LibraryPage />);
    const text = await screen.findByText(/You haven't uploaded any maps yet/);
    const empty = text.closest(".empty-state") as HTMLElement;
    expect(empty.querySelector("img")?.getAttribute("src")).toBe("/img/ambient/empty-library.webp");
    expect(within(empty).queryByRole("button")).toBeNull();
    expect(screen.getAllByText("Upload map")).toHaveLength(1);
    expect(screen.getByText("Upload map").closest(".library-toolbar")).toBeTruthy();
  });

  it("offers the GM of a room with no map the way to choose one", () => {
    const onChooseMap = vi.fn();
    render(<BoardEmptyState isGm onChooseMap={onChooseMap} />);
    const empty = document.querySelector(".board-empty .empty-state") as HTMLElement;
    expect(empty.querySelector("img")?.getAttribute("src")).toBe("/img/ambient/empty-map.webp");
    expect(within(empty).getByText("There is no map on the table yet.")).toBeTruthy();
    fireEvent.click(within(empty).getByRole("button", { name: "Choose a map" }));
    expect(onChooseMap).toHaveBeenCalledTimes(1);
  });

  it("tells a player the GM hasn't set a map, with no action", () => {
    render(<BoardEmptyState isGm={false} />);
    const empty = document.querySelector(".board-empty .empty-state") as HTMLElement;
    expect(within(empty).getByText("The GM hasn't set a map yet.")).toBeTruthy();
    expect(within(empty).queryByRole("button")).toBeNull();
  });
});
