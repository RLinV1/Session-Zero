import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DEV_S3_ENDPOINT, LocalDiskAssetStore, S3AssetStore, createAssetStore, isAwsEndpoint, type AssetStore } from "../src/store/assetStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { listenForFetch } from "./helpers";

/** Stands in for a connected object storage: reads come from an in-memory map. */
function fakeS3(objects: Record<string, string> = {}): AssetStore {
  return {
    put: async (_temp, key) => `/uploads/${key}`,
    delete: async () => {},
    read: async (key) => (key in objects ? { body: Readable.from([objects[key]!]), contentType: "image/png" } : null),
    readPrivate: async (key) => (key in objects ? Buffer.from(objects[key]!) : null),
    sizeOf: async (key) => (key in objects ? Buffer.byteLength(objects[key]!) : null),
  };
}

describe("choosing upload storage (upload-storage)", () => {
  afterEach(() => vi.restoreAllMocks());
  const quiet = () => vi.spyOn(console, "log").mockImplementation(() => {});

  it("connects to S3_ENDPOINT when it is set", async () => {
    quiet();
    const s3 = fakeS3();
    const connect = vi.fn(async () => s3);
    const store = await createAssetStore("/tmp/u", { S3_ENDPOINT: "http://s3:9000" }, connect);
    expect(store).not.toBeInstanceOf(LocalDiskAssetStore);
    expect(store.read).toBeTypeOf("function");
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "http://s3:9000" }));
  });

  it("refuses to start in production without S3_ENDPOINT", async () => {
    const connect = vi.fn(async () => fakeS3());
    await expect(createAssetStore("/tmp/u", { NODE_ENV: "production" }, connect)).rejects.toThrow(/S3_ENDPOINT/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("refuses to start in production with the development object storage credentials (security-hardening)", async () => {
    const connect = vi.fn(async () => fakeS3());
    for (const keys of [{}, { S3_ACCESS_KEY: "prod" }, { S3_SECRET_KEY: "prod-secret" }]) {
      await expect(
        createAssetStore("/tmp/u", { NODE_ENV: "production", S3_ENDPOINT: "http://s3:9000", ...keys }, connect),
      ).rejects.toThrow(/S3_ACCESS_KEY and S3_SECRET_KEY/);
    }
    expect(connect).not.toHaveBeenCalled();
  });

  it("connects in production with its own object storage credentials", async () => {
    quiet();
    const connect = vi.fn(async () => fakeS3());
    const env = { NODE_ENV: "production", S3_ENDPOINT: "http://s3:9000", S3_ACCESS_KEY: "prod", S3_SECRET_KEY: "prod-secret" };
    await createAssetStore("/tmp/u", env, connect);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ accessKeyId: "prod", secretAccessKey: "prod-secret" }));
  });

  it("uses local disk without probing when S3_AUTODETECT=0", async () => {
    quiet();
    const connect = vi.fn(async () => fakeS3());
    const store = await createAssetStore("/tmp/u", { S3_AUTODETECT: "0" }, connect);
    expect(store).toBeInstanceOf(LocalDiskAssetStore);
    expect(connect).not.toHaveBeenCalled();
  });

  it("uses the compose object store when it answers, with a single attempt", async () => {
    quiet();
    const s3 = fakeS3();
    const connect = vi.fn(async () => s3);
    const store = await createAssetStore("/tmp/u", {}, connect);
    expect(store).not.toBeInstanceOf(LocalDiskAssetStore);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ endpoint: DEV_S3_ENDPOINT, attempts: 1 }));
  });

  it("falls back to local disk when nothing answers", async () => {
    quiet();
    const refused = vi.fn(async (): Promise<AssetStore> => {
      throw new Error("ECONNREFUSED");
    });
    expect(await createAssetStore("/tmp/u", {}, refused)).toBeInstanceOf(LocalDiskAssetStore);
  });

  it("falls back to local disk within about a second when the probe hangs", async () => {
    quiet();
    const hangs = () => new Promise<AssetStore>(() => {});
    const started = Date.now();
    expect(await createAssetStore("/tmp/u", {}, hangs)).toBeInstanceOf(LocalDiskAssetStore);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe("keeping a disk copy alongside object storage (upload-storage)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deletes both the object storage object and the disk copy, so a deleted asset stops loading", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await writeFile(path.join(uploadDir, "map.png"), "disk copy");
    const s3Delete = vi.fn(async () => {});
    const connect = vi.fn(async (): Promise<AssetStore> => ({ ...fakeS3(), delete: s3Delete }));
    const store = await createAssetStore(uploadDir, { S3_ENDPOINT: "http://s3:9000" }, connect);
    await store.delete("map.png");
    expect(s3Delete).toHaveBeenCalledWith("map.png");
    expect(existsSync(path.join(uploadDir, "map.png"))).toBe(false);
  });

  it("reads private analysis bytes by object key and falls back to the disk copy", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await writeFile(path.join(uploadDir, "map.png"), "stored bytes");
    const store = await createAssetStore(uploadDir, { S3_ENDPOINT: "http://s3:9000" }, async () => fakeS3());
    expect(Buffer.from((await store.readPrivate("map.png", 100))!).toString()).toBe("stored bytes");
    await expect(store.readPrivate("map.png", 2)).rejects.toThrow("limit");
  });

  it("measures an object in storage, falls back to the disk copy, and answers null when neither has it (upload-limits)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await writeFile(path.join(uploadDir, "old.png"), "disk bytes");
    const store = await createAssetStore(uploadDir, { S3_ENDPOINT: "http://s3:9000" }, async () => fakeS3({ "new.png": "stored" }));
    expect(await store.sizeOf("new.png")).toBe(6);
    expect(await store.sizeOf("old.png")).toBe(10);
    expect(await store.sizeOf("gone.png")).toBeNull();
  });

  it("measures an object on local disk without leaving the upload folder (upload-limits)", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await writeFile(path.join(uploadDir, "map.png"), "12345");
    const disk = new LocalDiskAssetStore(uploadDir);
    expect(await disk.sizeOf("map.png")).toBe(5);
    expect(await disk.sizeOf("../map.png")).toBe(5);
    expect(await disk.sizeOf("gone.png")).toBeNull();
  });

  it("reads an object's length from S3 and treats only a 404 as missing (upload-limits)", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockImplementation(async (command: unknown) => {
      if (!(command instanceof HeadObjectCommand)) return {};
      if (command.input.Key === "map.png") return { ContentLength: 42 };
      throw Object.assign(new Error("failed"), { $metadata: { httpStatusCode: command.input.Key === "gone.png" ? 404 : 500 } });
    });
    const store = await S3AssetStore.connect({ endpoint: "http://s3:9000" });
    expect(await store.sizeOf("map.png")).toBe(42);
    expect(await store.sizeOf("gone.png")).toBeNull();
    await expect(store.sizeOf("broken.png")).rejects.toThrow("failed");
    expect(send).toHaveBeenCalled();
  });
});

describe("serving uploads while object storage is in use (upload-storage)", () => {
  it("serves object storage objects, falls through to disk for older uploads, and 404s the rest", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await writeFile(path.join(uploadDir, "old.png"), "from-disk");
    const app = await buildApp({ store: new MemoryRoomStore(), uploadDir, assets: fakeS3({ "new.png": "from-s3" }) });
    const base = await listenForFetch(app);
    try {
      expect(await (await fetch(`${base}/uploads/new.png`)).text()).toBe("from-s3");
      expect(await (await fetch(`${base}/uploads/old.png`)).text()).toBe("from-disk");
      expect((await fetch(`${base}/uploads/missing.png`)).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe("upload checksums by endpoint (s3-upload-checksum-compat)", () => {
  it("keeps the SDK's default checksums only for AWS S3 endpoints", () => {
    expect(isAwsEndpoint("https://s3.amazonaws.com")).toBe(true);
    expect(isAwsEndpoint("https://s3.us-east-2.amazonaws.com")).toBe(true);
    expect(isAwsEndpoint("https://s3.cn-north-1.amazonaws.com.cn")).toBe(true);
    expect(isAwsEndpoint("http://s3:8333")).toBe(false);
    expect(isAwsEndpoint(DEV_S3_ENDPOINT)).toBe(false);
    expect(isAwsEndpoint("https://amazonaws.com.evil.example")).toBe(false);
    expect(isAwsEndpoint("not a url")).toBe(false);
  });
});
