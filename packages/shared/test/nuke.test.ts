import { beforeEach, describe, expect, it } from "vitest";
import {
  ANIMATION_SHAPES,
  AnimationDef,
  AttackContext,
  Command,
  decide,
  describeUndo,
  filterEventForViewer,
  reduce,
  undoableAction,
  type AnimationDef as AnimationDefType,
  type CommandInput,
  type Participant,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, ctx, gm, resetRandom, run, withToken } from "./fixtures";

const slash: AnimationDefType = { shape: "slash", duration: 0.8, primary: "#ff8800", secondary: "#ffd27a", size: 1, particles: 40, glow: 0.6, shake: 0.3, flash: 0.2 };
const blast: AnimationDefType = { ...slash, shape: "nuke", duration: 2, size: 3, particles: 120 };

let batch = 0;
/** Like the server: decide, then reduce every event of the batch under one command id. */
function act(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  const meta = { commandId: `cmd-${++batch}`, actorId: actor.id };
  let next = state;
  for (const e of decision.events) next = reduce(next, e, meta);
  return { state: next, events: decision.events, commandId: meta.commandId };
}

/** Aria (Alice's, 30 HP), Goblin (5 HP), hidden Ogre (40 HP) and a signpost with no HP. */
function table() {
  let { state } = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const aria = Object.values(state.tokens)[0]!;
  const goblin = withToken(state, { name: "Goblin" });
  const ogre = withToken(goblin.state, { name: "Ogre", hidden: true });
  const sign = withToken(ogre.state, { name: "Signpost" });
  state = sign.state;
  const hp = (id: string, value: number) => {
    state = run(state, gm, { type: "token.setStats", tokenId: id, stats: { hp: value, maxHp: value, ac: null } }).state;
  };
  hp(aria.id, 30);
  hp(goblin.token.id, 5);
  hp(ogre.token.id, 40);
  return { state, aria, goblin: goblin.token, ogre: ogre.token, sign: sign.token };
}

beforeEach(resetRandom);

describe("GM nuke (FR-TAC-06, FR-TAC-07)", () => {
  it("damages every token with HP, hidden ones too", () => {
    const { state, aria, goblin, ogre, sign } = table();
    const { state: after, events } = run(state, gm, { type: "nuke.detonate", amount: 12, origin: { x: 50, y: 50 } });
    expect(after.tokens[aria.id]!.stats.hp).toBe(18);
    // HP may go negative, as with applied damage; it stops at the stats floor.
    expect(after.tokens[goblin.id]!.stats.hp).toBe(-7);
    expect(after.tokens[ogre.id]!.stats.hp).toBe(28);
    expect(after.tokens[sign.id]!.stats.hp).toBeNull();
    expect(events[0]).toMatchObject({ type: "MapNuked", amount: 12 });
    expect(events.filter((e) => e.type === "TokenStatsSet")).toHaveLength(3);
  });

  it("carries the stats each change replaced", () => {
    const { state, aria } = table();
    const { events } = run(state, gm, { type: "nuke.detonate", amount: 12, origin: { x: 50, y: 50 } });
    const change = events.find((e) => e.type === "TokenStatsSet" && e.tokenId === aria.id);
    expect(change).toMatchObject({ previous: { hp: 30 }, stats: { hp: 18 } });
  });

  it("appends only the blast when no token has HP", () => {
    const { events } = run(baseRoom(), gm, { type: "nuke.detonate", amount: 5, origin: { x: 1, y: 1 } });
    expect(events.map((e) => e.type)).toEqual(["MapNuked"]);
  });

  it("refuses a player and forged amounts", () => {
    const { state } = table();
    expect(attempt(state, alice, { type: "nuke.detonate", amount: 12, origin: { x: 1, y: 1 } })).toMatchObject({ ok: false, code: "forbidden" });
    for (const amount of [0, -3, 1.5, 1000]) {
      expect(Command.safeParse({ type: "nuke.detonate", amount, origin: { x: 1, y: 1 } }).success).toBe(false);
    }
  });

  it("takes a nuke animation and refuses any other shape", () => {
    const { state } = table();
    const ok = run(state, gm, { type: "nuke.detonate", amount: 3, origin: { x: 1, y: 1 }, animation: blast });
    expect(ok.events[0]).toMatchObject({ type: "MapNuked", animation: { shape: "nuke" } });
    expect(Command.safeParse({ type: "nuke.detonate", amount: 3, origin: { x: 1, y: 1 }, animation: slash }).success).toBe(false);
  });

  it("refuses an epicenter off the map", () => {
    let { state } = table();
    state = run(state, gm, { type: "scene.setMap", map: { url: "/m.png", width: 100, height: 100 } }).state;
    expect(attempt(state, gm, { type: "nuke.detonate", amount: 3, origin: { x: 500, y: 5 } })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("reaches players, and the hidden token's HP change does not (FR-GM-23)", () => {
    const { state, ogre } = table();
    const { events } = act(state, gm, { type: "nuke.detonate", amount: 12, origin: { x: 50, y: 50 } });
    const at = (event: (typeof events)[number], seq: number) => ({ seq, at: "2026-10-16T00:00:00.000Z", actorId: gm.id, event });
    const seen = events.map((e, i) => filterEventForViewer(at(e, 20 + i), state, alice).kind);
    const ogreIndex = events.findIndex((e) => e.type === "TokenStatsSet" && e.tokenId === ogre.id);
    expect(seen[ogreIndex]).toBe("redacted");
    expect(seen[0]).toBe("event");
  });

  it("undoes as one action and refuses once HP changed since", () => {
    const { state, aria, goblin } = table();
    const nuked = act(state, gm, { type: "nuke.detonate", amount: 12, origin: { x: 50, y: 50 } });
    const entry = undoableAction(nuked.state.undo, nuked.commandId)!;
    expect(describeUndo(entry, nuked.state.tokens).noun).toBe("the nuke for 12 damage");

    const undone = act(nuked.state, gm, { type: "history.undo", commandId: nuked.commandId });
    expect(undone.events.map((e) => e.type)).toEqual(["TokenStatsSet", "TokenStatsSet", "TokenStatsSet", "MapNukeUndone", "ActionUndone"]);
    expect(undone.state.tokens[aria.id]!.stats.hp).toBe(30);
    expect(undone.state.tokens[goblin.id]!.stats.hp).toBe(5);

    const healed = act(nuked.state, gm, { type: "token.setStats", tokenId: aria.id, stats: { hp: 30, maxHp: 30, ac: null } });
    expect(decide(healed.state, gm, Command.parse({ type: "history.undo", commandId: nuked.commandId }), ctx)).toMatchObject({ ok: false });
  });
});

describe("GM reduced animations setting (ADR 0038)", () => {
  it("lets only the GM turn it on and off, and reaches players", () => {
    const state = baseRoom();
    expect(state.reducedEffects).toBe(false);
    expect(attempt(state, alice, { type: "room.setReducedEffects", enabled: true })).toMatchObject({ ok: false, code: "forbidden" });
    const on = act(state, gm, { type: "room.setReducedEffects", enabled: true });
    expect(on.events).toEqual([{ type: "ReducedEffectsSet", enabled: true, previous: false }]);
    expect(on.state.reducedEffects).toBe(true);
    const at = { seq: 9, at: "2026-10-16T00:00:00.000Z", actorId: gm.id, event: on.events[0]! };
    expect(filterEventForViewer(at, state, alice).kind).toBe("event");
    expect(attempt(on.state, gm, { type: "room.setReducedEffects", enabled: true })).toMatchObject({ ok: false, code: "invalid" });
    expect(act(on.state, gm, { type: "room.setReducedEffects", enabled: false }).state.reducedEffects).toBe(false);
  });
});

describe("animation definitions (ADR 0038)", () => {
  it("accepts a bounded definition and rejects anything outside the bounds", () => {
    expect(AnimationDef.safeParse(slash).success).toBe(true);
    for (const bad of [
      { ...slash, particles: 500 },
      { ...slash, duration: 60 },
      { ...slash, duration: 0 },
      { ...slash, primary: "red" },
      { ...slash, shape: "laser" },
      { ...slash, glow: 2 },
      { ...slash, size: 0 },
    ]) {
      expect(AnimationDef.safeParse(bad).success).toBe(false);
    }
  });

  it("still reads a stored definition that has none of the later fields (ADR 0038)", () => {
    const parsed = AnimationDef.parse(slash);
    expect(parsed.count).toBeUndefined();
    expect(parsed.accent).toBeUndefined();
    expect(parsed.particleShape).toBeUndefined();
  });

  it("accepts the later fields in range and rejects them out of range (ADR 0038)", () => {
    const full = { ...slash, accent: "#00ff88", particleShape: "shard", count: 12, spread: 1, arc: 0, trail: 0.5, spin: 1, gravity: -1, rings: 5 };
    expect(AnimationDef.safeParse(full).success).toBe(true);
    for (const bad of [
      { ...full, accent: "green" },
      { ...full, particleShape: "blob" },
      { ...full, count: 0 },
      { ...full, count: 13 },
      { ...full, count: 2.5 },
      { ...full, spread: 1.1 },
      { ...full, arc: -0.1 },
      { ...full, trail: 2 },
      { ...full, spin: -1 },
      { ...full, gravity: 1.5 },
      { ...full, gravity: -1.5 },
      { ...full, rings: 6 },
      { ...full, rings: -1 },
    ]) {
      expect(AnimationDef.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("knows every shape, with the nuke last (ADR 0038)", () => {
    expect(ANIMATION_SHAPES).toHaveLength(22);
    expect(ANIMATION_SHAPES.at(-1)).toBe("nuke");
    for (const shape of ANIMATION_SHAPES) expect(AnimationDef.safeParse({ ...slash, shape }).success, shape).toBe(true);
  });

  it("reads old attack contexts without a style or animation", () => {
    const side = { tokenId: "t1", name: "Aria", hidden: false };
    const parsed = AttackContext.parse({ actor: side, target: side, label: null });
    expect(parsed.style).toBeUndefined();
    expect(parsed.animation).toBeUndefined();
  });
});

describe("attack style and named attack animation (FR-TAC-09, ADR 0038)", () => {
  function armed() {
    const { state, aria, goblin } = table();
    const stored = run(state, gm, {
      type: "token.configure",
      tokenId: aria.id,
      changes: { attacks: [{ name: "Flame Tongue", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 5 }, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 }, animation: slash }] },
    });
    return { state: stored.state, aria, goblin };
  }
  const roll = (state: RoomState, actorTokenId: string, targetTokenId: string, label: string, kind: "toHit" | "damage", extra: object = {}) => {
    const rolled = run(state, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId, targetTokenId, label, kind, ...extra } });
    const event = rolled.events[0];
    return event?.type === "DiceRolled" ? event.roll.attack : undefined;
  };

  it("copies the matching attack's animation onto the roll", () => {
    const { state, aria, goblin } = armed();
    expect(roll(state, aria.id, goblin.id, "Flame Tongue", "toHit")?.animation).toEqual(slash);
    expect(roll(state, aria.id, goblin.id, "Flame Tongue damage", "damage")?.animation).toEqual(slash);
  });

  it("gives no animation to an unmatched label", () => {
    const { state, aria, goblin } = armed();
    expect(roll(state, aria.id, goblin.id, "Shove", "toHit")?.animation).toBeUndefined();
  });

  it("ignores an animation the client sends", () => {
    const { state, aria, goblin } = armed();
    const stripped = Command.parse({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "Shove", animation: blast } });
    expect(stripped.type === "dice.roll" && stripped.attack && "animation" in stripped.attack).toBe(false);
    expect(roll(state, aria.id, goblin.id, "Shove", "toHit", { animation: blast })?.animation).toBeUndefined();
  });

  it("stores a style and rejects an unknown one", () => {
    const { state, aria, goblin } = armed();
    expect(roll(state, aria.id, goblin.id, "Shove", "toHit", { style: "magic" })?.style).toBe("magic");
    expect(Command.safeParse({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: "a", targetTokenId: "b", style: "nuclear" } }).success).toBe(false);
  });

  it("refuses a nuke animation on a named attack", () => {
    const { aria } = table();
    expect(Command.safeParse({
      type: "token.configure",
      tokenId: aria.id,
      changes: { attacks: [{ name: "Big", toHit: null, damage: { terms: [{ count: 1, sides: 6 }], modifier: 0 }, animation: blast }] },
    }).success).toBe(false);
  });
});
