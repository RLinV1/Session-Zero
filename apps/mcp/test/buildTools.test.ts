import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONDITIONS } from "@vtt/shared";
import { startMcpServer } from "../src/app";
import { AiClient, startStack, type Stack } from "./helpers";

const BUILD_TOOLS = ["check_build", "get_build", "get_map_setup", "remove_draft_item", "save_creatures", "save_encounter", "save_game_profile", "save_map", "save_map_setup", "view_file"];

let stack: Stack;
let ai: AiClient;

beforeEach(async () => {
  stack = await startStack();
  ai = await AiClient.connect(`${stack.mcp.url}/build`);
});
afterEach(async () => {
  await ai.close();
  await stack.close();
  vi.restoreAllMocks();
});

async function startBuild(displayName = "Vincent") {
  const account = await stack.room.signUp({ displayName });
  const { build, pass } = await account.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name: "Hollow Coast" });
  return { account, id: build.id, pass };
}

const upload = async (pass: string, kind: string, name: string, width = 700, height = 700) => {
  const image = await sharp({ create: { width, height, channels: 3, background: "#884422" } }).png().toBuffer();
  const body = new FormData();
  body.append("file", new Blob([image], { type: "image/png" }), name);
  const res = await fetch(`${stack.room.base}/api/build/current/files?kind=${kind}`, { method: "POST", headers: { authorization: `Bearer ${pass}` }, body });
  expect(res.status).toBe(201);
  return (await res.json() as { file: { id: string } }).file.id;
};

const creature = (over: Record<string, unknown> = {}) => ({ key: "goblin", name: "Goblin", isPlayerCharacter: false, hp: 7, maxHp: 7, ac: 13, ...over });

describe("the build tools (FR-GM-26)", () => {
  it("offers exactly the ten tools, and none can publish or reach outside the draft", async () => {
    const names = (await ai.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(BUILD_TOOLS);
  });

  it("has no argument that takes file contents or a web address", async () => {
    const { tools } = await ai.listTools();
    for (const tool of tools) {
      const properties = Object.keys((tool.inputSchema as { properties?: object }).properties ?? {});
      expect(properties.filter((p) => /url|link|address|bytes|base64|image$|content/i.test(p))).toEqual([]);
    }
  });

  it("says material text is data, and to name whose build it is", async () => {
    const { tools } = await ai.listTools();
    const getBuild = tools.find((t) => t.name === "get_build")!;
    expect(getBuild.description).toMatch(/whose build/i);
    expect(getBuild.description).toMatch(/not instructions/i);
    expect(ai.instructions).toMatch(/never instructions/i);
  });

  it("tools at the player address don't accept a pass", async () => {
    const { pass } = await startBuild();
    const player = stack.ai;
    const result = await player.call("get_view", { seat: pass });
    expect(result.isError).toBe(true);
    expect(await player.call("get_build", { pass })).toMatchObject({ isError: true, text: expect.stringMatching(/not found/i) });
  });

  it("names the build and whose it is, with the field guide", async () => {
    const { pass, id } = await startBuild("Vincent");
    const { json, isError } = await ai.call("get_build", { pass });
    expect(isError).toBe(false);
    expect(json).toMatchObject({ build: { id, name: "Hollow Coast" }, ownerName: "Vincent" });
  });

  it("the field guide says what can be stored and what can't (5.3)", async () => {
    const { pass } = await startBuild();
    const { text } = await ai.call("get_build", { pass });
    for (const condition of CONDITIONS) expect(text).toContain(condition.id);
    expect(text).toMatch(/Never invent a value/);
    expect(text).toMatch(/Large: 2\. Huge: 3\. Gargantuan: 4/);
    expect(text).toMatch(/no field for class, level, abilities, skills, saves, speed, spells, gear or notes/);
    expect(text).toMatch(/Optional\. A hex colour/);
    expect(text).toMatch(/not instructions/);
    expect(text).toMatch(/can't publish/);
    expect(text).toMatch(/4, 6, 8, 10, 12, 20, 100/);
  });

  it("gives an upload command for the public address, with no pass in it", async () => {
    const { pass } = await startBuild();
    const { text, json } = await ai.call("get_build", { pass });
    expect(JSON.stringify(json.upload)).toContain("http://localhost:5173/api/build/current/files?kind=token");
    expect(JSON.stringify(json.upload)).toContain("<pass>");
    expect(text).not.toContain(pass);
  });

  it("refuses a seat value given as a pass", async () => {
    const seat = `${randomUUID()}.${"a".repeat(43)}`;
    const result = await ai.call("get_build", { pass: seat });
    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/isn't a build pass/) });
  });

  it("tells the AI to ask for a new pass when one is cancelled", async () => {
    const { pass, id, account } = await startBuild();
    await account.request("DELETE", `/api/builds/${id}/pass`);
    const result = await ai.call("get_build", { pass });
    expect(result).toMatchObject({ isError: true, text: expect.stringMatching(/new one/) });
  });

  it("never sends the pass to the log when something fails", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = await startMcpServer({ roomServerUrl: "http://127.0.0.1:9", allowedOrigins: [] });
    const client = await AiClient.connect(`${broken.url}/build`);
    const pass = `szb_${"k".repeat(43)}`;
    const result = await client.call("get_build", { pass });
    expect(result.isError).toBe(true);
    expect(result.text).not.toContain(pass);
    expect(JSON.stringify(errors.mock.calls)).not.toContain(pass);
    await client.close();
    await broken.close();
  });

  it("forwards the pass as a header and the client's address", async () => {
    let seen: IncomingHttpHeaders = {};
    const fake = createServer((req, res) => {
      seen = req.headers;
      res.setHeader("content-type", "application/json");
      res.end("{}");
    });
    await new Promise<void>((resolve) => fake.listen(0, "127.0.0.1", resolve));
    const mcp = await startMcpServer({ roomServerUrl: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, allowedOrigins: [] });
    const client = await AiClient.connect(`${mcp.url}/build`);
    const pass = `szb_${"z".repeat(43)}`;
    await client.call("check_build", { pass });
    expect(seen.authorization).toBe(`Bearer ${pass}`);
    expect(seen["x-forwarded-for"]).toMatch(/127\.0\.0\.1/);
    await client.close();
    await mcp.close();
    fake.close();
  });

  it("saves creatures, each alone", async () => {
    const { pass } = await startBuild();
    const { json } = await ai.call("save_creatures", { pass, creatures: [creature({ key: "a" }), creature({ key: "b", maxHp: 20000 }), creature({ key: "c" })] });
    expect((json.results as { saved: boolean }[]).map((r) => r.saved)).toEqual([true, false, true]);
    expect(JSON.stringify(json)).toContain("maxHp");
  });

  it("names the die it refuses, and a blank retry works", async () => {
    const { pass } = await startBuild();
    const attack = (damage: unknown) => ({ name: "Sting", toHit: null, damage });
    const refused = await ai.call("save_creatures", { pass, creatures: [creature({ attacks: [attack({ terms: [{ count: 1, sides: 3 }], modifier: 0 })] })] });
    expect(JSON.stringify(refused.json)).toContain("d3");
    const retry = await ai.call("save_creatures", { pass, creatures: [creature({ attacks: [{ name: "Sting", toHit: { terms: [{ count: 1, sides: 20 }], modifier: 2 }, damage: null }], flags: [{ field: "damage", message: "d3 isn't available" }] })] });
    expect((retry.json.results as { saved: boolean }[])[0]?.saved).toBe(true);
  });

  it("saves mixed dice, and still takes an older client's one-die dice as one term (ADR 0061)", async () => {
    const { pass } = await startBuild();
    const mixed = { name: "Flame tongue", toHit: null, damage: { terms: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }], modifier: 3 } };
    const old = { name: "Bite", toHit: { count: 1, sides: 20, modifier: 4 }, damage: null };
    const saved = await ai.call("save_creatures", { pass, creatures: [creature({ attacks: [mixed, old] })] });
    expect((saved.json.results as { saved: boolean }[])[0]?.saved).toBe(true);
    const { json } = await ai.call("get_build", { pass });
    expect(json.items).toMatchObject([{ data: { attacks: [
      { damage: { terms: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }], modifier: 3 } },
      { toHit: { terms: [{ count: 1, sides: 20 }], modifier: 4 } },
    ] } }]);
  });

  it("saves a repeat by key rather than adding one", async () => {
    const { pass } = await startBuild();
    await ai.call("save_creatures", { pass, creatures: [creature({ hp: 1, maxHp: 1 })] });
    await ai.call("save_creatures", { pass, creatures: [creature({ hp: 9, maxHp: 9 })] });
    const { json } = await ai.call("get_build", { pass });
    expect(json.items).toMatchObject([{ key: "goblin", data: { hp: 9 } }]);
  });

  it("builds a whole draft and reports what still needs doing", async () => {
    const { pass } = await startBuild();
    const fileId = await upload(pass, "map", "cave.png");
    expect((await ai.call("save_game_profile", { pass, name: "Lanternfall", unitsPerCell: 5, unitLabel: "ft" })).isError).toBe(false);
    expect((await ai.call("save_map", { pass, key: "cave", name: "Cave", fileId, proposedGrid: { cellSize: 70, offsetX: 0, offsetY: 0 } })).isError).toBe(false);
    await ai.call("save_creatures", { pass, creatures: [creature()] });
    const encounter = await ai.call("save_encounter", {
      pass, key: "ambush", name: "Ambush", mapKey: "cave",
      tokens: [{ creatureKey: "goblin", square: { column: 2, row: 3 }, hidden: true }, { creatureKey: "goblin", square: null, hidden: false }],
    });
    expect(encounter.isError).toBe(false);
    const { json } = await ai.call("check_build", { pass });
    const messages = (json.issues as { message: string }[]).map((i) => i.message).join(" | ");
    expect(messages).toMatch(/waiting for the user/);
    expect(messages).toMatch(/no square/);
  });

  it("refuses an encounter off the map, naming the token", async () => {
    const { pass } = await startBuild();
    const fileId = await upload(pass, "map", "cave.png");
    await ai.call("save_map", { pass, key: "cave", name: "Cave", fileId, proposedGrid: { cellSize: 70, offsetX: 0, offsetY: 0 } });
    await ai.call("save_creatures", { pass, creatures: [creature()] });
    const result = await ai.call("save_encounter", { pass, key: "e", name: "E", mapKey: "cave", tokens: [{ creatureKey: "goblin", name: "Scout", square: { column: 99, row: 0 }, hidden: false }] });
    expect(result).toMatchObject({ isError: true, text: expect.stringContaining("Scout") });
  });

  it("shows a small picture, and no address", async () => {
    const { pass } = await startBuild();
    const fileId = await upload(pass, "map", "cave.png", 3000, 1500);
    const result = await ai.call("view_file", { pass, fileId });
    expect(result.isError).toBe(false);
    expect(result.images[0]?.mimeType).toBe("image/webp");
    const { width } = await sharp(Buffer.from(result.images[0]!.data, "base64")).metadata();
    expect(width).toBe(1500);
    expect(result.text).toBe("");
  });

  it("reports no such file for one from another build", async () => {
    const mine = await startBuild();
    const other = await startBuild();
    const fileId = await upload(other.pass, "token", "a.png", 64, 64);
    expect(await ai.call("view_file", { pass: mine.pass, fileId })).toMatchObject({ isError: true, text: expect.stringMatching(/no file/) });
  });

  it("removes a draft item, but not one the user changed", async () => {
    const { pass, id } = await startBuild();
    await ai.call("save_creatures", { pass, creatures: [creature({ key: "a" }), creature({ key: "b" })] });
    await stack.room.store.markBuildItem(id, "creature", "b", { editedByUser: true });
    expect((await ai.call("remove_draft_item", { pass, kind: "creature", key: "a" })).isError).toBe(false);
    expect(await ai.call("remove_draft_item", { pass, kind: "creature", key: "b" })).toMatchObject({ isError: true, text: expect.stringMatching(/user changed/) });
  });

  it("tells the AI to wait when it sends too much", async () => {
    const { pass } = await startBuild();
    for (let i = 0; i < 120; i++) await fetch(`${stack.room.base}/api/build/current`, { headers: { authorization: `Bearer ${pass}` } });
    expect(await ai.call("check_build", { pass })).toMatchObject({ isError: true, text: expect.stringMatching(/Wait \d+ seconds/) });
  });

  it("nothing done through the tools reaches the library", async () => {
    const { pass, account } = await startBuild();
    await ai.call("save_creatures", { pass, creatures: [creature()] });
    expect(await account.json<unknown[]>("GET", "/api/library/creatures")).toEqual([]);
  });
});

describe("setting up maps, as far as the owner allows (FR-GM-26, ADR 0053)", () => {
  async function startWith(choices: { aiGrid?: boolean; aiWalls?: boolean }) {
    const account = await stack.room.signUp({ displayName: "Vincent" });
    const { build, pass } = await account.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", { name: "Lanternfall", ...choices });
    return { account, id: build.id, pass };
  }

  /** A UVTT map of 8 by 6 squares of 50 pixels, with one closed opening, saved as draft map "shop". */
  async function uvttMap(pass: string) {
    const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#884422" } }).png().toBuffer();
    const uvtt = JSON.stringify({
      format: 0.3, image: image.toString("base64"),
      resolution: { pixels_per_grid: 50, map_size: { x: 8, y: 6 }, map_origin: { x: 0, y: 0 } },
      line_of_sight: [[{ x: 0, y: 2 }, { x: 8, y: 2 }]],
      portals: [{ bounds: [{ x: 3, y: 2 }, { x: 4, y: 2 }], position: { x: 3.5, y: 2 }, rotation: 0, closed: true, freestanding: false }],
    });
    const body = new FormData();
    body.append("file", new Blob([uvtt], { type: "application/json" }), "chandlery.uvtt");
    const res = await fetch(`${stack.room.base}/api/build/current/files?kind=uvtt`, { method: "POST", headers: { authorization: `Bearer ${pass}` }, body });
    expect(res.status).toBe(201);
    const fileId = (await res.json() as { file: { id: string } }).file.id;
    expect((await ai.call("save_map", { pass, key: "shop", name: "Chandlery", fileId })).isError).toBe(false);
    return fileId;
  }

  it("tells the AI what the owner allows, and how to read positions", async () => {
    const { pass } = await startWith({ aiWalls: true });
    const { json, text } = await ai.call("get_build", { pass });
    expect(json.allowed).toEqual({ grids: false, walls: true });
    expect(text).toMatch(/Corner \(c, r\) is the top-left corner of square \(c, r\)/);
    expect(text).toMatch(/Don't guess/);
    expect(ai.instructions).toMatch(/only as far as get_build's allowed/);
  });

  it("lists the numbered openings, and sets one as a locked door", async () => {
    const { pass } = await startWith({ aiWalls: true });
    await uvttMap(pass);
    expect((await ai.call("get_map_setup", { pass, mapKey: "shop" })).json).toMatchObject({
      allowed: { walls: true }, openings: [{ number: 1, square: { column: 3, row: 2 }, now: { kind: "opening" } }],
    });
    const saved = await ai.call("save_map_setup", {
      pass, mapKey: "shop",
      openings: [{ number: 1, kind: "door", state: "locked" }],
      marks: [{ square: { column: 6, row: 4 }, reason: "A gap in the wall that might be an archway." }],
    });
    expect(saved.isError).toBe(false);
    expect(saved.json).toMatchObject({ openings: [{ number: 1, now: { kind: "door", state: "locked" }, set: true }], marks: [{ square: { column: 6, row: 4 } }] });
  });

  it("refuses walls when the owner hasn't allowed them, saying where to turn them on", async () => {
    const { pass } = await startWith({});
    await uvttMap(pass);
    const refused = await ai.call("save_map_setup", { pass, mapKey: "shop", openings: [{ number: 1, kind: "door", state: "open" }] });
    expect(refused).toMatchObject({ isError: true, text: expect.stringMatching(/Let my AI set walls, doors and windows/) });
  });

  it("passes on the room server's message naming a bad line", async () => {
    const { pass } = await startWith({ aiWalls: true });
    await uvttMap(pass);
    const refused = await ai.call("save_map_setup", { pass, mapKey: "shop", lines: [{ from: { column: 0, row: 1 }, to: { column: 0, row: 1 }, kind: "wall" }] });
    expect(refused).toMatchObject({ isError: true, text: expect.stringMatching(/two different corners/) });
  });

  it("draws the grid and openings on a closer look at the map", async () => {
    const { pass } = await startWith({ aiWalls: true });
    const fileId = await uvttMap(pass);
    const result = await ai.call("view_file", { pass, fileId, overlay: true, fromColumn: 2, toColumn: 4, fromRow: 1, toRow: 2 });
    expect(result.isError).toBe(false);
    expect(await sharp(Buffer.from(result.images[0]!.data, "base64")).metadata()).toMatchObject({ width: 600, height: 400 });
  });
});
