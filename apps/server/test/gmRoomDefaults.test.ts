import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILTIN_ROOM_DEFAULTS, DEFAULT_GRID, defeatRemovalOf, diagonalRuleOf, difficultTerrainOf,
  type DomainEvent, type EncounterSummary, type LibraryAsset, type RoomDefaults,
} from "@vtt/shared";
import { startServer, type HttpAccount, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

const mine: RoomDefaults = {
  defeatRemoval: "npc",
  hideMapWithoutToken: false,
  hideHp: true,
  hideAc: true,
  diagonalRule: "euclidean",
  difficultTerrain: "exit",
  unitsPerCell: 1.5,
  unitLabel: "m",
};

/** Events that would have changed a rule or the grid after the room was made. */
const RULE_EVENTS = new Set<DomainEvent["type"]>([
  "DefeatRemovalSet", "HideMapWithoutTokenSet", "HideHpSet", "HideAcSet", "DiagonalRuleSet", "DifficultTerrainSet", "GridSet",
]);

const settings = (who: HttpAccount) => who.json<RoomDefaults>("GET", "/api/gm/settings");
const save = (who: HttpAccount, body: unknown) => who.request("PUT", "/api/gm/settings", body);

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

describe("a GM's room defaults over HTTP (gm-room-defaults)", () => {
  it("reads the built-ins until saved, then the saved defaults on every device", async () => {
    const laptop = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    expect(await settings(laptop)).toEqual(BUILTIN_ROOM_DEFAULTS);
    expect((await save(laptop, mine)).status).toBe(200);
    const phone = await server.signIn("kim@example.com", "correct horse");
    expect(await settings(phone)).toEqual(mine);
  });

  it("gives each GM only their own", async () => {
    const kim = await server.signUp();
    const sam = await server.signUp();
    await save(kim, mine);
    expect(await settings(sam)).toEqual(BUILTIN_ROOM_DEFAULTS);
  });

  it("refuses a request without an account", async () => {
    const nobody = server.anonymous();
    expect((await nobody.request("GET", "/api/gm/settings")).status).toBe(401);
    expect((await nobody.request("PUT", "/api/gm/settings", mine)).status).toBe(401);
  });

  it.each([
    ["an unknown diagonal rule", { diagonalRule: "hex" }],
    ["a negative distance per square", { unitsPerCell: -5 }],
    ["an empty unit label", { unitLabel: "" }],
  ])("refuses %s and keeps what was saved", async (_name, change) => {
    const kim = await server.signUp();
    await save(kim, mine);
    expect((await save(kim, { ...mine, ...change })).status).toBe(400);
    expect(await settings(kim)).toEqual(mine);
  });
});

describe("a new room starts with its GM's defaults (gm-room-defaults, table-rules)", () => {
  it("starts with every rule and the grid units, with no rule events", async () => {
    const kim = await server.signUp();
    await save(kim, mine);
    const creds = await server.createRoom("GM", { cookie: kim.cookie });
    const events = (await server.store.loadEvents(creds.roomId)).map((e) => e.event);
    expect(events[0]).toMatchObject({ type: "RoomCreated", defaults: mine });
    expect(events.filter((e) => RULE_EVENTS.has(e.type))).toEqual([]);

    const gm = await connect(creds);
    expect(defeatRemovalOf(gm.state)).toBe("npc");
    expect(gm.state.hideHp).toBe(true);
    expect(gm.state.hideAc).toBe(true);
    expect(diagonalRuleOf(gm.state)).toBe("euclidean");
    expect(difficultTerrainOf(gm.state)).toBe("exit");
    expect(gm.state.scene.grid).toMatchObject({ unitsPerCell: 1.5, unitLabel: "m" });

    const alice = await connect(await server.join(creds.inviteCode, "Alice"));
    expect(diagonalRuleOf(alice.state)).toBe("euclidean");
    expect(alice.state.scene.grid.unitLabel).toBe("m");
  });

  it("starts a room from an encounter template with them too", async () => {
    const kim = await server.signUp();
    const map = await uploadMap(kim);
    const prepCreds = await server.createRoom("GM", { cookie: kim.cookie, roomName: "Prep" });
    const prep = await connect(prepCreds);
    await prep.command({ type: "scene.setMap", map: { url: map.url, width: map.width, height: map.height, assetId: map.id } });
    await prep.command({ type: "token.create", name: "Goblin", position: { x: 105, y: 105 } });
    const template = await kim.json<EncounterSummary>("POST", "/api/library/encounters", { roomId: prepCreds.roomId, name: "Ambush" });

    await save(kim, mine);
    const created = await kim.json<{ roomId: string; inviteCode: string; participantId: string }>("POST", "/api/rooms", {
      roomName: "Next session", displayName: "GM", guestToken: server.newGuestToken(), templateId: template.id,
    });
    const events = (await server.store.loadEvents(created.roomId)).map((e) => e.event);
    expect(events[0]).toMatchObject({ type: "RoomCreated", defaults: mine });
    expect(events.filter((e) => RULE_EVENTS.has(e.type))).toEqual([]);
    const applied = events.find((e) => e.type === "EncounterApplied") as Extract<DomainEvent, { type: "EncounterApplied" }>;
    expect(applied.applied.scene.grid).toMatchObject({ unitsPerCell: 1.5, unitLabel: "m" });
  });

  it("starts exactly as before for a GM who never saved defaults", async () => {
    const creds = await server.createRoom();
    const events = (await server.store.loadEvents(creds.roomId)).map((e) => e.event);
    expect(events[0]).toEqual({ type: "RoomCreated", name: "Test", preset: "free" });
    expect(events.map((e) => e.type)).toEqual(["RoomCreated", "ParticipantJoined"]);
    const gm = await connect(creds);
    expect(gm.state.scene.grid).toEqual(DEFAULT_GRID);
    expect(diagonalRuleOf(gm.state)).toBe("equal");
  });

  it("never changes a room that already exists", async () => {
    const kim = await server.signUp();
    const creds = await server.createRoom("GM", { cookie: kim.cookie });
    await save(kim, { ...BUILTIN_ROOM_DEFAULTS, diagonalRule: "alternating" });
    const later = await server.createRoom("GM", { cookie: kim.cookie });
    expect(diagonalRuleOf((await connect(creds)).state)).toBe("equal");
    expect(diagonalRuleOf((await connect(later)).state)).toBe("alternating");
  });
});

const PNG = await sharp({ create: { width: 256, height: 256, channels: 3, background: "#334455" } }).png().toBuffer();

async function uploadMap(who: HttpAccount) {
  const form = new FormData();
  form.append("kind", "map");
  form.append("name", "Cave");
  form.append("width", "256");
  form.append("height", "256");
  form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
  const res = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie: who.cookie }, body: form });
  return (await res.json()) as LibraryAsset;
}
