import { describe, expect, it, vi } from "vitest";
import type { DetectedWallsResponse } from "@vtt/shared";
import { draftConnection } from "../src/pages/mapEditor/draftConnection";
import type { MapDraft } from "../src/pages/mapEditor/mapDraft";
import type { RoomConnection } from "../src/net/roomConnection";

const mapUrl = "/uploads/map.png";
const found = [{ a: { x: 0, y: 0 }, b: { x: 70, y: 0 } }, { a: { x: 70, y: 0 }, b: { x: 70, y: 70 } }];

function setup() {
  let draft: MapDraft = { mapUrl, walls: {}, fog: {}, lineOfSight: false, isometric: false, sightRange: null };
  let current = true;
  const liveCommand = vi.fn();
  const fetch = vi.fn(async (): Promise<DetectedWallsResponse> => ({ resultId: "result-b", walls: found }));
  const connection = draftConnection({ command: liveCommand } as unknown as RoomConnection, (change) => { draft = change(draft); }, fetch, mapUrl, { width: 680, height: 680 }, () => current);
  return { connection, fetch, liveCommand, draft: () => draft, replace: (next: MapDraft) => { draft = next; }, invalidate: () => { current = false; } };
}

describe("draft connection ownership (FR-GM-11)", () => {
  it("rejects same-count stale exclusions and applies matching exclusions", async () => {
    const test = setup();
    expect(await test.connection.command({ type: "wall.applyDetected", mapUrl, exclude: { resultId: "result-a", indices: [0] } })).toMatchObject({ ok: false, code: "invalid" });
    expect(test.draft().walls).toEqual({});
    expect(await test.connection.command({ type: "wall.applyDetected", mapUrl, exclude: { resultId: "result-b", indices: [0] } })).toMatchObject({ ok: true });
    expect(Object.values(test.draft().walls).map(({ a, b }) => ({ a, b }))).toEqual([found[1]]);
    expect(test.liveCommand).not.toHaveBeenCalled();
  });

  it.each(["reopen", "switch", "discard"])("ignores a delayed detection after editor %s", async (transition) => {
    const test = setup();
    let complete!: (result: DetectedWallsResponse) => void;
    test.fetch.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const pending = test.connection.command({ type: "wall.applyDetected", mapUrl });
    test.invalidate();
    const replacement: MapDraft = { mapUrl: transition === "switch" ? "/uploads/other.png" : mapUrl, walls: { retained: { id: "retained", ...found[0]! } }, fog: {}, lineOfSight: false, isometric: false, sightRange: null };
    test.replace(replacement);
    complete({ resultId: "result-b", walls: found });
    expect(await pending).toMatchObject({ ok: false, code: "invalid" });
    expect(test.draft()).toBe(replacement);
    expect(await test.connection.command({ type: "wall.clear" })).toMatchObject({ ok: false });
  });

  it("refuses a detection for a different map and out-of-range exclusions", async () => {
    const test = setup();
    expect(await test.connection.command({ type: "wall.applyDetected", mapUrl: "/uploads/other.png" })).toMatchObject({ ok: false });
    expect(test.fetch).not.toHaveBeenCalled();
    expect(await test.connection.command({ type: "wall.applyDetected", mapUrl, exclude: { resultId: "result-b", indices: [2] } })).toMatchObject({ ok: false });
    expect(test.draft().walls).toEqual({});
  });

  it("keeps synchronous editing private in the active draft", async () => {
    const test = setup();
    expect(await test.connection.command({ type: "wall.add", walls: [found[0]!] })).toMatchObject({ ok: true });
    const wallId = Object.keys(test.draft().walls)[0]!;
    expect(await test.connection.command({ type: "portal.set", wallId, portal: { kind: "door", state: "locked" } })).toMatchObject({ ok: true });
    expect(test.draft().walls[wallId]!.portal).toEqual({ kind: "door", state: "locked" });
    expect(test.liveCommand).not.toHaveBeenCalled();
  });
  it("refuses geometry the server would refuse, leaving the draft alone", async () => {
    const test = setup();
    const outside = { type: "wall.add" as const, walls: [{ a: { x: 0, y: 0 }, b: { x: 700, y: 0 } }] };
    const flat = { type: "fog.add" as const, region: { shape: "rect" as const, from: { x: 10, y: 10 }, to: { x: 200, y: 10 } } };
    const collinear = { type: "fog.add" as const, region: { shape: "polygon" as const, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }] } };
    for (const command of [outside, flat, collinear]) expect(await test.connection.command(command)).toMatchObject({ ok: false, code: "invalid" });
    expect(test.draft()).toEqual({ mapUrl, walls: {}, fog: {}, lineOfSight: false, isometric: false, sightRange: null });
    expect(await test.connection.command({ type: "wall.add", walls: [{ a: { x: 0, y: 0 }, b: { x: 680, y: 0 } }] })).toMatchObject({ ok: true });
  });
});
