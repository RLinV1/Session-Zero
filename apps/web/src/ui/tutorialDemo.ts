import type { AttackPreset, RoomState, Token } from "@vtt/shared";
import { attackExpression, pendingRulings, presetRollLabel } from "../panels/attackRoll";
import type { RoomConnection } from "../net/roomConnection";
import { t } from "../i18n/locale";

/**
 * The scripted demo fight of the guest demo (guest-gm-hosting). Every call sends the commands the
 * Initiative and Attack panels send, as the GM; nothing here changes state any other way.
 */

type Command = Parameters<RoomConnection["command"]>[0];
export type DemoResult = { ok: true } | { ok: false; message: string };

export interface DemoPair {
  hero: Token;
  foe: Token;
  /** The hero's attack that has both a to-hit roll and a damage roll. */
  attack: AttackPreset;
}

const strike = (token: Token): AttackPreset | undefined => token.attacks?.find((a) => a.toHit && a.damage);

/** Two tokens the fight can use: one with a full attack, and another with AC and HP left. First match wins, so a GM's own tokens are used. */
export function demoPair(state: RoomState): DemoPair | null {
  const tokens = Object.values(state.tokens);
  for (const hero of tokens) {
    const attack = strike(hero);
    const foe = attack && tokens.find((x) => x.id !== hero.id && x.stats.ac !== null && x.stats.hp !== null && x.stats.hp > 0);
    if (attack && foe) return { hero, foe, attack };
  }
  return null;
}

/** A damage roll of the hero on the foe that is waiting to be applied. */
export const damageWaiting = (state: RoomState): boolean => pendingRulings(state).some((item) => item.kind === "damage");

/** The tokens `makeDemoTokens` named, for the last step's clean-up. */
export const demoTokenIds = (state: RoomState): string[] =>
  Object.values(state.tokens).filter((x) => x.name === t("tutorial.demo.hero") || x.name === t("tutorial.demo.goblin")).map((x) => x.id);

const send = async (connection: RoomConnection, command: Command): Promise<DemoResult> => {
  const result = await connection.command(command);
  return result.ok ? { ok: true } : { ok: false, message: result.message };
};

/** The two demo tokens, side by side in the middle of the map; their events reach the snapshot before the acks do. */
async function makeDemoTokens(connection: RoomConnection, state: RoomState): Promise<DemoResult> {
  const grid = state.scene.grid;
  const mid = { x: (state.scene.map?.width ?? grid.cellSize * 8) / 2, y: (state.scene.map?.height ?? grid.cellSize * 8) / 2 };
  const hero = await send(connection, {
    type: "token.create",
    name: t("tutorial.demo.hero"),
    position: { x: mid.x - grid.cellSize, y: mid.y },
    stats: { hp: 12, maxHp: 12, ac: 14 },
    color: "#3b82f6",
    attacks: [{ name: t("tutorial.demo.sword"), toHit: { terms: [{ count: 1, sides: 20 }], modifier: 5 }, damage: { terms: [{ count: 1, sides: 8 }], modifier: 3 } }],
  } as Command);
  if (!hero.ok) return hero;
  return send(connection, {
    type: "token.create",
    name: t("tutorial.demo.goblin"),
    position: { x: mid.x + grid.cellSize, y: mid.y },
    stats: { hp: 12, maxHp: 12, ac: 8 },
    color: "#16a34a",
  } as Command);
}

/** The pair to fight with, creating the demo tokens first if the GM has no two usable ones. */
async function ensurePair(connection: RoomConnection): Promise<DemoPair | string> {
  const state = () => connection.snapshot.state;
  let pair = state() && demoPair(state()!);
  if (!pair && state()) {
    const made = await makeDemoTokens(connection, state()!);
    if (!made.ok) return made.message;
    pair = demoPair(state()!);
  }
  return pair || t("tutorial.demo.noTokens");
}

/** Encounter step: the two tokens, then the turn order with the hero first. */
export async function runDemoEncounter(connection: RoomConnection): Promise<DemoResult> {
  const pair = await ensurePair(connection);
  if (typeof pair === "string") return { ok: false, message: pair };
  if (connection.snapshot.state?.initiative) return { ok: true };
  return send(connection, { type: "initiative.start", entries: [{ tokenId: pair.hero.id, score: 15 }, { tokenId: pair.foe.id, score: 10 }] });
}

/** Attack and damage steps: the hero's named attack on the foe, as the Attack panel rolls it. */
export async function runDemoRoll(connection: RoomConnection, kind: "toHit" | "damage"): Promise<DemoResult> {
  const pair = await ensurePair(connection);
  if (typeof pair === "string") return { ok: false, message: pair };
  const dice = kind === "toHit" ? pair.attack.toHit! : pair.attack.damage!;
  return send(connection, {
    type: "dice.roll",
    expression: attackExpression(dice),
    visibility: "public",
    attack: { actorTokenId: pair.hero.id, targetTokenId: pair.foe.id, kind, label: presetRollLabel(pair.attack, kind) },
  });
}

/** The last step's offer: take the demo tokens (and their encounter) off the table again. */
export async function removeDemoTokens(connection: RoomConnection): Promise<DemoResult> {
  const state = connection.snapshot.state;
  if (!state) return { ok: true };
  if (state.initiative) {
    const ended = await send(connection, { type: "initiative.end" });
    if (!ended.ok) return ended;
  }
  for (const tokenId of demoTokenIds(state)) {
    const deleted = await send(connection, { type: "token.delete", tokenId });
    if (!deleted.ok) return deleted;
  }
  return { ok: true };
}
