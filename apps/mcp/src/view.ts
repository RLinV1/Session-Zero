import {
  attackLabel,
  cellAt,
  formatExpression,
  formatAttackOutcome,
  isGroupRoll,
  wallMidpoint,
  type LoggedRoll,
  type Participant,
  type Point,
  type RoomState,
  type Token,
} from "@vtt/shared";
import { ROOM_TEXT_NOTE } from "./brief";
import { squareAt, squareOfToken } from "./grid";

const RECENT_CHAT = 20;
const RECENT_ROLLS = 10;

const nameOf = (state: RoomState, id: string) => state.participants[id]?.displayName ?? "Someone who left";

/** A named attack as the AI can use it. */
function attackOf(attack: NonNullable<Token["attacks"]>[number]) {
  return {
    name: attack.name,
    toHit: attack.toHit ? formatExpression(attack.toHit) : null,
    damage: attack.damage ? formatExpression(attack.damage) : null,
  };
}

function tokenOf(state: RoomState, token: Token, you: Participant) {
  const yours = token.ownerIds.includes(you.id);
  return {
    id: token.id,
    name: token.name,
    ...squareOfToken(token.position, token.size, state.scene.grid),
    size: token.size,
    yours,
    // Only people still here: a removed seat's name can be the same as the seat that replaced it.
    owners: token.ownerIds.flatMap((id) => {
      const owner = state.participants[id];
      return owner && !owner.left && !owner.revoked ? [owner.displayName] : [];
    }),
    hp: token.stats.hp,
    maxHp: token.stats.maxHp,
    ac: token.stats.ac,
    conditions: token.conditions,
    ...(yours && token.attacks ? { attacks: token.attacks.map(attackOf) } : {}),
  };
}

function rollOf(state: RoomState, roll: LoggedRoll) {
  const by = nameOf(state, roll.byParticipantId);
  if (isGroupRoll(roll)) {
    return { by, expression: roll.expression, label: roll.label, results: roll.entries.map((e) => ({ name: e.name, total: e.total })) };
  }
  return {
    by,
    expression: roll.expression,
    dice: roll.dice,
    total: roll.total,
    ...(roll.attack ? {
      attack: {
        attacker: roll.attack.actor?.name ?? "Unknown",
        target: roll.attack.target?.name ?? "Unknown",
        label: attackLabel(roll.attack),
        kind: roll.attack.kind,
        outcome: formatAttackOutcome(roll) ?? "Waiting for the GM",
      },
    } : {}),
  };
}

function turnOrderOf(state: RoomState, you: Participant) {
  const initiative = state.initiative;
  if (!initiative) return null;
  const entry = (id: string) => {
    const token = state.tokens[id];
    return token ? { tokenId: id, name: token.name, yours: token.ownerIds.includes(you.id) } : null;
  };
  // The server sets activeIndex past the end when the active token is hidden, so this reads as nobody.
  const activeId = initiative.order[initiative.activeIndex];
  return {
    round: initiative.round,
    active: activeId === undefined ? null : entry(activeId),
    order: initiative.order.flatMap((id) => entry(id) ?? []),
  };
}

function mapOf(state: RoomState) {
  const { map, grid } = state.scene;
  if (!map) return { present: false as const };
  // Never the image's address: that picture shows what fog hides (design D7).
  return {
    present: true as const,
    columns: Math.ceil((map.width - grid.offsetX) / grid.cellSize),
    rows: Math.ceil((map.height - grid.offsetY) / grid.cellSize),
  };
}

/** Why the seat has no token on the map: none yet, or one carried here and waiting for the GM to place it (ADR 0068). */
function waitingHint(state: RoomState, you: Participant): string {
  const waiting = Object.values(state.staged ?? {}).filter((t) => t.ownerIds.includes(you.id)).map((t) => t.name);
  return waiting.length > 0
    ? `Your token${waiting.length === 1 ? "" : "s"} (${waiting.join(", ")}) ${waiting.length === 1 ? "is" : "are"} waiting for the GM to place ${waiting.length === 1 ? "it" : "them"} on this map. You can't move ${waiting.length === 1 ? "it" : "them"} until then.`
    : "This seat owns no tokens yet. Ask the GM to assign you one.";
}

/** `get_view`: everything here comes from the state the server already filtered for this seat. */
export function buildView(state: RoomState, you: Participant, pings: readonly { fromId: string; at: Point }[] = []) {
  const tokens = Object.values(state.tokens).map((token) => tokenOf(state, token, you));
  const people = Object.values(state.participants)
    .filter((p) => !p.left && !p.revoked)
    .map((p) => ({ id: p.id, name: p.displayName, role: p.role, isYou: p.id === you.id }));
  const doors = Object.values(state.walls).flatMap((wall) => {
    if (!wall.portal) return [];
    const { col, row } = cellAt(wallMidpoint(wall), state.scene.grid);
    return [{ id: wall.id, kind: wall.portal.kind, state: wall.portal.state, column: col, row }];
  });
  return {
    note: ROOM_TEXT_NOTE,
    room: state.name,
    you: { id: you.id, name: you.displayName },
    ...(tokens.some((t) => t.yours) ? {} : { hint: waitingHint(state, you) }),
    map: mapOf(state),
    grid: {
      unitsPerSquare: state.scene.grid.unitsPerCell,
      unit: state.scene.grid.unitLabel,
      lineOfSight: state.scene.lineOfSight === true,
    },
    tokens,
    doors,
    turnOrder: turnOrderOf(state, you),
    people,
    chat: state.chat.slice(-RECENT_CHAT).map((m) => ({
      id: m.id,
      from: m.senderName,
      fromId: m.senderId,
      text: m.text,
      at: m.at,
      mentionsYou: m.mentions?.some((mention) => mention.participantId === you.id) ?? false,
    })),
    rolls: state.rolls.slice(-RECENT_ROLLS).map((roll) => rollOf(state, roll)),
    pings: pings.map(({ fromId, at }) => ({ from: nameOf(state, fromId), fromId, ...squareAt(at, state.scene.grid) })),
  };
}
