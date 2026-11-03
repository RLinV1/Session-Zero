import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, truncate } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_GRID, MAX_UVTT_BYTES, MAX_UVTT_IMAGE_BYTES, serializeUvtt } from "@vtt/shared";
import { animatedPng, animatedWebp } from "./uvttImageFixtures";
import { validateUvttFile } from "../src/uvtt/validateFile";
import { UvttValidationPool } from "../src/uvtt/validationPool";
import { UVTT_MAX_DRAFTS, UVTT_PREPARATION_TTL, UvttPreparations } from "../src/uvtt/preparations";

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map((p) => rm(p, { recursive: true, force: true }))); });
async function file(data: string | Uint8Array) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "uvtt-test-")); folders.push(dir);
  const filename = path.join(dir, "map.uvtt"); await writeFile(filename, data); return filename;
}
async function input(format: "png" | "webp" = "png") {
  const image = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 20, g: 100, b: 30, alpha: 1 } } }).toFormat(format).toBuffer();
  return { format: 0.3, resolution: { pixels_per_grid: 100, map_size: { x: 4, y: 3 }, map_origin: { x: -0.25, y: 0.4 } }, image: image.toString("base64"),
    portals: [{ bounds: [{ x: 0, y: 1 }, { x: 1, y: 1 }], position: { x: 1.8, y: 2 }, closed: false, freestanding: true, rotation: 0.3 }],
    line_of_sight: [[{ x: -2, y: 1 }, { x: 5, y: 1 }]], objects_line_of_sight: [[{ x: 0, y: 2 }, { x: 2, y: 2 }]],
  };
}

describe("complete UVTT files and image validation (FR-GM-06/07/12)", () => {
  it.each([
    ["dungeondraft-test.dd2vtt.gz", "31f1dbff6106c990891fca2f7d64d20fac813a66299a3870b9e6782115f59afe", 1280, 1280, 3],
    ["arkenforge-tavern.uvtt.gz", "6dc29a43add7d67634c0d4b32cfed7857ecc172fb7c00e8d6d3cf010a62ad9bf", 3840, 2640, 12],
  ] as const)("checks unchanged real export %s against recorded checksum and selected coordinates", async (name, checksum, width, height, portalCount) => {
    const bytes = gunzipSync(await readFile(new URL(`./fixtures/uvtt/${name}`, import.meta.url)));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(checksum);
    if (portalCount === 12) {
      await expect(validateUvttFile(await file(bytes), DEFAULT_GRID)).rejects.toMatchObject({ issues: [expect.objectContaining({ code: "zero_segment" })] });
      return;
    }
    const result = await validateUvttFile(await file(bytes), DEFAULT_GRID);
    expect([result.width, result.height]).toEqual([width, height]);
    const portals = result.walls.filter((w) => w.uvttPortal);
    expect(portals).toHaveLength(portalCount);
    expect(portals[0]?.a).toEqual({ x: 704, y: 384 });
    expect(portals[0]?.uvttPortal?.position).toEqual({ x: 736, y: 384 });
    const exportFile = serializeUvtt({ width, height }, result.grid, result.walls, Buffer.from(result.image).toString("base64"));
    const roundTrip = await validateUvttFile(await file(JSON.stringify(exportFile)), DEFAULT_GRID);
    expect(roundTrip.walls).toHaveLength(result.walls.length);
    for (const [i, w] of result.walls.entries()) {
      for (const endpoint of ["a", "b"] as const) for (const axis of ["x", "y"] as const) expect(roundTrip.walls[i]![endpoint][axis]).toBeCloseTo(w[endpoint][axis], 6);
      expect(roundTrip.walls[i]?.uvttPortal).toEqual(w.uvttPortal);
    }
    const originalPixels = await sharp(result.image).raw().toBuffer();
    expect(createHash("sha256").update(await sharp(roundTrip.image).raw().toBuffer()).digest("hex")).toBe(createHash("sha256").update(originalPixels).digest("hex"));
  });
  it.each(["png", "webp"] as const)("fully decodes and round trips %s bytes and grid offsets in an actual worker", async (format) => {
    const pool = new UvttValidationPool();
    try {
      const f = await input(format);
      const first = await pool.validate(await file(JSON.stringify(f)), DEFAULT_GRID);
      const serialized = serializeUvtt(first, first.grid, first.walls, Buffer.from(first.image).toString("base64"));
      const next = await pool.validate(await file(JSON.stringify(serialized)), DEFAULT_GRID);
      expect(next.image).toEqual(first.image); expect(next.grid).toEqual(first.grid);
      expect(next.walls).toEqual(first.walls);
    } finally { await pool.close(); }
  });
  it("rejects invalid UTF-8, JSON, base64, image type, pixel data and dimensions", async () => {
    const f = await input();
    const jpeg = await sharp(Buffer.from(f.image, "base64")).jpeg().toBuffer();
    const invalid: (string | Uint8Array)[] = [new Uint8Array([0xff, 0xfe]), "{", JSON.stringify({ ...f, image: f.image + "\n" }),
      JSON.stringify({ ...f, image: "aGVsbG8=" }), JSON.stringify({ ...f, image: jpeg.toString("base64") }),
      JSON.stringify({ ...f, image: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="file:///not-a-map"/></svg>').toString("base64") }),
      JSON.stringify({ ...f, image: Buffer.from(f.image, "base64").subarray(0, 100).toString("base64") }),
      JSON.stringify({ ...f, resolution: { ...f.resolution, map_size: { x: 5, y: 3 } } }),
    ];
    for (const bytes of invalid) await expect(validateUvttFile(await file(bytes), DEFAULT_GRID)).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ severity: "error" })]) });
  });
  it("allows one pixel of rounding but rejects oversized dimensions", async () => {
    const f = await input();
    f.resolution.map_size.x = 4.01;
    await expect(validateUvttFile(await file(JSON.stringify(f)), DEFAULT_GRID)).resolves.toMatchObject({ width: 400 });
    const edge = await sharp({ create: { width: 16385, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    await expect(validateUvttFile(await file(JSON.stringify({ ...f, image: edge.toString("base64") })), DEFAULT_GRID)).rejects.toThrow(/16384/);
    const pixels = await sharp({ create: { width: 8000, height: 4001, channels: 3, background: "red" } }).png().toBuffer();
    await expect(validateUvttFile(await file(JSON.stringify({ ...f, image: pixels.toString("base64") })), DEFAULT_GRID)).rejects.toThrow(/image limits/);
  });
  it("rejects animated PNG/WebP rather than silently loading their first frame", async () => {
    for (const image of [await animatedPng(), await animatedWebp()]) {
      const f = { format: 0.3, image: image.toString("base64"), resolution: { pixels_per_grid: 1, map_size: { x: 2, y: 2 }, map_origin: { x: 0, y: 0 } } };
      await expect(validateUvttFile(await file(JSON.stringify(f)), DEFAULT_GRID)).rejects.toMatchObject({ issues: [expect.objectContaining({ code: "animated_image" })] });
    }
  });
  it("enforces container and decoded-image byte limits before image decoding", async () => {
    const oversized = await file(""); await truncate(oversized, MAX_UVTT_BYTES + 1);
    await expect(validateUvttFile(oversized, DEFAULT_GRID)).rejects.toMatchObject({ issues: [expect.objectContaining({ code: "container_limit" })] });
    const f = await input();
    await expect(validateUvttFile(await file(JSON.stringify({ ...f, image: Buffer.alloc(MAX_UVTT_IMAGE_BYTES + 1).toString("base64") })), DEFAULT_GRID)).rejects.toMatchObject({ issues: [expect.objectContaining({ code: "image_limit" })] });
  });
  it("bounds queued jobs and terminates a timed-out worker without poisoning the queue", async () => {
    const filename = await file(JSON.stringify(await input()));
    const pool = new UvttValidationPool(1);
    try {
      const jobs = [pool.validate(filename, DEFAULT_GRID), pool.validate(filename, DEFAULT_GRID), pool.validate(filename, DEFAULT_GRID), pool.validate(filename, DEFAULT_GRID)];
      const results = await Promise.allSettled(jobs);
      expect(results.every((r) => r.status === "rejected")).toBe(true);
      const last = results[3];
      expect(last?.status === "rejected" && last.reason.issues[0].code).toBe("validation_busy");
      await expect(pool.validate(filename, DEFAULT_GRID)).rejects.toMatchObject({ issues: [expect.objectContaining({ code: "validation_timeout" })] });
    } finally { await pool.close(); }
  });
});

describe("bounded private UVTT preparation lifecycle (FR-GM-07)", () => {
  it("binds room/GM, enforces two drafts, revisions, leases, receipts, expiry and retry", () => {
    let now = 0; const store = new UvttPreparations(() => now);
    const data = { map: { url: "/uploads/map.png", width: 400, height: 300 }, grid: DEFAULT_GRID, walls: [], diagnostics: [] };
    const baseline = { map: null, grid: DEFAULT_GRID, walls: {}, fog: {} };
    const one = store.create("room", "gm", data, baseline);
    expect(() => store.assertCanCreate("room", "gm")).not.toThrow();
    expect(() => store.assertCanCreate("room", "gm")).not.toThrow();
    store.create("room", "gm", data, baseline);
    expect(() => store.assertCanCreate("room", "gm")).toThrow(/Too many/);
    expect(() => store.assertCanCreate("room", "other-gm")).not.toThrow();
    expect(() => store.assertCanCreate("other-room", "gm")).not.toThrow();
    expect(() => store.create("room", "gm", data, baseline)).toThrow(/Too many/);
    expect(store.lease("other", "gm", one.id, 1)).toMatchObject({ ok: false, code: "not_found" });
    expect(store.lease("room", "player", one.id, 1)).toMatchObject({ ok: false });
    const edit = store.edit("room", "gm", one.id, { revision: 1, grid: DEFAULT_GRID, walls: [] })!;
    expect(edit.revision).toBe(2); expect(store.lease("room", "gm", one.id, 1)).toMatchObject({ ok: false, code: "invalid" });
    const lease = store.lease("room", "gm", one.id, 2);
    if (!lease.ok || !lease.finish) throw new Error("no lease");
    expect(store.discard("room", "gm", one.id)).toBe(false);
    lease.finish(); // append failed: draft is still applicable
    const retry = store.lease("room", "gm", one.id, 2);
    if (!retry.ok || !retry.finish) throw new Error("no retry");
    retry.finish(42);
    expect(() => store.assertCanCreate("room", "gm")).not.toThrow();
    expect(store.lease("room", "gm", one.id, 2)).toMatchObject({ ok: true, appliedSeq: 42 });
    store.discard("room", "gm", one.id); // successful receipt survives UI cleanup
    expect(store.lease("room", "gm", one.id, 2)).toMatchObject({ appliedSeq: 42 });
    now = UVTT_PREPARATION_TTL + 1;
    expect(store.lease("room", "gm", one.id, 2)).toMatchObject({ ok: false, code: "not_found" });
  });
  it("returns an applied receipt only for the scene it was applied to (FR-GM-25)", () => {
    const store = new UvttPreparations();
    const prep = store.create("room", "gm", { map: { url: "/x", width: 2, height: 2 }, grid: DEFAULT_GRID, walls: [], diagnostics: [] }, { map: null, grid: DEFAULT_GRID, walls: {}, fog: {} });
    const lease = store.lease("room", "gm", prep.id, 1, "a");
    if (!lease.ok || !lease.finish) throw new Error("no lease");
    lease.finish(7);
    expect(store.lease("room", "gm", prep.id, 1, "a")).toMatchObject({ ok: true, appliedSeq: 7 });
    expect(store.lease("room", "gm", prep.id, 1, "b")).toMatchObject({ ok: false, code: "invalid" });
  });
  it("enforces the process draft cap across owners", () => {
    const store = new UvttPreparations();
    for (let i = 0; i < UVTT_MAX_DRAFTS; i++) store.create(`r${i}`, `gm${i}`, { map: { url: "/x", width: 2, height: 2 }, grid: DEFAULT_GRID, walls: [], diagnostics: [] }, { map: null, grid: DEFAULT_GRID, walls: {}, fog: {} });
    expect(() => store.assertCanCreate("last", "gm")).toThrow(/Too many/);
    expect(() => store.create("last", "gm", { map: { url: "/x", width: 2, height: 2 }, grid: DEFAULT_GRID, walls: [], diagnostics: [] }, { map: null, grid: DEFAULT_GRID, walls: {}, fog: {} })).toThrow(/Too many/);
  });
  it("keeps applied receipts retryable without consuming draft capacity", () => {
    const store = new UvttPreparations(() => 0);
    const data = { map: { url: "/map.png", width: 400, height: 300 }, grid: DEFAULT_GRID, walls: [], diagnostics: [] };
    const baseline = { map: null, grid: DEFAULT_GRID, walls: {}, fog: {} };
    const receipts = Array.from({ length: UVTT_MAX_DRAFTS }, (_, i) => {
      const prep = store.create("room", "gm", data, baseline);
      const lease = store.lease("room", "gm", prep.id, 1);
      if (!lease.ok || !lease.finish) throw new Error("no lease");
      lease.finish(i === 0 ? null : i);
      return prep;
    });
    expect(() => store.assertCanCreate("room", "gm")).not.toThrow();
    store.create("room", "gm", data, baseline);
    store.create("room", "gm", data, baseline);
    expect(() => store.create("room", "gm", data, baseline)).toThrow(/Too many/);
    for (const [i, prep] of receipts.entries()) {
      expect(store.lease("room", "gm", prep.id, 1)).toEqual({ ok: true, appliedSeq: i === 0 ? null : i });
    }
  });
  it("excludes expired drafts from capacity while keeping expired leases counted until release", () => {
    let now = 0; const store = new UvttPreparations(() => now);
    const data = { map: { url: "/map.png", width: 400, height: 300 }, grid: DEFAULT_GRID, walls: [], diagnostics: [] };
    const baseline = { map: null, grid: DEFAULT_GRID, walls: {}, fog: {} };
    const first = store.create("room", "gm", data, baseline);
    store.create("room", "gm", data, baseline);
    const lease = store.lease("room", "gm", first.id, 1);
    if (!lease.ok || !lease.finish) throw new Error("no lease");
    now = UVTT_PREPARATION_TTL;
    expect(() => store.assertCanCreate("room", "gm")).not.toThrow();
    store.create("room", "gm", data, baseline);
    expect(() => store.assertCanCreate("room", "gm")).toThrow(/Too many/);
    expect(() => store.create("room", "gm", data, baseline)).toThrow(/Too many/);
    lease.finish();
    expect(() => store.assertCanCreate("room", "gm")).not.toThrow();
    expect(() => store.create("room", "gm", data, baseline)).not.toThrow();
  });
  it("revalidates edited portal bounds, removes duplicate blocking geometry and retains exact metadata", () => {
    const store = new UvttPreparations();
    const data = { map: { url: "/map.png", width: 400, height: 300 }, grid: DEFAULT_GRID, walls: [], diagnostics: [] };
    const prep = store.create("room", "gm", data, { map: null, grid: DEFAULT_GRID, walls: {}, fog: {} });
    const portal = { a: { x: 100, y: 100 }, b: { x: 200, y: 100 }, uvttPortal: { position: { x: -50, y: 20 }, closed: false, rotation: 0.8, freestanding: true } };
    const edit = store.edit("room", "gm", prep.id, { revision: 1, grid: DEFAULT_GRID, walls: [{ a: { x: 0, y: 100 }, b: { x: 400, y: 100 } }, portal] })!;
    expect(edit.walls).toEqual([{ a: { x: 0, y: 100 }, b: portal.a }, { a: portal.b, b: { x: 400, y: 100 } }, portal]);
  });
});
