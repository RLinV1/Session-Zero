// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAYERS_PER_ROOM, REVERSIBLE_EVENT_TYPES } from "@vtt/shared";
import { FactsRow, PING_TARGET_MS } from "../src/pages/home/FactsRow";

afterEach(() => {
  cleanup();
  vi.doUnmock("@vtt/shared");
  vi.resetModules();
});

/** A file of the repository, found from wherever the tests run. */
function repoFile(path: string): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, path))) {
    const up = resolve(dir, "..");
    if (up === dir) throw new Error(`${path} not found`);
    dir = up;
  }
  return readFileSync(join(dir, path), "utf8");
}

const fact = (text: RegExp) => screen.getByText(text).closest("li")!.textContent!.replace(/\s+/g, " ").trim();

describe("the facts row (gm-home: Figures are sourced)", () => {
  it("states the room's player limit, the ping target, no account for players, and what undo covers", () => {
    render(<FactsRow />);
    expect(fact(/players in one room/)).toBe(`Up to ${MAX_PLAYERS_PER_ROOM} players in one room.`);
    expect(fact(/for a ping/)).toBe(`Under ${PING_TARGET_MS} ms for a ping to reach everyone at the table.`);
    expect(fact(/for players/)).toBe("No account for players. They join from a link, in any browser.");
    expect(fact(/for moves/)).toBe("Undo for moves, fog, walls and hit points.");
  });

  it("takes the player figure from the shared limit, not from a typed number", async () => {
    vi.doMock("@vtt/shared", async (original) => ({ ...(await original<typeof import("@vtt/shared")>()), MAX_PLAYERS_PER_ROOM: 7 }));
    const { FactsRow: Row } = await import("../src/pages/home/FactsRow");
    render(<Row />);
    expect(fact(/players in one room/)).toBe("Up to 7 players in one room.");
  });

  it("states the ping figure the latency benchmark holds the server to", () => {
    const bench = repoFile("apps/server/test/ephemeralLatency.test.ts");
    expect(Number(bench.match(/const TARGET_P95_MS = (\d+);/)?.[1])).toBe(PING_TARGET_MS);
  });

  it("names only what the table can undo", () => {
    for (const type of ["TokenMoved", "FogAdded", "FogRemoved", "WallsAdded", "WallsRemoved", "TokenStatsSet"]) {
      expect(REVERSIBLE_EVENT_TYPES).toContain(type);
    }
  });
});
