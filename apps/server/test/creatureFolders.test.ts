import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BulkDeleteCreaturesResponse, LibraryCreature } from "@vtt/shared";
import { newGuestToken, startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

const newGm = async () => (await server.signUp()).cookie;

const gmFetch = (cookie: string | null, url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  fetch(server.base + url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...init.headers },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

async function create(gm: string, body: object): Promise<LibraryCreature> {
  const res = await gmFetch(gm, "/api/library/creatures", { method: "POST", body });
  expect(res.status).toBe(201);
  return (await res.json()) as LibraryCreature;
}
const list = async (gm: string) => (await (await gmFetch(gm, "/api/library/creatures")).json()) as LibraryCreature[];
const bulkUpdate = (gm: string | null, body: unknown, headers?: Record<string, string>) => gmFetch(gm, "/api/library/creatures/bulk", { method: "PATCH", body, headers });
const bulkDelete = (gm: string | null, body: unknown, headers?: Record<string, string>) => gmFetch(gm, "/api/library/creatures/bulk-delete", { method: "POST", body, headers });
const byName = (creatures: LibraryCreature[]) => Object.fromEntries(creatures.map((c) => [c.name, c]));

describe("creature folders (library-organize, ADR 0075, FR-GM-08)", () => {
  it("saves a folder on create and edit, and reads none for a creature without one", async () => {
    const gm = await newGm();
    const goblin = await create(gm, { name: "Goblin", folder: " Cairnkeepers " });
    expect(goblin.folder).toBe("Cairnkeepers");
    const rubble = await create(gm, { name: "Rubble" });
    expect(rubble.folder).toBeNull();

    const moved = await gmFetch(gm, `/api/library/creatures/${rubble.id}`, { method: "PATCH", body: { folder: "Lanternfall" } });
    expect(await moved.json()).toMatchObject({ name: "Rubble", folder: "Lanternfall" });
    const out = await gmFetch(gm, `/api/library/creatures/${goblin.id}`, { method: "PATCH", body: { folder: null } });
    expect(await out.json()).toMatchObject({ name: "Goblin", folder: null });
    expect(byName(await list(gm))).toMatchObject({ Goblin: { folder: null }, Rubble: { folder: "Lanternfall" } });
  });

  it("refuses a blank or overlong folder and keeps the creature as it was", async () => {
    const gm = await newGm();
    const goblin = await create(gm, { name: "Goblin", folder: "Cairnkeepers" });
    for (const folder of ["  ", "x".repeat(61)]) {
      expect((await gmFetch(gm, "/api/library/creatures", { method: "POST", body: { name: "Orc", folder } })).status).toBe(400);
      expect((await gmFetch(gm, `/api/library/creatures/${goblin.id}`, { method: "PATCH", body: { folder } })).status).toBe(400);
    }
    expect((await list(gm)).map((c) => [c.name, c.folder])).toEqual([["Goblin", "Cairnkeepers"]]);
  });
});

describe("editing several creatures at once (library-organize, ADR 0075, FR-GM-08)", () => {
  it("moves and edits the chosen creatures together and returns them", async () => {
    const gm = await newGm();
    const a = await create(gm, { name: "Mira Hale", ac: 8, maxHp: 10 });
    const b = await create(gm, { name: "Tor Breck", ac: 9, maxHp: 20, size: 2 });
    const c = await create(gm, { name: "Kettle Varga", ac: 10 });

    const res = await bulkUpdate(gm, { ids: [a.id, b.id, a.id], patch: { folder: "Frost Peaks", ac: 12 } });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as LibraryCreature[];
    expect(updated.map((x) => [x.id, x.folder, x.ac])).toEqual([[a.id, "Frost Peaks", 12], [b.id, "Frost Peaks", 12]]);
    expect(JSON.stringify(updated)).not.toContain("ownerGmId");

    // Only the named values change; the rest of each creature is its own.
    expect(byName(await list(gm))).toMatchObject({
      "Mira Hale": { folder: "Frost Peaks", ac: 12, maxHp: 10, size: 1 },
      "Tor Breck": { folder: "Frost Peaks", ac: 12, maxHp: 20, size: 2 },
      "Kettle Varga": { folder: null, ac: 10 },
    });
    expect(c.folder).toBeNull();

    const unfiled = await bulkUpdate(gm, { ids: [a.id, b.id], patch: { folder: null } });
    expect(((await unfiled.json()) as LibraryCreature[]).every((x) => x.folder === null)).toBe(true);
  });

  it("changes none of them when one is another GM's or gone, and answers 404", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const mine = await create(gmA, { name: "Goblin", ac: 15 });
    const theirs = await create(gmB, { name: "Orc", ac: 13 });

    for (const other of [theirs.id, randomUUID()]) {
      const res = await bulkUpdate(gmA, { ids: [mine.id, other], patch: { ac: 1 } });
      expect(res.status).toBe(404);
    }
    expect((await list(gmA))[0]).toMatchObject({ name: "Goblin", ac: 15 });
    expect((await list(gmB))[0]).toMatchObject({ name: "Orc", ac: 13 });
  });

  it("refuses a Max HP below any one's starting HP, changing none of them", async () => {
    const gm = await newGm();
    const healthy = await create(gm, { name: "Ogre", maxHp: 59 });
    const wounded = await create(gm, { name: "Wounded Ogre", hp: 30, maxHp: 59 });
    const res = await bulkUpdate(gm, { ids: [healthy.id, wounded.id], patch: { maxHp: 20 } });
    expect(res.status).toBe(400);
    expect((await list(gm)).map((x) => x.maxHp)).toEqual([59, 59]);
  });

  it("refuses values a bulk edit can't set, an empty change and a bad id", async () => {
    const gm = await newGm();
    const goblin = await create(gm, { name: "Goblin" });
    for (const body of [
      { ids: [goblin.id], patch: { name: "Renamed" } },
      { ids: [goblin.id], patch: {} },
      { ids: [goblin.id], patch: { ac: 120 } },
      { ids: ["goblin"], patch: { ac: 10 } },
      { ids: [], patch: { ac: 10 } },
    ]) {
      expect((await bulkUpdate(gm, body)).status).toBe(400);
    }
    expect((await list(gm))[0]).toMatchObject({ name: "Goblin", ac: null });
  });
});

describe("deleting several creatures at once (library-organize, ADR 0075, FR-GM-08)", () => {
  it("deletes the GM's chosen creatures and skips another GM's or ones already gone", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const a = await create(gmA, { name: "Goblin 2" });
    const b = await create(gmA, { name: "Goblin 10" });
    const keep = await create(gmA, { name: "Ogre" });
    const theirs = await create(gmB, { name: "Orc" });

    const res = await bulkDelete(gmA, { ids: [a.id, b.id, theirs.id, randomUUID(), a.id] });
    expect(res.status).toBe(200);
    expect((await res.json()) as BulkDeleteCreaturesResponse).toEqual({ deleted: 2 });
    expect((await list(gmA)).map((c) => c.id)).toEqual([keep.id]);
    expect((await list(gmB)).map((c) => c.name)).toEqual(["Orc"]);
  });

  it("answers 401 to a room guest credential for both bulk actions", async () => {
    const gm = await newGm();
    const goblin = await create(gm, { name: "Goblin" });
    const guest = { authorization: `Bearer ${newGuestToken()}` };
    expect((await bulkUpdate(null, { ids: [goblin.id], patch: { ac: 1 } }, guest)).status).toBe(401);
    expect((await bulkDelete(null, { ids: [goblin.id] }, guest)).status).toBe(401);
    expect((await list(gm)).map((c) => c.name)).toEqual(["Goblin"]);
  });
});
