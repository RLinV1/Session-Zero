// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GRID, emptyRoomState, type AccountView, type LibraryCreature, type PresetFeatures, type RoomState } from "@vtt/shared";
import { accountStore } from "../src/account/accountStore";
import { cursorSquare, moveCursor, placementCommand, startCursor, type PlacementGhost } from "../src/board/placement";
import { AddTokenButton, savedCreatureDraft, tokenDraftFor } from "../src/panels/AddToken";

const all: PresetFeatures = { attacks: true, conditions: true, armorClass: true };
const none: PresetFeatures = { attacks: false, conditions: false, armorClass: false };

const goblin: LibraryCreature = {
  id: "c1", name: "Goblin", size: 1, maxHp: 7, ac: 15, color: "#2e7d32", conditions: ["prone"],
  imageAssetId: "a1", imageUrl: "/uploads/goblin.webp", createdAt: "2026-09-27T00:00:00.000Z",
  attacks: [{ name: "Scimitar", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: { terms: [{ count: 1, sides: 6 }], modifier: 2 } }],
};

const mapRoom = (): RoomState => {
  const base = emptyRoomState("r1");
  return { ...base, scene: { ...base.scene, map: { url: "/uploads/map.png", width: 1400, height: 1050 }, grid: DEFAULT_GRID } };
};

describe("Each placement sends one token (token-placement-flow)", () => {
  it("strips any count from a draft and sends exactly one at the square", () => {
    const draft = tokenDraftFor({ name: "Ogre", hidden: false, ownerIds: [], size: 2, rotation: 0, stats: { hp: 59, maxHp: 59, ac: 11 }, image: null, color: "#336699", conditions: [], attacks: [] }, all);
    const command = placementCommand({ kind: "create", draft: { ...draft, count: 5 } }, { x: 140, y: 70 });
    expect(command).toEqual({ ...draft, count: 1, position: { x: 140, y: 70 } });
  });

  it("sends a duplicate as the token id and the square, nothing else", () => {
    const ghost: PlacementGhost = { name: "Goblin", size: 1, rotation: 0, color: "#000000", imageUrl: null, hidden: true, stats: { hp: 7, maxHp: 7, ac: 15 } };
    expect(placementCommand({ kind: "duplicate", tokenId: "t1", ghost }, { x: 35, y: 35 })).toEqual({ type: "token.duplicate", tokenId: "t1", position: { x: 35, y: 35 } });
  });
});

describe("Keyboard placement (token-placement-flow)", () => {
  it("starts on the square nearest the map's centre", () => {
    expect(startCursor(mapRoom(), 1)).toEqual({ x: 735, y: 525 });
  });

  it("moves one square per press and stops at the map's edge", () => {
    const room = mapRoom();
    expect(moveCursor({ x: 735, y: 525 }, 1, 0, 1, room)).toEqual({ x: 805, y: 525 });
    expect(moveCursor({ x: 35, y: 35 }, -1, 0, 1, room)).toEqual({ x: 35, y: 35 });
    expect(moveCursor({ x: 35, y: 35 }, 0, -1, 1, room)).toEqual({ x: 35, y: 35 });
    expect(moveCursor({ x: 1365, y: 1015 }, 1, 1, 1, room)).toEqual({ x: 1365, y: 1015 });
  });

  it("names the square for screen readers, counting from 1", () => {
    expect(cursorSquare({ x: 35, y: 35 }, 1, DEFAULT_GRID)).toBe("column 1, row 1");
    expect(cursorSquare({ x: 735, y: 525 }, 1, DEFAULT_GRID)).toBe("column 11, row 8");
    expect(cursorSquare({ x: 140, y: 70 }, 2, DEFAULT_GRID)).toBe("column 2, row 1");
  });
});

describe("Saved Creatures places a creature directly (token-placement-flow, library-creatures)", () => {
  it("uses the creature's values, no owner, and Hidden as ticked", () => {
    expect(savedCreatureDraft(goblin, true, all)).toMatchObject({
      type: "token.create", name: "Goblin", size: 1, rotation: 0, hidden: true, ownerIds: [],
      stats: { hp: 7, maxHp: 7, ac: 15 }, color: "#2e7d32", conditions: ["prone"],
      imageUrl: "/uploads/goblin.webp", assetId: "a1", attacks: goblin.attacks,
    });
    expect(savedCreatureDraft(goblin, false, all).hidden).toBe(false);
  });

  it("leaves out what the room's preset turns off, as New Token does", () => {
    expect(savedCreatureDraft(goblin, false, none)).toMatchObject({ stats: { ac: null }, conditions: [], attacks: [] });
  });

  it("never carries a count", () => {
    expect(savedCreatureDraft(goblin, false, all)).not.toHaveProperty("count");
  });
});

describe("New Token and Saved Creatures buttons (token-placement-flow)", () => {
  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); };
  });
  afterEach(() => {
    cleanup();
    accountStore.setState({ status: "loading" }, true);
  });

  it("shows a signed-out GM only New Token", () => {
    accountStore.setState({ status: "signedOut" }, true);
    render(<AddTokenButton state={emptyRoomState("r1")} token="t" onPlace={() => {}} />);
    expect(screen.getByRole("button", { name: "New Token" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Saved Creatures" })).toBeNull();
  });

  it("shows a signed-in GM both buttons", () => {
    accountStore.setState({ status: "signedIn", account: { id: "u1" } as unknown as AccountView }, true);
    render(<AddTokenButton state={emptyRoomState("r1")} token="t" onPlace={() => {}} />);
    expect(screen.getByRole("button", { name: "Saved Creatures" })).toBeTruthy();
  });

  it("has no count in the New Token form", () => {
    render(<AddTokenButton state={emptyRoomState("r1")} token="t" onPlace={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "New Token" }));
    expect(screen.queryByLabelText("How many")).toBeNull();
    expect(screen.queryByRole("spinbutton", { name: /how many/i })).toBeNull();
  });
});
