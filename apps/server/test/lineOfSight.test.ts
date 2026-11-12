import { afterEach, describe, expect, it } from "vitest";
import type { ServerMessage, Token, Wall } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
  server = null;
});

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const isEphemeral = (m: ServerMessage): m is Extract<ServerMessage, { type: "ephemeral" }> => m.type === "ephemeral";
const sightOf = (c: TestClient) => (c.state as { sight?: unknown }).sight;

/** Map 700x700, a wall down x=350 with a closed door in the middle; Alice's fighter west, the goblin east. */
async function setup() {
  server = await startServer();
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  clients.push(gm, alice);
  await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 700, height: 700 } });
  await gm.command({ type: "token.create", name: "Fighter", position: { x: 100, y: 350 }, ownerIds: [aliceCreds.participantId] });
  await gm.command({ type: "token.create", name: "Goblin", position: { x: 600, y: 350 } });
  await gm.command({
    type: "wall.add",
    walls: [
      { a: { x: 350, y: 0 }, b: { x: 350, y: 300 } },
      { a: { x: 350, y: 300 }, b: { x: 350, y: 400 } },
      { a: { x: 350, y: 400 }, b: { x: 350, y: 700 } },
    ],
  });
  const wallsNow = Object.values(gm.state.walls) as Wall[];
  const door = wallsNow.find((w) => w.a.y === 300)!;
  const marked = await gm.command({ type: "portal.set", wallId: door.id, portal: { kind: "door", state: "closed" } });
  await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(marked))));
  const goblin = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Goblin")!;
  return { gm, alice, aliceCreds, gmCreds, door, goblin };
}

const mentionsGoblin = (raw: string, goblin: Token) => raw.includes(goblin.id) || raw.includes("Goblin");

describe("line of sight over the wire (FR-GM-19)", () => {
  it("hides what is out of sight, then shows it when a door opens or line of sight goes off", async () => {
    const { gm, alice, aliceCreds, door, goblin } = await setup();
    // Off: the player sees the goblin, no `sight`.
    expect(Object.keys(alice.state.tokens)).toContain(goblin.id);
    expect(sightOf(alice)).toBeUndefined();

    // On: the next snapshot drops the goblin, keeps only the wall pieces in sight, and carries `sight`.
    const on = await gm.command({ type: "scene.setLineOfSight", enabled: true });
    await alice.waitForSeq(seqOf(on));
    expect(mentionsGoblin(JSON.stringify(alice.state), goblin)).toBe(false);
    expect(Array.isArray(sightOf(alice))).toBe(true);
    // Only the faces of the x = 350 wall the fighter looks at arrive, as opaque pieces (ADR 0056).
    expect((Object.values(alice.state.walls) as Wall[]).every((w) => w.portal || (w.id.startsWith("seen:") && w.a.x === 350 && w.b.x === 350))).toBe(true);

    // A fresh connection gets the same filtered welcome.
    const fresh = await server!.connect({ roomId: alice.state.roomId, guestToken: aliceCreds.guestToken });
    clients.push(fresh);
    expect(mentionsGoblin(JSON.stringify(fresh.state), goblin)).toBe(false);
    expect(Array.isArray(sightOf(fresh))).toBe(true);
    expect(fresh.rawLog.join("\n")).not.toContain(goblin.id);

    // The goblin moving out of sight sends the player nothing that names it.
    const logBefore = alice.rawLog.length;
    const moved = await gm.command({ type: "token.move", tokenId: goblin.id, to: { x: 620, y: 360 } });
    await alice.waitForSeq(seqOf(moved));
    expect(alice.rawLog.slice(logBefore).join("\n")).not.toContain(goblin.id);

    // Opening the door shows it.
    const opened = await gm.command({ type: "portal.setState", wallId: door.id, state: "open" });
    await alice.waitForSeq(seqOf(opened));
    expect(Object.keys(alice.state.tokens)).toContain(goblin.id);

    // Closing it hides it again; turning line of sight off shows it and drops `sight`.
    const closed = await gm.command({ type: "portal.setState", wallId: door.id, state: "closed" });
    await alice.waitForSeq(seqOf(closed));
    expect(Object.keys(alice.state.tokens)).not.toContain(goblin.id);
    const off = await gm.command({ type: "scene.setLineOfSight", enabled: false });
    await alice.waitForSeq(seqOf(off));
    expect(Object.keys(alice.state.tokens)).toContain(goblin.id);
    expect(sightOf(alice)).toBeUndefined();
  });

  it("withholds a goblin beyond the sight range in the open, and delivers it at Unlimited (FR-GM-19)", async () => {
    server = await startServer();
    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds);
    const alice = await server.connect(aliceCreds);
    clients.push(gm, alice);
    await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1400, height: 700 } });
    // 5 ft grid: 70 px per square, so the goblin is 40 ft (560 px) from the fighter.
    expect(gm.state.scene.grid).toMatchObject({ cellSize: 70, unitsPerCell: 5 });
    await gm.command({ type: "token.create", name: "Fighter", position: { x: 105, y: 350 }, ownerIds: [aliceCreds.participantId] });
    await gm.command({ type: "scene.setLineOfSight", enabled: true });
    await gm.command({ type: "scene.setSightRange", range: 30 });
    const made = await gm.command({ type: "token.create", name: "Goblin", position: { x: 665, y: 350 } });
    await alice.waitForSeq(seqOf(made));
    const goblin = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Goblin")!;
    expect(mentionsGoblin(JSON.stringify(alice.state), goblin)).toBe(false);
    expect(alice.rawLog.join("\n")).not.toContain(goblin.id);

    const unlimited = await gm.command({ type: "scene.setSightRange", range: null });
    await alice.waitForSeq(seqOf(unlimited));
    expect(Object.keys(alice.state.tokens)).toContain(goblin.id);
  });

  it("does not leak the position of a secret wall through the sight polygon (FR-GM-23)", async () => {
    const { gm, alice } = await setup();
    const secret = { a: { x: 613.25, y: 277.75 }, b: { x: 660.25, y: 322.75 } };
    // Line of sight first: with it off, a wall on open ground is in plain view (ADR 0056).
    await gm.command({ type: "scene.setLineOfSight", enabled: true });
    const on = await gm.command({ type: "wall.add", walls: [secret] });
    await alice.waitForSeq(seqOf(on));
    const raw = alice.rawLog.join("\n");
    for (const n of ["613.25", "277.75", "660.25", "322.75"]) expect(raw).not.toContain(n);
    const origin = { x: 100, y: 350 };
    const sight = sightOf(alice) as { x: number; y: number }[][];
    expect(sight.length).toBeGreaterThan(0);
    for (const end of [secret.a, secret.b]) {
      const target = Math.atan2(end.y - origin.y, end.x - origin.x);
      for (const v of sight.flat()) {
        const diff = Math.atan2(v.y - origin.y, v.x - origin.x) - target;
        expect(Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)))).toBeGreaterThan(1e-6);
      }
    }
  });

  it("relays drag previews only for tokens the player can see (cached concealment)", async () => {
    const { gm, alice, door, goblin } = await setup();
    const fighter = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Fighter")!;
    const on = await gm.command({ type: "scene.setLineOfSight", enabled: true });
    await alice.waitForSeq(seqOf(on));
    await alice.waitFor((m) => m.type === "welcome"); // the snapshot that applies it
    const logStart = alice.rawLog.length;
    const marker = () => gm.send({ type: "ephemeral", payload: { type: "ping", at: { x: 5, y: 5 } } });

    // Goblin behind the wall: dropped. The marker proves the stream was flowing.
    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: goblin.id, at: { x: 610, y: 350 } } });
    marker();
    expect((await alice.waitFor(isEphemeral)).payload.type).toBe("ping");
    expect(alice.rawLog.slice(logStart).join("\n")).not.toContain(goblin.id);

    // A visible token reaches the player.
    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: fighter.id, at: { x: 120, y: 350 } } });
    expect((await alice.waitFor(isEphemeral)).payload).toMatchObject({ type: "tokenDragPreview", tokenId: fighter.id });

    // Open the door so the goblin is visible, then drag it to a spot behind the wall's shadow: dropped.
    const opened = await gm.command({ type: "portal.setState", wallId: door.id, state: "open" });
    await alice.waitForSeq(seqOf(opened));
    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: goblin.id, at: { x: 600, y: 350 } } });
    expect((await alice.waitFor(isEphemeral)).payload).toMatchObject({ tokenId: goblin.id });
    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: goblin.id, at: { x: 500, y: 650 } } });
    marker();
    expect((await alice.waitFor(isEphemeral)).payload.type).toBe("ping");
  });

  it("does not send plain wall coordinates of a fogged room (fog blocks sight)", async () => {
    const { gm, alice } = await setup();
    // A small room east of the door wall, walls at distinctive decimals, then fog over it.
    const room = [
      { a: { x: 401.37, y: 101.73 }, b: { x: 501.37, y: 101.73 } },
      { a: { x: 501.37, y: 101.73 }, b: { x: 501.37, y: 201.73 } },
    ];
    // Fog first: walls drawn on open ground are in plain view (ADR 0056).
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 380, y: 80 }, to: { x: 520, y: 220 } } });
    await gm.command({ type: "wall.add", walls: room });
    const fogged = await gm.command({ type: "scene.setLineOfSight", enabled: true });
    await alice.waitForSeq(seqOf(fogged));
    const raw = alice.rawLog.join("\n");
    for (const n of ["401.37", "101.73", "501.37", "201.73"]) expect(raw).not.toContain(n);
  });

  it("converges: a fresh player and a second GM equal the long-lived clients after mixed edits", async () => {
    const { gm, alice, aliceCreds, gmCreds, door, goblin } = await setup();
    const fighter = (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Fighter")!;
    const last = async (p: Promise<unknown>) => {
      const seq = seqOf(await p);
      await Promise.all([gm, alice].map((c) => c.waitForSeq(seq)));
      return seq;
    };
    await last(gm.command({ type: "scene.setLineOfSight", enabled: true }));
    await last(gm.command({ type: "token.move", tokenId: goblin.id, to: { x: 620, y: 360 } }));
    await last(alice.command({ type: "token.move", tokenId: fighter.id, to: { x: 120, y: 340 } }));
    await last(gm.command({ type: "portal.setState", wallId: door.id, state: "open" }));
    await last(gm.command({ type: "token.move", tokenId: goblin.id, to: { x: 560, y: 380 } }));
    await last(gm.command({ type: "portal.setState", wallId: door.id, state: "closed" }));
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 200, y: 200 }, to: { x: 300, y: 300 } } });
    const fogId = Object.keys(gm.state.fog)[0]!;
    await last(gm.command({ type: "token.move", tokenId: goblin.id, to: { x: 640, y: 340 } }));
    await last(gm.command({ type: "fog.remove", regionId: fogId }));
    await last(gm.command({ type: "scene.setLineOfSight", enabled: false }));
    const final = await last(gm.command({ type: "scene.setLineOfSight", enabled: true }));

    const fresh = await server!.connect({ roomId: alice.state.roomId, guestToken: aliceCreds.guestToken });
    clients.push(fresh);
    await fresh.waitForSeq(final);
    expect(alice.state).toEqual(fresh.state);
    const gm2 = await server!.connect(gmCreds);
    clients.push(gm2);
    await gm2.waitForSeq(final);
    expect(gm.state).toEqual(gm2.state);
  });

  it("leaks no hidden wall coordinates or bearings to a player whose token stands 0.5 px from a tilted wall (FR-GM-23)", async () => {
    server = await startServer();
    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds);
    const alice = await server.connect(aliceCreds);
    clients.push(gm, alice);
    await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 10000, height: 10000 } });
    // 0.5 px off the tilted wall's midpoint, on its upper side. A player's own token.move is refused this close
    // to a wall (its footprint would cross), so the token is placed first and the walls drawn around it.
    const len = Math.hypot(2000.46, 3.6);
    const to = { x: 5000.6 + (3.6 / len) * 0.5, y: 5001.91 - (2000.46 / len) * 0.5 };
    await gm.command({ type: "token.create", name: "Fighter", position: to, ownerIds: [aliceCreds.participantId] });
    const blocker = { a: { x: 4000.37, y: 5000.11 }, b: { x: 6000.83, y: 5003.71 } };
    const hidden = [
      { a: { x: 4300.123456, y: 5400.456789 }, b: { x: 5200.789012, y: 5600.321098 } },
      { a: { x: 5000.512345, y: 6000.251234 }, b: { x: 5100.754321, y: 8000.125678 } },
    ];
    // Line of sight first: with it off, walls on open ground are in plain view (ADR 0056).
    const on = await gm.command({ type: "scene.setLineOfSight", enabled: true });
    const added = await gm.command({ type: "wall.add", walls: [blocker, ...hidden] });
    await alice.waitForSeq(Math.max(seqOf(added), seqOf(on)));
    const raw = alice.rawLog.join("\n");
    for (const w of hidden) for (const v of [w.a.x, w.a.y, w.b.x, w.b.y]) expect(raw).not.toContain(String(v));
    const sight = (sightOf(alice) as { x: number; y: number }[][])[0]!;
    expect(sight.length).toBeGreaterThan(2);
    const bearing = (p: { x: number; y: number }) => Math.atan2(p.y - to.y, p.x - to.x);
    for (const w of hidden) {
      for (const e of [w.a, w.b]) {
        for (const v of sight) {
          const d = Math.abs(bearing(v) - bearing(e)) % (2 * Math.PI);
          expect(Math.min(d, 2 * Math.PI - d)).toBeGreaterThan(1e-6);
        }
      }
    }
  });
});
