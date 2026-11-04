import {
  Command,
  decide,
  emptyRoomState,
  reduceAll,
  type CommandInput,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";

export const gm: Participant = { id: "p-gm", role: "gm", displayName: "GM" };
export const alice: Participant = { id: "p-alice", role: "player", displayName: "Alice" };
export const bob: Participant = { id: "p-bob", role: "player", displayName: "Bob" };

export function baseRoom(): RoomState {
  const events: DomainEvent[] = [
    { type: "RoomCreated", name: "Test Room" },
    { type: "ParticipantJoined", participant: gm },
    { type: "ParticipantJoined", participant: alice },
    { type: "ParticipantJoined", participant: bob },
  ];
  // Auto-remove at 0 HP is on in a real room (ADR 0049); the fixture opts out so damage tests keep their tokens.
  return { ...reduceAll(emptyRoomState("room-1"), events), autoRemoveDefeated: false };
}

let n = 0;
/**
 * Deterministic context. `random` cycles a fixed sequence instead of using Math.random,
 * so dice assertions are exact rather than statistical.
 */
let r = 0;
const SEQUENCE = [0.0, 0.5, 0.999, 0.25, 0.75];
export const ctx = {
  newId: () => `id-${++n}`,
  random: () => SEQUENCE[r++ % SEQUENCE.length]!,
};
export const resetRandom = () => {
  r = 0;
};

/** Parse like the server does (applies defaults), then decide + apply. */
export function run(state: RoomState, actor: Participant, input: CommandInput) {
  const decision = decide(state, actor, Command.parse(input), ctx);
  if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
  return { state: reduceAll(state, decision.events), events: decision.events };
}

/** Like `run`, but returns the rejection instead of throwing. */
export function attempt(state: RoomState, actor: Participant, input: CommandInput) {
  return decide(state, actor, Command.parse(input), ctx);
}

/** Creates a token and returns the new state plus the token that was created. */
export function withToken(
  state: RoomState,
  overrides: Partial<{ name: string; ownerIds: string[]; hidden: boolean }> = {},
) {
  const { state: next, events } = run(state, gm, {
    type: "token.create",
    name: overrides.name ?? "Fighter",
    position: { x: 35, y: 35 },
    ownerIds: overrides.ownerIds ?? [],
    hidden: overrides.hidden ?? false,
  });
  const created = events[0];
  if (created?.type !== "TokenCreated") throw new Error("expected TokenCreated");
  return { state: next, token: created.token };
}
