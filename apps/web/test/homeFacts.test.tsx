// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAYERS_PER_ROOM, REVERSIBLE_EVENT_TYPES } from "@vtt/shared";
import { FactsRow } from "../src/pages/home/FactsRow";

afterEach(() => {
  cleanup();
  vi.doUnmock("@vtt/shared");
  vi.resetModules();
});

const fact = (text: RegExp) => screen.getByText(text).closest("li")!.textContent!.replace(/\s+/g, " ").trim();

describe("the facts row (gm-home: Figures are sourced, Free is stated)", () => {
  it("states that it is free, the room's player limit, no account needed to start, and what undo covers", () => {
    render(<FactsRow />);
    expect(fact(/no paid tier/)).toBe("Free forever for every feature, with no paid tier.");
    expect(fact(/players in one room/)).toBe(`Up to ${MAX_PLAYERS_PER_ROOM} players in one room.`);
    expect(fact(/free account keeps/)).toBe("No account needed to start, for players or GMs. A free account keeps your rooms on any device and lets you upload your own maps.");
    expect(fact(/for moves/)).toBe("Undo for moves, fog, walls and hit points.");
  });

  it("states no ping latency", () => {
    render(<FactsRow />);
    expect(screen.queryByText(/\bping\b|\bms\b/i)).toBeNull();
  });

  it("takes the player figure from the shared limit, not from a typed number", async () => {
    vi.doMock("@vtt/shared", async (original) => ({ ...(await original<typeof import("@vtt/shared")>()), MAX_PLAYERS_PER_ROOM: 7 }));
    const { FactsRow: Row } = await import("../src/pages/home/FactsRow");
    render(<Row />);
    expect(fact(/players in one room/)).toBe("Up to 7 players in one room.");
  });

  it("names only what the table can undo", () => {
    for (const type of ["TokenMoved", "FogAdded", "FogRemoved", "WallsAdded", "WallsRemoved", "TokenStatsSet"]) {
      expect(REVERSIBLE_EVENT_TYPES).toContain(type);
    }
  });
});
