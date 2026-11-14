// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/net/api";
import { toGridDraft } from "../src/pages/gridDraft";
import { GmPanel } from "../src/pages/GmPanel";
import { GuideTour } from "../src/ui/GuideTour";
import { editorGuide } from "../src/pages/mapEditor/mapEditorGuides";
import { GRID, TOKEN, fakeConnection, room, stubMapEditorEnvironment } from "./mapEditorHarness";

vi.mock("../src/panels/CheckpointsPanel", () => ({ CheckpointsPanel: () => null }));
vi.mock("../src/panels/EncounterPanel", () => ({ EncounterPanel: () => null }));

beforeEach(() => {
  stubMapEditorEnvironment();
  Element.prototype.scrollIntoView = () => {};
  vi.spyOn(api.walls, "availability").mockResolvedValue({ available: true });
  vi.spyOn(api.walls, "status").mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  render(
    <GmPanel
      connection={fakeConnection().connection} state={room()} token={TOKEN}
      gridDraft={toGridDraft(GRID)} hasGridDraft={false}
      onGridDraftChange={() => {}} onGridDraftCancel={() => {}} onGridApply={async () => true}
      gridApplying={false} gridError={null} onReviewDeparture={() => {}}
    />,
  );
}
const editor = () => screen.getByRole("dialog", { name: /^(Edit|Change) map$/ });
/** The Map step is in Change map; every other step is in Edit map. */
const openStep = (tab: string) => {
  fireEvent.click(screen.getByRole("button", { name: tab === "1 · Map" ? "Change map" : "Edit map" }));
  fireEvent.click(within(editor()).getByRole("tab", { name: tab }));
};
const guide = () => within(editor()).getByRole("button", { name: "Guide" });
const title = () => within(editor()).getByRole("heading", { level: 2, name: (_, el) => el.id === "guide-title" });

describe("map editor step guides (map-editor-step-guides)", () => {
  it.each([
    ["1 · Map", "The map"],
    ["1 · Grid", "Place the grid"],
    ["2 · Walls", "The walls"],
    ["3 · Fog", "The fog"],
    ["4 · Sight", "Test tokens"],
  ])("%s has a Guide button that opens a tour for that step", (tab, first) => {
    mount();
    openStep(tab);
    fireEvent.click(guide());
    expect(title().textContent).toBe(first);
  });

  it("walks Next, Back and Done, and skips steps whose control is not on screen", () => {
    mount();
    openStep("3 · Fog");
    fireEvent.click(guide());
    const seen: string[] = [];
    for (;;) {
      seen.push(title().textContent!);
      const next = within(editor()).getByRole("button", { name: /^(Next|Done)$/ });
      if (next.textContent === "Done") { fireEvent.click(next); break; }
      fireEvent.click(next);
    }
    // No fogged regions yet, so that step is skipped.
    expect(seen).toEqual(["The fog", "Tools", "Player view", "Fog whole map"]);
    expect(editor().querySelector(".guide-layer")).toBeNull();
    fireEvent.click(guide());
    fireEvent.click(within(editor()).getByRole("button", { name: "Next" }));
    fireEvent.click(within(editor()).getByRole("button", { name: "Back" }));
    expect(title().textContent).toBe("The fog");
  });

  it("closes on Escape without closing the editor", () => {
    mount();
    openStep("4 · Sight");
    fireEvent.click(guide());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(editor().querySelector(".guide-layer")).toBeNull();
    expect(editor().hasAttribute("open")).toBe(true);
  });

  it("tours the Sight controls", () => {
    mount();
    openStep("4 · Sight");
    fireEvent.click(guide());
    const seen: string[] = [];
    for (;;) {
      seen.push(title().textContent!);
      const next = within(editor()).getByRole("button", { name: /^(Next|Done)$/ });
      if (next.textContent === "Done") break;
      fireEvent.click(next);
    }
    expect(seen).toContain("Line of sight");
    expect(seen).toContain("Range");
  });

  it("every editor tour has distinct cards", () => {
    for (const key of ["map", "grid", "walls", "fog", "sight"]) {
      const steps = editorGuide(key)!;
      expect(new Set(steps.map((s) => s.target)).size).toBe(steps.length);
    }
  });

  it("still runs the app-wide guide for a role", () => {
    document.body.innerHTML = '<button data-tour="fit">Fit</button>';
    render(<GuideTour role="gm" onClose={() => {}} />);
    expect(screen.getByText("Lost your place? Fit brings the whole map back into view.")).toBeTruthy();
  });
});
