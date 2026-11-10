import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../src/domain/credentials";
import type { Detector } from "../src/domain/gridDetection";
import type { BuildFileRecord } from "../src/store/buildStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type HttpAccount } from "./helpers";

let store: MemoryRoomStore;
let server: Awaited<ReturnType<typeof startServer>>;
let clock: number;

const detector: Detector = async () => ({ status: "suggested", candidate: { cellSize: 70, offsetX: 0, offsetY: 0, confidence: 0.9 } as never });

beforeEach(async () => {
  store = new MemoryRoomStore();
  clock = Date.now();
  server = await startServer(store, { now: () => clock, detector });
});
afterEach(() => server.close());

interface Started { account: HttpAccount; id: string; pass: string }

async function start(account?: HttpAccount, name = "Hollow Coast"): Promise<Started> {
  const owner = account ?? await server.signUp({ displayName: "Vincent" });
  const res = await owner.request("POST", "/api/builds", { name });
  expect(res.status).toBe(201);
  const body = await res.json() as { build: { id: string }; pass: string };
  return { account: owner, id: body.build.id, pass: body.pass };
}

const withPass = (pass: string, method: string, url: string, body?: unknown) => fetch(server.base + url, {
  method,
  headers: { authorization: `Bearer ${pass}`, ...(body !== undefined && { "content-type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const png = (width = 64, height = 64) => sharp({ create: { width, height, channels: 3, background: "#884422" } }).png().toBuffer();

function form(data: Uint8Array | string, name: string, type: string) {
  const body = new FormData();
  body.append("file", new Blob([typeof data === "string" ? data : Buffer.from(data)], { type }), name);
  return body;
}

const send = (pass: string, kind: string, body: FormData) =>
  fetch(`${server.base}/api/build/current/files?kind=${kind}`, { method: "POST", headers: { authorization: `Bearer ${pass}` }, body });

const uploadToken = async (pass: string, name = "goblin.png") => {
  const res = await send(pass, "token", form(await png(), name, "image/png"));
  expect(res.status).toBe(201);
  return (await res.json() as { file: { id: string; name: string; width: number } }).file;
};

const uploadMap = async (pass: string, width = 700, height = 700) => {
  const res = await send(pass, "map", form(await png(width, height), "cave.png", "image/png"));
  expect(res.status).toBe(201);
  return (await res.json() as { file: { id: string } }).file;
};

const uvtt = async () => JSON.stringify({
  format: 0.3,
  image: (await png(400, 300)).toString("base64"),
  resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
  line_of_sight: [[{ x: 1, y: 1 }, { x: 5, y: 1 }]],
  portals: [],
});

const storedFiles = async () => (await readdir(server.uploadDir).catch(() => [])).length;

const seedFile = (buildId: string, over: Partial<BuildFileRecord> = {}): BuildFileRecord => {
  const id = randomUUID();
  return {
    id, buildId, kind: "token", objectKey: `${id}.webp`, url: `/uploads/${id}.webp`, originalName: "x.png", width: 1, height: 1, sizeBytes: 1,
    grid: null, board: null, sourceHash: null, detectionSourceHash: null, detectionVersion: null, detectionError: null, detectionStatus: null,
    detectionAttempt: 0, detectionResult: null, detectionUpdatedAt: null, publishedAssetId: null, createdAt: new Date().toISOString(), ...over,
  };
};
const SEED_LIMITS = { files: 1000, maps: 1000, bytes: Number.MAX_SAFE_INTEGER };

describe("starting a build (FR-GM-26)", () => {
  it("refuses a signed-out visitor and creates nothing", async () => {
    const res = await server.anonymous().request("POST", "/api/builds", { name: "X" });
    expect(res.status).toBe(401);
  });

  it("makes a private draft and shows its pass", async () => {
    const { id, pass, account } = await start();
    expect(pass).toMatch(/^szb_[A-Za-z0-9_-]{43}$/);
    const list = await account.json<{ id: string; name: string }[]>("GET", "/api/builds");
    expect(list).toMatchObject([{ id, name: "Hollow Coast" }]);
  });

  it("shows the pass once, and stores only its hash", async () => {
    const { id, pass, account } = await start();
    const read = await account.request("GET", `/api/builds/${id}`);
    expect(await read.text()).not.toContain(pass);
    const stored = await store.findBuild(id, account.view!.id === "" ? "" : (await store.findUserById(account.view!.id))!.ownerId);
    expect(stored?.passHash).toBe(hashToken(pass));
    expect(JSON.stringify(stored)).not.toContain(pass);
  });

  it("gives another account a 404", async () => {
    const { id } = await start();
    const other = await server.signUp();
    expect((await other.request("GET", `/api/builds/${id}`)).status).toBe(404);
    expect((await other.request("POST", `/api/builds/${id}/pass`)).status).toBe(404);
    expect((await other.request("DELETE", `/api/builds/${id}/pass`)).status).toBe(404);
  });

  it("allows 3 open builds", async () => {
    const { account } = await start();
    await start(account);
    await start(account);
    const res = await account.request("POST", "/api/builds", { name: "Fourth" });
    expect(res.status).toBe(409);
    expect(await res.text()).toMatch(/finish or discard/i);
  });

  it("needs a name", async () => {
    const account = await server.signUp();
    expect((await account.request("POST", "/api/builds", { name: "  " })).status).toBe(400);
  });

  it("refuses a request from another site", async () => {
    const account = await server.signUp();
    const res = await account.request("POST", "/api/builds", { name: "X" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });
});

describe("what a pass can reach (FR-GM-26, ADR 0053)", () => {
  it("reads its own build, by id or as current, and names whose it is", async () => {
    const { id, pass } = await start();
    for (const ref of [id, "current"]) {
      const res = await withPass(pass, "GET", `/api/build/${ref}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ build: { id, name: "Hollow Coast" }, ownerName: "Vincent" });
    }
  });

  it("never returns the stored hash", async () => {
    const { pass } = await start();
    const text = await (await withPass(pass, "GET", "/api/build/current")).text();
    expect(text).not.toContain(hashToken(pass));
    expect(text).not.toMatch(/passHash|ownerGmId/);
  });

  it("reads another build, on any account, exactly as one that doesn't exist", async () => {
    const mine = await start();
    const sibling = await start(mine.account, "Second");
    const stranger = await start();
    const missing = await withPass(mine.pass, "GET", `/api/build/${randomUUID()}`);
    for (const id of [sibling.id, stranger.id]) {
      const res = await withPass(mine.pass, "GET", `/api/build/${id}`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(await missing.clone().text());
    }
  });

  it("isn't accepted by any existing route: the answer is exactly as with no credential", async () => {
    const { pass, account } = await start();
    const room = await server.createRoom("GM", { cookie: account.cookie });
    const routes: [string, string, unknown?][] = [
      ["GET", "/api/library"], ["GET", "/api/library/creatures"], ["GET", "/api/library/encounters"], ["GET", "/api/gm/rooms"], ["GET", "/api/me/rooms"],
      ["GET", "/api/auth/me"], ["POST", "/api/auth/password", { currentPassword: "x", newPassword: "y".repeat(12) }], ["POST", "/api/rooms", { roomName: "R", displayName: "D", guestToken: "a".repeat(32) }],
      ["GET", `/api/rooms/${room.roomId}/invite`], ["GET", `/api/rooms/${room.roomId}/history`], ["POST", `/api/rooms/${room.roomId}/seat`, { guestToken: "a".repeat(32) }],
      ["POST", "/api/library/uvtt/imports", {}], ["POST", "/api/uploads", {}], ["DELETE", `/api/rooms/${room.roomId}`],
    ];
    for (const [method, url, body] of routes) {
      const anon = await server.anonymous().request(method, url, body);
      const carrying = await withPass(pass, method, url, body);
      expect(`${method} ${url} ${carrying.status}`).toBe(`${method} ${url} ${anon.status}`);
      expect(await carrying.text()).toBe(await anon.text());
    }
  });

  it("is refused as a credential on the owner's own build routes", async () => {
    const { pass, id } = await start();
    for (const [method, url] of [["GET", `/api/builds/${id}`], ["POST", `/api/builds/${id}/pass`], ["DELETE", `/api/builds/${id}/pass`], ["GET", "/api/builds"]] as const) {
      expect((await withPass(pass, method, url)).status).toBe(401);
    }
  });

  it("can't open a room socket", async () => {
    const { pass, account } = await start();
    const room = await server.createRoom("GM", { cookie: account.cookie });
    await expect(server.connect({ roomId: room.roomId, guestToken: pass })).rejects.toThrow();
  });

  it("the session cookie doesn't work on pass routes", async () => {
    const { account } = await start();
    expect((await account.request("GET", "/api/build/current")).status).toBe(401);
  });

  it("refuses no credential, a malformed one and a seat value", async () => {
    await start();
    expect((await fetch(`${server.base}/api/build/current`)).status).toBe(401);
    expect((await withPass("szb_short", "GET", "/api/build/current")).status).toBe(401);
    expect((await withPass(`${randomUUID()}.${"a".repeat(43)}`, "GET", "/api/build/current")).status).toBe(401);
  });

  it("expires after 24 hours, with a message about making a new one", async () => {
    const { pass } = await start();
    clock += 24 * 60 * 60_000 - 1000;
    expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(200);
    clock += 2000;
    const res = await withPass(pass, "GET", "/api/build/current");
    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/expired.*new one/i);
  });

  it("a new pass ends the old one", async () => {
    const { pass, id, account } = await start();
    const { pass: next } = await account.json<{ pass: string }>("POST", `/api/builds/${id}/pass`);
    expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(401);
    expect((await withPass(next, "GET", "/api/build/current")).status).toBe(200);
  });

  it("can be cancelled at once", async () => {
    const { pass, id, account } = await start();
    expect((await account.request("DELETE", `/api/builds/${id}/pass`)).status).toBe(204);
    expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(401);
  });

  it("stops at 120 requests a minute, with a retry time", async () => {
    const { pass } = await start();
    for (let i = 0; i < 120; i++) expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(200);
    const res = await withPass(pass, "GET", "/api/build/current");
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    clock += 61_000;
    expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(200);
  });

  it("starts refusing an address that keeps sending invalid passes", async () => {
    for (let i = 0; i < 60; i++) expect((await withPass(`szb_${"a".repeat(43)}`, "GET", "/api/build/current")).status).toBe(401);
    expect((await withPass(`szb_${"a".repeat(43)}`, "GET", "/api/build/current")).status).toBe(429);
  });

  it("working requests don't count as guesses", async () => {
    const { pass } = await start();
    for (let i = 0; i < 70; i++) await withPass(pass, "GET", "/api/build/current");
    expect((await withPass(`szb_${"b".repeat(43)}`, "GET", "/api/build/current")).status).toBe(401);
  });

  it("ends every pass on the account when the password changes", async () => {
    const account = await server.signUp({ password: "correct horse battery" });
    const [a, b] = [await start(account), await start(account)];
    const res = await account.request("POST", "/api/auth/password", { currentPassword: "correct horse battery", newPassword: "a new long password" });
    expect(res.status).toBe(204);
    expect((await withPass(a.pass, "GET", "/api/build/current")).status).toBe(401);
    expect((await withPass(b.pass, "GET", "/api/build/current")).status).toBe(401);
  });

  it("is gone with the account, along with the build's stored files (ADR 0050)", async () => {
    const account = await server.signUp({ password: "correct horse battery" });
    const { pass, id } = await start(account);
    await uploadToken(pass);
    expect(await storedFiles()).toBe(1);
    const res = await account.request("DELETE", "/api/auth/account", { password: "correct horse battery" });
    expect(res.status).toBe(204);
    expect((await withPass(pass, "GET", "/api/build/current")).status).toBe(401);
    expect(await store.listBuildFiles(id)).toEqual([]);
    expect(await storedFiles()).toBe(0);
  });
});

describe("files in a build (FR-GM-26)", () => {
  it("takes an image by pass and lists it under its own name", async () => {
    const { pass } = await start();
    const file = await uploadToken(pass, "goblin.png");
    expect(file).toMatchObject({ name: "goblin.png", width: 64 });
    const read = await (await withPass(pass, "GET", "/api/build/current")).json() as { files: { id: string; name: string }[] };
    expect(read.files).toMatchObject([{ id: file.id, name: "goblin.png" }]);
  });

  it("takes a dropped image by cookie, and the AI sees it", async () => {
    const { id, pass, account } = await start();
    const res = await fetch(`${server.base}/api/builds/${id}/files?kind=token`, {
      method: "POST", headers: { cookie: account.cookie }, body: form(await png(), "IMG_2231.jpg", "image/png"),
    });
    expect(res.status).toBe(201);
    const read = await (await withPass(pass, "GET", "/api/build/current")).json() as { files: { name: string }[] };
    expect(read.files[0]?.name).toBe("IMG_2231.jpg");
  });

  it("refuses a dropped file from another site", async () => {
    const { id, account } = await start();
    const res = await fetch(`${server.base}/api/builds/${id}/files?kind=token`, {
      method: "POST", headers: { cookie: account.cookie, origin: "https://evil.example" }, body: form(await png(), "a.png", "image/png"),
    });
    expect(res.status).toBe(403);
  });

  it("doesn't show the AI where a file is stored", async () => {
    const { pass } = await start();
    await uploadToken(pass);
    expect(await (await withPass(pass, "GET", "/api/build/current")).text()).not.toMatch(/uploads\/|objectKey|"url"/);
  });

  it("the owner's page does get the address", async () => {
    const { id, pass, account } = await start();
    await uploadToken(pass);
    const read = await account.json<{ files: { url: string }[] }>("GET", `/api/builds/${id}`);
    expect(read.files[0]?.url).toMatch(/^\/uploads\//);
  });

  it("needs to be told what the file is", async () => {
    const { pass } = await start();
    const res = await fetch(`${server.base}/api/build/current/files`, { method: "POST", headers: { authorization: `Bearer ${pass}` }, body: form(await png(), "a.png", "image/png") });
    expect(res.status).toBe(400);
  });

  it("refuses a PDF, and says the rules stay in the AI app", async () => {
    const { pass } = await start();
    const res = await send(pass, "token", form("%PDF-1.7 rules", "rules.pdf", "application/pdf"));
    expect(res.status).toBe(415);
    expect(await res.text()).toMatch(/stay in your AI app/i);
    expect(await storedFiles()).toBe(0);
  });

  it.each([
    ["an SVG", "<svg xmlns='http://www.w3.org/2000/svg'/>"],
    ["HTML", "<html><script>alert(1)</script></html>"],
    ["a PDF", "%PDF-1.7 rules"],
  ])("refuses %s named goblin.png", async (_label, content) => {
    const { pass } = await start();
    const res = await send(pass, "token", form(content, "goblin.png", "image/png"));
    expect(res.status).toBe(415);
    expect(await storedFiles()).toBe(0);
  });

  it("records the real size whatever is claimed", async () => {
    const { pass } = await start();
    const body = form(await png(32, 16), "a.png", "image/png");
    body.set("width", "9999");
    const res = await send(pass, "token", body);
    expect(await res.json()).toMatchObject({ file: { width: 32, height: 16 } });
  });

  it("refuses an image over 25 MiB", async () => {
    const { pass } = await start();
    const res = await send(pass, "token", form(new Uint8Array(30 * 1024 ** 2), "big.png", "image/png"));
    expect(res.status).toBe(413);
    expect(await storedFiles()).toBe(0);
  });

  it("takes a UVTT file with its grid and walls", async () => {
    const { pass } = await start();
    const res = await send(pass, "uvtt", form(await uvtt(), "crypt.uvtt", "application/json"));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ file: { kind: "map", name: "crypt.uvtt", fromUvtt: true, width: 400, grid: { cellSize: 50 }, walls: 1 } });
  });

  it("refuses a broken UVTT file with its diagnostics", async () => {
    const { pass } = await start();
    const res = await send(pass, "uvtt", form("{ not json", "bad.uvtt", "application/json"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ issues: expect.any(Array) });
    expect(await storedFiles()).toBe(0);
  });

  it("refuses a non-UVTT file sent as UVTT", async () => {
    const { pass } = await start();
    expect((await send(pass, "uvtt", form("%PDF", "rules.pdf", "application/pdf"))).status).toBe(415);
  });

  it("stops at 100 files", async () => {
    const { pass, id } = await start();
    for (let i = 0; i < 100; i++) await store.addBuildFile(seedFile(id), SEED_LIMITS);
    expect((await send(pass, "token", form(await png(), "a.png", "image/png"))).status).toBe(409);
    expect(await storedFiles()).toBe(0);
  });

  it("stops at 20 maps, but still takes token art", async () => {
    const { pass, id } = await start();
    for (let i = 0; i < 20; i++) await store.addBuildFile(seedFile(id, { kind: "map" }), SEED_LIMITS);
    expect((await send(pass, "map", form(await png(), "a.png", "image/png"))).status).toBe(409);
    expect((await send(pass, "uvtt", form(await uvtt(), "a.uvtt", "application/json"))).status).toBe(409);
    expect((await send(pass, "token", form(await png(), "a.png", "image/png"))).status).toBe(201);
  });

  it("stops at 500 MiB and removes what it had stored", async () => {
    const { pass, id } = await start();
    await store.addBuildFile(seedFile(id, { sizeBytes: 500 * 1024 ** 2 }), SEED_LIMITS);
    expect((await send(pass, "token", form(await png(), "a.png", "image/png"))).status).toBe(409);
    expect(await storedFiles()).toBe(0);
  });

  it("shares the account's upload budget with a retry time", async () => {
    const { pass, account } = await start();
    const ownerId = (await store.findUserById(account.view!.id))!.ownerId;
    for (let i = 0; i < 300; i++) server.app.limits.uploadsPerOwner.hit(`upload:${ownerId}`);
    const res = await send(pass, "token", form(await png(), "a.png", "image/png"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await storedFiles()).toBe(0);
  });

  it("doesn't let refused uploads use up the account's budget, so a pass can't block the owner's uploads", async () => {
    const { pass, account } = await start();
    const ownerId = (await store.findUserById(account.view!.id))!.ownerId;
    for (let i = 0; i < 299; i++) server.app.limits.uploadsPerOwner.hit(`upload:${ownerId}`);
    expect((await send(pass, "token", form("%PDF-1.7", "rules.pdf", "application/pdf"))).status).toBe(415);
    expect((await send(pass, "token", form("%PDF-1.7", "rules.pdf", "application/pdf"))).status).toBe(415);
    expect((await send(pass, "token", form(await png(), "a.png", "image/png"))).status).toBe(201);
    expect((await send(pass, "token", form(await png(), "b.png", "image/png"))).status).toBe(429);
  });

  it("goes by a file's bytes, not its declared type, as curl often sends a generic one", async () => {
    const { pass } = await start();
    const webp = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#884422" } }).webp().toBuffer();
    const res = await send(pass, "token", form(webp, "goblin.webp", "application/octet-stream"));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ file: { name: "goblin.webp", width: 32 } });
    expect((await readdir(server.uploadDir)).every((f) => f.endsWith(".webp"))).toBe(true);
  });

  it("still refuses a non-image with a generic declared type, leaving nothing behind", async () => {
    const { pass } = await start();
    expect((await send(pass, "token", form("%PDF-1.7 rules", "rules.bin", "application/octet-stream"))).status).toBe(415);
    expect(await storedFiles()).toBe(0);
  });

  it("queues grid detection on a plain map, and the AI can read the suggestion", async () => {
    const { pass } = await start();
    await uploadMap(pass);
    let detection: unknown = null;
    for (let i = 0; i < 100 && !detection; i++) {
      const read = await (await withPass(pass, "GET", "/api/build/current")).json() as { files: { detection: { status: string; suggestion: unknown } | null }[] };
      if (read.files[0]?.detection?.status === "suggested") detection = read.files[0].detection;
      else await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(detection).toMatchObject({ status: "suggested", suggestion: { cellSize: 70 } });
  });

  it("doesn't queue detection on token art", async () => {
    const { pass } = await start();
    await uploadToken(pass);
    const read = await (await withPass(pass, "GET", "/api/build/current")).json() as { files: { detection: unknown }[] };
    expect(read.files[0]?.detection).toBeNull();
  });
});

describe("a small copy of a file (FR-GM-26)", () => {
  it("is at most 1500 pixels on a side", async () => {
    const { pass } = await start();
    const res = await send(pass, "map", form(await png(3000, 1500), "big.png", "image/png"));
    const { file } = await res.json() as { file: { id: string } };
    const preview = await withPass(pass, "GET", `/api/build/current/files/${file.id}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toContain("image/webp");
    const { width, height } = await sharp(Buffer.from(await preview.arrayBuffer())).metadata();
    expect([width, height]).toEqual([1500, 750]);
  });

  it("doesn't enlarge a small picture", async () => {
    const { pass } = await start();
    const file = await uploadToken(pass);
    const preview = await withPass(pass, "GET", `/api/build/current/files/${file.id}/preview`);
    expect((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width).toBe(64);
  });

  it("reports no such file for one from another build", async () => {
    const mine = await start();
    const other = await start();
    const file = await uploadToken(other.pass);
    expect((await withPass(mine.pass, "GET", `/api/build/current/files/${file.id}/preview`)).status).toBe(404);
    expect((await withPass(mine.pass, "GET", "/api/build/current/files/not-a-uuid/preview")).status).toBe(404);
  });
});

describe("draft items (FR-GM-26)", () => {
  const save = async (pass: string, creatures: unknown[]) =>
    (await (await withPass(pass, "POST", "/api/build/current/creatures", { creatures })).json()) as { results: { key: string; saved: boolean; error?: string; problems?: string[] }[] };
  const goblin = (over: Record<string, unknown> = {}) => ({ key: "goblin", name: "Goblin", isPlayerCharacter: false, hp: 7, maxHp: 7, ac: 13, ...over });
  const items = async (pass: string) => (await (await withPass(pass, "GET", "/api/build/current")).json() as { items: { kind: string; key: string; data: Record<string, unknown> }[] }).items;
  const check = async (pass: string) => (await (await withPass(pass, "GET", "/api/build/current/check")).json() as { issues: { type: string; item: string; message: string }[] }).issues;

  async function withMap(pass: string, proposedGrid: unknown = { cellSize: 70, offsetX: 0, offsetY: 0 }) {
    const file = await uploadMap(pass);
    const res = await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId: file.id, proposedGrid });
    expect(res.status).toBe(200);
    await save(pass, [goblin()]);
  }
  const encounter = (tokens: unknown[], over: Record<string, unknown> = {}) => ({ key: "ambush", name: "Ambush", mapKey: "cave", tokens, ...over });
  const token = (over: Record<string, unknown> = {}) => ({ creatureKey: "goblin", square: { column: 1, row: 1 }, hidden: true, ...over });
  const saveEncounter = (pass: string, body: unknown) => withPass(pass, "POST", "/api/build/current/encounters", body);

  it("saves a creature with its values", async () => {
    const { pass } = await start();
    expect((await save(pass, [goblin({ hp: 24, maxHp: 24, ac: 15 })])).results).toMatchObject([{ key: "goblin", saved: true }]);
    expect((await items(pass))[0]).toMatchObject({ kind: "creature", key: "goblin", data: { hp: 24, maxHp: 24, ac: 15 } });
  });

  it("saves the good creatures and refuses the bad, naming the field", async () => {
    const { pass } = await start();
    const { results } = await save(pass, [
      goblin({ key: "a" }),
      goblin({ key: "b", maxHp: 20000 }),
      goblin({ key: "c", attacks: [{ name: "Bite", toHit: null, damage: { count: 1, sides: 7, modifier: 0 } }] }),
      goblin({ key: "d" }),
    ]);
    expect(results.map((r) => r.saved)).toEqual([true, false, false, true]);
    expect(results[1]?.error).toContain("maxHp");
    expect(results[2]?.error).toContain("d7");
    expect((await items(pass)).map((i) => i.key)).toEqual(["a", "d"]);
  });

  it("a repeated save leaves one item with the later values", async () => {
    const { pass } = await start();
    await save(pass, [goblin({ hp: 1, maxHp: 1 })]);
    await save(pass, [goblin({ hp: 9, maxHp: 9 })]);
    expect(await items(pass)).toMatchObject([{ key: "goblin", data: { hp: 9 } }]);
  });

  it("limits how many creatures one call may send", async () => {
    const { pass } = await start();
    const res = await withPass(pass, "POST", "/api/build/current/creatures", { creatures: Array.from({ length: 21 }, (_, i) => goblin({ key: `g${i}` })) });
    expect(res.status).toBe(422);
  });

  it("takes art only from this build's own token files", async () => {
    const mine = await start();
    const other = await start();
    const theirs = await uploadToken(other.pass);
    const mineArt = await uploadToken(mine.pass);
    expect((await save(mine.pass, [goblin({ imageFileId: theirs.id })])).results[0]).toMatchObject({ saved: false, error: expect.stringContaining("imageFileId") });
    expect((await save(mine.pass, [goblin({ imageFileId: mineArt.id })])).results[0]?.saved).toBe(true);
  });

  it("saves a player character with a blank AC but reports it", async () => {
    const { pass } = await start();
    const { results } = await save(pass, [goblin({ isPlayerCharacter: true, ac: null })]);
    expect(results[0]).toMatchObject({ saved: true, problems: [expect.stringContaining("AC")] });
  });

  it("doesn't report a blank that carries a flag", async () => {
    const { pass } = await start();
    const { results } = await save(pass, [goblin({ isPlayerCharacter: true, ac: null, flags: [{ field: "ac", message: 'Sheet says "around 14 maybe"' }] })]);
    expect(results[0]?.problems).toEqual([]);
  });

  it("doesn't report blank AC in a game with no AC", async () => {
    const { pass } = await start();
    await withPass(pass, "PUT", "/api/build/current/profile", { name: "No armour", features: { hitPoints: true, armorClass: false, attacks: true, conditions: true } });
    expect((await save(pass, [goblin({ isPlayerCharacter: true, ac: null })])).results[0]?.problems).toEqual([]);
  });

  it("refuses to overwrite what the user edited", async () => {
    const { pass, id } = await start();
    await save(pass, [goblin()]);
    await store.markBuildItem(id, "creature", "goblin", { editedByUser: true });
    const { results } = await save(pass, [goblin({ hp: 1, maxHp: 1 })]);
    expect(results[0]).toMatchObject({ saved: false, error: expect.stringMatching(/user changed/i) });
    expect((await withPass(pass, "DELETE", "/api/build/current/items/creature/goblin")).status).toBe(409);
    expect((await items(pass))[0]?.data).toMatchObject({ hp: 7 });
  });

  it("refuses to change or remove what was published", async () => {
    const { pass, id } = await start();
    await save(pass, [goblin()]);
    await store.markBuildItem(id, "creature", "goblin", { publishedId: randomUUID() });
    expect((await save(pass, [goblin()])).results[0]).toMatchObject({ saved: false, error: expect.stringMatching(/published/i) });
    expect((await withPass(pass, "DELETE", "/api/build/current/items/creature/goblin")).status).toBe(409);
  });

  it("removes a draft item", async () => {
    const { pass } = await start();
    await save(pass, [goblin()]);
    expect((await withPass(pass, "DELETE", "/api/build/current/items/creature/goblin")).status).toBe(204);
    expect((await withPass(pass, "DELETE", "/api/build/current/items/creature/goblin")).status).toBe(404);
    expect(await items(pass)).toEqual([]);
  });

  it("keeps a game profile, and refuses too much text", async () => {
    const { pass } = await start();
    expect((await withPass(pass, "PUT", "/api/build/current/profile", { name: "Lanternfall", unitsPerCell: 2, unitLabel: "m" })).status).toBe(200);
    expect(await (await withPass(pass, "GET", "/api/build/current")).json()).toMatchObject({ profile: { name: "Lanternfall", unitsPerCell: 2, unitLabel: "m" } });
    expect((await withPass(pass, "PUT", "/api/build/current/profile", { name: "X", notes: "x".repeat(8001) })).status).toBe(422);
  });

  it("a plain map's proposal waits for the user", async () => {
    const { pass } = await start();
    await withMap(pass);
    expect((await items(pass)).find((i) => i.kind === "map")?.data).toMatchObject({ gridStatus: "proposed", grid: null });
    expect(await check(pass)).toContainEqual({ type: "problem", item: "map cave", message: expect.stringContaining("confirm") });
  });

  it("a plain map with no proposal needs a grid", async () => {
    const { pass } = await start();
    await withMap(pass, null);
    expect((await items(pass)).find((i) => i.kind === "map")?.data).toMatchObject({ gridStatus: "none" });
    expect(await check(pass)).toContainEqual({ type: "problem", item: "map cave", message: expect.stringContaining("needs a grid") });
  });

  it("a UVTT map arrives with its grid confirmed, and a proposal can't replace it", async () => {
    const { pass } = await start();
    const { file } = await (await send(pass, "uvtt", form(await uvtt(), "c.uvtt", "application/json"))).json() as { file: { id: string } };
    await withPass(pass, "POST", "/api/build/current/maps", { key: "crypt", name: "Crypt", fileId: file.id, proposedGrid: { cellSize: 99, offsetX: 0, offsetY: 0 } });
    expect((await items(pass))[0]?.data).toMatchObject({ gridStatus: "confirmed", grid: { cellSize: 50 }, proposedGrid: null });
  });

  it("refuses a map from a file that isn't a map in this build", async () => {
    const { pass } = await start();
    const art = await uploadToken(pass);
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key: "m", name: "M", fileId: art.id })).status).toBe(422);
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key: "m", name: "M", fileId: randomUUID() })).status).toBe(422);
  });

  it("refuses a square size that doesn't fit the map", async () => {
    const { pass } = await start();
    const file = await uploadMap(pass);
    const res = await withPass(pass, "POST", "/api/build/current/maps", { key: "m", name: "M", fileId: file.id, proposedGrid: { cellSize: 800, offsetX: 0, offsetY: 0 } });
    expect(res.status).toBe(422);
  });

  it("can't send walls with a map", async () => {
    const { pass } = await start();
    const file = await uploadMap(pass);
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key: "m", name: "M", fileId: file.id, walls: [] })).status).toBe(422);
  });

  it("saves an encounter by square", async () => {
    const { pass } = await start();
    await withMap(pass);
    expect((await saveEncounter(pass, encounter([token()]))).status).toBe(200);
    expect((await items(pass)).find((i) => i.kind === "encounter")?.data).toMatchObject({ tokens: [{ creatureKey: "goblin", square: { column: 1, row: 1 }, hidden: true }] });
  });

  it("accepts a token with no square and lists it for the user", async () => {
    const { pass } = await start();
    await withMap(pass);
    expect((await saveEncounter(pass, encounter([token({ square: null })]))).status).toBe(200);
    expect(await check(pass)).toContainEqual({ type: "problem", item: "encounter ambush", message: expect.stringContaining("no square") });
  });

  it("refuses an encounter naming a creature or map that isn't there", async () => {
    const { pass } = await start();
    await withMap(pass);
    const creature = await saveEncounter(pass, encounter([token({ creatureKey: "dragon" })]));
    expect(creature.status).toBe(422);
    expect(await creature.text()).toContain("dragon");
    const map = await saveEncounter(pass, encounter([token()], { mapKey: "nowhere" }));
    expect(map.status).toBe(422);
    expect(await map.text()).toContain("nowhere");
  });

  it("refuses a square off the map, naming the token", async () => {
    const { pass } = await start();
    await withMap(pass);
    const res = await saveEncounter(pass, encounter([token({ name: "Scout", square: { column: 10, row: 0 } })]));
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Scout");
  });

  it("accepts a square on a map with no grid yet, to be checked at publish", async () => {
    const { pass } = await start();
    await withMap(pass, null);
    expect((await saveEncounter(pass, encounter([token({ square: { column: 500, row: 0 } })]))).status).toBe(200);
  });

  it("refuses board coordinates and owners", async () => {
    const { pass } = await start();
    await withMap(pass);
    expect((await saveEncounter(pass, encounter([token({ position: { x: 1, y: 1 } })]))).status).toBe(422);
    expect((await saveEncounter(pass, encounter([token({ ownerIds: ["x"] })]))).status).toBe(422);
  });

  it("stops at 20 encounters but lets one be saved again", async () => {
    const { pass } = await start();
    await withMap(pass);
    for (let i = 0; i < 20; i++) expect((await saveEncounter(pass, encounter([token()], { key: `e${i}` }))).status).toBe(200);
    expect((await saveEncounter(pass, encounter([token()], { key: "e20" }))).status).toBe(409);
    expect((await saveEncounter(pass, encounter([token()], { key: "e0", name: "Again" }))).status).toBe(200);
  });

  it("check lists problems and flags, and changes nothing", async () => {
    const { pass, account } = await start();
    await withPass(pass, "PUT", "/api/build/current/profile", { name: "G", flags: [{ field: "toHit", message: 'Read "+5" as a d20 roll' }] });
    await save(pass, [goblin({ hp: null, flags: [{ field: "hp", message: "HP ??" }] })]);
    const before = await items(pass);
    const issues = await check(pass);
    expect(issues).toContainEqual({ type: "flag", item: "game profile", message: expect.stringContaining("d20") });
    expect(issues).toContainEqual({ type: "flag", item: "creature goblin", message: "hp: HP ??" });
    expect(await items(pass)).toEqual(before);
    const library = await account.json<{ kind: string }[]>("GET", "/api/library/creatures");
    expect(library).toEqual([]);
  });

  it("nothing a pass does reaches the library", async () => {
    const { pass, account } = await start();
    await uploadToken(pass);
    await withMap(pass);
    await saveEncounter(pass, encounter([token()]));
    const assets = await account.json<{ objectKey?: string; name: string }[]>("GET", "/api/library");
    expect(assets.filter((a) => a.name === "cave.png" || a.name === "goblin.png")).toEqual([]);
    expect(await account.json<unknown[]>("GET", "/api/library/creatures")).toEqual([]);
    expect(await account.json<unknown[]>("GET", "/api/library/encounters")).toEqual([]);
  });

  it("offers no way to publish with a pass", async () => {
    const { pass } = await start();
    for (const [method, url] of [["POST", "/api/build/current/publish"], ["POST", "/api/build/current"], ["DELETE", "/api/build/current"]] as const) {
      expect((await withPass(pass, method, url, {})).status).toBe(404);
    }
  });
});

describe("the owner's choices for maps (FR-GM-26, ADR 0053)", () => {
  // 8 by 6 squares of 50 pixels, with one closed opening in a wall along row line 2.
  const uvttWithOpening = async () => JSON.stringify({
    format: 0.3,
    image: (await png(400, 300)).toString("base64"),
    resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
    line_of_sight: [[{ x: 0, y: 2 }, { x: 8, y: 2 }]],
    portals: [{ bounds: [{ x: 3, y: 2 }, { x: 4, y: 2 }], position: { x: 3.5, y: 2 }, rotation: 0, closed: true, freestanding: false }],
  });

  async function startWith(choices: { aiGrid?: boolean; aiWalls?: boolean }) {
    const account = await server.signUp({ displayName: "Vincent" });
    const res = await account.request("POST", "/api/builds", { name: "Lanternfall", ...choices });
    expect(res.status).toBe(201);
    const body = await res.json() as { build: { id: string; choices: unknown }; pass: string };
    return { account, id: body.build.id, pass: body.pass, choices: body.build.choices };
  }

  async function uvttMap(pass: string) {
    const res = await send(pass, "uvtt", form(await uvttWithOpening(), "chandlery.uvtt", "application/json"));
    expect(res.status).toBe(201);
    const { file } = await res.json() as { file: { id: string; openings: number } };
    expect(file.openings).toBe(1);
    expect((await withPass(pass, "POST", "/api/build/current/maps", { key: "shop", name: "Chandlery", fileId: file.id })).status).toBe(200);
    return file.id;
  }

  const setDoor = (pass: string) => withPass(pass, "PUT", "/api/build/current/maps/shop/setup", { openings: [{ number: 1, kind: "door", state: "locked" }] });
  const readSetup = async (pass: string) => (await withPass(pass, "GET", "/api/build/current/maps/shop/setup")).json() as Promise<Record<string, unknown>>;

  it("starts with both off, and shows them to the owner and the AI", async () => {
    const { account, id, pass } = await start();
    expect((await account.json<{ build: { choices: unknown } }>("GET", `/api/builds/${id}`)).build.choices).toEqual({ aiGrid: false, aiWalls: false });
    expect((await (await withPass(pass, "GET", "/api/build/current")).json() as { allowed: unknown }).allowed).toEqual({ grids: false, walls: false });
  });

  it("takes the choices ticked at the start, and only the owner changes them", async () => {
    const { account, id, choices } = await startWith({ aiGrid: true, aiWalls: true });
    expect(choices).toEqual({ aiGrid: true, aiWalls: true });
    const changed = await account.request("PUT", `/api/builds/${id}/choices`, { aiGrid: false, aiWalls: true });
    expect(changed.status).toBe(200);
    expect((await changed.json() as { build: { choices: unknown } }).build.choices).toEqual({ aiGrid: false, aiWalls: true });
    const other = await server.signUp();
    expect((await other.request("PUT", `/api/builds/${id}/choices`, { aiGrid: true, aiWalls: true })).status).toBe(404);
  });

  it("can't be changed with a pass", async () => {
    const { account, id, pass } = await start();
    expect((await withPass(pass, "PUT", `/api/builds/${id}/choices`, { aiGrid: true, aiWalls: true })).status).toBe(401);
    expect((await withPass(pass, "PUT", "/api/build/current/choices", { aiGrid: true, aiWalls: true })).status).toBe(404);
    expect((await account.json<{ build: { choices: unknown } }>("GET", `/api/builds/${id}`)).build.choices).toEqual({ aiGrid: false, aiWalls: false });
  });

  it("refuses the AI's walls when the owner hasn't allowed them, but still lets it look", async () => {
    const { pass } = await start();
    await uvttMap(pass);
    const refused = await setDoor(pass);
    expect(refused.status).toBe(403);
    expect(await refused.text()).toMatch(/Let my AI set walls, doors and windows/);
    expect(await readSetup(pass)).toMatchObject({ allowed: { walls: false }, openings: [{ number: 1, set: false }] });
  });

  it("lists the numbered openings, with their squares and what they are", async () => {
    const { pass } = await startWith({ aiWalls: true });
    await uvttMap(pass);
    expect(await readSetup(pass)).toMatchObject({
      map: "shop", grid: { cellSize: 50, status: "confirmed", by: "file" }, columns: 8, rows: 6, plainWalls: 2,
      openings: [{ number: 1, square: { column: 3, row: 2 }, direction: "horizontal", lengthSquares: 1, now: { kind: "opening", state: "closed" }, set: false }],
      lines: [], marks: [], problems: [],
    });
  });

  it("sets an opening, and keeps it when the map is saved again", async () => {
    const { pass } = await startWith({ aiWalls: true });
    const fileId = await uvttMap(pass);
    expect((await setDoor(pass)).status).toBe(200);
    await withPass(pass, "POST", "/api/build/current/maps", { key: "shop", name: "The Guild Chandlery", fileId });
    expect(await readSetup(pass)).toMatchObject({ openings: [{ number: 1, now: { kind: "door", state: "locked" }, set: true }] });
  });

  it("refuses a line off the map, naming it, and changes nothing", async () => {
    const { pass } = await startWith({ aiWalls: true });
    await uvttMap(pass);
    const res = await withPass(pass, "PUT", "/api/build/current/maps/shop/setup", { lines: [{ from: { column: 7, row: 1 }, to: { column: 9, row: 1 }, kind: "wall" }] });
    expect(res.status).toBe(422);
    expect(await res.text()).toMatch(/Line 1 \(a wall from column 7, row 1 to column 9, row 1\) has a corner off the map/);
    expect(await readSetup(pass)).toMatchObject({ lines: [] });
  });

  it("refuses the AI once the owner has fixed the map", async () => {
    const { account, id, pass } = await startWith({ aiWalls: true });
    await uvttMap(pass);
    const fixed = await account.request("PUT", `/api/builds/${id}/maps/shop/setup`, { openings: [{ number: 1, kind: "door", state: "closed" }], lines: [], marks: [] });
    expect(fixed.status).toBe(200);
    expect((await fixed.json() as { item: { editedByUser: boolean } }).item.editedByUser).toBe(true);
    const refused = await setDoor(pass);
    expect(refused.status).toBe(409);
    expect(await refused.text()).toMatch(/changed/i);
  });

  it("refuses the AI on a map already published", async () => {
    const { account, id, pass } = await startWith({ aiWalls: true });
    await uvttMap(pass);
    const reviewed = Object.fromEntries((await account.json<{ items: { kind: string; key: string; updatedAt: string }[] }>("GET", `/api/builds/${id}`)).items.map((i) => [`${i.kind}/${i.key}`, i.updatedAt]));
    expect((await account.request("POST", `/api/builds/${id}/publish`, { maps: ["shop"], reviewed })).status).toBe(200);
    expect((await setDoor(pass)).status).toBe(409);
  });

  it("draws the grid, walls and numbered openings on a block of squares, enlarged", async () => {
    const { pass } = await startWith({ aiWalls: true });
    const fileId = await uvttMap(pass);
    const res = await withPass(pass, "GET", `/api/build/current/files/${fileId}/preview?overlay=1&fromColumn=2&toColumn=4&fromRow=1&toRow=2`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/image\/webp/);
    // 3 by 2 squares of 50 pixels, enlarged four times.
    expect(await sharp(Buffer.from(await res.arrayBuffer())).metadata()).toMatchObject({ width: 600, height: 400 });
    expect((await withPass(pass, "GET", `/api/build/current/files/${fileId}/preview?overlay=1&fromColumn=2`)).status).toBe(422);
  });

  it("asks about openings still as imported, only when the AI may set walls", async () => {
    const asked = await startWith({ aiWalls: true });
    await uvttMap(asked.pass);
    const issues = async (pass: string) => ((await (await withPass(pass, "GET", "/api/build/current/check")).json()) as { issues: { item: string; message: string }[] }).issues.filter((i) => i.item === "map shop");
    expect(await issues(asked.pass)).toEqual([expect.objectContaining({ message: expect.stringMatching(/Openings still as imported: 1\./) })]);
    const quiet = await start();
    await uvttMap(quiet.pass);
    expect(await issues(quiet.pass)).toEqual([]);
  });

  it("counts the AI's grid when detection agrees and grids are allowed, and not once they're turned off", async () => {
    const { account, id, pass } = await startWith({ aiGrid: true });
    const file = await uploadMap(pass);
    for (let i = 0; i < 100; i++) {
      const read = await (await withPass(pass, "GET", "/api/build/current")).json() as { files: { detection: { status: string } | null }[] };
      if (read.files[0]?.detection?.status === "suggested") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const saved = await withPass(pass, "POST", "/api/build/current/maps", { key: "cave", name: "Cave", fileId: file.id, proposedGrid: { cellSize: 70, offsetX: 0, offsetY: 0 } });
    expect((await saved.json() as { item: { data: unknown } }).item.data).toMatchObject({ gridStatus: "confirmed", gridBy: "agreement", grid: { cellSize: 70, unitsPerCell: 5 } });
    await account.request("PUT", `/api/builds/${id}/choices`, { aiGrid: false, aiWalls: false });
    const { items } = await account.json<{ items: { key: string; data: unknown }[] }>("GET", `/api/builds/${id}`);
    expect(items.find((i) => i.key === "cave")?.data).toMatchObject({ gridStatus: "proposed", grid: null });
  });
});
