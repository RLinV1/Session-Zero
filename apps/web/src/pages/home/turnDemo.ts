import { decide, emptyRoomState, reduce, type Command, type DecideContext, type Participant, type RoomState, type Token } from "@vtt/shared";

/**
 * A fight already under way, for the turn order tile: four tokens and the turn order started,
 * built and advanced by the table's own `decide` and `reduce` (gm-home: "Its demos SHALL run the
 * same rules the table runs").
 */
export const TURN_GM: Participant = { id: "gm", role: "gm", displayName: "GM" };
export const TURN_PLAYER: Participant = { id: "mara-player", role: "player", displayName: "Mara's player" };

const ENTRIES: { id: string; name: string; color: string; score: number; image?: string; owner?: boolean }[] = [
  { id: "goblin-boss", name: "Goblin boss", color: "#c0392b", score: 17, image: "/img/home/tokens/camp-boss.webp" },
  { id: "mara", name: "Mara", color: "#5b8def", score: 15, image: "/img/home/tokens/camp-mara.webp", owner: true },
  { id: "wolf", name: "Wolf", color: "#7f8c8d", score: 12, image: "/img/home/tokens/camp-wolf.webp" },
  { id: "pell", name: "Pell", color: "#3fb950", score: 9, image: "/img/home/tokens/camp-pell.webp" },
];

const token = (e: (typeof ENTRIES)[number], i: number): Token => ({
  id: e.id,
  name: e.name,
  position: { x: 35 + i * 70, y: 35 },
  size: 1,
  rotation: 0,
  color: e.color,
  imageUrl: e.image ?? null,
  ownerIds: e.owner ? [TURN_PLAYER.id] : [],
  hidden: false,
  stats: { hp: null, maxHp: null, ac: null },
  conditions: [],
});

let ids = 0;
const ctx: DecideContext = { newId: () => `turn-${++ids}` };

/** Runs one GM command through `decide` and folds its events with `reduce`; a refusal changes nothing. */
function run(state: RoomState, command: Command): RoomState {
  const decision = decide(state, TURN_GM, command, ctx);
  return decision.ok ? decision.events.reduce((s, e) => reduce(s, e), state) : state;
}

export function fightRoom(): RoomState {
  let state = emptyRoomState("home-turns");
  state = reduce(state, { type: "ParticipantJoined", participant: TURN_GM });
  state = reduce(state, { type: "ParticipantJoined", participant: TURN_PLAYER });
  ENTRIES.forEach((e, i) => (state = reduce(state, { type: "TokenCreated", token: token(e, i) })));
  return run(state, { type: "initiative.start", entries: ENTRIES.map((e) => ({ tokenId: e.id, score: e.score })) });
}

/** The GM's Next turn. */
export const nextTurn = (state: RoomState): RoomState => run(state, { type: "initiative.advance" });

/** Each token's score as the GM gave it, for the order list. */
export const scoreOf = (tokenId: string) => ENTRIES.find((e) => e.id === tokenId)?.score ?? null;
