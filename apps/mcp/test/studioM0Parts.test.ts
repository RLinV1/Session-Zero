import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_DCR_CLIENTS, StudioAuth, UNUSED_CLIENT_TTL_MS } from "../src/studioM0/auth";
import { renderMarkedCrop } from "../src/studioM0/crop";
import { EvidenceLog, StudioError, type StudioFile } from "../src/studioM0/store";

/** interactive-ai-scene-studio M0: unit checks of harness parts the endpoint test can't easily reach. */
describe("Studio M0 harness parts (FR-GM-26, interactive-ai-scene-studio M0)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "studio-m0-parts-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function mapFile(width: number, height: number): Promise<StudioFile> {
    const bytes = await sharp({ create: { width, height, channels: 3, background: "#336699" } }).png().toBuffer();
    return { id: "f", name: "map.png", source: "fixture", mimeType: "image/png", bytes, sha256: "", width, height, createdAt: "" };
  }

  it("marks crops at the minimum size and every placement keeps the marker inside the picture", async () => {
    const file = await mapFile(64, 64);
    for (let i = 0; i < 20; i++) {
      const crop = await renderMarkedCrop(file, { width: 32, height: 32 }, path.join(dir, "key.jsonl"), "t");
      expect(crop.output).toEqual({ width: 32, height: 32 });
    }
  });

  it("refuses a crop too thin to show once scaled, with a message the model can act on", async () => {
    const file = await mapFile(4000, 100);
    await expect(renderMarkedCrop(file, {}, path.join(dir, "key.jsonl"), "t")).rejects.toBeInstanceOf(StudioError);
  });

  it("never rejects when the evidence log can't be written", async () => {
    const blocker = path.join(dir, "not-a-dir");
    await writeFile(blocker, "");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(new EvidenceLog(path.join(blocker, "evidence.jsonl")).write("x")).resolves.toBeUndefined();
    expect(errors).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  describe("dynamic client registration", () => {
    let clock = 0;
    let authDir: string;
    let server: Server;
    let base: string;
    let auth: StudioAuth;
    const log = () => new EvidenceLog(path.join(authDir, "evidence.jsonl"));
    const makeAuth = () => new StudioAuth({ publicOrigin: "https://s.test", resourcePath: "/mcp/studio-m0", dataDir: authDir, log: log(), now: () => clock });
    const register = () => fetch(`${base}/oauth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ redirect_uris: ["https://host.test/cb"], token_endpoint_auth_method: "none" }) });
    const savedIds = async () => (JSON.parse(await readFile(path.join(authDir, "clients.json"), "utf8")) as { clientId: string }[]).map((c) => c.clientId);

    beforeAll(async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      authDir = await mkdtemp(path.join(dir, "auth-"));
      auth = makeAuth();
      await auth.init();
      const app = express().use(auth.router());
      server = await new Promise<Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      vi.restoreAllMocks();
    });

    it("keeps every client from simultaneous registrations, and a restart reloads them", async () => {
      const ids = await Promise.all(Array.from({ length: 30 }, async () => ((await (await register()).json()) as { client_id: string }).client_id));
      await auth.saveClients(); // Queued after every registration's save.
      expect(new Set(await savedIds())).toEqual(new Set(ids));
      // A restarted server saves exactly what it loaded: every one is still there.
      const restarted = makeAuth();
      await restarted.init();
      await restarted.saveClients();
      expect(new Set(await savedIds())).toEqual(new Set(ids));
    });

    it("holds a bounded number of clients, and unused ones expire to make room", async () => {
      let status = 0;
      for (let i = 0; i < MAX_DCR_CLIENTS + 5 && status !== 503; i++) status = (await register()).status;
      expect(status).toBe(503);
      clock += UNUSED_CLIENT_TTL_MS;
      expect((await register()).status).toBe(201);
      await auth.saveClients(); // Drain the saves the cleanup queued.
      expect(await savedIds()).toHaveLength(1);
    });
  });

  it("refuses an access-token lifetime that isn't a whole number of seconds in range", () => {
    const log = new EvidenceLog(path.join(dir, "evidence.jsonl"));
    const make = (accessTtlSeconds?: number) => new StudioAuth({ publicOrigin: "https://s.test", resourcePath: "/mcp/studio-m0", dataDir: dir, accessTtlSeconds, log });
    for (const bad of [Number.NaN, 0, 5, 1.5, 100_000]) expect(() => make(bad)).toThrow(/10 to 86400/);
    expect(() => make(undefined)).not.toThrow();
    expect(() => make(600)).not.toThrow();
  });
});
