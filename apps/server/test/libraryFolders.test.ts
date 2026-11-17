import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AnimationDef, EncounterSummary, LibraryAnimation, LibraryAsset, LibraryCreature, MoveToFolderResponse } from "@vtt/shared";
import { newGuestToken, startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const slash: AnimationDef = { shape: "slash", duration: 0.8, primary: "#ff8800", secondary: "#ffd27a", size: 1, particles: 40, glow: 0.6, shake: 0.3, flash: 0.2 };

const newGm = async () => (await server.signUp()).cookie;

const gmFetch = (cookie: string | null, url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  fetch(server.base + url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...init.headers },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
const json = async <T>(res: Response) => (await res.json()) as T;
const move = (gm: string | null, body: unknown, headers?: Record<string, string>) => gmFetch(gm, "/api/library/move-to-folder", { method: "POST", body, headers });

async function upload(cookie: string, kind: "map" | "token", name: string) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("name", name);
  form.append("width", "256");
  form.append("height", "256");
  form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
  return json<LibraryAsset>(await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: form }));
}

/** A template saved from a room on `map`, as the library makes one (encounter-templates). */
async function template(cookie: string, map: LibraryAsset, name: string) {
  const creds = await server.createRoom("GM", { cookie, roomName: `Prep ${name}` });
  const gm = await server.connect(creds);
  clients.push(gm);
  expect(await gm.command({ type: "scene.setMap", map: { url: map.url, width: map.width, height: map.height, assetId: map.id } })).toMatchObject({ type: "ack" });
  return json<EncounterSummary>(await gmFetch(cookie, "/api/library/encounters", { method: "POST", body: { roomId: creds.roomId, name } }));
}

const assets = (gm: string) => gmFetch(gm, "/api/library").then((r) => json<LibraryAsset[]>(r));
const folderOf = <T extends { id: string; folder?: string | null }>(list: T[], id: string) => list.find((x) => x.id === id)?.folder;

describe("library folders for every kind (library-organize, ADR 0075, FR-GM-08, FR-GM-13)", () => {
  it("files maps, token art, creatures, templates and animations, and reads them back", async () => {
    const gm = await newGm();
    const map = await upload(gm, "map", "Crypt");
    const art = await upload(gm, "token", "Goblin art");
    const goblin = await json<LibraryCreature>(await gmFetch(gm, "/api/library/creatures", { method: "POST", body: { name: "Goblin" } }));
    const ambush = await template(gm, map, "Ambush");
    const fire = await json<LibraryAnimation>(await gmFetch(gm, "/api/library/animations", { method: "POST", body: { name: "Fire", def: slash } }));
    // Nothing saved before has a folder.
    expect([map.folder, art.folder, goblin.folder, ambush.folder, fire.folder]).toEqual([null, null, null, null, null]);

    for (const [kind, id] of [["asset", map.id], ["asset", art.id], ["creature", goblin.id], ["encounter", ambush.id], ["animation", fire.id]] as const) {
      const res = await move(gm, { kind, ids: [id], folder: " Cairnkeepers " });
      expect(res.status).toBe(200);
      expect(await json<MoveToFolderResponse>(res)).toEqual({ moved: 1 });
    }

    expect(folderOf(await assets(gm), map.id)).toBe("Cairnkeepers");
    expect(folderOf(await assets(gm), art.id)).toBe("Cairnkeepers");
    expect(folderOf(await json<LibraryCreature[]>(await gmFetch(gm, "/api/library/creatures")), goblin.id)).toBe("Cairnkeepers");
    const templates = await json<EncounterSummary[]>(await gmFetch(gm, "/api/library/encounters"));
    expect(folderOf(templates, ambush.id)).toBe("Cairnkeepers");
    // Filing is not a save: the template keeps its place in "newest first".
    expect(templates.find((e) => e.id === ambush.id)?.updatedAt).toBe(ambush.updatedAt);
    expect(folderOf(await json<LibraryAnimation[]>(await gmFetch(gm, "/api/library/animations")), fire.id)).toBe("Cairnkeepers");

    // Renaming keeps the folder; moving to null takes it out.
    const renamed = await json<LibraryAsset>(await gmFetch(gm, `/api/library/${map.id}`, { method: "PATCH", body: { name: "Old crypt" } }));
    expect(renamed.folder).toBe("Cairnkeepers");
    expect((await move(gm, { kind: "asset", ids: [map.id], folder: null })).status).toBe(200);
    expect(folderOf(await assets(gm), map.id)).toBeNull();
  });

  it("moves all of them or none: another GM's id, a missing one or the wrong kind answers 404", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const mine = await upload(gmA, "map", "Crypt");
    const theirs = await upload(gmB, "map", "Tower");
    const goblin = await json<LibraryCreature>(await gmFetch(gmA, "/api/library/creatures", { method: "POST", body: { name: "Goblin" } }));

    for (const ids of [[mine.id, theirs.id], [mine.id, randomUUID()], [mine.id, goblin.id]]) {
      const res = await move(gmA, { kind: "asset", ids, folder: "Stolen" });
      expect(res.status).toBe(404);
    }
    expect(folderOf(await assets(gmA), mine.id)).toBeNull();
    expect(folderOf(await assets(gmB), theirs.id)).toBeNull();
  });

  it("refuses a blank or overlong folder, an unknown kind and a room guest", async () => {
    const gm = await newGm();
    const map = await upload(gm, "map", "Crypt");
    for (const body of [
      { kind: "asset", ids: [map.id], folder: "  " },
      { kind: "asset", ids: [map.id], folder: "x".repeat(61) },
      { kind: "dice", ids: [map.id], folder: "A" },
      { kind: "asset", ids: [], folder: "A" },
      { kind: "asset", ids: [map.id] },
    ]) {
      expect((await move(gm, body)).status).toBe(400);
    }
    expect((await move(null, { kind: "asset", ids: [map.id], folder: "A" }, { authorization: `Bearer ${newGuestToken()}` })).status).toBe(401);
    expect(folderOf(await assets(gm), map.id)).toBeNull();
  });
});
