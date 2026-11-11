import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_EDGE, mapOverlay, renderMapImage } from "../src/mapImage";
import { addToken, eventually, gmDoes, joinAs, openTable, squareCenter, startStack, type Stack } from "./helpers";

/** Pure magenta, so any pixel of the raw map stands out from the mask and from a JPEG's noise. */
const MAP_COLOR = { r: 255, g: 0, b: 255 };
const MASK = { r: 0x14, g: 0x14, b: 0x1a };

const near = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tolerance = 16) =>
  Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance;

/** Reads pixels back out of a returned image, at output coordinates. */
async function decode(base64: string) {
  const { data, info } = await sharp(Buffer.from(base64, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    at(x: number, y: number) {
      const i = (Math.round(y) * info.width + Math.round(x)) * info.channels;
      return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]! };
    },
  };
}

describe("get_map_image (FR-PL-08, FR-GM-17, FR-GM-19)", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack();
  });
  afterAll(() => stack.close());
  afterEach(() => vi.restoreAllMocks());

  /** A solid map uploaded to the room server, placed in a room, with an AI seated and its GM connected. */
  const mappedTable = async (width = 1400, height = 1400) => {
    const table = await openTable(stack.room);
    const key = `map-${table.roomId}.png`;
    await sharp({ create: { width, height, channels: 3, background: MAP_COLOR } }).png({ compressionLevel: 1 }).toFile(path.join(stack.room.uploadDir, key));
    await gmDoes(table.gm, { type: "scene.setMap", map: { url: `/uploads/${key}`, width, height } });
    return { ...table, ...(await joinAs(stack.ai, table.inviteCode, "Oswin")) };
  };

  const image = async (seat: string) => {
    const result = await stack.ai.call("get_map_image", { seat });
    expect(result.isError).toBe(false);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]!.mimeType).toBe("image/jpeg");
    return decode(result.images[0]!.data);
  };

  it("says when there is no map yet", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const result = await stack.ai.call("get_map_image", { seat });
    expect(result.isError).toBe(false);
    expect(result.images).toHaveLength(0);
    expect(result.json.message).toMatch(/no map yet/);
    gm.close();
  });

  it("paints a fogged area opaque, not the map underneath", async () => {
    const { gm, seat } = await mappedTable();
    expect(near((await image(seat)).at(1000, 1000), MAP_COLOR)).toBe(true);

    await gmDoes(gm, { type: "fog.add", region: { shape: "rect", from: { x: 700, y: 700 }, to: { x: 1400, y: 1400 } } });
    const fogged = await eventually(() => image(seat), (img) => near(img.at(1000, 1000), MASK));
    expect(near(fogged.at(1000, 1000), MASK)).toBe(true);
    expect(near(fogged.at(1395, 1395), MASK)).toBe(true);
    // Just outside the fog is still the map (between grid lines, so the line color doesn't count).
    expect(near(fogged.at(35, 1000), MAP_COLOR, 90)).toBe(true);
    gm.close();
  });

  it("paints a polygon fog region where it really is", async () => {
    const { gm, seat } = await mappedTable();
    await gmDoes(gm, { type: "fog.add", region: { shape: "polygon", points: [{ x: 700, y: 0 }, { x: 1400, y: 700 }, { x: 700, y: 700 }] } });
    const img = await eventually(() => image(seat), (i) => near(i.at(900, 500), MASK));
    expect(near(img.at(1200, 200), MAP_COLOR, 90)).toBe(true);
    gm.close();
  });

  it("with line of sight on, shows only what is inside the seat's sight", async () => {
    const { gm, seat, participantId } = await mappedTable();
    const { cellSize } = gm.state.scene.grid;
    await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 1), ownerIds: [participantId] });
    await gmDoes(gm, { type: "wall.add", walls: [{ a: { x: 700, y: 0 }, b: { x: 700, y: 1400 } }] });
    await gmDoes(gm, { type: "scene.setLineOfSight", enabled: true });
    const img = await eventually(() => image(seat), (i) => near(i.at(cellSize * 15.5, cellSize * 10.5), MASK));
    expect(near(img.at(cellSize * 4.5, cellSize * 6.5), MAP_COLOR, 90)).toBe(true);
    expect(near(img.at(cellSize * 15.5, cellSize * 1.5), MASK)).toBe(true);
    gm.close();
  });

  it("gives two seats with different sight different images", async () => {
    const { gm, inviteCode, seat, participantId } = await mappedTable();
    const pip = await joinAs(stack.ai, inviteCode, "Pip");
    await addToken(gm, { name: "Oswin", position: squareCenter(gm, 1, 10), ownerIds: [participantId] });
    await addToken(gm, { name: "Pip", position: squareCenter(gm, 18, 10), ownerIds: [pip.participantId] });
    await gmDoes(gm, { type: "wall.add", walls: [{ a: { x: 700, y: 0 }, b: { x: 700, y: 1400 } }] });
    await gmDoes(gm, { type: "scene.setLineOfSight", enabled: true });
    const { cellSize } = gm.state.scene.grid;
    const left = cellSize * 4.5;
    const right = 1400 - cellSize * 4.5;
    const y = cellSize * 15.5;

    const oswin = await eventually(() => image(seat), (i) => near(i.at(right, y), MASK));
    const pips = await eventually(() => image(pip.seat), (i) => near(i.at(left, y), MASK));
    expect(near(oswin.at(left, y), MAP_COLOR, 90)).toBe(true);
    expect(near(pips.at(right, y), MAP_COLOR, 90)).toBe(true);
    gm.close();
  });

  it("with line of sight on and no token, shows nothing", async () => {
    const { gm, seat } = await mappedTable();
    await gmDoes(gm, { type: "scene.setLineOfSight", enabled: true });
    const img = await eventually(() => image(seat), (i) => near(i.at(735, 735), MASK));
    expect(near(img.at(1015, 315), MASK)).toBe(true);
    gm.close();
  });

  it("shows nothing in the moment line of sight is on but the seat's sight hasn't arrived", async () => {
    const { gm, participantId } = await mappedTable();
    const you = gm.state.participants[participantId]!;
    // What a seat's mirror holds after the event, until the snapshot that follows it.
    const state = { ...gm.state, scene: { ...gm.state.scene, lineOfSight: true }, sight: undefined };
    const rendered = await renderMapImage(state, you, { roomServerUrl: stack.room.base, builtinMapDir: "/nowhere" });
    if (rendered.kind !== "image") throw new Error(rendered.message);
    const img = await decode(rendered.data.toString("base64"));
    expect(near(img.at(735, 735), MASK)).toBe(true);
    expect(near(img.at(1015, 315), MASK)).toBe(true);
    gm.close();
  });

  it("marks only the tokens in the seat's filtered state", async () => {
    const { gm, seat } = await mappedTable();
    const shown = squareCenter(gm, 3, 3);
    const hidden = squareCenter(gm, 8, 8);
    await addToken(gm, { name: "Shown", position: shown, color: "#00ff00" });
    await addToken(gm, { name: "Secret", position: hidden, color: "#00ff00", hidden: true });
    const img = await eventually(() => image(seat), (i) => !near(i.at(shown.x, shown.y), MAP_COLOR, 90));
    expect(near(img.at(hidden.x, hidden.y), MAP_COLOR, 90)).toBe(true);
    gm.close();
  });

  it("scales a large map down, with the fog still aligned", async () => {
    const { gm, seat } = await mappedTable(4000, 2000);
    await gmDoes(gm, { type: "fog.add", region: { shape: "rect", from: { x: 2000, y: 0 }, to: { x: 4000, y: 2000 } } });
    const img = await eventually(() => image(seat), (i) => near(i.at(1115, 406), MASK));
    expect(Math.max(img.width, img.height)).toBe(MAX_IMAGE_EDGE);
    expect(img.width).toBe(1500);
    expect(img.height).toBe(750);
    // Either side of the fog's edge, which falls exactly halfway across, between grid lines 26.25 pixels apart.
    expect(near(img.at(775, 406), MASK)).toBe(true);
    expect(near(img.at(722, 406), MAP_COLOR, 90)).toBe(true);
    gm.close();
  });

  it("refuses a map over 64 megapixels with a message, and get_view still works", async () => {
    const { gm, inviteCode } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    await gmDoes(gm, { type: "scene.setMap", map: { url: "/uploads/huge.png", width: 10_000, height: 10_000 } });
    const result = await eventually(() => stack.ai.call("get_map_image", { seat }), (r) => /too large/.test(r.text));
    expect(result.images).toHaveLength(0);
    expect((await stack.ai.call("get_view", { seat })).isError).toBe(false);
    gm.close();
  });

  it("refuses a file over 64 megapixels even if the room says it is small", async () => {
    const { gm, inviteCode, roomId } = await openTable(stack.room);
    const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
    const key = `huge-${roomId}.png`;
    await sharp({ create: { width: 8100, height: 8000, channels: 3, background: MAP_COLOR } }).png({ compressionLevel: 1 }).toFile(path.join(stack.room.uploadDir, key));
    await gmDoes(gm, { type: "scene.setMap", map: { url: `/uploads/${key}`, width: 100, height: 100 } });
    const result = await eventually(() => stack.ai.call("get_map_image", { seat }), (r) => /too large/.test(r.text), 5_000);
    expect(result.images).toHaveLength(0);
    gm.close();
  });

  describe("a picture that doesn't sit under the masks as the board's does", () => {
    const RED = { r: 255, g: 0, b: 0 };
    const BLUE = { r: 0, g: 0, b: 255 };

    /** Left half red, right half blue: the fog goes over the secret blue half. */
    const twoHalves = (width: number, height: number) =>
      sharp({ create: { width, height, channels: 3, background: RED } }).composite([{
        input: { create: { width: Math.ceil(width / 2), height, channels: 3, background: BLUE } },
        left: Math.floor(width / 2),
        top: 0,
      }]).png().toBuffer();

    /** Places a file in a room as `width` by `height`, with the right half of that board under fog. */
    const placed = async (file: Buffer, extension: string, width: number, height: number) => {
      const table = await openTable(stack.room);
      const key = `tagged-${table.roomId}.${extension}`;
      await writeFile(path.join(stack.room.uploadDir, key), file);
      await gmDoes(table.gm, { type: "scene.setMap", map: { url: `/uploads/${key}`, width, height } });
      await gmDoes(table.gm, { type: "fog.add", region: { shape: "rect", from: { x: width / 2, y: 0 }, to: { x: width, y: height } } });
      const { seat } = await joinAs(stack.ai, table.inviteCode, "Oswin");
      const result = await eventually(() => stack.ai.call("get_map_image", { seat }), (r) => r.images.length === 1 || /unavailable/.test(r.text));
      return { ...table, result };
    };

    const shareOfBlue = async (base64: string) => {
      const { data, info } = await sharp(Buffer.from(base64, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      let blue = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (near({ r: data[i]!, g: data[i + 1]!, b: data[i + 2]! }, BLUE, 60)) blue++;
      }
      return blue / (data.length / info.channels);
    };

    it("shows none of the fogged half of an ordinary picture", async () => {
      const { gm, result } = await placed(await twoHalves(800, 400), "png", 800, 400);
      expect(result.images).toHaveLength(1);
      expect(await shareOfBlue(result.images[0]!.data)).toBe(0);
      gm.close();
    });

    it("refuses a WebP with a rotation tag, which browsers don't agree on", async () => {
      const file = await sharp(await twoHalves(800, 400)).webp().withMetadata({ orientation: 6 }).toBuffer();
      expect((await sharp(file).metadata()).orientation).toBe(6);
      const { gm, result } = await placed(file, "webp", 800, 400);
      expect(result.images).toHaveLength(0);
      expect(result.json.message).toMatch(/unavailable/);
      gm.close();
    });

    it("refuses a file whose size isn't the one the room stored, since the board draws it at its own size", async () => {
      const { gm, result } = await placed(await twoHalves(400, 400), "png", 800, 800);
      expect(result.images).toHaveLength(0);
      expect(result.json.message).toMatch(/unavailable/);
      gm.close();
    });

    it("refuses a size mismatch in just one direction", async () => {
      const { gm, result } = await placed(await twoHalves(800, 400), "png", 800, 401);
      expect(result.images).toHaveLength(0);
      gm.close();
    });

    it("keeps a rotated JPEG aligned, since browsers do apply its tag and store the rotated size", async () => {
      // Pictured sideways: on the file's own axes the top half is red and the bottom blue. Rotated by its tag, the blue half is on the left.
      const sideways = await sharp({ create: { width: 400, height: 800, channels: 3, background: RED } }).composite([{
        input: { create: { width: 400, height: 400, channels: 3, background: BLUE } }, left: 0, top: 400,
      }]).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toBuffer();
      expect((await sharp(sideways).metadata()).orientation).toBe(6);

      const { gm, result, roomId } = await placed(sideways, "jpg", 800, 400);
      expect(result.images).toHaveLength(1);
      const img = await decode(result.images[0]!.data);
      expect([img.width, img.height]).toEqual([800, 400]);
      // The fog is over the right half, which holds the red. The blue on the left is the part left showing.
      expect(near(img.at(175, 175), BLUE, 60)).toBe(true);
      expect(near(img.at(595, 175), MASK)).toBe(true);
      expect(roomId).toBeDefined();
      gm.close();
    });

    it("still draws when a token's name holds characters XML can't carry", async () => {
      const { gm, seat } = await mappedTable();
      await addToken(gm, { name: "Bad\u0001Name￾", position: squareCenter(gm, 1, 1) });
      const result = await eventually(() => stack.ai.call("get_view", { seat }), (v) => (v.json.tokens as unknown[]).length === 1);
      expect(result.isError).toBe(false);
      expect((await stack.ai.call("get_map_image", { seat })).images).toHaveLength(1);
      gm.close();
    });
  });

  it("returns an error rather than the raw image when the mask can't be applied", async () => {
    const { gm, participantId, roomId } = await mappedTable();
    const sources = { roomServerUrl: stack.room.base, builtinMapDir: "/nowhere" };
    const you = gm.state.participants[participantId]!;
    const state = gm.state;
    await expect(renderMapImage(state, you, sources, () => Buffer.from("<not-svg"))).rejects.toThrow(/couldn't be drawn safely/);
    await expect(renderMapImage(state, you, sources, () => { throw new Error("overlay broke"); })).rejects.toThrow(/couldn't be drawn safely/);
    expect(await renderMapImage(state, you, sources)).toMatchObject({ kind: "image" });
    expect(roomId).toBeDefined();
    gm.close();
  });

  it("gives up on a map read that stalls, and frees its place", async () => {
    const { gm, participantId } = await mappedTable();
    const you = gm.state.participants[participantId]!;
    const stalled = createServer(() => {});
    await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
    const sources = { roomServerUrl: `http://127.0.0.1:${(stalled.address() as AddressInfo).port}`, builtinMapDir: "/nowhere", readTimeoutMs: 100 };
    expect(await renderMapImage(gm.state, you, sources)).toMatchObject({ kind: "message", message: expect.stringMatching(/unavailable/) });
    stalled.closeAllConnections();
    await new Promise((resolve) => stalled.close(resolve));
    gm.close();
  });

  it("escapes a token's name in the drawing", async () => {
    const { gm, participantId } = await mappedTable();
    const you = gm.state.participants[participantId]!;
    await addToken(gm, { name: `<svg onload="x">&'`, position: squareCenter(gm, 1, 1) });
    const svg = mapOverlay({ state: gm.state, you, map: gm.state.scene.map!, width: 700, height: 700 }).toString();
    expect(svg).not.toContain("<svg onload");
    expect(svg).toContain("&#60;svg");
    gm.close();
  });

  describe("only reads a map from known places", () => {
    let requests = 0;
    const listener = createServer((_req, res) => {
      requests++;
      res.end("x");
    });
    let listenerUrl = "";
    beforeAll(async () => {
      await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
      listenerUrl = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise((resolve) => listener.close(resolve)));

    it.each([
      "LISTENER/latest/meta-data/",
      "http://169.254.169.254/latest/meta-data/",
      "//evil.example/uploads/x.png",
      "/uploads/../api/health",
      "/uploads/..",
      "/uploads/a/b.png",
      "/uploads/x.png?y=1",
      "/api/rooms",
      "/img/not-a-shipped-map.webp",
      "file:///etc/passwd",
    ])("says %s is unavailable, and requests nothing", async (url) => {
      const { gm, inviteCode } = await openTable(stack.room);
      const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
      await gmDoes(gm, { type: "scene.setMap", map: { url: url.replace("LISTENER", listenerUrl), width: 700, height: 700 } });
      await eventually(() => stack.ai.call("get_view", { seat }), (v) => (v.json.map as { present: boolean }).present);

      const fetched = vi.spyOn(globalThis, "fetch");
      requests = 0;
      const result = await stack.ai.call("get_map_image", { seat });
      expect(result.json.message).toMatch(/unavailable/);
      expect(result.images).toHaveLength(0);
      expect(requests).toBe(0);
      const roomServerRequests = fetched.mock.calls.map(([target]) => String(target)).filter((target) => target.startsWith(stack.room.base));
      expect(roomServerRequests).toEqual([]);
      gm.close();
    });

    it("doesn't decode an upload that isn't a map format, such as an SVG", async () => {
      const { gm, inviteCode, roomId } = await openTable(stack.room);
      const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
      const key = `sneaky-${roomId}.svg`;
      await writeFile(path.join(stack.room.uploadDir, key), `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700"><image href="${listenerUrl}/x"/></svg>`);
      await gmDoes(gm, { type: "scene.setMap", map: { url: `/uploads/${key}`, width: 700, height: 700 } });
      requests = 0;
      const result = await eventually(() => stack.ai.call("get_map_image", { seat }), (r) => /unavailable/.test(r.text));
      expect(result.images).toHaveLength(0);
      expect(requests).toBe(0);
      gm.close();
    });

    it("reads a built-in map from disk, not over the network", async () => {
      const { gm, inviteCode } = await openTable(stack.room);
      const { seat } = await joinAs(stack.ai, inviteCode, "Oswin");
      await gmDoes(gm, { type: "scene.setMap", map: { url: "/img/map-crypt.webp", width: 2800, height: 1680 } });
      const fetched = vi.spyOn(globalThis, "fetch");
      const result = await eventually(() => stack.ai.call("get_map_image", { seat }), (r) => r.images.length === 1);
      expect(fetched.mock.calls.map(([target]) => String(target)).filter((target) => target.startsWith(stack.room.base))).toEqual([]);
      const img = await decode(result.images[0]!.data);
      expect(img.width).toBe(MAX_IMAGE_EDGE);
      gm.close();
    });
  });
});
