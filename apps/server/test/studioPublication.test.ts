import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { BUILTIN_ROOM_DEFAULTS, DEFAULT_GRID, StudioInspection, StudioPublicationReceipt, StudioPublishReview, type CreateRoomResponse, type StudioPublishReviewInput } from "@vtt/shared";
import { hashToken } from "../src/domain/credentials";
import type { BuildPublishPlan, BuildPublishResult } from "../src/store/buildStore";
import { UPLOAD_ALLOWANCE } from "../src/store/libraryStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import type { RoomStore } from "../src/store/roomStore";
import { LocalStudioMediaStore, S3StudioMediaStore } from "../src/store/studioMediaStore";
import { newGuestToken, startServer, TestClient } from "./helpers";
import { storeCases } from "./storeHarness";
import { bearer, connectStudio, TEST_ORIGIN } from "./studioFlow";

const selection = { maps: [], creatures: [], encounters: ["watch"] };
const grid = { cellSize: 50, offsetX: 0, offsetY: 0 };
const wall = { kind: "wall", from: { column: 0, row: 1 }, to: { column: 7, row: 1 } };
const door = { kind: "door", state: "closed", from: { column: 1, row: 1 }, to: { column: 2, row: 1 } };
const token = (creatureKey: string, column: number, hidden: boolean) => ({ creatureKey, hidden, square: { column, row: 3 } });

async function fixture(store: RoomStore, s3 = false, now = Date.now) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "studio-publication-"));
  const media = s3 ? await S3StudioMediaStore.connect({
    endpoint: process.env.STUDIO_S3_ENDPOINT!, bucket: process.env.STUDIO_S3_BUCKET!, publicBucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.STUDIO_S3_ACCESS_KEY!, secretAccessKey: process.env.STUDIO_S3_SECRET_KEY!,
  }) : await LocalStudioMediaStore.connect(path.join(directory, "private"), path.join(directory, "public"));
  const png = (width: number, height: number, background: string) =>
    sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
  const bytes = { map: await png(525, 400, "#a76138"), token: await png(48, 48, "#617638") };
  const opts = {
    studio: { publicOrigin: TEST_ORIGIN }, studioMedia: media, now,
    studioDownloader: async (url: string) => url.endsWith("/token") ? bytes.token : bytes.map,
  };
  const server = await startServer(store, opts);
  const close = async () => {
    await server.close();
    if (media instanceof S3StudioMediaStore) media.close();
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const owner = await server.signUp();
    const { build: { id }, pass } = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds",
      { name: "Studio watch", aiWalls: true, aiTerrain: true });
    const gm = (await store.findUserById(owner.view!.id))!.ownerId;
    const { tokens } = await connectStudio(server.base, owner, [id]);
    const base = `/api/builds/${id}`;
    const mapRoute = `${base}/studio/authoring/maps/chapel`;
    const send = (method: string, suffix: string, input?: unknown) => fetch(`${server.base}/api/studio/builds/${id}${suffix}`, {
      method, headers: bearer(tokens.access_token, { "content-type": "application/json" }), body: input === undefined ? undefined : JSON.stringify(input),
    });
    const save = async (method: string, suffix: string, input: unknown) => {
      const res = await send(method, suffix, input);
      if (!res.ok) throw new Error(`${suffix}: ${res.status} ${await res.text()}`);
      return res;
    };
    const upload = async (kind: "map" | "token") => {
      const result = await save("POST", "/intake", { kind, file: {
        file_id: randomUUID(), download_url: `https://sdmntpreastus3.oaiusercontent.com/${kind}`, file_name: `${kind}.png`, mime_type: "image/png",
      } });
      const { file } = await result.json() as { file: { id: string } };
      return (await store.findBuildFile(id, file.id))!;
    };
    const map = await upload("map");
    const art = await upload("token");
    await save("POST", "/maps", { key: "chapel", name: "Chapel", fileId: map.id, proposedGrid: grid });
    await save("PUT", "/maps/chapel/setup", { lines: [wall, door], terrain: [{ row: 3, start: 2, end: 3, kind: "difficult" }] });
    await save("POST", "/creatures", { creatures: [
      { key: "guard", name: "Guard", isPlayerCharacter: false, hp: 173, size: 2, imageFileId: art.id },
      { key: "secret", name: "Unseen Herald", isPlayerCharacter: false, size: 1, imageFileId: art.id, hp: 137, maxHp: 137, ac: 19 },
    ] });
    await save("POST", "/encounters", { key: "watch", name: "Watch", mapKey: "chapel", tokens: [token("guard", 2, false), token("secret", 7, true)] });
    await save("POST", "/encounters", { key: "other", name: "Other watch", mapKey: "chapel", tokens: [] });
    const review = async (input: StudioPublishReviewInput = { selection }) =>
      StudioPublishReview.parse(await owner.json("POST", `${base}/publish/review`, input));
    const makeRequest = async () => {
      const inspected = StudioInspection.parse(await owner.json("GET", `${mapRoute}?encounterKey=watch`));
      return owner.json<{ requestId: string; baseRevisionId: string }>("POST", `${mapRoute}/requests`, {
        encounterKey: "watch", instruction: "Unlock the gate and move the guard", inspectedVersion: inspected.inspectedVersion, operationId: randomUUID(),
        selection: { region: { minX: 0, minY: 0, maxX: 400, maxY: 350 }, layers: ["geometry", "placements"],
          objectIds: inspected.objects.map(({ id }) => id), wholeObjectIds: [] },
      });
    };
    const advance = async () => {
      const request = await makeRequest();
      const inspected = StudioInspection.parse(await owner.json("GET", `${mapRoute}?encounterKey=watch`));
      const operations = [
        { op: "line.update", id: inspected.objects.find((entry) => entry.kind === "door")!.id, line: { ...door, state: "open" } },
        { op: "placement.move", id: inspected.scene.tokens[0]!.id, square: { column: 3, row: 4 } },
      ];
      const propose = () => send("POST", `/authoring/requests/${request.requestId}/proposals`, {
        baseRevisionId: request.baseRevisionId, operationId: randomUUID(), operations,
      });
      const response = await propose();
      if (!response.ok) throw new Error(await response.text());
      const { revisionId } = await response.json() as { revisionId: string };
      return { request, revisionId, propose };
    };
    const confirm = (revisionId: string) => owner.json<{ revisionId: string }>("POST", `${base}/publish/grid`, { mapKey: "chapel", revisionId });
    const publishInput = async () => {
      const pinned = await review();
      expect(pinned.digest, JSON.stringify(pinned.problems)).toBeTruthy();
      return { selection, digest: pinned.digest!, operationId: randomUUID() };
    };
    return { id, gm, pass, base, map, art, owner, server, bytes, opts, media, tokens, send, save, close, advance, confirm, publishInput, review, upload };
  } catch (error) { await close(); throw error; }
}

describe.each(storeCases)("M5 exact publication on %s (FR-GM-26, FR-GM-27, FR-GM-23)", (name, makeStore) => {
  it("pins divergent and historical candidates, restores explicitly, and keeps a single receipt across concurrent commits", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const { request, revisionId, propose } = await f.advance();
      expect((await store.findBuildItem(f.id, "encounter", "watch"))?.data.tokens).toMatchObject([token("guard", 2, false), token("secret", 7, true)]);
      const working = await f.review();
      expect(working.candidates[0]).toMatchObject({ candidate: { revision: { id: revisionId },
        scene: { tokens: [{ square: { column: 3, row: 4 } }, { hidden: true }] } }, confirmGrid: true });
      const historical = await f.review({ selection, candidate: { mapKey: "chapel", revisionId: request.baseRevisionId } });
      expect(historical.digest).toBeNull();
      expect(historical.candidates[0]?.candidate.scene.tokens[0]?.square).toEqual({ column: 2, row: 3 });
      const restored = await f.owner.json<{ revisionId: string }>("POST", `${f.base}/studio/authoring/maps/chapel/restore`, {
        revisionId, expectedCurrentRevisionId: revisionId, operationId: randomUUID(),
      });
      const confirmed = await f.confirm(restored.revisionId);
      const before = (await store.findBuild(f.id, f.gm))!.updatedAt;
      const publishedReview = await f.review();
      expect(publishedReview.candidates[0]?.candidate.revision.id).toBe(confirmed.revisionId);
      expect(publishedReview.disclosesOriginals).toBe(true);
      expect(publishedReview.otherEncounters).toMatchObject([{ key: "other" }]);
      expect(publishedReview.encounters[0]?.data).toMatchObject({
        grid, walls: [{}, {}, { portal: { kind: "door", state: "open" } }],
        terrain: [{ row: 3, start: 2, end: 3, kind: "difficult" }],
        tokens: [{ name: "Guard", position: { x: 200, y: 250 }, stats: { hp: 173, maxHp: null, ac: null } }, { name: "Unseen Herald", hidden: true }],
      });
      expect(JSON.stringify(publishedReview)).not.toContain(f.map.objectKey);
      expect((await store.findBuild(f.id, f.gm))!.updatedAt).toBe(before);
      const input = await f.publishInput();
      const commit = () => f.owner.json("POST", `${f.base}/publish/commit`, input);
      const [a, b] = await Promise.all([commit(), commit()]);
      const receipt = StudioPublicationReceipt.parse(a);
      expect(b).toEqual(receipt);
      expect(receipt.assetIds).toHaveLength(2);
      expect(receipt.candidates).toEqual([{ mapKey: "chapel", revisionId: confirmed.revisionId }]);
      expect((await store.findBuildItem(f.id, "encounter", "other"))?.publishedId).toBeNull();
      expect((await propose()).status).toBe(409);
      expect((await f.owner.request("POST", `${f.base}/publish/commit`, { ...input, digest: "a".repeat(64) })).status).toBe(409);
      expect((await store.findBuildItem(f.id, "encounter", "watch"))?.data.tokens).toMatchObject([{ square: { column: 3, row: 4 } }, { hidden: true }]);
      const assets = await Promise.all(receipt.assetIds.map((id) => store.findAsset(id, f.gm)));
      for (const asset of assets) {
        const url = f.server.base + asset!.url;
        const good = await fetch(url);
        expect(good.headers.get("content-type")).toBe("image/png");
        expect(Buffer.from(await good.arrayBuffer())).toEqual(f.bytes[asset!.kind]);
        expect((await fetch(url, { method: "HEAD" })).headers.get("content-length")).toBe(String(f.bytes[asset!.kind].length));
        expect((await fetch(f.server.base + "/uploads/" + asset!.studioOriginal!.key)).status).toBe(404);
      }

      const exportMap = await f.owner.request("GET", `/api/library/${receipt.published.maps[0]!.id}/export`);
      expect(exportMap.status).toBe(200);
      const exported = await exportMap.json() as { image: string };
      expect(Buffer.from(exported.image, "base64")).toEqual(f.bytes.map);

      await store.setRoomDefaults(f.gm, { ...BUILTIN_ROOM_DEFAULTS, unitsPerCell: 2, unitLabel: "m", hideHp: true, hideAc: true });
      const template = await store.findEncounter(receipt.published.encounters[0]!.id, f.gm);
      expect(template?.data.grid).toMatchObject({ ...grid, unitsPerCell: 5, unitLabel: "ft" });
      const guestToken = newGuestToken();
      const room = await f.owner.json<CreateRoomResponse>("POST", "/api/rooms", { roomName: "Native watch", displayName: "GM", guestToken, templateId: receipt.published.encounters[0]!.id });
      const gm = await TestClient.connect(f.server.base, { ...room, guestToken });
      const playerSeat = await f.server.join(room.inviteCode, "Player");
      const player = await TestClient.connect(f.server.base, playerSeat);
      try {
        const visible = Object.values(gm.state.tokens).find((token) => token.name === "Guard")!;
        const hidden = Object.values(gm.state.tokens).find((token) => token.hidden)!;
        expect(gm.state.scene.grid).toMatchObject({ ...grid, unitsPerCell: 2, unitLabel: "m" });
        expect(gm.state.terrain?.base).toEqual(publishedReview.encounters[0]!.data.terrain);
        expect(Object.values(gm.state.walls)).toContainEqual(expect.objectContaining({ portal: { kind: "door", state: "open" } }));
        expect(Object.values(player.state.tokens)).toMatchObject([{ id: visible.id, name: "Guard" }]);
        expect(visible.stats.hp).toBe(173);
        expect(player.state.tokens[visible.id]?.stats.hp).toBeNull();
        expect(await gm.command({ type: "token.move", tokenId: hidden.id, to: { x: 425, y: 225 } })).toMatchObject({ type: "ack" });
        await player.waitFor((message) => message.type === "redacted" && message.seq === gm.seq);
        const reconnect = await TestClient.connect(f.server.base, playerSeat);
        try {
          expect(reconnect.state).toEqual(player.state);
          const raw = [...player.rawLog, ...reconnect.rawLog].join("\n");
          for (const secret of [hidden.id, hidden.name, f.map.objectKey, f.art.objectKey, confirmed.revisionId, guestToken, '"hp":173']) expect(raw).not.toContain(secret);
          expect(raw).toContain(visible.id);
          expect(raw).toContain(gm.state.scene.map!.url);
        } finally { reconnect.close(); }
      } finally { player.close(); gm.close(); }

      // A fresh store connection and HTTP app read the retained result, including after discard.
      expect((await f.owner.request("DELETE", f.base)).status).toBe(204);
      expect(await f.media.read(f.map.studio!.previewKey, 1024 * 1024)).toBeNull();
      expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toEqual(f.bytes.map);
      const retainedAt = (await store.findBuild(f.id, f.gm))!.updatedAt;
      const nextStore = name === "postgres" ? await PostgresRoomStore.connect(process.env.DATABASE_URL!) : store;
      const restarted = await startServer(nextStore, f.opts);
      try {
        const signedIn = await restarted.signIn(f.owner.email, f.owner.password);
        expect(await signedIn.json("POST", `${f.base}/publish/commit`, input)).toEqual(receipt);
        expect((await nextStore.findBuild(f.id, f.gm))!.updatedAt).toBe(retainedAt);
        const alias = assets.find((asset) => asset?.kind === "map")!;
        expect((await signedIn.request("DELETE", `/api/library/${alias.id}`)).status).toBe(204);
        expect((await fetch(restarted.base + alias.url)).status).toBe(404);
        await restarted.app.sweepStudioMedia();
        expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toBeNull();
        expect(await signedIn.json("POST", `${f.base}/publish/commit`, input)).toEqual(receipt);
        expect((await fetch(restarted.base + alias.url)).status).toBe(404);
      } finally { await restarted.close(); if (nextStore instanceof PostgresRoomStore) await nextStore.close(); }
    } finally { await f.close(); }
  });

  it("refuses pass/delegated/foreign and cross-origin writes, and binds reused map and creature values", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const { revisionId } = await f.advance();
      await f.confirm(revisionId);
      const input = await f.publishInput();
      for (const arg of [f.pass, f.tokens.access_token]) {
        expect((await f.server.anonymous().request("POST", `${f.base}/publish/commit`, input, bearer(arg))).status).toBe(401);
      }
      const other = await f.server.signUp();
      expect((await other.request("POST", `${f.base}/publish/review`, { selection })).status).toBe(404);
      expect((await f.owner.request("POST", `${f.base}/publish/commit`, input, { origin: "https://foreign.test.invalid" })).status).toBe(403);
      const receipt = StudioPublicationReceipt.parse(await f.owner.json("POST", `${f.base}/publish/commit`, input));
      await f.save("POST", "/encounters", { key: "late", mapKey: "chapel", name: "Late", tokens: [token("guard", 2, false)] });
      const next = { selection: { ...selection, encounters: ["late"] } };
      const review = await f.review(next);
      expect(review.creatures[0]).toMatchObject({ key: "guard", reused: true });
      await store.updateCreature(receipt.published.creatures.find(({ key }) => key === "guard")!.id, f.gm, { ac: 15 });
      expect((await f.owner.request("POST", `${f.base}/publish/commit`, { ...next, digest: review.digest, operationId: randomUUID() })).status).toBe(409);
      const latest = await f.review(next);
      expect(latest.creatures[0]?.values.ac).toBe(15);
      await store.replaceAssetPreparation(receipt.published.maps[0]!.id, f.gm, { grid: { ...DEFAULT_GRID, cellSize: 40 }, board: { walls: [], fog: [] } });
      expect((await f.owner.request("POST", `${f.base}/publish/commit`, { ...next, digest: latest.digest, operationId: randomUUID() })).status).toBe(409);
      expect((await f.review(next)).maps[0]?.grid?.cellSize).toBe(40);
      expect((await store.findBuildItem(f.id, "encounter", "late"))?.publishedId).toBeNull();
    } finally { await f.close(); }
  });

  it("validates stale terrain, off-map geometry and a multi-square footprint without a write", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const confirm = (cellSize: number) => f.owner.json("POST", `${f.base}/maps/chapel/grid`, { ...grid, cellSize });
      await confirm(50);
      const ready = await f.review();
      expect(ready.digest).toBeTruthy();
      await confirm(40);
      expect((await f.review()).problems).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/different grid/) })]));
      await confirm(50);

      const saved = (await store.findBuildItem(f.id, "map", "chapel"))!;
      const setup = saved.data.setup as Record<string, unknown>;
      const edit = (patch: Record<string, unknown>) => store.editBuildItem({ ...saved, data: { ...saved.data, setup: { ...setup, ...patch } } });
      await edit({ terrain: [{ row: 4, start: 3, end: 3, kind: "blocked" }] });
      expect((await f.review()).problems).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/Blocked terrain/) })]));
      await edit({ lines: [{ ...wall, to: { column: 30, row: 1 } }] });
      expect((await f.review()).problems).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/off the map/) })]));
      const refused = await f.owner.request("POST", `${f.base}/publish/commit`, { selection, digest: ready.digest, operationId: randomUUID() });
      expect(refused.status).toBe(409);
      expect(await store.uploadUsage({ ownerGmId: f.gm })).toMatchObject({ items: 0, bytes: 0 });
      expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toEqual(f.bytes.map);
    } finally { await f.close(); }
  });

  it("checks two enrolled maps on one source, and keeps partial publication, unpublish and sweep consistent", async () => {
    const store = makeStore();
    let clock = Date.now();
    const f = await fixture(store, false, () => clock);
    try {
      const { revisionId } = await f.advance();
      await f.confirm(revisionId);
      // Seed the incompatible shared source directly. Ordinary save_map already blocks this shape.
      const chapel = (await store.findBuildItem(f.id, "map", "chapel"))!;
      await store.saveBuildItem({ ...chapel, key: "annex", data: { ...chapel.data, name: "Annex" } }, null);
      await f.save("PUT", "/maps/annex/setup", { lines: [{ ...wall, to: { column: 5, row: 1 } }] });
      const annex = `${f.base}/studio/authoring/maps/annex`;
      const inspected = StudioInspection.parse(await f.owner.json("GET", annex));
      const enrolled = await f.owner.json<{ baseRevisionId: string }>("POST", `${annex}/requests`, {
        operationId: randomUUID(), inspectedVersion: inspected.inspectedVersion, encounterKey: null, instruction: "Review the annex",
        selection: { region: { minX: 0, minY: 0, maxX: 320, maxY: 200 }, layers: ["geometry"], objectIds: [], wholeObjectIds: [] },
      });
      await f.owner.json("POST", `${f.base}/publish/grid`, { mapKey: "annex", revisionId: enrolled.baseRevisionId });
      const conflict = await f.review({ selection: { maps: ["chapel", "annex"], creatures: [], encounters: [] } });
      expect(conflict.candidates).toHaveLength(2);
      expect(conflict.digest).toBeNull();
      expect(conflict.problems).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/incompatible/) })]));

      const maps = { maps: ["chapel"], creatures: [], encounters: [] };
      const publishMap = async () => {
        const review = await f.review({ selection: maps });
        expect(review.digest, JSON.stringify(review.problems)).toBeTruthy();
        return StudioPublicationReceipt.parse(await f.owner.json("POST", `${f.base}/publish/commit`, { selection: maps, digest: review.digest, operationId: randomUUID() }));
      };
      const first = await publishMap();
      const firstId = first.assetIds[0]!;
      const old = (await store.findAsset(firstId, f.gm))!;
      expect((await f.owner.request("PATCH", `${f.base}/encounters/watch`, { name: "Still a draft" })).status).toBe(200);
      expect((await store.findBuildItem(f.id, "encounter", "watch"))?.publishedId).toBeNull();
      expect((await store.findBuildItem(f.id, "map", "annex"))?.publishedId).toBeNull();
      expect((await f.owner.request("POST", `${f.base}/remove-published`, { ids: [firstId], unpublishMap: true })).status).toBe(200);
      expect((await fetch(f.server.base + old.url)).status).toBe(404);
      expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toEqual(f.bytes.map);
      expect(await f.media.read(f.map.studio!.previewKey, 1024 * 1024)).toBeTruthy();
      const secondId = (await publishMap()).assetIds[0]!;
      await store.forgetPublished(f.id, { files: [{ id: f.map.id, publishedAssetId: firstId }],
        items: [{ kind: "map", key: "chapel", publishedId: firstId }] });
      expect((await store.findBuildFile(f.id, f.map.id))?.publishedAssetId).toBe(secondId);
      expect((await store.findBuildItem(f.id, "map", "chapel"))?.publishedId).toBe(secondId);
      clock += 15 * 24 * 60 * 60 * 1000;
      await f.server.app.sweepAbandonedBuilds();
      expect((await store.findBuild(f.id, f.gm))?.status).toBe("closed");
      expect(await f.media.read(f.art.objectKey, 1024 * 1024)).toBeNull();
      expect(await f.media.read(f.map.studio!.previewKey, 1024 * 1024)).toBeNull();
      expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toEqual(f.bytes.map);
      expect((await f.owner.request("POST", `${f.base}/remove-published`, { ids: [secondId] })).status).toBe(200);
      expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toBeNull();
    } finally { await f.close(); }
  });

  it("rolls back materialization, asset bindings and usage on late encounter failure", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const { revisionId } = await f.advance();
      await f.confirm(revisionId);
      const input = await f.publishInput();
      const build = await store.findBuild(f.id, f.gm);
      const items = await store.listBuildItems(f.id);
      const files = await store.listBuildFiles(f.id);
      const usage = await store.uploadUsage({ ownerGmId: f.gm });
      const fallback = `studio-original-${randomUUID()}.png`;
      await writeFile(path.join(f.server.uploadDir, fallback), f.bytes.map);
      for (const method of ["GET", "HEAD"]) expect((await fetch(`${f.server.base}/uploads/${fallback}`, { method })).status).toBe(404);
      for (const allowance of [{ maxItems: 1, maxBytes: UPLOAD_ALLOWANCE.maxBytes }, { maxItems: 1000, maxBytes: f.bytes.map.length }]) {
        await expect(store.commitStudioPublication(f.id, f.gm, input, new Date().toISOString(), allowance, 50)).rejects.toThrow();
      }
      await expect(store.commitStudioPublication(f.id, f.gm, input, new Date().toISOString(), UPLOAD_ALLOWANCE, 0)).rejects.toThrow(/0 encounter templates/);
      expect(await store.listBuildItems(f.id)).toEqual(items);
      expect(await store.listBuildFiles(f.id)).toEqual(files);
      expect(await store.findBuild(f.id, f.gm)).toEqual(build);
      expect(await store.uploadUsage({ ownerGmId: f.gm })).toEqual(usage);
      expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toEqual(f.bytes.map);
      const receipt = await store.commitStudioPublication(f.id, f.gm, input, new Date().toISOString(), UPLOAD_ALLOWANCE, 50);
      expect(receipt.assetIds).toHaveLength(2);
      const after = await store.uploadUsage({ ownerGmId: f.gm });
      expect(after.bytes - usage.bytes).toBe(f.bytes.map.length + f.bytes.token.length);
    } finally { await f.close(); }
  });
});

it.skipIf(!process.env.DATABASE_URL || !process.env.STUDIO_S3_ENDPOINT)(
  "withholds prospective aliases from a separate PostgreSQL connection during a late rollback with real private S3 (FR-GM-27)", async () => {
    const store = await PostgresRoomStore.connect(process.env.DATABASE_URL!);
    const reader = await PostgresRoomStore.connect(process.env.DATABASE_URL!);
    const f = await fixture(store, true);
    const otherServer = await startServer(reader, f.opts);
    try {
      const { revisionId } = await f.advance();
      await f.confirm(revisionId);
      const input = await f.publishInput();
      const before = await reader.uploadUsage({ ownerGmId: f.gm });
      // Hold a real transaction after the add-only writer inserts its rows, before the receipt.
      type Writer = { writePublication(tx: unknown, plan: BuildPublishPlan, ...args: unknown[]): Promise<BuildPublishResult> };
      const subject = store as unknown as Writer;
      const write = subject.writePublication.bind(subject);
      const staged: BuildPublishPlan["assets"] = [];
      const injection = vi.spyOn(subject, "writePublication").mockImplementationOnce(async (tx, plan, ...args) => {
        await write(tx, plan, ...args);
        staged.push(...plan.assets);
        for (const { record } of staged) {
          expect(await reader.findAsset(record.id, f.gm)).toBeNull();
          expect((await fetch(otherServer.base + record.url)).status).toBe(404);
          expect((await fetch(otherServer.base + record.url, { method: "HEAD" })).status).toBe(404);
          expect((await fetch(`${process.env.STUDIO_S3_ENDPOINT}/${process.env.STUDIO_S3_BUCKET}/${record.studioOriginal!.key}`)).ok).toBe(false);
        }
        throw new Error("Injected late failure");
      });
      try {
        await expect(store.commitStudioPublication(f.id, f.gm, input, new Date().toISOString(), UPLOAD_ALLOWANCE, 50)).rejects.toThrow("Injected late failure");
      } finally { injection.mockRestore(); }
      expect(staged).toHaveLength(2);
      for (const { record } of staged) expect((await fetch(otherServer.base + record.url)).status).toBe(404);
      expect(await reader.uploadUsage({ ownerGmId: f.gm })).toEqual(before);
      const receipt = await store.commitStudioPublication(f.id, f.gm, input, new Date().toISOString(), UPLOAD_ALLOWANCE, 50);
      for (const id of receipt.assetIds) {
        const asset = (await reader.findAsset(id, f.gm))!;
        expect(Buffer.from(await (await fetch(otherServer.base + asset.url)).arrayBuffer())).toEqual(f.bytes[asset.kind]);
      }
      expect((await f.owner.request("DELETE", "/api/auth/account", { password: f.owner.password })).status).toBe(204);
      expect(await f.media.read(f.map.objectKey, 1024 * 1024)).toBeNull();
      expect(await f.media.read(f.art.studio!.previewKey, 1024 * 1024)).toBeNull();
    } finally { await otherServer.close(); await f.close(); await Promise.all([store.close(), reader.close()]); }
  });

it.skipIf(!process.env.DATABASE_URL)("rejects an owner commit whose session ends while waiting for the build lock (FR-GM-27)", async () => {
  const url = process.env.DATABASE_URL!;
  const store = await PostgresRoomStore.connect(url);
  const blocker = new PrismaClient({ datasources: { db: { url } } });
  const f = await fixture(store);
  try {
    const { revisionId } = await f.advance();
    await f.confirm(revisionId);
    const input = await f.publishInput();
    const tokenHash = hashToken(f.owner.cookie.slice(f.owner.cookie.indexOf("=") + 1));
    let locked!: () => void;
    const isLocked = new Promise<void>((resolve) => { locked = resolve; });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const holder = blocker.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`builds:item:${f.id}`}))`;
      locked();
      await held;
    });
    await isLocked;
    const commit = store.commitStudioPublication(f.id, f.gm, input, new Date().toISOString(),
      UPLOAD_ALLOWANCE, 50, { tokenHash, now: Date.now });
    const rejected = expect(commit).rejects.toMatchObject({ code: "access" });
    try {
      await store.deleteSession(tokenHash);
    } finally {
      release();
      await holder;
    }
    await rejected;
    expect(await store.uploadUsage({ ownerGmId: f.gm })).toMatchObject({ items: 0, bytes: 0 });
    const owner = await f.server.signIn(f.owner.email, f.owner.password);
    expect(StudioPublicationReceipt.safeParse(await owner.json("POST", `${f.base}/publish/commit`, input)).success).toBe(true);
  } finally {
    await f.close();
    await Promise.all([store.close(), blocker.$disconnect()]);
  }
});
