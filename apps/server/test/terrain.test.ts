import { afterEach, describe, expect, it, vi } from "vitest";
import { ClientMessage, ReplayResponse, inSight, replayStates, type CommandInput, type MovementPreviewRequest, type Token } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";
import { LiveRoom } from "../src/domain/liveRoom";
let server: Awaited<ReturnType<typeof startServer>> | null = null;
const clients: TestClient[] = [];
afterEach(async () => { vi.restoreAllMocks(); clients.splice(0).forEach((c) => c.close()); await server?.close(); server = null; });
const seq = (r: unknown) => (r as { seq: number }).seq;
const context = (c: TestClient) => ({ boardEpoch: c.state.boardEpoch ?? 0, revision: c.state.terrainRevision ?? 0 });
const paint = (c: TestClient, kind: "blocked" | "difficult" | null, col = 1, layerId = "base"): CommandInput => ({ type: "terrain.paint", layerId, paint: [{ row: 0, start: col, end: col, kind }], context: context(c) });
async function setup() {
  server = await startServer();
  const gmCreds = await server.createRoom(), playerCreds = await server.join(gmCreds.inviteCode, "Mover");
  const gm = await server.connect(gmCreds), player = await server.connect(playerCreds); clients.push(gm, player);
  await gm.command({ type: "scene.setMap", map: { url: "/uploads/map.png", width: 700, height: 700 } });
  const made = await gm.command({ type: "token.create", name: "Mover", position: { x: 35, y: 35 }, ownerIds: [playerCreds.participantId] });
  await player.waitForSeq(seq(made));
  const token = Object.values(gm.state.tokens)[0] as Token;
  return { gm, player, token, gmCreds, playerCreds };
}

describe.each(["token.configure", "token.setAppearance"] as const)("%s resize over the wire (FR-TAC-03, FR-GM-23, FR-REC-02)", (type) => {
  const resize = (token: Token, size: number): CommandInput => type === "token.configure"
    ? { type, tokenId: token.id, changes: { size, name: "Changed name", rotation: 90, hidden: true, ownerIds: [], imageUrl: "/uploads/changed.png", assetId: null, stats: { hp: 2, maxHp: 3, ac: 10 }, conditions: ["prone"] } }
    : { type, tokenId: token.id, name: "Changed name", size, rotation: 90 };
  const sizeOnly = (token: Token, size: number): CommandInput => type === "token.configure"
    ? { type, tokenId: token.id, changes: { size } }
    : { type, tokenId: token.id, name: token.name, size, rotation: token.rotation };

  it.each(["base", "temporary"])("refuses %s Blocked enlargement without appending or changing any submitted field", async (layer) => {
    const { gm, player, token } = await setup();
    let layerId = "base";
    if (layer === "temporary") {
      await gm.command(paint(gm, "difficult"));
      await gm.command({ type: "terrain.effect.create", name: "Private trap", context: context(gm) });
      layerId = gm.state.terrain!.effects[0]!.id;
    }
    await gm.command(paint(gm, "blocked", 1, layerId)); await player.waitForSeq(gm.seq);
    const before = structuredClone(gm.state), playerBefore = structuredClone(player.state), last = gm.seq;
    const events = await server!.store.loadEvents(gm.state.roomId);
    expect(await gm.command(resize(token, 2))).toMatchObject({ type: "rejected", code: "invalid", message: "That move is unavailable." });
    expect(gm.seq).toBe(last); expect(player.seq).toBe(last);
    expect(gm.state).toEqual(before); expect(player.state).toEqual(playerBefore);
    expect(await server!.store.loadEvents(gm.state.roomId)).toEqual(events);
    await gm.command(paint(gm, null, 1, layerId));
    expect(await gm.command(sizeOnly(token, 2))).toMatchObject({ type: "ack" });
    await gm.command(paint(gm, "blocked", 1, layerId));
    // Painting may cover the enlarged token; shrinking into its clear top-left cell succeeds.
    expect(await gm.command(sizeOnly(gm.state.tokens[token.id]!, 1))).toMatchObject({ type: "ack" });
    await player.waitForSeq(gm.seq);
    expect(gm.state.tokens[token.id]).toEqual(token);
    expect(player.state.tokens[token.id]).toMatchObject({ size: 1, position: token.position });
  });

  it.each(["terrain", "portal"])("validates against a preceding queued %s edit", async (obstacle) => {
    const { gm, player, token } = await setup();
    if (obstacle === "portal") await gm.command({ type: "wall.add", walls: [{ a: { x: 105, y: 0 }, b: { x: 105, y: 140 }, portal: { kind: "window", state: "open" } }] });
    const last = gm.seq;
    const edit = gm.command(obstacle === "terrain" ? paint(gm, "blocked") : { type: "portal.setState", wallId: Object.keys(gm.state.walls)[0]!, state: "closed" });
    const resized = gm.command(sizeOnly(token, 2));
    expect(await edit).toMatchObject({ type: "ack" });
    expect(await resized).toMatchObject({ type: "rejected", message: "That move is unavailable." });
    await player.waitForSeq(gm.seq);
    expect(gm.seq).toBe(last + 1); expect(gm.state.tokens[token.id]).toEqual(token);
    expect(player.state.tokens[token.id]).toMatchObject({ size: 1, position: token.position });
  });

  it("preserves hide-first/reveal-last, compensation, non-undoable resize batches, replay and reload", async () => {
    const { gm, player, token, gmCreds, playerCreds } = await setup();
    await gm.command({ type: "token.setOwners", tokenId: token.id, ownerIds: [] });
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 60, y: 60 }, to: { x: 100, y: 100 } } });
    await player.waitForSeq(gm.seq);
    const fog = structuredClone(gm.state.fog), before = gm.seq, undo = structuredClone(gm.state.undo.filter((entry) => entry.undoable));
    const named = (size: number, name: string): CommandInput => type === "token.configure"
      ? { type, tokenId: token.id, changes: { size, name, rotation: 90 } }
      : { type, tokenId: token.id, size, name, rotation: 90 };
    expect(await gm.command(named(2, "Private resize"))).toMatchObject({ type: "ack" });
    await player.waitForSeq(gm.seq);
    const grown = (await server!.store.loadEvents(gm.state.roomId)).filter((e) => e.seq > before);
    expect(grown.map((e) => e.event.type)).toEqual(["TokenMoved", "TokenAppearanceSet"]);
    expect(grown[0]!.event).toMatchObject({ from: token.position, to: { x: 70, y: 70 } });
    expect(grown[1]!.event).toMatchObject({ previous: { name: token.name, size: 1, rotation: 0 } });
    expect(player.state.tokens[token.id]).toBeUndefined();
    expect(gm.state.undo.filter((entry) => entry.undoable)).toEqual(undo);
    expect(gm.state.undo.at(-1)).toMatchObject({ commandId: grown[0]!.commandId, undoable: false });
    expect(await gm.command({ type: "history.undo", commandId: grown[0]!.commandId! })).toMatchObject({ type: "rejected" });
    const concealedSeq = gm.seq;
    expect(await gm.command(named(1, "Public return"))).toMatchObject({ type: "ack" });
    await player.waitForSeq(gm.seq);
    const shrunk = (await server!.store.loadEvents(gm.state.roomId)).filter((e) => e.seq > concealedSeq);
    expect(shrunk.map((e) => e.event.type)).toEqual(["TokenAppearanceSet", "TokenMoved"]);
    expect(shrunk[0]!.event).toMatchObject({ previous: { name: "Private resize", size: 2, rotation: 90 } });
    expect(player.state.tokens[token.id]).toMatchObject({ name: "Public return", size: 1, position: token.position });
    expect(player.rawLog.join("\n")).not.toContain("Private resize");
    expect(gm.state.fog).toEqual(fog); expect(gm.state.undo.filter((entry) => entry.undoable)).toEqual(undo);
    expect(gm.state.undo.at(-1)).toMatchObject({ commandId: shrunk[0]!.commandId, undoable: false });
    const canonical = structuredClone(gm.state.tokens[token.id]), store = server!.store;
    clients.splice(0).forEach((c) => c.close()); await server!.close(); server = await startServer(store);
    const reGm = await server.connect(gmCreds), rePlayer = await server.connect(playerCreds); clients.push(reGm, rePlayer);
    expect(reGm.state.tokens[token.id]).toEqual(canonical);
    expect(rePlayer.state.tokens[token.id]).toMatchObject({ name: "Public return", size: 1, position: token.position });
    expect(reGm.state.fog).toEqual(fog);
    for (const credentials of [gmCreds, playerCreds]) {
      const response = await fetch(`${server.base}/api/rooms/${gmCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${credentials.guestToken}` } });
      expect(response.status).toBe(200);
      const replay = ReplayResponse.parse(await response.json());
      expect(replayStates(replay).at(-1)?.tokens[token.id]).toMatchObject({ name: "Public return", size: 1, position: token.position });
      if (credentials === playerCreds) expect(JSON.stringify(replay)).not.toContain("Private resize");
    }
  });
});

describe("terrain over the ordered wire (FR-PL-04, FR-GM-23, FR-REC-02)", () => {
  it.each([
    { name: "into", from: 35, to: 105, left: 70, right: 210 },
    { name: "within", from: 105, to: 175, left: 70, right: 210 },
    { name: "across a thin strip of", from: 35, to: 245, left: 139, right: 139.1 },
    { name: "out of", from: 175, to: 245, left: 70, right: 210 },
  ])("permits ordinary owner and GM movement $name fog without altering fog", async ({ from, to, left, right }) => {
    const { gm, player, token } = await setup();
    expect(await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: left, y: 0 }, to: { x: right, y: 70 } } })).toMatchObject({ type: "ack" });
    if (from !== 35) expect(await gm.command({ type: "token.move", tokenId: token.id, to: { x: from, y: 35 } })).toMatchObject({ type: "ack" });
    await player.waitForSeq(gm.seq);
    expect(player.state.tokens[token.id]).toBeDefined();
    const move: CommandInput = { type: "token.move", tokenId: token.id, to: { x: to, y: 35 }, expectedOrigin: { x: from, y: 35 }, boardEpoch: gm.state.boardEpoch ?? 0 };
    const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: "role-fog", tokenId: token.id, from: { x: from, y: 35 }, to: move.to, boardEpoch: gm.state.boardEpoch ?? 0 };
    gm.send({ type: "ephemeral", payload: request });
    expect(await gm.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback")).toMatchObject({ payload: { status: "clear" } });
    player.send({ type: "ephemeral", payload: request });
    expect(await player.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback")).toMatchObject({ payload: { status: "unknown" } });
    const fog = structuredClone(gm.state.fog), last = gm.seq;
    expect(await player.command({ ...move, reposition: true })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.seq).toBe(last);
    const moved = await gm.command(move); expect(moved).toMatchObject({ type: "ack" });
    await player.waitForSeq(seq(moved));
    expect(gm.state.tokens[token.id]?.position).toEqual(move.to);
    expect(await gm.command({ type: "token.move", tokenId: token.id, to: move.expectedOrigin! })).toMatchObject({ type: "ack" });
    await player.waitForSeq(gm.seq);
    const ownedMove = await player.command(move); expect(ownedMove).toMatchObject({ type: "ack" });
    await gm.waitForSeq(seq(ownedMove));
    expect(player.state.tokens[token.id]?.position).toEqual(move.to);
    expect(gm.state.fog).toEqual(fog); expect(player.state.fog).toEqual(fog);
  });
  it.each(["GM placement", "new fog"])("does not immobilize an owner after %s, and revalidates later authorization", async (source) => {
    const { gm, player, token, playerCreds } = await setup();
    const addFog: CommandInput = { type: "fog.add", region: { shape: "rect", from: { x: 70, y: 0 }, to: { x: 280, y: 70 } } };
    const place: CommandInput = { type: "token.move", tokenId: token.id, to: { x: 105, y: 35 } };
    if (source === "GM placement") { await gm.command(addFog); await gm.command(place); }
    else { await gm.command(place); await gm.command(addFog); }
    await player.waitForSeq(gm.seq);
    const fog = structuredClone(gm.state.fog);
    const move = { type: "token.move" as const, tokenId: token.id, to: { x: 175, y: 35 }, expectedOrigin: { x: 105, y: 35 }, boardEpoch: gm.state.boardEpoch ?? 0 };
    expect(await player.command(move)).toMatchObject({ type: "ack" });
    await gm.waitForSeq(player.seq);
    expect(gm.state.tokens[token.id]?.position).toEqual(move.to);
    expect(gm.state.fog).toEqual(fog);
    await gm.command({ type: "token.setHidden", tokenId: token.id, hidden: true }); await player.waitForSeq(gm.seq);
    let last = gm.seq;
    expect(await player.command({ ...move, expectedOrigin: move.to, to: { x: 245, y: 35 } })).toMatchObject({ type: "rejected", code: "not_found" });
    expect(gm.seq).toBe(last);
    await gm.command({ type: "token.setHidden", tokenId: token.id, hidden: false });
    await gm.command({ type: "token.setOwners", tokenId: token.id, ownerIds: [] }); await player.waitForSeq(gm.seq);
    last = gm.seq;
    expect(await player.command({ ...move, expectedOrigin: move.to, to: { x: 245, y: 35 } })).toMatchObject({ type: "rejected", code: "not_found" });
    expect(gm.seq).toBe(last);
    await gm.command({ type: "token.setOwners", tokenId: token.id, ownerIds: [player.participantId] });
    await gm.command({ type: "participant.revoke", participantId: player.participantId }); await player.disconnected;
    const room = await LiveRoom.load(gm.state.roomId, server!.store);
    expect(await room.submit(player.participantId, { ...move, expectedOrigin: move.to, to: { x: 245, y: 35 } })).toMatchObject({ ok: false, code: "forbidden" });
    await expect(server!.connect(playerCreds)).rejects.toThrow(/revoked/);
  });
  it.each(["blocked", "wall", "closed", "locked"] as const)("conceals advisory %s collisions but enforces owner routes and destinations under fog", async (obstacle) => {
    const { gm, player, token } = await setup();
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 350, y: 140 } } });
    await gm.command({ type: "token.move", tokenId: token.id, to: { x: 105, y: 35 } });
    if (obstacle === "blocked") await gm.command(paint(gm, "blocked", 2));
    else await gm.command({ type: "wall.add", walls: [{ a: { x: 175, y: 0 }, b: { x: 175, y: 140 }, ...(obstacle !== "wall" ? { portal: { kind: "door", state: obstacle } } : {}) }] });
    await player.waitForSeq(gm.seq);
    const fog = structuredClone(gm.state.fog), last = gm.seq;
    for (const x of [315, 175]) {
      const to = { x, y: 35 };
      const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: `obstacle-${x}`, tokenId: token.id, from: { x: 105, y: 35 }, to, boardEpoch: gm.state.boardEpoch ?? 0 };
      for (const [client, status] of [[player, "unknown"], [gm, "blocked"]] as const) {
        client.send({ type: "ephemeral", payload: request });
        expect(await client.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === request.requestId)).toMatchObject({ payload: { status } });
      }
      expect(await player.command({ type: "token.move", tokenId: token.id, to, expectedOrigin: request.from, boardEpoch: request.boardEpoch })).toMatchObject({ type: "rejected", message: "That move is unavailable." });
      expect(await gm.command({ type: "token.move", tokenId: token.id, to, reposition: true })).toMatchObject({ type: x === 315 ? "ack" : "rejected" });
      if (x === 315) await gm.command({ type: "token.move", tokenId: token.id, to: request.from, reposition: true });
    }
    expect(gm.seq).toBe(last + 2);
    expect(player.state.walls).toEqual({}); expect(player.state.terrainView?.runs).toEqual([]);
    expect(gm.state.fog).toEqual(fog);
  });
  it("revalidates physical edits during a GM fog drag and still rejects stale origin and epoch", async () => {
    const { gm, player, token } = await setup();
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 350, y: 70 } } });
    const move = { type: "token.move" as const, tokenId: token.id, to: { x: 245, y: 35 }, expectedOrigin: token.position, boardEpoch: gm.state.boardEpoch ?? 0 };
    let id = 0;
    const preview = async () => {
      const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: `gm-drag-${++id}`, tokenId: token.id, from: token.position, to: move.to, boardEpoch: move.boardEpoch };
      gm.send({ type: "ephemeral", payload: request });
      return gm.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === request.requestId);
    };
    expect(await preview()).toMatchObject({ payload: { status: "clear" } });
    // Same authenticated socket, consecutive sends: the queued move must see the preceding paint.
    const painted = gm.command(paint(gm, "blocked"));
    const refused = gm.command(move);
    expect(await painted).toMatchObject({ type: "ack" });
    expect(await refused).toMatchObject({ type: "rejected", message: "That move is unavailable." });
    expect(await preview()).toMatchObject({ payload: { status: "blocked" } });
    expect(await gm.command({ type: "token.configure", tokenId: token.id, changes: { position: move.to, name: "Still Mover" } })).toMatchObject({ type: "rejected" });
    expect(gm.state.tokens[token.id]?.name).toBe(token.name);
    await gm.command(paint(gm, null));
    await gm.command({ type: "wall.add", walls: [{ a: { x: 140, y: 0 }, b: { x: 140, y: 140 }, portal: { kind: "door", state: "open" } }] });
    const wallId = Object.keys(gm.state.walls)[0]!;
    expect(await preview()).toMatchObject({ payload: { status: "clear" } });
    for (const state of ["closed", "locked"] as const) {
      await gm.command({ type: "portal.setState", wallId, state });
      expect(await preview()).toMatchObject({ payload: { status: "blocked" } });
      expect(await gm.command(move)).toMatchObject({ type: "rejected", message: "That move is unavailable." });
    }
    await gm.command({ type: "portal.setState", wallId, state: "open" });
    expect(await gm.command(move)).toMatchObject({ type: "ack" });
    const movedSeq = gm.seq;
    expect(await gm.command(move)).toMatchObject({ type: "rejected", message: "The board or token changed. Try the move again." });
    expect(gm.seq).toBe(movedSeq);
    await gm.command({ type: "scene.setGrid", grid: { ...gm.state.scene.grid, offsetX: 1 } });
    const changedSeq = gm.seq;
    expect(await gm.command({ ...move, to: { x: 315, y: 35 }, expectedOrigin: move.to })).toMatchObject({ type: "rejected", message: "The board or token changed. Try the move again." });
    expect(gm.seq).toBe(changedSeq);
    await player.waitForSeq(gm.seq);
    // Half the door lies below the fog, so the player gets the whole door (ADR 0056).
    expect(Object.keys(player.state.walls)).toEqual([wallId]);
  });
  it("revalidates owner drags after fog-only edits, new physical restrictions and stale positions/epochs", async () => {
    const { gm, player, token } = await setup();
    let origin = token.position, id = 0;
    const to = { x: 245, y: 35 }, epoch = gm.state.boardEpoch ?? 0;
    const preview = async () => {
      const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: `owner-drag-${++id}`, tokenId: token.id, from: origin, to, boardEpoch: epoch };
      player.send({ type: "ephemeral", payload: request });
      return player.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === request.requestId);
    };
    const move = () => player.command({ type: "token.move", tokenId: token.id, to, expectedOrigin: origin, boardEpoch: epoch });
    expect(await preview()).toMatchObject({ payload: { status: "clear" } });
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 350, y: 70 } } }); await player.waitForSeq(gm.seq);
    const fog = structuredClone(gm.state.fog);
    expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
    const moved = await move(); expect(moved).toMatchObject({ type: "ack" }); await gm.waitForSeq(seq(moved));
    expect(gm.state.tokens[token.id]?.position).toEqual(to);
    expect(await move()).toMatchObject({ type: "rejected", message: "The board or token changed. Try the move again." });
    await gm.command({ type: "token.move", tokenId: token.id, to: token.position }); await player.waitForSeq(gm.seq);
    expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
    await gm.command(paint(gm, "blocked")); await player.waitForSeq(gm.seq);
    expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
    expect(await move()).toMatchObject({ type: "rejected", message: "That move is unavailable." });
    await gm.command(paint(gm, null));
    await gm.command({ type: "wall.add", walls: [{ a: { x: 140, y: 0 }, b: { x: 140, y: 140 }, portal: { kind: "door", state: "open" } }] }); await player.waitForSeq(gm.seq);
    const wallId = Object.keys(gm.state.walls)[0]!;
    for (const state of ["closed", "locked"] as const) {
      expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
      await gm.command({ type: "portal.setState", wallId, state }); await player.waitForSeq(gm.seq);
      expect(await move()).toMatchObject({ type: "rejected", message: "That move is unavailable." });
    }
    await gm.command({ type: "portal.setState", wallId, state: "open" }); await player.waitForSeq(gm.seq);
    const passed = await move(); expect(passed).toMatchObject({ type: "ack" }); await gm.waitForSeq(seq(passed));
    origin = to;
    await gm.command({ type: "scene.setGrid", grid: { ...gm.state.scene.grid, offsetX: 1 } }); await player.waitForSeq(gm.seq);
    expect(await move()).toMatchObject({ type: "rejected", message: "The board or token changed. Try the move again." });
    expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
    expect(gm.state.fog).toEqual(fog);
  });
  it("privately signals visible-route wall collisions without sending walls or probing concealed layouts", async () => {
    const { gm, player, token, playerCreds, gmCreds } = await setup();
    const observer = await server!.connect(await server!.join(gmCreds.inviteCode, "Observer")); clients.push(observer);
    const added = await gm.command({ type: "wall.add", walls: [{ a: { x: 140, y: 0 }, b: { x: 140, y: 280 } }] });
    await player.waitForSeq(seq(added)); await observer.waitForSeq(seq(added));
    // The wall is in plain view, so the player holds it as a bare piece (ADR 0056).
    expect(player.state.walls).toEqual({ "seen:0": { id: "seen:0", a: { x: 140, y: 0 }, b: { x: 140, y: 280 } } });
    const initialSeq = player.seq, original = JSON.stringify(player.state);
    let id = 0;
    const preview = async (change: Partial<MovementPreviewRequest> = {}) => {
      const request: MovementPreviewRequest = { type: "tokenMovePreview", requestId: `preview${++id}`, tokenId: token.id, from: token.position, to: { x: 315, y: 35 }, boardEpoch: player.state.boardEpoch ?? 0, ...change };
      player.send({ type: "ephemeral", payload: request });
      return player.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === request.requestId);
    };
    expect(await preview()).toEqual({ type: "ephemeral", from: playerCreds.participantId, payload: { type: "tokenMoveFeedback", requestId: "preview1", atSeq: initialSeq, status: "blocked" } });
    expect(await preview({ to: { x: 35, y: 175 } })).toMatchObject({ payload: { status: "clear" } });
    expect(await preview({ from: { x: 36, y: 35 } })).toMatchObject({ payload: { status: "unknown" } });
    expect(await preview({ boardEpoch: 999 })).toMatchObject({ payload: { status: "unknown" } });
    expect(await preview({ reposition: true })).toMatchObject({ payload: { status: "unknown" } });
    expect(player.seq).toBe(initialSeq); expect(JSON.stringify(player.state)).toBe(original);
    expect(gm.rawLog.join("\n")).not.toContain("tokenMovePreview"); expect(gm.rawLog.join("\n")).not.toContain("tokenMoveFeedback");
    expect(observer.rawLog.join("\n")).not.toContain("tokenMovePreview"); expect(observer.rawLog.join("\n")).not.toContain("tokenMoveFeedback");
    const fogged = await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 70, y: 0 }, to: { x: 280, y: 70 } } }); await player.waitForSeq(seq(fogged));
    expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
    const removed = await gm.command({ type: "wall.clear" }); await player.waitForSeq(seq(removed));
    expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
    const revealed = await gm.command({ type: "fog.remove", regionId: Object.keys(gm.state.fog)[0]! }); await player.waitForSeq(seq(revealed));
    const sight = await gm.command({ type: "scene.setLineOfSight", enabled: true }); await player.waitForSeq(seq(sight));
    const range = await gm.command({ type: "scene.setSightRange", range: 5 }); await player.waitForSeq(seq(range));
    expect(await preview()).toMatchObject({ payload: { status: "unknown" } });
    // A client cannot impersonate a server feedback message through the ephemeral relay.
    expect(ClientMessage.safeParse({ type: "ephemeral", payload: { type: "tokenMoveFeedback", requestId: "forged", atSeq: player.seq, status: "clear" } }).success).toBe(false);
    const response = await fetch(`${server!.base}/api/rooms/${gmCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${playerCreds.guestToken}` } });
    expect(await response.text()).not.toContain("tokenMoveFeedback");
  });
  it("keeps fogged monsters private through owner movement, sight overlap, reconnect and REST replay", async () => {
    const { gm, player, token, gmCreds, playerCreds } = await setup();
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 350, y: 140 } } });
    await gm.command({ type: "scene.setLineOfSight", enabled: true });
    await gm.command({ type: "scene.setSightRange", range: null });
    await gm.command({ type: "token.create", name: "Private Lurker", position: { x: 175.25, y: 75.5 } });
    const monster = Object.values(gm.state.tokens).find((t) => t.name === "Private Lurker")!;
    await player.waitForSeq(gm.seq);
    const fog = structuredClone(gm.state.fog), sight = structuredClone(player.state.sight);
    expect(inSight(player.state.sight!, monster.position)).toBe(true);
    expect(player.state.tokens[monster.id]).toBeUndefined();
    player.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: token.id, at: { x: 315, y: 35 } } });
    await gm.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenDragPreview");
    expect(player.state.sight).toEqual(sight);
    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: monster.id, at: { x: 231.75, y: 77.5 } } });
    expect(await gm.command({ type: "token.configure", tokenId: monster.id, changes: { name: "Private Wraith", position: { x: 245.25, y: 75.5 }, stats: { hp: 31, maxHp: 39, ac: 21 } } })).toMatchObject({ type: "ack" });
    const moved = await player.command({ type: "token.move", tokenId: token.id, to: { x: 105, y: 35 }, expectedOrigin: token.position, boardEpoch: gm.state.boardEpoch ?? 0 });
    expect(moved).toMatchObject({ type: "ack" }); await gm.waitForSeq(seq(moved));
    expect(player.state.fog).toEqual(fog); expect(gm.state.fog).toEqual(fog);
    expect(player.state.sight).not.toEqual(sight);
    expect(inSight(player.state.sight!, gm.state.tokens[monster.id]!.position)).toBe(true);
    const fresh = await server!.connect(playerCreds); clients.push(fresh);
    const response = await fetch(`${server!.base}/api/rooms/${gmCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${playerCreds.guestToken}` } });
    expect(response.status).toBe(200);
    const replay = ReplayResponse.parse(await response.json());
    for (const state of replayStates(replay)) expect(state.tokens[monster.id]).toBeUndefined();
    for (const payload of [player.rawLog.join("\n"), fresh.rawLog.join("\n"), JSON.stringify(replay)]) {
      for (const secret of [monster.id, "Private Lurker", "Private Wraith", '"x":175.25', '"x":245.25', '"x":231.75', '"hp":31']) expect(payload).not.toContain(secret);
    }
  });
  it("retains the private advisory limit of ten requests per socket per second", async () => {
    const { gm, player, token } = await setup();
    const now = Date.now(), clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const request = (id: number): MovementPreviewRequest => ({ type: "tokenMovePreview", requestId: `limited-${id}`, tokenId: token.id, from: token.position, to: { x: 105, y: 35 }, boardEpoch: gm.state.boardEpoch ?? 0 });
    for (let i = 0; i < 10; i++) {
      player.send({ type: "ephemeral", payload: request(i) });
      await player.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === request(i).requestId);
    }
    player.send({ type: "ephemeral", payload: request(10) });
    expect(await player.command({ type: "token.move", tokenId: token.id, to: token.position })).toMatchObject({ type: "ack" });
    const feedback = () => player.rawLog.filter((raw) => raw.includes('"tokenMoveFeedback"'));
    expect(feedback()).toHaveLength(10);
    expect(gm.rawLog.join("\n")).not.toContain("tokenMoveFeedback");
    clock.mockReturnValue(now + 1001);
    player.send({ type: "ephemeral", payload: request(11) });
    await player.waitFor((m) => m.type === "ephemeral" && m.payload.type === "tokenMoveFeedback" && m.payload.requestId === request(11).requestId);
    expect(feedback()).toHaveLength(11);
  });
  it("filters layers/names/revisions, redacts unchanged projections, restores temporary edits and reconnects", async () => {
    const { gm, player, playerCreds } = await setup();
    const base = await gm.command(paint(gm, "blocked")); await player.waitForSeq(seq(base));
    expect(player.state.terrainView?.runs).toEqual([{ row: 0, start: 1, end: 1, kind: "blocked" }]);
    const created = await gm.command({ type: "terrain.effect.create", name: "Private trap name", context: context(gm) }); await player.waitForSeq(seq(created));
    const id = gm.state.terrain!.effects[0]!.id;
    const effect = await gm.command(paint(gm, "difficult", 1, id)); await player.waitForSeq(seq(effect));
    expect(player.state.terrainView?.temporary).toHaveLength(1);
    const start = player.rawLog.length;
    const rename = await gm.command({ type: "terrain.effect.rename", effectId: id, name: "Secret location", context: context(gm) }); await player.waitForSeq(seq(rename));
    expect(player.rawLog.slice(start).some((raw) => JSON.parse(raw).type === "redacted")).toBe(true);
    const removed = await gm.command({ type: "terrain.effect.remove", effectId: id, context: context(gm) }); await player.waitForSeq(seq(removed));
    expect(player.state.terrainView?.temporary).toEqual([]); expect(gm.state.terrain?.base[0]?.kind).toBe("blocked");
    const commandId = gm.state.undo.at(-1)!.commandId;
    const undone = await gm.command({ type: "history.undo", commandId }); await player.waitForSeq(seq(undone));
    expect(gm.state.terrain?.effects[0]?.name).toBe("Secret location");
    const fresh = await server!.connect(playerCreds); clients.push(fresh);
    expect(fresh.state.terrainView).toEqual(player.state.terrainView);
    for (const log of [...player.rawLog, ...fresh.rawLog]) { expect(log).not.toContain("Private trap name"); expect(log).not.toContain("Secret location"); expect(log).not.toContain('"terrainRevision"'); expect(log).not.toContain('"terrain":'); expect(log).not.toContain(id); }
  });
  it("revalidates painting before a move, refuses forged override and stale origins without events", async () => {
    const { gm, player, token } = await setup();
    const to = { x: 175, y: 35 };
    const move: CommandInput = { type: "token.move", tokenId: token.id, to, expectedOrigin: token.position, boardEpoch: gm.state.boardEpoch ?? 0 };
    const painted = await gm.command(paint(gm, "blocked")); await player.waitForSeq(seq(painted));
    const last = gm.seq;
    expect(await player.command(move)).toMatchObject({ type: "rejected", message: "That move is unavailable." });
    expect(await gm.command(move)).toMatchObject({ type: "rejected" });
    expect(await player.command({ ...move, reposition: true })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.seq).toBe(last);
    const moved = await gm.command({ ...move, reposition: true }); await player.waitForSeq(seq(moved));
    expect(await player.command(move)).toMatchObject({ type: "rejected" });
    const stale = paint(gm, "difficult", 3); await gm.command(paint(gm, "difficult", 4));
    expect(await gm.command(stale)).toMatchObject({ type: "rejected" });
    expect(gm.state.terrain?.base.some((r) => r.start === 3)).toBe(false);
  });
  it("keeps concealed terrain out of history and replay and recovers all layers after restart", async () => {
    const { gm, player, gmCreds, playerCreds } = await setup();
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 70, y: 0 }, to: { x: 140, y: 70 } } });
    const painted = await gm.command(paint(gm, "difficult")); await player.waitForSeq(seq(painted));
    expect(player.state.terrainView?.runs).toEqual([]);
    await gm.command({ type: "terrain.effect.create", name: "Hidden ash", context: context(gm) });
    const effectId = gm.state.terrain!.effects[0]!.id;
    await gm.command(paint(gm, "difficult", 1, effectId));
    const checkpoint = await gm.command({ type: "checkpoint.create", name: "All layers" }); await player.waitForSeq(seq(checkpoint));
    const canonical = structuredClone(gm.state.terrain);
    await gm.command(paint(gm, "blocked", 4));
    const epoch = gm.state.boardEpoch ?? 0;
    const restore = await gm.command({ type: "checkpoint.restore", checkpointId: gm.state.checkpoints[0]!.id }); await player.waitForSeq(seq(restore));
    expect(gm.state.terrain).toEqual(canonical); expect(gm.state.boardEpoch).toBeGreaterThan(epoch);
    const store = server!.store;
    clients.splice(0).forEach((c) => c.close()); await server!.close();
    server = await startServer(store);
    const reGm = await server.connect(gmCreds), rePlayer = await server.connect(playerCreds); clients.push(reGm, rePlayer);
    expect(reGm.state.terrain).toEqual(canonical); expect(rePlayer.state.terrainView?.runs).toEqual([]);
    const response = await fetch(`${server.base}/api/rooms/${gmCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${playerCreds.guestToken}` } });
    expect(response.status).toBe(200);
    const replay = ReplayResponse.parse(await response.json());
    expect(replayStates(replay).at(-1)?.terrainView?.runs).toEqual([]);
    expect(JSON.stringify(replay)).not.toContain('"TerrainPainted"');
    expect(JSON.stringify(replay)).not.toContain('"terrainRevision"');
    const history = await fetch(`${server.base}/api/rooms/${gmCreds.roomId}/history`, { headers: { authorization: `Bearer ${playerCreds.guestToken}` } });
    expect(history.status).toBe(403); expect(await history.text()).not.toContain('"TerrainPainted"');
  });
});

describe("terrain for partly visible squares over the wire (FR-GM-17, FR-GM-23)", () => {
  it("sends a partly fogged square and never a wholly fogged one, live, on reconnect and in REST replay (ADR 0069)", async () => {
    const { gm, player, gmCreds, playerCreds } = await setup();
    const s = gm.state.scene.grid.cellSize, ox = gm.state.scene.grid.offsetX, oy = gm.state.scene.grid.offsetY;
    // Fog covers the right half of square 5 and all of squares 6 to 8 on row 0.
    const fogged = await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: ox + 5.5 * s, y: oy - 1 }, to: { x: ox + 9 * s, y: oy + s + 1 } } });
    await player.waitForSeq(seq(fogged));
    const partly = await gm.command(paint(gm, "difficult", 5)); await player.waitForSeq(seq(partly));
    const hidden = await gm.command(paint(gm, "blocked", 7)); await player.waitForSeq(seq(hidden));
    expect(gm.state.terrain?.base).toEqual([{ row: 0, start: 5, end: 5, kind: "difficult" }, { row: 0, start: 7, end: 7, kind: "blocked" }]);
    expect(player.state.terrainView?.runs).toEqual([{ row: 0, start: 5, end: 5, kind: "difficult" }]);
    const fresh = await server!.connect(playerCreds); clients.push(fresh);
    expect(fresh.state.terrainView?.runs).toEqual([{ row: 0, start: 5, end: 5, kind: "difficult" }]);
    const response = await fetch(`${server!.base}/api/rooms/${gmCreds.roomId}/replay/start`, { headers: { authorization: `Bearer ${playerCreds.guestToken}` } });
    expect(response.status).toBe(200);
    const replay = ReplayResponse.parse(await response.json());
    for (const payload of [player.rawLog.join("\n"), fresh.rawLog.join("\n"), JSON.stringify(replay)]) {
      expect(payload).not.toContain('"kind":"blocked"');
      expect(payload).not.toContain('"start":7');
    }
  });
});
