// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ColorMatrixFilter, Container, Graphics } from "pixi.js";
import { emptyRoomState, filterStateForViewer, isDowned, type Participant, type Token } from "@vtt/shared";
import { BoardView } from "../src/board/boardView";
import { DOWNED_GREY, artStyleFor } from "../src/board/effects";

const gm: Participant = { id: "g", role: "gm", displayName: "G" };
const alice: Participant = { id: "a", role: "player", displayName: "A" };
const token = (hp: number | null, overrides: Partial<Token> = {}): Token => ({
  id: "t", name: "Goblin", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#556b2f", imageUrl: null,
  ownerIds: [], hidden: false, conditions: [], stats: { hp, maxHp: 7, ac: 13 }, ...overrides,
});

type Harness = {
  drawDecor(view: unknown, token: Token, r: number, focused: boolean, active: boolean, owned: boolean, viewed: boolean, grouped?: boolean, downed?: boolean): void;
  drawConditionLook(view: unknown, conditions: Token["conditions"], downed?: boolean): void;
};
/** A board for its drawing methods only; nothing is initialised or rendered. */
function board() {
  const view = Object.create(BoardView.prototype) as Harness;
  Object.assign(view, { palette: { focus: 0x3b82f6, ok: 0x22c55e, warn: 0xeab308, danger: 0xef4444 }, osReduced: false, tableReduced: false, applyArtOffset: vi.fn() });
  return view;
}
const tokenView = () => ({ decor: new Graphics(), art: new Container(), grey: null as ColorMatrixFilter | null, conditions: [], looping: false });

describe("downed tokens (FR-TAC-07, downed-token-marker)", () => {
  it("is down at 0 HP or below, never without HP", () => {
    expect(isDowned(token(0))).toBe(true);
    expect(isDowned(token(-4))).toBe(true);
    expect(isDowned(token(5))).toBe(false);
    expect(isDowned(token(null))).toBe(false);
  });

  it("greys a downed token, more than Unconscious though not fully, and keeps other condition looks", () => {
    expect(DOWNED_GREY).toBeGreaterThan(0.6);
    expect(DOWNED_GREY).toBeLessThan(1);
    expect(artStyleFor([], false, true).grey).toBe(DOWNED_GREY);
    expect(artStyleFor(["unconscious"], false).grey).toBe(0.6);
    expect(artStyleFor(["unconscious"], false, true).grey).toBe(DOWNED_GREY);
    expect(artStyleFor(["prone"], false, true)).toMatchObject({ grey: DOWNED_GREY, tilt: 70 });
  });

  it("draws an X over a downed token and takes it away when healed", () => {
    const b = board(), view = tokenView();
    b.drawDecor(view, token(5), 33, false, false, false, false, false, false);
    const healthy = view.decor.context.instructions.length;
    b.drawDecor(view, token(0), 33, false, false, false, false, false, true);
    expect(view.decor.context.instructions.length).toBe(healthy + 2);
    b.drawDecor(view, token(5), 33, false, false, false, false, false, false);
    expect(view.decor.context.instructions.length).toBe(healthy);
  });

  it("applies the downed grey to the art, and none once healed", () => {
    const b = board(), view = tokenView();
    b.drawConditionLook(view, [], true);
    expect(view.art.filters).toHaveLength(1);
    expect(view.grey).toBeInstanceOf(ColorMatrixFilter);
    b.drawConditionLook(view, [], false);
    expect(view.art.filters).toBeNull();
  });

  it("is judged only from HP the viewer holds: hidden HP shows no marker to players", () => {
    const state = emptyRoomState("r");
    const own = token(0, { id: "own", ownerIds: [alice.id] });
    state.tokens = { t: token(0), own };
    state.hideHp = true;
    const forAlice = filterStateForViewer(state, alice);
    expect(isDowned(forAlice.tokens.t!)).toBe(false);
    expect(isDowned(forAlice.tokens.own!)).toBe(true);
    expect(isDowned(filterStateForViewer(state, gm).tokens.t!)).toBe(true);
    state.hideHp = false;
    expect(isDowned(filterStateForViewer(state, alice).tokens.t!)).toBe(true);
  });
});
