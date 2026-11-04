// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SHIPPED_MAPS, type LibraryAsset } from "@vtt/shared";
import { api } from "../src/net/api";
import { LibraryPage } from "../src/pages/LibraryPage";

vi.mock("../src/account/RequireAccount", () => ({ RequireAccount: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../src/account/AccountPages", () => ({ AccountMenu: () => null }));
vi.mock("../src/ui/SiteHeader", () => ({ SiteHeader: () => null, HubNav: () => null }));

const grid = { cellSize: 70, offsetX: 0, offsetY: 0, unitsPerCell: 5, unit: "ft" } as unknown as LibraryAsset["grid"];
const row = (id: string, name: string, url: string): LibraryAsset => ({ id, kind: "map", name, url, width: 700, height: 700, grid, createdAt: "2026-10-18T00:00:00Z" });
const seeded = (i: number) => row(`seed${i}`, SHIPPED_MAPS[i]!.name, SHIPPED_MAPS[i]!.url);
const mine = row("mine1", "My Cellar", "/uploads/cellar.png");

function mount(rows: LibraryAsset[]) {
  vi.spyOn(api.library, "list").mockResolvedValue(rows);
  vi.spyOn(api.library.creatures, "list").mockResolvedValue([]);
  vi.spyOn(api.library.encounters, "list").mockResolvedValue([]);
  render(<LibraryPage />);
}
const included = () => within(screen.getByRole("region", { name: "Included with the app" }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Maps tab lists the shipped maps under Included with the app (ADR 0036)", () => {
  it("keeps seeded shipped rows out of the uploads grid and uploads out of the section", async () => {
    mount([mine, seeded(0), seeded(1)]);
    await screen.findByText("My Cellar");
    expect(included().getByText(SHIPPED_MAPS[0]!.name)).toBeTruthy();
    expect(included().getByText(SHIPPED_MAPS[1]!.name)).toBeTruthy();
    expect(included().queryByText("My Cellar")).toBeNull();
    expect(within(screen.getByRole("tabpanel")).queryByText(SHIPPED_MAPS[0]!.name)).toBeNull();
    // Seeded rows replace their static twin: each name appears once.
    expect(screen.getAllByText(SHIPPED_MAPS[0]!.name)).toHaveLength(1);
  });

  it("falls back to the static maps before seeding, without duplicating seeded ones", async () => {
    mount([mine, seeded(0)]);
    await screen.findByText("My Cellar");
    expect(included().getAllByRole("listitem").length).toBe(SHIPPED_MAPS.length);
  });

  it("search filters both groups and the empty state still shows the section", async () => {
    mount([mine, seeded(0)]);
    await screen.findByText("My Cellar");
    fireEvent.change(screen.getByLabelText("Search by name"), { target: { value: "cellar" } });
    expect(screen.getByText("My Cellar")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Included with the app" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Search by name"), { target: { value: SHIPPED_MAPS[0]!.name } });
    expect(screen.queryByText("My Cellar")).toBeNull();
    expect(included().getByText(SHIPPED_MAPS[0]!.name)).toBeTruthy();
  });

  it("with no uploads, says so and still lists the included maps", async () => {
    mount([SHIPPED_MAPS.map((_, i) => seeded(i))].flat());
    await screen.findByText(/You haven't uploaded any maps yet/);
    expect(included().getAllByRole("listitem").length).toBe(SHIPPED_MAPS.length);
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  });
});
