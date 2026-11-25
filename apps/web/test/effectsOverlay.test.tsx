import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CLIENT_SETTINGS, setClientSettings } from "../src/ui/clientSettings";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, type RoomState, type Token } from "@vtt/shared";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET } from "../src/board/effectPresets";
import EffectsOverlay, { type OverlayEffect } from "../src/board/EffectsOverlay";

const token = (id: string, over: Partial<Token> = {}): Token => ({
  id, name: id, position: { x: 140, y: 140 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
});

const room = (tokens: Token[]): RoomState => ({
  ...emptyRoomState("r"),
  tokens: Object.fromEntries(tokens.map((t) => [t.id, t])),
});

const render = (state: RoomState, effects: OverlayEffect[] = [], isGm = false) =>
  renderToStaticMarkup(<EffectsOverlay state={state} effects={effects} subscribe={() => () => {}} onDone={() => {}} isGm={isGm} />);

describe("effects overlay (board-effects-overlay)", () => {
  it("is hidden from assistive technology and styled as input-transparent", () => {
    const html = render(room([token("a")]));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="effects-overlay"');
    expect(html).not.toContain("tabindex");
  });

  it("draws a ring for a ring condition", () => {
    const html = render(room([token("a", { conditions: ["concentrating"] })]));
    expect(html).toContain("effects-ring");
  });

  it("draws a ring for prone too", () => {
    expect(render(room([token("a", { conditions: ["prone"] })]))).toContain("effects-ring");
  });

  it("draws nothing for a condition-free board", () => {
    const html = render(room([token("a")]));
    expect(html).not.toContain("effects-ring");
    expect(html).not.toContain("effects-label");
  });

  it("shows the damage number on a visible target", () => {
    const html = render(room([token("b")]), [{ id: 1, effect: { kind: "damage", tokenId: "b", amount: 7 } }]);
    expect(html).toContain("−7");
  });

  it("draws no effect for a token hidden from a player, but does for the GM", () => {
    const state = room([token("b", { hidden: true, conditions: ["concentrating"] })]);
    const effects: OverlayEffect[] = [{ id: 1, effect: { kind: "hit", tokenId: "b" } }];
    const player = render(state, effects, false);
    expect(player).not.toContain("effects-ring");
    expect(player).not.toContain("effects-orb");
    expect(render(state, effects, true)).toContain("effects-orb");
  });

  it("draws nothing for a token missing from the viewer's state", () => {
    const html = render(room([token("a")]), [{ id: 1, effect: { kind: "damage", tokenId: "ghost", amount: 3 } }]);
    expect(html).not.toContain("−3");
  });

  it("leaves the strike to the Pixi board and draws no DOM motion for it (ADR 0038)", () => {
    const state = room([token("a"), token("b")]);
    const strike: OverlayEffect[] = [{ id: 1, effect: { kind: "strike", fromId: "a", toId: "b", animation: ATTACK_STYLE_PRESETS.melee } }];
    expect(render(state, strike, true)).not.toContain("effects-orb");
    expect(render(state, strike, false)).not.toContain("effects-orb");
  });

  it("shows a damage number on each token a nuke names, only where visible (ADR 0038, FR-GM-23)", () => {
    const state = room([token("a"), token("b", { hidden: true })]);
    const nuke: OverlayEffect[] = [{ id: 1, effect: { kind: "nuke", animation: NUKE_PRESET, origin: { x: 0, y: 0 }, amount: 12, tokenIds: ["a", "b"] } }];
    const player = render(state, nuke, false);
    expect(player.match(/−12/g)).toHaveLength(1);
    expect(render(state, nuke, true).match(/−12/g)).toHaveLength(2);
  });
});

describe("hit, miss and damage at each Animations level (animation-levels)", () => {
  const state = room([token("b")]);
  const hit: OverlayEffect[] = [{ id: 1, effect: { kind: "hit", tokenId: "b" } }];
  const miss: OverlayEffect[] = [{ id: 2, effect: { kind: "miss", tokenId: "b" } }];
  const damage: OverlayEffect[] = [{ id: 3, effect: { kind: "damage", tokenId: "b", amount: 7 } }];
  const nuke: OverlayEffect[] = [{ id: 4, effect: { kind: "nuke", animation: NUKE_PRESET, origin: { x: 0, y: 0 }, amount: 12, tokenIds: ["b"] } }];
  const damages: OverlayEffect[] = [{ id: 5, effect: { kind: "damages", hits: [{ tokenId: "b", amount: 9 }] } }];
  afterEach(() => setClientSettings(DEFAULT_CLIENT_SETTINGS));

  it("Full plays the moving hit and the MISS splash", () => {
    setClientSettings({ animationLevel: "full" });
    expect(render(state, hit)).toContain("effects-orb");
    expect(render(state, miss)).toContain("effects-miss");
  });

  it("Reduced shows a still ring with no text, and a still damage number", () => {
    setClientSettings({ animationLevel: "reduced" });
    const hitHtml = render(state, hit);
    expect(hitHtml).toContain("effects-ring");
    expect(hitHtml).not.toContain("effects-orb");
    const missHtml = render(state, miss);
    expect(missHtml).toContain("effects-ring");
    expect(missHtml).not.toContain("effects-label");
    expect(missHtml).not.toMatch(/miss/i);
    const damageHtml = render(state, damage);
    expect(damageHtml).toContain("−7");
    expect(damageHtml).not.toContain("effects-orb");
  });

  it("None draws nothing for a hit, a miss or any damage number", () => {
    setClientSettings({ animationLevel: "none" });
    for (const effects of [hit, miss, damage, nuke, damages]) {
      const html = render(state, effects);
      expect(html).not.toContain("effects-ring");
      expect(html).not.toContain("effects-label");
      expect(html).not.toContain("effects-orb");
    }
  });

  it("ignores the room's old table-wide reduced flag", () => {
    setClientSettings({ animationLevel: "full" });
    expect(render({ ...state, reducedEffects: true }, hit)).toContain("effects-orb");
  });
});
