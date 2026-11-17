import { afterEach, describe, expect, it } from "vitest";
import { formatExpression, type CommittedEvent, type DomainEvent, type ServerMessage, type Token } from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient } from "./helpers";

/**
 * Rooms whose stored history gave tokens named attacks before mixed dice (ADR 0061) hold the old
 * `{ count, sides, modifier }` dice in their events. They must load in today's shape, without the
 * stored events changing (legacy-attack-dice-crash).
 */

type Server = Awaited<ReturnType<typeof startServer>>;
const servers: Server[] = [];
const clients: TestClient[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function start(store?: MemoryRoomStore) {
  const server = await startServer(store);
  servers.push(server);
  return server;
}

async function connect(server: Server, creds: Parameters<Server["connect"]>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

const oldBite = { name: "Bite", toHit: { count: 1, sides: 20, modifier: 4 }, damage: { count: 1, sides: 6, modifier: 2 } };
const newBite = { name: "Bite", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 }, damage: { terms: [{ count: 1, sides: 6 }], modifier: 2 } };
const claws = { name: "Claws", toHit: null, damage: { terms: [{ count: 2, sides: 4 }], modifier: 0 } };

/** The log the memory store keeps, as stored, for checking nothing was rewritten. */
const storedLog = (store: MemoryRoomStore, roomId: string) =>
  structuredClone((store as unknown as { events: Map<string, CommittedEvent[]> }).events.get(roomId) ?? []);

/**
 * A room whose history gains `events` exactly as an older server stored them, then reopened on a
 * fresh server over the same store, so the room is loaded from that history.
 */
async function roomWithHistory(seed: (wolf: Token) => { commandId?: string; event: DomainEvent }[]) {
  // Held here, not read back as `first.store`: the server only exposes it as a RoomStore, and the
  // check that nothing was rewritten reads the memory store's own log.
  const store = new MemoryRoomStore();
  const first = await start(store);
  const creds = await first.createRoom("GM");
  const gm = await connect(first, creds);
  expect(await gm.command({ type: "token.create", name: "Template wolf", position: { x: 35, y: 35 } })).toMatchObject({ type: "ack" });
  const wolf = Object.values(gm.state.tokens).find((t) => t.name === "Template wolf")!;
  const lastSeq = (await store.loadEvents(creds.roomId)).length;
  await store.append(creds.roomId, lastSeq, seed(wolf).map((e) => ({ actorId: gm.participantId, ...e })));
  const before = storedLog(store, creds.roomId);
  const second = await start(store);
  const reopened = await connect(second, creds);
  return { store, creds, gm: reopened, before };
}

describe("named attacks stored before mixed dice (FR-TAC-09, legacy attack dice)", () => {
  it("loads a room whose history holds old attack dice, in today's shape, and rolls them", async () => {
    const { store, creds, gm, before } = await roomWithHistory((wolf) => [
      { event: { type: "TokenCreated", token: { ...wolf, id: crypto.randomUUID(), name: "Wolf", attacks: [oldBite] } } as unknown as DomainEvent },
    ]);
    const wolf = Object.values(gm.state.tokens).find((t) => t.name === "Wolf")!;
    expect(wolf.attacks).toEqual([newBite]);
    expect(formatExpression(wolf.attacks![0]!.toHit!)).toBe("1d20+4");
    const rolled = await gm.command({ type: "dice.roll", expression: formatExpression(wolf.attacks![0]!.damage!) });
    expect(rolled).toMatchObject({ type: "ack" });
    // History is read in today's shape but never rewritten (invariant 5).
    expect(storedLog(store, creds.roomId).slice(0, before.length)).toEqual(before);
  });

  it("undoing an old attack change restores the earlier attacks in today's shape", async () => {
    const commandId = crypto.randomUUID();
    let wolfId = "";
    const { gm } = await roomWithHistory((wolf) => {
      wolfId = crypto.randomUUID();
      return [
        { event: { type: "TokenCreated", token: { ...wolf, id: wolfId, name: "Wolf", attacks: [oldBite] } } as unknown as DomainEvent },
        { commandId, event: { type: "TokenAttacksSet", tokenId: wolfId, attacks: [claws], previous: [oldBite] } as unknown as DomainEvent },
      ];
    });
    expect(gm.state.tokens[wolfId]!.attacks).toEqual([claws]);
    expect(gm.state.undo.some((u) => u.commandId === commandId)).toBe(true);
    const undone = await gm.command({ type: "history.undo", commandId });
    expect(undone).toMatchObject({ type: "ack" });
    const set = await gm.waitFor((m: ServerMessage) => m.type === "event" && m.committed.event.type === "TokenAttacksSet" && m.committed.event.attacks[0]?.name === "Bite");
    expect(set).toMatchObject({ committed: { event: { attacks: [newBite], previous: [claws] } } });
    expect(gm.state.tokens[wolfId]!.attacks).toEqual([newBite]);
  });
});
