import { beforeEach, describe, expect, it } from "vitest";
import {
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  formatAttackRoll,
  type CommandInput,
  type CommittedEvent,
  type DiceRoll,
  type RoomState,
  isDiceRoll
} from "../src";
import { alice, attempt, baseRoom, bob, gm, resetRandom, run, withToken } from "./fixtures";

const attackRoll = (actorTokenId: string, targetTokenId: string, extra: Partial<Extract<CommandInput, { type: "dice.roll" }>> = {}): CommandInput => ({
  type: "dice.roll",
  expression: "1d20+5",
  attack: { actorTokenId, targetTokenId, label: "Longsword" },
  ...extra,
});

const committed = (event: CommittedEvent["event"], seq = 10): CommittedEvent => ({ seq, at: "2026-09-26T00:00:00.000Z", actorId: gm.id, event });

/** Aria (Alice's), Goblin 2 (visible) and Shadow (hidden). */
function table() {
  const aria = withToken(baseRoom(), { name: "Aria", ownerIds: [alice.id] });
  const goblin = withToken(aria.state, { name: "Goblin 2" });
  const shadow = withToken(goblin.state, { name: "Shadow", hidden: true });
  return { state: shadow.state, aria: aria.token, goblin: goblin.token, shadow: shadow.token };
}

function rolled(state: RoomState, actor = alice, input: CommandInput): { state: RoomState; roll: DiceRoll } {
  const result = run(state, actor, input);
  const event = result.events[0];
  if (event?.type !== "DiceRolled") throw new Error("expected DiceRolled");
  return { state: result.state, roll: event.roll };
}

beforeEach(resetRandom);

describe("attack rolls: who may attack (FR-TAC-09, ADR 0010)", () => {
  it("records attacker, target and label with roll-time names", () => {
    const { state, aria, goblin } = table();
    const { roll } = rolled(state, alice, attackRoll(aria.id, goblin.id));
    expect(roll).toMatchObject({ expression: "1d20+5", total: 6, visibility: "public" });
    expect(roll.attack).toEqual({
      actor: { tokenId: aria.id, name: "Aria", hidden: false },
      target: { tokenId: goblin.id, name: "Goblin 2", hidden: false },
      label: "Longsword",
      kind: "toHit",
    });
  });

  it("stores a blank label as none", () => {
    const { state, aria, goblin } = table();
    const { roll } = rolled(state, alice, attackRoll(aria.id, goblin.id, { attack: { actorTokenId: aria.id, targetTokenId: goblin.id, label: "   " } }));
    expect(roll.attack?.label).toBeNull();
  });

  it("refuses an attack with a token the player does not own (FR-GM-15)", () => {
    const { state, aria, goblin } = table();
    expect(attempt(state, bob, attackRoll(aria.id, goblin.id))).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(state, alice, attackRoll(goblin.id, aria.id))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("answers a hidden attacker or target as missing for a player (FR-GM-23)", () => {
    const { state, aria, shadow } = table();
    const hiddenTarget = attempt(state, alice, attackRoll(aria.id, shadow.id));
    const missingTarget = attempt(state, alice, attackRoll(aria.id, "no-such-token"));
    expect(hiddenTarget).toMatchObject({ ok: false, code: "not_found" });
    expect(hiddenTarget).toEqual(missingTarget);
    expect(attempt(state, alice, attackRoll(shadow.id, aria.id))).toEqual(attempt(state, alice, attackRoll("no-such-token", aria.id)));
  });

  it("refuses a token attacking itself", () => {
    const { state, aria } = table();
    expect(attempt(state, alice, attackRoll(aria.id, aria.id))).toMatchObject({ ok: false, code: "invalid" });
  });

  it("lets the GM attack with any token, hidden ones included", () => {
    const { state, aria, shadow } = table();
    const { roll } = rolled(state, gm, attackRoll(shadow.id, aria.id));
    expect(roll.attack?.actor).toEqual({ tokenId: shadow.id, name: "Shadow", hidden: true });
    expect(roll.attack?.target).not.toBeNull();
  });

  it("ignores turn order and range, and leaves plain rolls unchanged", () => {
    const { state, aria, goblin } = table();
    const inTurn = run(state, gm, { type: "initiative.start", entries: [{ tokenId: goblin.id, score: 20 }, { tokenId: aria.id, score: 5 }] }).state;
    expect(attempt(inTurn, alice, attackRoll(aria.id, goblin.id, { expression: "2d6+1" })).ok).toBe(true);
    const plain = rolled(state, bob, { type: "dice.roll", expression: "2d6+1" }).roll;
    expect(plain).not.toHaveProperty("attack");
  });
});

describe("attack rolls never reveal hidden tokens (FR-GM-23, ADR 0010)", () => {
  it("blanks a hidden attacker in a public roll and resyncs players instead of passing the event", () => {
    const { state, aria, shadow } = table();
    const before = state;
    const { state: after, roll } = rolled(state, gm, attackRoll(shadow.id, aria.id, { attack: { actorTokenId: shadow.id, targetTokenId: aria.id, label: "Claws" } }));

    expect(filterEventForViewer(committed({ type: "DiceRolled", roll }), before, alice)).toEqual({ kind: "resync" });
    const seen = filterStateForViewer(after, alice).rolls.filter(isDiceRoll).at(-1)!;
    expect(seen.attack).toEqual({ actor: null, target: roll.attack!.target, label: "Claws", kind: "toHit" });
    expect(JSON.stringify(filterStateForViewer(after, alice))).not.toContain(shadow.id);
    expect(JSON.stringify(filterStateForViewer(after, alice))).not.toContain("Shadow");
    expect(filterStateForViewer(after, gm).rolls.filter(isDiceRoll).at(-1)).toEqual(roll);
  });

  it("passes a public attack between visible tokens as a normal event", () => {
    const { state, aria, goblin } = table();
    const { roll } = rolled(state, alice, attackRoll(aria.id, goblin.id));
    const event = committed({ type: "DiceRolled", roll });
    expect(filterEventForViewer(event, state, bob)).toEqual({ kind: "event", committed: event });
  });

  it("still redacts a GM-only attack roll", () => {
    const { state, aria, shadow } = table();
    const { state: after, roll } = rolled(state, gm, attackRoll(shadow.id, aria.id, { visibility: "gm" }));
    expect(filterEventForViewer(committed({ type: "DiceRolled", roll }, 12), state, alice)).toEqual({ kind: "redacted", seq: 12 });
    expect(filterStateForViewer(after, alice).rolls).toHaveLength(0);
  });

  it("blanks a target hidden after the roll, and keeps it for the GM", () => {
    const { state, aria, goblin } = table();
    const attacked = rolled(state, alice, attackRoll(aria.id, goblin.id)).state;
    const hidden = run(attacked, gm, { type: "token.setHidden", tokenId: goblin.id, hidden: true }).state;
    expect(filterStateForViewer(hidden, alice).rolls.filter(isDiceRoll).at(-1)!.attack?.target).toBeNull();
    expect(JSON.stringify(filterStateForViewer(hidden, alice))).not.toContain(goblin.id);
    expect(filterStateForViewer(hidden, gm).rolls.filter(isDiceRoll).at(-1)!.attack?.target?.name).toBe("Goblin 2");
  });

  it("keeps a side concealed after the hidden token is renamed and revealed", () => {
    const { state, aria, shadow } = table();
    const attacked = rolled(state, gm, attackRoll(shadow.id, aria.id)).state;
    const renamed = run(attacked, gm, { type: "token.configure", tokenId: shadow.id, changes: { name: "Innkeeper", hidden: false } }).state;
    expect(renamed.tokens[shadow.id]?.hidden).toBe(false);
    expect(filterStateForViewer(renamed, alice).rolls.filter(isDiceRoll).at(-1)!.attack?.actor).toBeNull();
    expect(JSON.stringify(filterStateForViewer(renamed, alice).rolls)).not.toContain("Shadow");
  });

  it("keeps a target concealed once hidden, even after it is deleted or revealed", () => {
    const { state, aria, goblin } = table();
    const hidden = run(rolled(state, alice, attackRoll(aria.id, goblin.id)).state, gm, { type: "token.setHidden", tokenId: goblin.id, hidden: true }).state;
    const deleted = run(hidden, gm, { type: "token.delete", tokenId: goblin.id }).state;
    expect(filterStateForViewer(deleted, alice).rolls.filter(isDiceRoll).at(-1)!.attack?.target).toBeNull();
    const revealed = run(hidden, gm, { type: "token.setHidden", tokenId: goblin.id, hidden: false }).state;
    expect(filterStateForViewer(revealed, alice).rolls.filter(isDiceRoll).at(-1)!.attack?.target).toBeNull();
    expect(filterStateForViewer(revealed, gm).rolls.filter(isDiceRoll).at(-1)!.attack?.target?.name).toBe("Goblin 2");
  });

  it("keeps a deleted target's name only if it was visible when rolled", () => {
    const { state, aria, goblin, shadow } = table();
    const visibleThenDeleted = run(rolled(state, alice, attackRoll(aria.id, goblin.id)).state, gm, { type: "token.delete", tokenId: goblin.id }).state;
    expect(filterStateForViewer(visibleThenDeleted, alice).rolls.filter(isDiceRoll).at(-1)!.attack?.target?.name).toBe("Goblin 2");

    const hiddenThenDeleted = run(rolled(state, gm, attackRoll(shadow.id, aria.id)).state, gm, { type: "token.delete", tokenId: shadow.id }).state;
    expect(filterStateForViewer(hiddenThenDeleted, alice).rolls.filter(isDiceRoll).at(-1)!.attack?.actor).toBeNull();
  });
});

describe("attack roll text (FR-TAC-09, FR-REC-01)", () => {
  it("names attacker, target and label in the roll log", () => {
    const { state, aria, goblin } = table();
    const { roll } = rolled(state, alice, attackRoll(aria.id, goblin.id));
    expect(formatAttackRoll(roll)).toBe("Aria → Goblin 2 · Longsword · 1d20+5 = 6");
    expect(formatAttackRoll({ ...roll, attack: { ...roll.attack!, actor: null, label: null } })).toBe("Unknown → Goblin 2 · 1d20+5 = 6");
    expect(formatAttackRoll({ expression: "2d6", total: 7 })).toBe("2d6 = 7");
  });

  it("describes attack rolls in the activity log with roll-time names", () => {
    const { state, aria, goblin } = table();
    const { roll } = rolled(state, alice, attackRoll(aria.id, goblin.id));
    const deleted = run(state, gm, { type: "token.delete", tokenId: goblin.id }).state;
    expect(formatActivity({ type: "DiceRolled", roll }, "Tomas", deleted)).toBe("Tomas rolled an attack: Aria → Goblin 2 with Longsword, 1d20+5: 6");
    expect(formatActivity({ type: "DiceRolled", roll: { ...roll, visibility: "gm", attack: { ...roll.attack!, label: null } } }, "GM", state))
      .toBe("GM rolled an attack: Aria → Goblin 2, 1d20+5: 6 (GM only)");
  });
});
