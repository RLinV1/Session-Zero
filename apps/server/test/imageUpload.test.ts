import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryAsset } from "@vtt/shared";
import { checkImageBytes, imageUploader, type ImageUploadResult } from "../src/http/imageUpload";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { pngOfSize } from "./pngOfSize";
import { startServer } from "./helpers";

const canvas = (width = 40, height = 30) => sharp({ create: { width, height, channels: 3, background: "#785634" } });
const PNG = await canvas().png().toBuffer();
const JPEG = await canvas().jpeg().toBuffer();
const WEBP = await canvas().webp().toBuffer();
const GIF = await canvas().gif().toBuffer();
const SIDEWAYS = await canvas().jpeg().withMetadata({ orientation: 6 }).toBuffer();
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><script>alert(1)</script></svg>');
const SCRIPT = Buffer.from("<script>alert(1)</script>");

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "vtt-image-check-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("reading an image's real format and size (FR-GM-15, upload-limits)", () => {
  const check = async (bytes: Uint8Array) => {
    const file = path.join(dir, "input");
    await writeFile(file, bytes);
    return checkImageBytes(file);
  };

  it.each([
    ["PNG", PNG, "image/png"],
    ["JPEG", JPEG, "image/jpeg"],
    ["WebP", WEBP, "image/webp"],
  ])("accepts a real %s at its real size", async (_name, bytes, contentType) => {
    expect(await check(bytes)).toEqual({ ok: true, contentType, width: 40, height: 30 });
  });

  it.each([
    ["GIF", GIF],
    ["SVG", SVG],
    ["script text", SCRIPT],
    ["an empty file", Buffer.alloc(0)],
  ])("refuses %s with 415", async (_name, bytes) => {
    expect(await check(bytes)).toMatchObject({ ok: false, status: 415, error: "Use PNG, JPEG or WebP" });
  });

  it("reports the size a browser draws for a JPEG stored on its side", async () => {
    expect(await check(SIDEWAYS)).toEqual({ ok: true, contentType: "image/jpeg", width: 30, height: 40 });
  });

  it("refuses an image too large on one side, however small the file is", async () => {
    expect(await check(pngOfSize(20000, 1))).toMatchObject({ ok: false, status: 413 });
  });
});

describe("imageUploader (FR-GM-15, upload-limits)", () => {
  let http: Server;
  let base: string;
  beforeEach(async () => {
    const app = express();
    const receive = imageUploader(dir);
    app.post("/up", (req, res) => void receive(req, res).then((result) => res.json(result)));
    await new Promise<void>((resolve) => {
      http = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = http.address();
    base = `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;
  });
  afterEach(() => new Promise((resolve) => http.close(resolve)));

  const send = async (bytes: Uint8Array, type: string) => {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), "beholder.png");
    return (await (await fetch(`${base}/up`, { method: "POST", body: form })).json()) as ImageUploadResult;
  };

  it("keeps a correct image under its real type when it was labelled wrongly", async () => {
    const result = await send(JPEG, "image/png");
    if (!result.ok) throw new Error(result.error);
    expect(result.image).toMatchObject({ contentType: "image/jpeg", width: 40, height: 30, bytes: JPEG.length });
    expect(result.image.key).toMatch(/\.jpg$/);
    expect(result.image.key).not.toContain("beholder");
    expect(await readdir(dir)).toEqual([result.image.key]);
  });

  it("leaves a correctly labelled image's name alone", async () => {
    const result = await send(PNG, "image/png");
    if (!result.ok) throw new Error(result.error);
    expect(result.image).toMatchObject({ contentType: "image/png", bytes: PNG.length });
    expect(result.image.key).toMatch(/\.png$/);
  });

  it.each([
    ["script", SCRIPT, 415],
    ["GIF", GIF, 415],
    ["SVG", SVG, 415],
    ["empty file", Buffer.alloc(0), 415],
    ["image too wide", pngOfSize(20000, 1), 413],
  ])("keeps no copy of a refused %s", async (_name, bytes, status) => {
    expect(await send(bytes, "image/png")).toMatchObject({ ok: false, status });
    expect(await readdir(dir)).toEqual([]);
  });
});

describe("uploads are checked on every route (FR-GM-02, FR-GM-08, FR-GM-15)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  let store: MemoryRoomStore;
  beforeEach(async () => {
    store = new MemoryRoomStore();
    server = await startServer(store);
  });
  afterEach(async () => {
    await server.close();
    vi.restoreAllMocks();
  });

  const form = (fields: Record<string, string>, bytes: Uint8Array, type = "image/png") => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    data.append("file", new Blob([bytes], { type }), "art.png");
    return data;
  };
  const library = (cookie: string, fields: Record<string, string>, bytes: Uint8Array, type?: string) =>
    fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: form({ name: "Art", ...fields }, bytes, type) });
  const room = (token: string, fields: Record<string, string>, bytes: Uint8Array, type?: string) =>
    fetch(`${server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: form(fields, bytes, type) });
  const size = { width: "256", height: "256" };

  it("refuses a script labelled as an image in the library and keeps nothing", async () => {
    const { cookie } = await server.signUp();
    const res = await library(cookie, { kind: "token", ...size }, SCRIPT);
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "Use PNG, JPEG or WebP" });
    expect(await readdir(server.uploadDir)).toEqual([]);
  });

  it("refuses a GIF labelled as a PNG in a room and records nothing", async () => {
    const creds = await server.createRoom();
    const record = vi.spyOn(store, "recordRoomUpload");
    expect((await room(creds.guestToken, { purpose: "token" }, GIF)).status).toBe(415);
    expect(record).not.toHaveBeenCalled();
    expect(await readdir(server.uploadDir)).toEqual([]);
  });

  it("refuses an SVG labelled as a PNG", async () => {
    const { cookie } = await server.signUp();
    expect((await library(cookie, { kind: "token", ...size }, SVG)).status).toBe(415);
  });

  it("serves a JPEG declared as a PNG as a JPEG", async () => {
    const { cookie } = await server.signUp();
    const res = await library(cookie, { kind: "token", ...size }, JPEG);
    expect(res.status).toBe(201);
    const asset = (await res.json()) as LibraryAsset;
    expect(asset.url).toMatch(/\.jpg$/);
    expect((await fetch(server.base + asset.url)).headers.get("content-type")).toBe("image/jpeg");
  });

  it("records a library image's real size, not the declared one", async () => {
    const { cookie } = await server.signUp();
    const res = await library(cookie, { kind: "token", ...size }, pngOfSize(64, 64));
    expect(await res.json()).toMatchObject({ width: 64, height: 64 });
  });

  it("records a photo taken sideways at the size a browser draws", async () => {
    const { cookie } = await server.signUp();
    const res = await library(cookie, { kind: "map", width: "40", height: "30" }, SIDEWAYS);
    expect(await res.json()).toMatchObject({ width: 30, height: 40 });
  });

  it("records a room token's real size when none was declared", async () => {
    const creds = await server.createRoom();
    const record = vi.spyOn(store, "recordRoomUpload");
    expect((await room(creds.guestToken, {}, pngOfSize(64, 64))).status).toBe(200);
    expect(record.mock.calls[0]![3]).toMatchObject({ purpose: "token", width: 64, height: 64 });
  });

  it("refuses an image too large on one side, whatever size was declared", async () => {
    const { cookie } = await server.signUp();
    const res = await library(cookie, { kind: "map", width: "1000", height: "1" }, pngOfSize(20000, 1));
    expect(res.status).toBe(413);
    expect(await readdir(server.uploadDir)).toEqual([]);
  });
});
