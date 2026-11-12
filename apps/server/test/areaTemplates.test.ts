import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AreaTemplate, EphemeralPayload, ServerMessage } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  clients.push(gm, alice, bob);
  return { gm, alice, bob };
}

const templates = (c: TestClient) => Object.values(c.state.templates) as AreaTemplate[];
const cone = { type: "template.place", shape: "cone", origin: { x: 70, y: 70 }, toward: { x: 280, y: 70 }, size: 15 } as const;

describe("shared area templates over the wire (FR-TAC-06, FR-SYNC-02, ADR 0007)", () => {
  it("shows a player's template to everyone and lets them remove it", async () => {
    const { gm, alice, bob } = await setup();

    const placed = await alice.command(cone);
    expect(placed).toMatchObject({ type: "ack" });
    const seq = (placed as { seq: number }).seq;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(seq)));
    for (const c of [gm, alice, bob]) {
      expect(templates(c)).toHaveLength(1);
      expect(templates(c)[0]).toMatchObject({ shape: "cone", size: 15, ownerId: alice.participantId });
    }

    const id = templates(bob)[0]!.id;
    expect(await bob.command({ type: "template.remove", templateId: id })).toMatchObject({ type: "rejected", code: "forbidden" });

    const removed = await alice.command({ type: "template.remove", templateId: id });
    const removedSeq = (removed as { seq: number }).seq;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(removedSeq)));
    for (const c of [gm, alice, bob]) expect(templates(c)).toEqual([]);
  });

  it("never sends a GM-only template to players, but keeps their seq gap-free (FR-GM-23)", async () => {
    const { gm, alice } = await setup();

    const placed = await gm.command({ ...cone, gmOnly: true });
    const seq = (placed as { seq: number }).seq;
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seq)));
    expect(templates(gm)).toHaveLength(1);
    expect(templates(alice)).toEqual([]);
    expect(alice.rawLog.join(" ")).not.toContain("TemplatePlaced");

    expect(await alice.command({ ...cone, gmOnly: true })).toMatchObject({ type: "rejected", code: "forbidden" });
  });
});

describe("template aim previews (KAN-35, FR-TAC-06)", () => {
  const isEphemeral = (m: ServerMessage): m is Extract<ServerMessage, { type: "ephemeral" }> => m.type === "ephemeral";
  const aim = (gmOnly = false, x = 140): EphemeralPayload => ({
    type: "templatePreview",
    preview: { shape: "cone", origin: { x, y: 70 }, toward: { x: x + 210, y: 70 }, size: 15, gmOnly },
  });
  const marker = (x: number): EphemeralPayload => ({ type: "ping", at: { x, y: 10 } });
  async function withMap() {
    const room = await setup();
    await room.gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
    await Promise.all([room.alice, room.bob].map((c) => c.waitForSeq(room.gm.seq)));
    return room;
  }

  it("shows the aim to everyone else, takes no seq and changes no state", async () => {
    const { gm, alice, bob } = await withMap();
    const seq = alice.seq;
    const before = JSON.stringify(bob.state);
    alice.send({ type: "ephemeral", payload: aim() });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(aim());
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(aim());
    expect(JSON.stringify(bob.state)).toBe(before);
    // Aim, then place: exactly one event, at the next seq.
    alice.send({ type: "ephemeral", payload: { type: "templatePreview", preview: null, gmOnly: false } });
    const placed = await alice.command(cone);
    expect(placed).toMatchObject({ type: "ack", seq: seq + 1 });
    await bob.waitForSeq(alice.seq);
    expect(templates(bob)).toHaveLength(1);
  });

  it("keeps a GM-only aim, and its clear, from players", async () => {
    const { gm, alice, bob } = await withMap();
    gm.send({ type: "ephemeral", payload: aim(true) });
    gm.send({ type: "ephemeral", payload: { type: "templatePreview", preview: null, gmOnly: true } });
    gm.send({ type: "ephemeral", payload: marker(1) });
    expect((await alice.waitFor(isEphemeral)).payload).toEqual(marker(1));
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(marker(1));
  });

  it("refuses a clear that doesn't say whether its aim was GM-only", async () => {
    const { gm, alice, bob } = await withMap();
    gm.send({ type: "ephemeral", payload: { type: "templatePreview", preview: null } as unknown as EphemeralPayload });
    gm.send({ type: "ephemeral", payload: marker(3) });
    expect((await alice.waitFor(isEphemeral)).payload).toEqual(marker(3));
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(marker(3));
  });

  it("drops a player's forged GM-only aim, and an aim off the map", async () => {
    const { gm, alice, bob } = await withMap();
    alice.send({ type: "ephemeral", payload: aim(true) });
    alice.send({ type: "ephemeral", payload: aim(false, 5000) });
    alice.send({ type: "ephemeral", payload: marker(2) });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(marker(2));
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(marker(2));
  });

  it("keeps an aim from under fog away from other players", async () => {
    const { gm, alice, bob } = await withMap();
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 400, y: 400 } } });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    alice.send({ type: "ephemeral", payload: aim(false, 140) });
    alice.send({ type: "ephemeral", payload: marker(600) });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(marker(600));
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(aim(false, 140));
  });
});

describe("area colours over the wire (FR-TAC-06, FR-GM-23, ADR 0040)", () => {
  const isEphemeral = (m: ServerMessage): m is Extract<ServerMessage, { type: "ephemeral" }> => m.type === "ephemeral";

  it("shows a public area in its colour to everyone, and keeps a GM-only one and its colour from players", async () => {
    const { gm, alice } = await setup();
    await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });

    // A GM-only green aim, then a ping as a marker: the player gets the ping and nothing before it.
    gm.send({ type: "ephemeral", payload: { type: "templatePreview", preview: { shape: "circle", origin: { x: 140, y: 70 }, toward: { x: 141, y: 70 }, size: 20, gmOnly: true, color: "green" } } });
    gm.send({ type: "ephemeral", payload: { type: "ping", at: { x: 1, y: 10 } } });
    expect((await alice.waitFor(isEphemeral)).payload).toMatchObject({ type: "ping" });

    await gm.command({ ...cone, shape: "circle", gmOnly: true, color: "green" });
    const placed = await gm.command({ ...cone, color: "red" });
    const seq = (placed as { seq: number }).seq;
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seq)));

    expect(templates(gm).map((t) => t.color).sort()).toEqual(["green", "red"]);
    expect(templates(alice)).toHaveLength(1);
    expect(templates(alice)[0]).toMatchObject({ shape: "cone", color: "red" });
    expect(alice.rawLog.join(" ")).not.toContain("green");
  });

  it("refuses a colour outside the fixed list", async () => {
    const { alice } = await setup();
    expect(await alice.command({ ...cone, color: "white" } as never)).toMatchObject({ type: "rejected" });
    expect(templates(alice)).toEqual([]);
  });
});

describe("editing placed areas over the wire (FR-TAC-06, FR-GM-17, ADR 0058)", () => {
  const isEphemeral = (m: ServerMessage): m is Extract<ServerMessage, { type: "ephemeral" }> => m.type === "ephemeral";
  const marker = (x: number): EphemeralPayload => ({ type: "ping", at: { x, y: 10 } });
  async function withMap() {
    const room = await setup();
    await room.gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
    await Promise.all([room.alice, room.bob].map((c) => c.waitForSeq(room.gm.seq)));
    return room;
  }
  async function placeBy(by: TestClient, others: TestClient[], extra: Record<string, unknown> = {}) {
    await by.command({ ...cone, ...extra } as typeof cone);
    await Promise.all(others.map((c) => c.waitForSeq(by.seq)));
    return templates(by)[0]!;
  }
  const geometry = (t: AreaTemplate) => ({ origin: t.origin, toward: t.toward, size: t.size, ...(t.width !== undefined && { width: t.width }) });
  const editPreview = (t: AreaTemplate, x: number, gmOnly = false): EphemeralPayload => ({
    type: "templatePreview",
    templateId: t.id,
    preview: { shape: t.shape, origin: { x, y: 70 }, toward: { x: x + 210, y: 70 }, size: t.size, gmOnly },
  });

  it("shows an edit to everyone and refuses a stale one", async () => {
    const { gm, alice, bob } = await withMap();
    const t = await placeBy(alice, [gm, bob]);
    const moved = await alice.command({ type: "template.update", templateId: t.id, origin: { x: 140, y: 140 }, toward: { x: 350, y: 140 }, size: 30, expected: geometry(t) });
    expect(moved).toMatchObject({ type: "ack" });
    await Promise.all([gm, bob].map((c) => c.waitForSeq(alice.seq)));
    for (const c of [gm, alice, bob]) expect(templates(c)[0]).toMatchObject({ id: t.id, origin: { x: 140, y: 140 }, size: 30, ownerId: alice.participantId });
    expect(await gm.command({ type: "template.update", templateId: t.id, origin: { x: 70, y: 70 }, toward: { x: 280, y: 70 }, size: 15, expected: geometry(t) }))
      .toMatchObject({ type: "rejected", code: "invalid" });
    expect(await bob.command({ type: "template.update", templateId: t.id, origin: { x: 70, y: 70 }, toward: { x: 280, y: 70 }, size: 15, expected: geometry(templates(bob)[0]!) }))
      .toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("drops a player's area from another player's state when it moves into fog, and keeps it for the GM", async () => {
    const { gm, alice, bob } = await withMap();
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 600, y: 0 }, to: { x: 1000, y: 800 } } });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    const t = await placeBy(alice, [gm, bob]);
    expect(templates(bob)).toHaveLength(1);
    await alice.command({ type: "template.update", templateId: t.id, origin: { x: 800, y: 300 }, toward: { x: 900, y: 300 }, size: 15, expected: geometry(t) });
    await Promise.all([gm, bob].map((c) => c.waitForSeq(alice.seq)));
    expect(templates(bob)).toEqual([]);
    expect(templates(gm)[0]).toMatchObject({ origin: { x: 800, y: 300 } });
    expect(templates(alice)[0]).toMatchObject({ origin: { x: 800, y: 300 } });
  });

  it("relays an edit preview, never persisted, and drops one from someone who can't edit the area", async () => {
    const { gm, alice, bob } = await withMap();
    const t = await placeBy(alice, [gm, bob]);
    const seq = alice.seq;
    alice.send({ type: "ephemeral", payload: editPreview(t, 140) });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(editPreview(t, 140));
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(editPreview(t, 140));
    // Bob may not edit Alice's area: his preview naming it reaches no one.
    bob.send({ type: "ephemeral", payload: editPreview(t, 200) });
    bob.send({ type: "ephemeral", payload: marker(5) });
    expect((await alice.waitFor(isEphemeral)).payload).toEqual(marker(5));
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(marker(5));
    expect(alice.seq).toBe(seq);
  });

  it("keeps a GM-only area's edit preview from players, whatever the payload claims", async () => {
    const { gm, alice, bob } = await withMap();
    const t = await placeBy(gm, [alice, bob], { gmOnly: true });
    gm.send({ type: "ephemeral", payload: editPreview(t, 140, false) });
    gm.send({ type: "ephemeral", payload: marker(7) });
    expect((await alice.waitFor(isEphemeral)).payload).toEqual(marker(7));
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(marker(7));
  });

  it("keeps an edit preview dragged into fog from other players", async () => {
    const { gm, alice, bob } = await withMap();
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 600, y: 0 }, to: { x: 1000, y: 800 } } });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    const t = await placeBy(alice, [gm, bob]);
    alice.send({ type: "ephemeral", payload: editPreview(t, 800) });
    alice.send({ type: "ephemeral", payload: marker(9) });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(marker(9));
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(editPreview(t, 800));
  });
});

describe("areas visible in part over the wire (FR-GM-17, ADR 0059)", () => {
  const isEphemeral = (m: ServerMessage): m is Extract<ServerMessage, { type: "ephemeral" }> => m.type === "ephemeral";
  const marker = (x: number): EphemeralPayload => ({ type: "ping", at: { x, y: 10 } });
  /** A 1000×800 map with its right half (x 500–1000) fogged. */
  async function halfFogged() {
    const gmCreds = await server.createRoom();
    const [gm, alice, bob] = await Promise.all([
      server.connect(gmCreds),
      server.join(gmCreds.inviteCode, "Alice").then((c) => server.connect(c)),
      server.join(gmCreds.inviteCode, "Bob").then((c) => server.connect(c)),
    ]);
    clients.push(gm, alice, bob);
    const room = { gm, alice, bob, inviteCode: gmCreds.inviteCode };
    await room.gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
    await room.gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 500, y: 0 }, to: { x: 1000, y: 800 } } });
    await Promise.all([room.alice, room.bob].map((c) => c.waitForSeq(room.gm.seq)));
    return room;
  }
  const outOfFog = { type: "template.place", shape: "cone", origin: { x: 600, y: 400 }, toward: { x: 0, y: 400 }, size: 30 } as const;

  it("sends a cone aimed out of fog to players, live and in a fresh snapshot", async () => {
    const { gm, alice, inviteCode } = await halfFogged();
    await gm.command(outOfFog);
    await alice.waitForSeq(gm.seq);
    expect(templates(alice)).toHaveLength(1);
    expect(alice.rawLog.join(" ")).toContain("TemplatePlaced");
    // Someone joining now gets it in their first snapshot.
    const carol = await server.connect(await server.join(inviteCode, "Carol"));
    clients.push(carol);
    await carol.waitForSeq(gm.seq);
    expect(templates(carol)).toHaveLength(1);
  });

  it("relays an aim out of fog to other players, but not one wholly in fog", async () => {
    const { gm, alice, bob } = await halfFogged();
    const aim = (x: number, toward: number): EphemeralPayload => ({ type: "templatePreview", preview: { shape: "cone", origin: { x, y: 400 }, toward: { x: toward, y: 400 }, size: 30, gmOnly: false } });
    alice.send({ type: "ephemeral", payload: aim(600, 0) });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(aim(600, 0));
    alice.send({ type: "ephemeral", payload: { type: "templatePreview", preview: null, gmOnly: false } });
    await bob.waitFor(isEphemeral);
    alice.send({ type: "ephemeral", payload: aim(700, 1000) });
    alice.send({ type: "ephemeral", payload: marker(11) });
    expect((await bob.waitFor(isEphemeral)).payload).toEqual(marker(11));
    expect((await gm.waitFor(isEphemeral)).payload).toEqual(aim(600, 0));
  });
});
