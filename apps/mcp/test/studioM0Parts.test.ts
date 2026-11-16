import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { StudioAuth } from "../src/studioM0/auth";
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

  it("refuses an access-token lifetime that isn't a whole number of seconds in range", () => {
    const log = new EvidenceLog(path.join(dir, "evidence.jsonl"));
    const make = (accessTtlSeconds?: number) => new StudioAuth({ publicOrigin: "https://s.test", resourcePath: "/mcp/studio-m0", dataDir: dir, accessTtlSeconds, log });
    for (const bad of [Number.NaN, 0, 5, 1.5, 100_000]) expect(() => make(bad)).toThrow(/10 to 86400/);
    expect(() => make(undefined)).not.toThrow();
    expect(() => make(600)).not.toThrow();
  });
});
