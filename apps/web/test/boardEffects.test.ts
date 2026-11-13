import { describe, expect, it } from "vitest";
import { CONDITIONS, emptyRoomState, type DiceRoll, type DomainEvent, type Participant, type RoomState, type Token } from "@vtt/shared";
import {
  CONDITION_EFFECTS,
  MAX_ATTACK_EFFECTS,
  artStyleFor,
  attackEffectFor,
  attackPlan,
  effectToPlay,
  effectiveReducedMotion,
  type AttackEffect,
  conditionLoopWanted,
  loopFrameDue,
  loopingConditions,
} from "../src/board/effects";
import { ATTACK_STYLE_PRESETS, NUKE_PRESET, SHAPE_DEFAULTS } from "../src/board/effectPresets";

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const player: Participant = { id: "p1", role: "player", displayName: "Aria" };

const token = (id: string, hidden = false): Token => ({
  id, name: id, position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
});

const side = (tokenId: string) => ({ tokenId, name: tokenId, hidden: false });

const roll = (over: Partial<DiceRoll> = {}): DiceRoll => ({
  id: "r1", expression: "1d20", byParticipantId: "gm", dice: [12], modifier: 0, total: 12, visibility: "public",
  attack: { actor: side("a"), target: side("b"), label: null, kind: "toHit" },
  ...over,
});

const room = (over: { tokens?: Token[]; rolls?: DiceRoll[] } = {}): RoomState => ({
  ...emptyRoomState("room"),
  tokens: Object.fromEntries((over.tokens ?? [token("a"), token("b")]).map((t) => [t.id, t])),
  rolls: over.rolls ?? [roll()],
});

const rolled = (r: DiceRoll): DomainEvent => ({ type: "DiceRolled", roll: r });
const ruled = (verdict: "hit" | "miss" | null): DomainEvent => ({ type: "RollRuled", rollId: "r1", verdict, previous: null });
const applied = (amount = 7): DomainEvent => ({ type: "RollDamageApplied", rollId: "r1", amount });

describe("attackEffectFor: which events animate (KAN-76)", () => {
  it("strikes from the attacker to the target for a visible attack roll", () => {
    expect(attackEffectFor(rolled(roll()), room(), gm)).toMatchObject({ kind: "strike", fromId: "a", toId: "b" });
    expect(attackEffectFor(rolled(roll()), room(), player)).toMatchObject({ kind: "strike", fromId: "a", toId: "b" });
  });

  it("strikes for a damage roll too", () => {
    const damage = roll({ attack: { actor: side("a"), target: side("b"), label: null, kind: "damage" } });
    expect(attackEffectFor(rolled(damage), room({ rolls: [damage] }), gm)).toMatchObject({ kind: "strike" });
  });

  it("does nothing for a plain roll", () => {
    const plain = roll({ attack: undefined });
    expect(attackEffectFor(rolled(plain), room({ rolls: [plain] }), gm)).toBeNull();
  });

  it("does nothing for an event that is not an attack", () => {
    const moved: DomainEvent = { type: "TokenMoved", tokenId: "a", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } };
    expect(attackEffectFor(moved, room(), gm)).toBeNull();
  });

  it("does nothing when a side is null in this viewer's copy (FR-GM-23)", () => {
    const blanked = roll({ attack: { actor: null, target: side("b"), label: null, kind: "toHit" } });
    expect(attackEffectFor(rolled(blanked), room({ rolls: [blanked] }), player)).toBeNull();
    const noTarget = roll({ attack: { actor: side("a"), target: null, label: null, kind: "toHit" } });
    expect(attackEffectFor(rolled(noTarget), room({ rolls: [noTarget] }), player)).toBeNull();
    expect(attackEffectFor(ruled("hit"), room({ rolls: [noTarget] }), player)).toBeNull();
    expect(attackEffectFor(applied(), room({ rolls: [noTarget] }), player)).toBeNull();
  });

  it("does nothing when a token is missing from the viewer's state (FR-GM-23)", () => {
    expect(attackEffectFor(rolled(roll()), room({ tokens: [token("a")] }), gm)).toBeNull();
    expect(attackEffectFor(rolled(roll()), room({ tokens: [token("b")] }), gm)).toBeNull();
    expect(attackEffectFor(ruled("hit"), room({ tokens: [token("a")] }), gm)).toBeNull();
  });

  it("does nothing for a player when the attacker or target is hidden, but plays for the GM (FR-GM-23)", () => {
    const hiddenAttacker = room({ tokens: [token("a", true), token("b")] });
    expect(attackEffectFor(rolled(roll()), hiddenAttacker, player)).toBeNull();
    expect(attackEffectFor(rolled(roll()), hiddenAttacker, gm)).toMatchObject({ kind: "strike" });
    const hiddenTarget = room({ tokens: [token("a"), token("b", true)] });
    expect(attackEffectFor(rolled(roll()), hiddenTarget, player)).toBeNull();
    expect(attackEffectFor(ruled("hit"), hiddenTarget, player)).toBeNull();
    expect(attackEffectFor(applied(), hiddenTarget, player)).toBeNull();
    expect(attackEffectFor(ruled("hit"), hiddenTarget, gm)).toEqual({ kind: "hit", tokenId: "b", fromId: "a" });
  });
});

describe("attackEffectFor: damage after a to-hit does not strike again (KAN-76, no-repeat-strike-on-damage)", () => {
  const attack = (id: string, kind: "toHit" | "damage", target = "b", over: Partial<DiceRoll> = {}) =>
    roll({ id, attack: { actor: side("a"), target: side(target), label: null, kind }, ...over });
  const threeTokens = [token("a"), token("b"), token("c")];
  const strikeFor = (rolls: DiceRoll[], viewer: Participant = gm) =>
    attackEffectFor(rolled(rolls[rolls.length - 1]!), room({ tokens: threeTokens, rolls }), viewer);

  it("plays nothing for damage right after a to-hit on the same pair", () => {
    expect(strikeFor([attack("r1", "toHit"), attack("r2", "damage")])).toBeNull();
  });

  it("still strikes for damage with no earlier attack roll (a damage-only attack)", () => {
    expect(strikeFor([attack("r2", "damage")])).toMatchObject({ kind: "strike", fromId: "a", toId: "b" });
  });

  it("still strikes for damage against a different target than the to-hit", () => {
    expect(strikeFor([attack("r1", "toHit", "b"), attack("r2", "damage", "c")])).toMatchObject({ kind: "strike", fromId: "a", toId: "c" });
  });

  it("goes by the latest roll for the pair: damage after damage strikes", () => {
    expect(strikeFor([attack("r1", "toHit"), attack("r2", "damage"), attack("r3", "damage")])).toMatchObject({ kind: "strike" });
  });

  it("looks past rolls between other tokens", () => {
    expect(strikeFor([attack("r1", "toHit"), attack("r2", "toHit", "c"), attack("r3", "damage")])).toBeNull();
  });

  it("strikes for a player whose copy never had the GM-only to-hit", () => {
    // filterStateForViewer drops GM-only rolls, so the player's rolls hold only the damage.
    expect(strikeFor([attack("r2", "damage")], player)).toMatchObject({ kind: "strike" });
    expect(strikeFor([attack("r1", "toHit", "b", { visibility: "gm" }), attack("r2", "damage")], gm)).toBeNull();
  });

  it("treats a to-hit ruled Miss like any other: damage after it plays nothing", () => {
    expect(strikeFor([attack("r1", "toHit", "b", { verdict: "miss" }), attack("r2", "damage")])).toBeNull();
  });

  it("never stops a to-hit from striking", () => {
    expect(strikeFor([attack("r1", "toHit"), attack("r2", "toHit")])).toMatchObject({ kind: "strike" });
  });
});

describe("attackEffectFor: rulings with a hidden side (KAN-76, FR-GM-23)", () => {
  it("plays no hit, miss or damage when the attacker is blanked or hidden for the player", () => {
    const blanked = roll({ attack: { actor: null, target: side("b"), label: null, kind: "toHit" } });
    expect(attackEffectFor(ruled("hit"), room({ rolls: [blanked] }), player)).toBeNull();
    expect(attackEffectFor(applied(), room({ rolls: [blanked] }), player)).toBeNull();
    const hiddenActor = room({ tokens: [token("a", true), token("b")] });
    expect(attackEffectFor(ruled("miss"), hiddenActor, player)).toBeNull();
    expect(attackEffectFor(ruled("miss"), hiddenActor, gm)).toMatchObject({ kind: "miss", tokenId: "b" });
  });
});

describe("attackEffectFor: GM-only rolls (KAN-76, FR-GM-22)", () => {
  it("never strikes for a player on a GM-only roll, even if one arrived", () => {
    const gmRoll = roll({ visibility: "gm" });
    expect(attackEffectFor(rolled(gmRoll), room({ rolls: [gmRoll] }), player)).toBeNull();
    expect(attackEffectFor(rolled(gmRoll), room({ rolls: [gmRoll] }), gm)).toMatchObject({ kind: "strike" });
  });
});

describe("attackEffectFor: rulings and damage (KAN-76)", () => {
  it("plays hit and miss on the roll's target, and nothing when the verdict is cleared", () => {
    // The attacker rides along so "Current turn" can tell whose ruling it is (board-attack-effects).
    expect(attackEffectFor(ruled("hit"), room(), player)).toEqual({ kind: "hit", tokenId: "b", fromId: "a" });
    expect(attackEffectFor(ruled("miss"), room(), player)).toEqual({ kind: "miss", tokenId: "b", fromId: "a" });
    expect(attackEffectFor(ruled(null), room(), gm)).toBeNull();
  });

  it("plays the damage amount on the target", () => {
    expect(attackEffectFor(applied(7), room(), gm)).toEqual({ kind: "damage", tokenId: "b", amount: 7 });
    expect(attackEffectFor(applied(0), room(), gm)).toBeNull();
  });

  it("does nothing for an unknown roll or an undone damage apply", () => {
    expect(attackEffectFor(ruled("hit"), room({ rolls: [] }), gm)).toBeNull();
    expect(attackEffectFor({ type: "RollDamageUnapplied", rollId: "r1", amount: 7 }, room(), gm)).toBeNull();
  });
});

describe("attack plans under reduced motion (KAN-76)", () => {
  const effects = [
    { kind: "strike", fromId: "a", toId: "b", animation: ATTACK_STYLE_PRESETS.melee },
    { kind: "hit", tokenId: "b" },
    { kind: "miss", tokenId: "b" },
    { kind: "damage", tokenId: "b", amount: 3 },
  ] as const;

  it("travels and moves normally, each within 1.5 s", () => {
    for (const effect of effects) {
      const plan = attackPlan(effect, false);
      expect(plan.motion).toBe(true);
      expect(plan.durationMs).toBeLessThanOrEqual(1500);
    }
  });

  it("is a static, short-lived marker when motion is reduced", () => {
    for (const effect of effects) {
      const plan = attackPlan(effect, true);
      expect(plan.motion).toBe(false);
      expect(plan.durationMs).toBeLessThanOrEqual(1000);
    }
  });

  it("caps concurrent effects at 8", () => {
    expect(MAX_ATTACK_EFFECTS).toBe(8);
  });
});

describe("condition effects (KAN-76, FR-TAC-08)", () => {
  it("has an effect for every condition", () => {
    for (const { id } of CONDITIONS) expect(CONDITION_EFFECTS[id], id).toBeDefined();
    expect(Object.keys(CONDITION_EFFECTS).sort()).toEqual(CONDITIONS.map((c) => c.id).sort());
  });

  it("styles the art: invisible fades, prone tilts, unconscious greys", () => {
    expect(artStyleFor(["invisible"], false).alpha).toBeLessThan(0.5);
    expect(artStyleFor(["prone"], false).tilt).toBe(70);
    expect(artStyleFor(["unconscious"], false).grey).toBe(0.6);
    expect(artStyleFor([], false)).toEqual({ alpha: 1, tilt: 0, squash: 1, grey: 0, tremble: 0 });
    expect(artStyleFor(["stunned", "prone"], false).tilt).toBe(70);
  });

  it("selects static variants under reduced motion", () => {
    expect(artStyleFor(["frightened"], false).tremble).toBeGreaterThan(0);
    expect(artStyleFor(["frightened"], true).tremble).toBe(0);
  });

  it("knows which conditions move", () => {
    expect(loopingConditions(["poisoned", "prone", "blinded", "frightened"])).toEqual(["frightened"]);
    expect(loopingConditions([])).toEqual([]);
  });
});

describe("condition loop budget (KAN-76)", () => {
  it("runs only with a looping token, a visible page and motion allowed", () => {
    const on = { loopingTokens: 1, pageVisible: true, reducedMotion: false };
    expect(conditionLoopWanted(on)).toBe(true);
    expect(conditionLoopWanted({ ...on, loopingTokens: 0 })).toBe(false);
    expect(conditionLoopWanted({ ...on, pageVisible: false })).toBe(false);
    expect(conditionLoopWanted({ ...on, reducedMotion: true })).toBe(false);
  });

  it("draws at most 30 frames a second", () => {
    expect(loopFrameDue(1000, 1000)).toBe(false);
    expect(loopFrameDue(1016, 1000)).toBe(false);
    expect(loopFrameDue(1030, 1000)).toBe(false);
    expect(loopFrameDue(1034, 1000)).toBe(true);
  });
});

describe("attack animation resolution (FR-TAC-09, ADR 0038)", () => {
  const cell = emptyRoomState("r").scene.grid.cellSize;
  const at = (cells: number): RoomState => room({ tokens: [token("a"), { ...token("b"), position: { x: 100 + cells * cell, y: 100 } }] });
  const withAttack = (attack: Partial<NonNullable<DiceRoll["attack"]>>) =>
    roll({ attack: { actor: side("a"), target: side("b"), label: null, kind: "toHit", ...attack } });
  const animationOf = (r: DiceRoll, state: RoomState) => {
    const effect = attackEffectFor(rolled(r), state, gm);
    return effect?.kind === "strike" ? effect.animation : null;
  };

  it.each([["melee"], ["ranged"], ["magic"]] as const)("uses the %s built-in for a roll with that style", (style) => {
    expect(animationOf(withAttack({ style }), at(6))).toEqual(ATTACK_STYLE_PRESETS[style]);
  });

  it("plays the slash next to the target and one arrow farther away when the roll says nothing (attack-range)", () => {
    expect(animationOf(withAttack({}), at(1))).toEqual(SHAPE_DEFAULTS.slash);
    expect(animationOf(withAttack({}), at(6))).toEqual(SHAPE_DEFAULTS.arrow);
  });

  it("decides by whether the tokens' squares touch", () => {
    expect(animationOf(withAttack({}), at(1.5))).toEqual(SHAPE_DEFAULTS.slash);
    expect(animationOf(withAttack({}), at(1.6))).toEqual(SHAPE_DEFAULTS.arrow);
  });
  it("treats a diagonal neighbouring cell as melee", () => {
    const state = at(1);
    state.tokens.b = { ...state.tokens.b!, position: { x: 100 + cell, y: 100 + cell } };
    expect(animationOf(withAttack({}), state)).toEqual(SHAPE_DEFAULTS.slash);
  });

  it("follows the named attack's kind of range, wherever the target stands (attack-range)", () => {
    expect(animationOf(withAttack({ range: "melee" }), at(6))).toEqual(SHAPE_DEFAULTS.slash);
    expect(animationOf(withAttack({ range: "ranged" }), at(1))).toEqual(SHAPE_DEFAULTS.arrow);
  });

  it("plays the same arrow for every distant roll, for every viewer", () => {
    const state = at(6);
    const shapes = new Set(Array.from({ length: 20 }, (_, i) => animationOf(roll({ id: `roll-${i}`, attack: withAttack({}).attack }), state)?.shape));
    expect([...shapes]).toEqual(["arrow"]);
    const r = withAttack({ range: "ranged" });
    expect(attackEffectFor(rolled(r), state, player)).toEqual(attackEffectFor(rolled(r), state, gm));
  });

  it("prefers the roll's own animation over its style and the distance", () => {
    const custom = { ...ATTACK_STYLE_PRESETS.magic, primary: "#00ff00" };
    expect(animationOf(withAttack({ animation: custom, style: "melee" }), at(1))).toEqual(custom);
  });

  it("prefers the style over the distance", () => {
    expect(animationOf(withAttack({ style: "ranged" }), at(1))).toEqual(ATTACK_STYLE_PRESETS.ranged);
  });

  it("lasts as long as the animation says", () => {
    const effect = attackEffectFor(rolled(withAttack({ style: "magic" })), at(3), gm)!;
    expect(attackPlan(effect, false).durationMs).toBe(ATTACK_STYLE_PRESETS.magic.duration * 1000);
  });
});

describe("nuke effect (FR-TAC-06, ADR 0038)", () => {
  const nuked: DomainEvent = { type: "MapNuked", amount: 9, origin: { x: 50, y: 60 } };
  const noHp: Token = { ...token("c"), stats: { hp: null, maxHp: null, ac: null } };
  const state = room({ tokens: [token("a"), token("b", true), noHp] });

  it("names the tokens with HP the GM can see, hidden ones included", () => {
    expect(attackEffectFor(nuked, state, gm)).toEqual({
      kind: "nuke", animation: NUKE_PRESET, origin: { x: 50, y: 60 }, amount: 9, tokenIds: ["a", "b"],
    });
  });

  it("leaves a hidden token out for a player (FR-GM-23)", () => {
    expect(attackEffectFor(nuked, state, player)).toMatchObject({ kind: "nuke", tokenIds: ["a"] });
  });

  it("uses the event's animation when it has one", () => {
    const custom = { ...NUKE_PRESET, primary: "#0000ff" };
    expect(attackEffectFor({ ...nuked, animation: custom } as DomainEvent, state, gm)).toMatchObject({ animation: custom });
  });

  it("plays nothing for an undone nuke", () => {
    expect(attackEffectFor({ type: "MapNukeUndone", amount: 9, origin: { x: 0, y: 0 } } as DomainEvent, state, gm)).toBeNull();
  });

  it("lasts as long as its animation, and is a short still tint when reduced", () => {
    const effect = attackEffectFor(nuked, state, gm)!;
    expect(attackPlan(effect, false)).toEqual({ motion: true, durationMs: NUKE_PRESET.duration * 1000 });
    expect(attackPlan(effect, true).motion).toBe(false);
  });
});

describe("table-wide reduced animations (ADR 0038)", () => {
  it("is reduced when the GM turned it on, even if the device allows motion", () => {
    expect(effectiveReducedMotion({ reducedEffects: true }, false)).toBe(true);
    const strike = { kind: "strike", fromId: "a", toId: "b", animation: ATTACK_STYLE_PRESETS.melee } as const;
    expect(attackPlan(strike, effectiveReducedMotion({ reducedEffects: true }, false)).motion).toBe(false);
  });

  it("is reduced when the device asks for it, whatever the table says", () => {
    expect(effectiveReducedMotion({ reducedEffects: false }, true)).toBe(true);
  });

  it("moves normally when neither asks for reduced motion", () => {
    expect(effectiveReducedMotion({ reducedEffects: false }, false)).toBe(false);
  });
});

describe("the viewer's Attack animations choice (board-attack-effects)", () => {
  const aria = { ...token("aria"), ownerIds: ["p1"] };
  const bram = { ...token("bram"), ownerIds: ["p2"] };
  const goblin = token("goblin");
  /** An encounter on `activeId`'s turn; undefined is a turn the viewer can't see (past the end of their order). */
  const turn = (activeId: string | undefined) => ({
    tokens: { aria, bram, goblin },
    initiative: { order: ["aria", "bram", "goblin"], activeIndex: activeId === undefined ? 3 : ["aria", "bram", "goblin"].indexOf(activeId), round: 1 },
  });
  const noEncounter = { tokens: { aria, bram, goblin }, initiative: null };
  const strike = (fromId: string): AttackEffect => ({ kind: "strike", fromId, toId: "goblin", animation: ATTACK_STYLE_PRESETS.melee });
  const hit = (fromId?: string): AttackEffect => ({ kind: "hit", tokenId: "goblin", ...(fromId && { fromId }) });
  const miss = (fromId: string): AttackEffect => ({ kind: "miss", tokenId: "goblin", fromId });
  const damage: AttackEffect = { kind: "damage", tokenId: "goblin", amount: 5 };
  const damages: AttackEffect = { kind: "damages", hits: [{ tokenId: "goblin", amount: 3 }] };
  const defeat: AttackEffect = { kind: "defeat", tokenId: "goblin" };
  const nuke: AttackEffect = { kind: "nuke", animation: NUKE_PRESET, origin: { x: 0, y: 0 }, amount: 4, tokenIds: ["aria", "goblin"] };
  const every = [strike("bram"), hit("bram"), miss("bram"), damage, damages, defeat, nuke];

  it("plays everything on All", () => {
    for (const effect of every) expect(effectToPlay(effect, "all", turn("aria"))).toBe(effect);
  });

  it("plays only a defeat on None", () => {
    for (const effect of every) expect(effectToPlay(effect, "none", turn("aria"))).toBe(effect.kind === "defeat" ? effect : null);
  });

  it("plays everything on Current turn with no encounter running", () => {
    for (const effect of every) expect(effectToPlay(effect, "turn", noEncounter)).toBe(effect);
  });

  it("plays the active token's strike, hit and miss, and skips another token's", () => {
    expect(effectToPlay(strike("aria"), "turn", turn("aria"))).not.toBeNull();
    expect(effectToPlay(hit("aria"), "turn", turn("aria"))).not.toBeNull();
    expect(effectToPlay(miss("aria"), "turn", turn("aria"))).not.toBeNull();
    expect(effectToPlay(strike("bram"), "turn", turn("aria"))).toBeNull();
    expect(effectToPlay(hit("bram"), "turn", turn("aria"))).toBeNull();
    expect(effectToPlay(miss("bram"), "turn", turn("aria"))).toBeNull();
    // A ruling whose attacker the viewer can't see names no one, so it can't be the active token's.
    expect(effectToPlay(hit(), "turn", turn("aria"))).toBeNull();
  });

  it("always plays damage numbers and defeats on Current turn", () => {
    for (const effect of [damage, damages, defeat]) expect(effectToPlay(effect, "turn", turn("aria"))).toBe(effect);
  });

  it("plays a nuke on an NPC's or an unseen turn, and only its numbers on a player's", () => {
    expect(effectToPlay(nuke, "turn", turn("goblin"))).toBe(nuke);
    expect(effectToPlay(nuke, "turn", turn(undefined))).toBe(nuke);
    expect(effectToPlay(nuke, "turn", turn("aria"))).toEqual({ kind: "damages", hits: [{ tokenId: "aria", amount: 4 }, { tokenId: "goblin", amount: 4 }] });
    expect(effectToPlay({ ...nuke, amount: 0 }, "turn", turn("aria"))).toBeNull();
  });
});
