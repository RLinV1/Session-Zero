// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import { ARROW_STEPS, ownsArrowKeys, stepTo } from "../src/ui/MoveControl";
import { TokenCard } from "../src/board/TokenCard";

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };
const bob: Participant = { id: "bob", role: "player", displayName: "Bob" };

const fighter: Token = {
  id: "f1", name: "Fighter", position: { x: 105, y: 105 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: ["alice"], hidden: false, stats: { hp: 12, maxHp: 12, ac: 16 }, conditions: [],
};
const base = emptyRoomState("r1");
const state: RoomState = {
  ...base,
  participants: { gm, alice, bob },
  tokens: { f1: fighter },
  scene: { ...base.scene, grid: { ...base.scene.grid, cellSize: 70 } },
};

afterEach(cleanup);

describe("the token card has no on-screen move pad or arrow-key switch (FR-PL-04, client-settings)", () => {
  it("shows neither Move buttons nor the arrow-key switch, which lives in Settings", () => {
    for (const you of [alice, gm, bob]) {
      render(<TokenCard token={fighter} state={state} you={you} onClose={() => {}} onMove={vi.fn()} />);
      expect(screen.queryByRole("switch", { name: /arrow keys/i }), you.displayName).toBeNull();
      expect(screen.queryByRole("group", { name: "Move Fighter" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Move Fighter .* one square/ })).toBeNull();
      cleanup();
    }
  });
});

describe("moving the selected token with the arrow keys (FR-PL-04, WCAG 2.1.1)", () => {
  it("steps one square per arrow and stops at the map's edge", () => {
    const [dx, dy] = ARROW_STEPS.ArrowRight!;
    expect(stepTo({ x: 35, y: 35 }, 70, dx, dy)).toEqual({ x: 105, y: 35 });
    expect(stepTo({ x: 35, y: 35 }, 70, ...ARROW_STEPS.ArrowLeft!, { width: 140, height: 140 })).toBeNull();
    expect(ARROW_STEPS.Enter).toBeUndefined();
  });

  it("leaves the arrows to fields, tab lists and other widgets that use them", () => {
    const text = document.createElement("input");
    const box = Object.assign(document.createElement("input"), { type: "checkbox" });
    const tablist = document.createElement("div");
    tablist.setAttribute("role", "tablist");
    const tab = document.createElement("button");
    tablist.append(tab);
    const plain = document.createElement("button");
    expect(ownsArrowKeys(text)).toBe(true);
    expect(ownsArrowKeys(document.createElement("textarea"))).toBe(true);
    expect(ownsArrowKeys(tab)).toBe(true);
    // Checkboxes and plain buttons don't use the arrows, so the keys still move the token from them.
    expect(ownsArrowKeys(box)).toBe(false);
    expect(ownsArrowKeys(plain)).toBe(false);
    expect(ownsArrowKeys(document.body)).toBe(false);
  });
});
