// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, type EncounterSummary } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { EncounterCard, encounterSummary } from "../src/pages/LibraryEncounters";
import { EncounterPanel } from "../src/panels/EncounterPanel";

const connection = { command: async () => ({ ok: true }) } as unknown as RoomConnection;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const template = (overrides: Partial<EncounterSummary> = {}): EncounterSummary => ({
  id: "t1", name: "Goblin ambush", mapName: "Cave", mapAssetId: "a1", tokenCount: 3, fogCount: 1,
  createdAt: "2026-10-06T00:00:00.000Z", updatedAt: "2026-10-06T00:00:00.000Z", ...overrides,
});

describe("the GM's Encounter templates section (encounter-templates, FR-GM-13)", () => {
  it("offers a header save action and waits for the list before saying anything about it", () => {
    const html = renderToStaticMarkup(<EncounterPanel connection={connection} state={emptyRoomState("r1")} />);
    expect(html).toContain('aria-label="Save as template"');
    expect(html).toContain("Encounter templates");
    expect(text(html)).toContain("Loading…");
    expect(text(html)).not.toContain("No templates yet.");
  });
});

describe("encounter summaries (encounter-templates)", () => {
  it("counts tokens and fog, singular and plural", () => {
    expect(encounterSummary(template({ tokenCount: 1, fogCount: 0 }))).toBe("1 token");
    expect(encounterSummary(template({ tokenCount: 3, fogCount: 1 }))).toBe("3 tokens · 1 fog region");
    expect(encounterSummary(template({ tokenCount: 0, fogCount: 2 }))).toBe("0 tokens · 2 fog regions");
  });
});

describe("an encounter card in the library (encounter-templates, FR-GM-13)", () => {
  const render = (e: EncounterSummary) =>
    renderToStaticMarkup(<EncounterCard encounter={e} onChanged={() => {}} onDeleted={() => {}} />);

  it("shows its name, map and contents with Rename and Delete", () => {
    const html = render(template());
    expect(text(html)).toContain("Goblin ambush");
    expect(text(html)).toContain("Cave · 3 tokens · 1 fog region");
    expect(html).toContain(`aria-label="Rename"`);
    expect(html).toContain(`aria-label="Delete"`);
    expect(html).not.toContain('role="alert"');
  });

  it("warns when its map was deleted", () => {
    const html = render(template({ mapName: null }));
    expect(text(html)).toContain("Map deleted");
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain("until you save it again");
  });
});
