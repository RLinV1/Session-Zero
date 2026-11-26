import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { StudioChatSelectionReference, StudioCorrectionHistory, StudioCorrectionReceipt, StudioInspection, StudioSnapshot, type BuildDetail, type StudioChatSelectionUpdate, type StudioCorrectionInput } from "@vtt/shared";
import { UPLOAD_ALLOWANCE } from "../src/store/libraryStore";
import { LocalDiskAssetStore } from "../src/store/assetStore";
import type { BuildFileRecord } from "../src/store/buildStore";
import { renderStudioCrop } from "../src/domain/studioCrop";
import { AUTHORING_LIMITS, CHAT_SELECTION_LIMITS, type StudioRevision } from "../src/store/studioAuthoring";
import type { RoomStore } from "../src/store/roomStore";
import { startServer } from "./helpers";
import { storeCases } from "./storeHarness";
import { bearer, connectStudio, TEST_ORIGIN } from "./studioFlow";

const wall = { kind: "wall", from: { column: 0, row: 1 }, to: { column: 5, row: 1 } } as const;
const door = { kind: "door", state: "closed", from: { column: 1, row: 1 }, to: { column: 2, row: 1 } } as const;
const region = { minX: 0, minY: 0, maxX: 225, maxY: 225 };

async function fixture(store: RoomStore, board: BuildFileRecord["board"] = null, now?: () => number) {
  const server = await startServer(store, { studio: { publicOrigin: TEST_ORIGIN }, now });
  try {
    const owner = await server.signUp();
    const { build: { id }, pass } = await owner.json<{ build: { id: string }; pass: string }>("POST", "/api/builds", {
      name: "M3 Chapel", aiGrid: false, aiWalls: true, aiTerrain: true,
    });
    const source: BuildFileRecord = {
      id: randomUUID(), buildId: id, kind: "map", objectKey: "synthetic", url: "/uploads/synthetic",
      originalName: "Chapel", width: 525, height: 400, sizeBytes: 1, grid: null, board, sourceHash: null,
      detectionSourceHash: null, detectionVersion: null, detectionError: null, detectionStatus: null, detectionAttempt: 0,
      detectionResult: null, detectionUpdatedAt: null, publishedAssetId: null, createdAt: new Date().toISOString(),
    };
    await store.addBuildFile(source, { maps: 20, files: 100, bytes: 100000 });
    const { tokens } = await connectStudio(server.base, owner, [id]);
    const send = (method: string, route: string, data?: unknown, token = tokens.access_token) =>
      fetch(`${server.base}/api/studio/builds/${id}${route}`, { method, headers: bearer(token, { "content-type": "application/json" }), body: data === undefined ? undefined : JSON.stringify(data) });
    const put = async (method: string, path: string, body: unknown) => {
      const res = await send(method, path, body);
      if (!res.ok) throw new Error(await res.text());
    };
    await put("POST", "/maps", { key: "chapel", name: "Chapel", fileId: source.id, proposedGrid: { cellSize: 50, offsetX: 25, offsetY: 0 } });
    await put("PUT", "/maps/chapel/setup", { lines: [wall, door], terrain: [{ row: 0, start: -1, end: -1, kind: "difficult" }] });
    await put("POST", "/creatures", { creatures: [{ key: "guard", name: "Guard", size: 2, isPlayerCharacter: false }] });
    await put("POST", "/encounters", { key: "night", name: "Night", mapKey: "chapel", tokens: [{ creatureKey: "guard", square: { column: 0, row: 2 }, hidden: false }] });
    await put("POST", "/studio/context", { sourceFileId: source.id, mapKey: "chapel", encounterKey: "night" });
    const base = `/api/builds/${id}`;
    const map = `${base}/studio/authoring/maps/chapel`;
    const inspect = () => owner.json<{ inspectedVersion: string; objects: { id: string }[]; drifted: boolean }>("GET", `${map}?encounterKey=night`);
    const makeRequest = (inspectedVersion: string, selection: StudioCorrectionInput["selection"]) => ({
      encounterKey: "night", operationId: randomUUID(), inspectedVersion, instruction: "Open the door and clear the rubble.", selection,
    });
    const create = (input: StudioCorrectionInput) => owner.json<{ requestId: string; baseRevisionId: string }>("POST", `${map}/requests`, input);
    const history = () => owner.json<{ workingRevisionId: string; revisions: Pick<StudioRevision, "id" | "parentId" | "actor">[] }>("GET", `${map}/revisions`);
    const readRevision = async (revisionId: string) => (await owner.json<{ revision: StudioRevision }>("GET", `${map}/revisions/${revisionId}`)).revision;
    const propose = (requestId: string, baseRevisionId: string, operations: unknown[], operationId = randomUUID()) =>
      send("POST", `/authoring/requests/${requestId}/proposals`, { baseRevisionId, operationId, operations });
    return { server, owner, id, pass, source, send, base, map, inspect, makeRequest, create, history, readRevision, propose };
  } catch (error) {
    await server.close();
    throw error;
  }
}

describe.each(storeCases)("Studio M3 authoring in %s (FR-GM-26, FR-GM-27)", (_name, makeStore) => {
  it("enrolls exactly what the owner saw, saves only scoped batches, and keeps concurrent candidates", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const before = await f.inspect();
      expect((await f.inspect()).objects).toEqual(before.objects);
      const [wallId, doorId, placementId] = before.objects.map(({ id }) => id);
      const input = f.makeRequest(before.inspectedVersion, {
        region, layers: ["geometry", "terrain", "placements"], objectIds: [wallId!, doorId!, placementId!], wholeObjectIds: [wallId!],
      });
      const rejected = await f.owner.request("POST", `${f.map}/requests`, { ...input, selection: { ...input.selection, wholeObjectIds: [] } });
      expect(rejected.status).toBe(422);
      expect((await f.owner.request("GET", `${f.map}/revisions`)).status).toBe(404);
      const request = await f.create(input);
      const otherSource = { ...f.source, id: randomUUID(), objectKey: "replacement", url: "/uploads/replacement" };
      await store.addBuildFile(otherSource, { maps: 20, files: 100, bytes: 100000 });
      const replace = await f.send("POST", "/maps", { key: "chapel", name: "Replacement", fileId: otherSource.id });
      expect(await replace.json()).toMatchObject({ code: "enrolled" });
      expect(await f.create(input)).toEqual(request);
      expect(await (await f.send("POST", "/authoring/maps/chapel/requests", input)).json()).toEqual(request);
      expect((await f.owner.request("POST", `${f.map}/requests`, { ...input, instruction: "Different retry" })).status).toBe(409);
      const open = { op: "line.update", id: doorId, line: { ...door, state: "open" } };
      const erase = { op: "terrain.paint", runs: [{ row: 0, start: -1, end: -1, kind: null }] };
      const move = { op: "placement.move", id: placementId, square: { column: 1, row: 1 } };
      const outside = await f.propose(request.requestId, request.baseRevisionId, [open, { ...move, square: { column: 3, row: 2 } }]);
      expect(outside.status).toBe(422);
      expect((await f.history()).revisions).toHaveLength(1);
      const legacy = fetch(`${f.server.base}/api/build/current/maps/chapel/setup`, {
        method: "PUT", headers: bearer(f.pass, { "content-type": "application/json" }), body: JSON.stringify({ lines: [] }),
      });
      const firstId = randomUUID(), secondId = randomUUID();
      const proposals = await Promise.all([
        f.propose(request.requestId, request.baseRevisionId, [open, erase, move], firstId),
        f.propose(request.requestId, request.baseRevisionId, [open, erase, move], secondId),
        legacy,
      ]);
      expect(proposals[2]!.status).toBe(409);
      const results = await Promise.all(proposals.slice(0, 2).map(async (response) => ({
        http: response.status, body: await response.json() as { status: string; revisionId: string; currentRevisionId: string },
      })));
      const advanced = results.find(({ body }) => body.status === "advanced")!;
      const stale = results.find(({ body }) => body.status === "stale")!;
      expect(advanced.http).toBe(200);
      expect(stale.http).toBe(409);
      expect(stale.body.currentRevisionId).toBe(advanced.body.revisionId);
      const replay = await f.propose(request.requestId, request.baseRevisionId, [open, erase, move], firstId);
      expect(await replay.json()).toEqual(results[0]!.body);
      expect((await f.history()).revisions).toHaveLength(3);
      expect((await f.readRevision(stale.body.revisionId)).scene.ids.lines).toEqual([wallId, doorId]);
      const publicDraft = await store.findBuildItem(f.id, "map", "chapel");
      expect(publicDraft?.data.setup).toMatchObject({ lines: [wall, door], terrain: [{ row: 0, start: -1, end: -1, kind: "difficult" }] });
      const website = StudioSnapshot.parse(await f.owner.json("GET", `${f.base}/studio`));
      const tool = StudioSnapshot.parse(await (await f.send("GET", "/studio")).json());
      expect(tool).toEqual({ ...website, correctionsAllowed: true });
      expect(tool.workingRevisionId).toBe(advanced.body.revisionId);
      expect(tool.scene.walls.map((w) => w.portal?.state).filter(Boolean)).toEqual(["open"]);
      expect(tool.scene.terrain).toEqual([]);
      expect(tool.scene.tokens[0]).toMatchObject({ id: placementId, square: { column: 1, row: 1 } });
      const restore = await f.owner.json<{ revisionId: string }>("POST", `${f.map}/restore`, {
        revisionId: request.baseRevisionId, expectedCurrentRevisionId: advanced.body.revisionId, operationId: randomUUID(),
      });
      expect(await f.readRevision(restore.revisionId)).toMatchObject({ actor: "owner", parentId: advanced.body.revisionId, restoredFrom: request.baseRevisionId });
      expect((await f.history()).revisions).toHaveLength(4);
      expect((await f.owner.request("DELETE", f.base)).status).toBe(204);
      expect((await f.owner.request("GET", `${f.map}/revisions`)).status).toBe(404);
    } finally { await f.server.close(); }
  });

  it("requires the whole crossing wall when removing the portal would fill its gap", async () => {
    const f = await fixture(makeStore());
    try {
      const seen = await f.inspect();
      const [wallId, doorId] = seen.objects.map(({ id }) => id);
      const selection: StudioCorrectionInput["selection"] = {
        region: { minX: 99, minY: 40, maxX: 111, maxY: 80 }, layers: ["geometry", "terrain"],
        objectIds: [doorId!], wholeObjectIds: [doorId!],
      };
      const saved = await f.create(f.makeRequest(seen.inspectedVersion, selection));
      const operations = [
        { op: "terrain.paint", runs: [{ row: 0, start: 1, end: 1, kind: "difficult" }] },
        { op: "line.remove", id: doorId },
      ];
      const refused = await f.propose(saved.requestId, saved.baseRevisionId, operations);
      expect(refused.status).toBe(422);
      expect(await refused.json()).toMatchObject({ code: "scope" });
      expect(await f.history()).toMatchObject({ workingRevisionId: saved.baseRevisionId, revisions: [{ id: saved.baseRevisionId }] });

      const included = await f.create(f.makeRequest(saved.baseRevisionId, {
        ...selection, objectIds: [doorId!, wallId!], wholeObjectIds: [doorId!, wallId!],
      }));
      const accepted = await f.propose(included.requestId, included.baseRevisionId, operations);
      expect(accepted.status).toBe(200);
      const { revisionId } = await accepted.json() as { revisionId: string };
      expect((await f.readRevision(revisionId)).scene.map.setup).toMatchObject({
        lines: [wall], terrain: [{ row: 0, start: -1, end: -1, kind: "difficult" }, { row: 0, start: 1, end: 1, kind: "difficult" }],
      });
    } finally { await f.server.close(); }
  });

  it("preserves imported walls and reports the original portal state when it is flagged for review", async () => {
    const importedDoor = { a: { x: 75, y: 50 }, b: { x: 125, y: 50 }, portal: { kind: "door", state: "open" } } as const;
    const importedWall = { a: { x: 25, y: 100 }, b: { x: 275, y: 100 } };
    const f = await fixture(makeStore(), { walls: [importedDoor, importedWall], fog: [] });
    try {
      const seen = StudioInspection.parse(await f.inspect());
      const opening = seen.objects.find((object) => object.state === "open")!;
      const saved = await f.create(f.makeRequest(seen.inspectedVersion, {
        region, layers: ["geometry"], objectIds: [opening.id], wholeObjectIds: [],
      }));
      const cut = await f.propose(saved.requestId, saved.baseRevisionId, [{ op: "line.add", line: {
        ...door, from: { column: 1, row: 2 }, to: { column: 2, row: 2 },
      } }]);
      expect(cut.status).toBe(422);
      expect(await cut.json()).toMatchObject({ code: "scope" });
      expect((await f.history()).revisions).toHaveLength(1);

      const reason = "Check which side the portal opens from.";
      const flagged = await f.propose(saved.requestId, saved.baseRevisionId, [{ op: "opening.set", id: opening.id, opening: { kind: "leave", reason } }]);
      expect(flagged.status).toBe(200);
      const after = StudioInspection.parse(await f.inspect());
      expect(after.objects.find((object) => object.id === opening.id)).toMatchObject({ kind: "door", state: "open", label: reason });
      expect(after.scene.walls).toEqual(seen.scene.walls);
    } finally { await f.server.close(); }
  });

  it("allows approved builds to create and restore private corrections while enforcing choices and revocation", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const owner = (await store.findUserById(f.owner.view!.id))!.ownerId;
      const [grant] = await store.listStudioGrants(owner, new Date().toISOString());
      expect((await f.owner.request("PUT", `${f.base}/grants/${grant!.id}/corrections`, { enabled: true })).status).toBe(404);
      const inspect = StudioInspection.parse(await f.inspect());
      const input = f.makeRequest(inspect.inspectedVersion, { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] });
      const create = () => f.send("POST", "/authoring/maps/chapel/requests", input);
      await store.setBuildChoices(f.id, owner, { aiGrid: false, aiWalls: true, aiTerrain: false });
      expect(await (await create()).json()).toMatchObject({ code: "permission" });
      await store.setBuildChoices(f.id, owner, { aiGrid: false, aiWalls: true, aiTerrain: true });

      const saved = StudioCorrectionReceipt.parse(await (await create()).json());
      expect(await (await create()).json()).toEqual(saved);
      const proposal = await f.propose(saved.requestId, saved.baseRevisionId, [
        { op: "terrain.paint", runs: [{ row: 0, start: -1, end: -1, kind: null }] },
      ]);
      expect(proposal.status).toBe(200);
      const { revisionId } = await proposal.json() as { revisionId: string };
      const args = { revisionId: saved.baseRevisionId, expectedCurrentRevisionId: revisionId, operationId: randomUUID() };
      const restore = () => f.send("POST", "/authoring/maps/chapel/restore", args);
      await store.setBuildChoices(f.id, owner, { aiGrid: false, aiWalls: true, aiTerrain: false });
      expect(await (await restore()).json()).toMatchObject({ code: "permission" });
      await store.setBuildChoices(f.id, owner, { aiGrid: false, aiWalls: true, aiTerrain: true });
      const restored = await (await restore()).json() as { revisionId: string };
      expect(await (await restore()).json()).toEqual(restored);
      expect(await f.readRevision(restored.revisionId)).toMatchObject({ actor: "studio", parentId: revisionId, restoredFrom: saved.baseRevisionId });

      const detail = await f.owner.json<BuildDetail>("GET", f.base);
      const version = detail.items.find((item) => item.kind === "map")!.authoring!.token;
      expect((await f.owner.request("POST", `${f.base}/maps/chapel/grid`, { cellSize: 50, offsetX: 20, offsetY: 0 },
        { "X-Studio-Authoring-Version": version })).status).toBe(200);
      const edited = await f.history();
      expect((await f.send("POST", "/authoring/maps/chapel/restore", {
        revisionId: saved.baseRevisionId, expectedCurrentRevisionId: edited.workingRevisionId, operationId: randomUUID(),
      })).status).toBe(409);
      expect((await f.history()).workingRevisionId).toBe(edited.workingRevisionId);

      await store.revokeStudioGrant(grant!.id, new Date().toISOString(), owner);
      expect((await create()).status).toBe(401);
      expect((await restore()).status).toBe(401);
      expect((await f.history()).workingRevisionId).toBe(edited.workingRevisionId);
    } finally { await f.server.close(); }
  });

  it("attaches only a view's current selection and starts its exact request after a chat instruction", async () => {
    const store = makeStore();
    let now = Date.now();
    const f = await fixture(store, null, () => now);
    try {
      const inspected = StudioInspection.parse(await f.inspect());
      const draft: NonNullable<StudioChatSelectionUpdate["draft"]> = { mapKey: "chapel", encounterKey: "night", inspectedVersion: inspected.inspectedVersion,
        selection: { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] } };
      const path = "/authoring/chat-selections";
      const stage = (viewId: string, sequence: number, value: typeof draft | null = draft) =>
        f.send("POST", path, { viewId, sequence, draft: value });
      const identify = async (response: Response) => {
        expect(response.status).toBe(200);
        const { selectionId, expiresAt } = StudioChatSelectionReference.parse(await response.json());
        expect(expiresAt).toBe(new Date(now + CHAT_SELECTION_LIMITS.ttlMs).toISOString());
        return selectionId!;
      };
      const start = (id: string, instruction = "Remove the rubble.", token?: string) =>
        f.send("POST", `${path}/${id}/request`, { instruction }, token);
      const view = randomUUID(), secondView = randomUUID();
      const original = await identify(await stage(view, 1));
      expect(await identify(await stage(view, 1))).toBe(original);
      const cancelled = await identify(await stage(secondView, 1));
      const rectangle = { ...region, maxX: 24, maxY: 52 };
      const active = await identify(await stage(view, 2, { ...draft, selection: { ...draft.selection, region: rectangle } }));
      expect((await f.owner.request("GET", `${f.map}/revisions`)).status).toBe(404);
      expect((await stage(view, 1)).status).toBe(409);
      expect((await stage(view, 3, { ...draft, inspectedVersion: "stale" })).status).toBe(409);
      const unapproved = await stage(view, 3, { ...draft, selection: { ...draft.selection, objectIds: [inspected.objects[0]!.id] } });
      expect(unapproved.status).toBe(422);
      const owner = (await store.findUserById(f.owner.view!.id))!.ownerId;
      await store.setBuildChoices(f.id, owner, { aiGrid: false, aiWalls: true, aiTerrain: false });
      expect((await stage(view, 3)).status).toBe(403);
      await store.setBuildChoices(f.id, owner, { aiGrid: false, aiWalls: true, aiTerrain: true });
      expect((await start(original)).status).toBe(409);
      expect(await (await stage(secondView, 2, null)).json()).toEqual({ selectionId: null });
      expect((await start(cancelled)).status).toBe(409);
      expect((await f.send("POST", `${path}/${active}/request`, { instruction: " ", selection: draft.selection })).status).toBe(422);

      const { tokens } = await connectStudio(f.server.base, f.owner, [f.id]);
      expect((await start(active, "Remove the rubble.", tokens.access_token)).status).toBe(409);
      const otherBuild = await f.owner.json<{ build: { id: string } }>("POST", "/api/builds", { name: "Unshared build" });
      const refused = await fetch(`${f.server.base}/api/studio/builds/${otherBuild.build.id}${path}/${active}/request`, {
        method: "POST", headers: bearer(tokens.access_token, { "content-type": "application/json" }), body: JSON.stringify({ instruction: "Wrong build." }),
      });
      expect(refused.status).toBe(404);
      now += CHAT_SELECTION_LIMITS.ttlMs + 1;
      expect((await start(active)).status).toBe(409);

      const valid = await identify(await stage(view, 3, { ...draft, selection: { ...draft.selection, region: rectangle } }));
      const competing = await identify(await stage(secondView, 3));
      const first = await start(valid);
      expect(first.status).toBe(200);
      const saved = StudioCorrectionReceipt.parse(await first.json());
      expect(saved).toMatchObject({ requestId: valid, scope: { region: rectangle } });
      expect(await (await start(valid)).json()).toEqual(saved);
      expect((await start(valid, "Overwrite it with a new instruction.")).status).toBe(409);
      expect((await start(competing)).status).toBe(409);
      expect(await (await f.send("GET", `/authoring/requests/${saved.requestId}`)).json()).toMatchObject({ instruction: "Remove the rubble." });
      await stage(view, 4, null);
      expect((await start(valid)).status).toBe(409);
      const history = StudioCorrectionHistory.parse(await f.owner.json("GET", `${f.map}/revisions`));
      expect(history.requests).toHaveLength(1);
      expect(history.requests[0]).toMatchObject(saved);
    } finally { await f.server.close(); }
  });

  it("bounds recent view records and keeps clear ordering through a retry", async () => {
    let now = Date.now();
    const f = await fixture(makeStore(), null, () => now);
    try {
      const path = "/authoring/chat-selections";
      const viewId = randomUUID();
      const stage = (view: string, sequence: number, draft: unknown) => f.send("POST", path, { viewId: view, sequence, draft });
      await stage(viewId, 2, null);
      for (let count = 1; count < CHAT_SELECTION_LIMITS.viewsPerBuild; count++) {
        expect((await stage(randomUUID(), 1, null)).status).toBe(200);
      }
      expect(await (await stage(randomUUID(), 1, null)).json()).toMatchObject({ code: "limit" });
      const { inspectedVersion } = await f.inspect();
      const draft = { mapKey: "chapel", encounterKey: "night", inspectedVersion,
        selection: { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] } };
      expect(await (await stage(viewId, 1, draft)).json()).toMatchObject({ code: "conflict" });
      expect((await stage(viewId, 3, draft)).status).toBe(200);
      now += CHAT_SELECTION_LIMITS.ttlMs + 1;
      expect((await stage(randomUUID(), 1, draft)).status).toBe(200);
    } finally { await f.server.close(); }
  });

  it("retrieves the saved edge crop after a newer proposal, records activity, and denies it after revocation", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const bytes = await sharp({ create: { width: f.source.width, height: f.source.height, channels: 3, background: "#577762" } }).png().toBuffer();
      await writeFile(path.join(f.server.uploadDir, f.source.objectKey), bytes);
      const seen = await f.inspect();
      const saved = await f.create(f.makeRequest(seen.inspectedVersion, { region: { minX: 0, minY: 0, maxX: 20, maxY: 20 }, layers: ["terrain"], objectIds: [], wholeObjectIds: [] }));
      const requestPath = `/authoring/requests/${saved.requestId}`;
      const fetchCrop = () => f.send("GET", `${requestPath}/crop`);
      const crop = await fetchCrop();
      expect(crop.status).toBe(200);
      expect(crop.headers.get("cache-control")).toBe("no-store");
      expect(JSON.parse(crop.headers.get("x-studio-crop")!)).toEqual({ left: 0, top: 0, width: 125, height: 150 });
      const first = Buffer.from(await crop.arrayBuffer());
      expect((await sharp(first).metadata()).format).toBe("webp");
      const history = async () => StudioCorrectionHistory.parse(await f.owner.json("GET", `${f.map}/revisions`));
      expect((await history()).requests[0]!.activity).toEqual({ observed: false });
      expect(await (await f.send("GET", requestPath)).json()).toMatchObject({ baseRevisionId: saved.baseRevisionId, terrainCells: { fromColumn: -1, toColumn: -1, fromRow: 0, toRow: 0 } });
      expect((await history()).requests[0]!.activity).toEqual({ observed: true });
      const paint = { op: "terrain.paint", runs: [{ row: 0, start: -1, end: -1, kind: null }] };
      const mixed = await f.propose(saved.requestId, saved.baseRevisionId, [paint, { op: "line.remove", id: seen.objects[0]!.id }]);
      expect(mixed.status).toBe(422);
      expect((await history()).revisions).toHaveLength(1);
      expect((await history()).requests[0]!.activity).toEqual({ observed: true, outcome: { status: "refused", code: "scope" } });
      const proposalKey = randomUUID();
      const advanced = await f.propose(saved.requestId, saved.baseRevisionId, [paint], proposalKey);
      expect(advanced.status).toBe(200);
      const { revisionId } = await advanced.json() as { revisionId: string };
      expect(Buffer.from(await (await fetchCrop()).arrayBuffer())).toEqual(first);

      const owner = (await store.findUserById(f.owner.view!.id))!.ownerId;
      await store.setBuildChoices(f.id, owner, { aiGrid: false, aiWalls: true, aiTerrain: false });
      const deniedReplay = await f.propose(saved.requestId, saved.baseRevisionId, [paint], proposalKey);
      expect(deniedReplay.status).toBe(403);
      expect((await history()).requests[0]!.activity).toEqual({ observed: true, outcome: { status: "advanced", revisionId } });

      const grant = (await store.listStudioGrants(owner, new Date().toISOString()))[0]!;
      const run = store.studioAuthoring.bind(store);
      let reads = 0;
      const revokeDuringCrop = vi.spyOn(store, "studioAuthoring").mockImplementation(async (...args) => {
        if (args[2].kind === "crop" && ++reads === 2) await store.revokeStudioGrant(grant.id, new Date().toISOString());
        return run(...args);
      });
      try {
        const denied = await fetchCrop();
        expect(denied.status).toBe(401);
        expect(denied.headers.get("content-type")).not.toContain("image/");
      } finally { revokeDuringCrop.mockRestore(); }
    } finally { await f.server.close(); }
  });

  it("checks the file's original hash for legacy revisions captured before M4", async () => {
    const f = await fixture(makeStore());
    try {
      const seen = await f.inspect();
      const input = f.makeRequest(seen.inspectedVersion, { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] });
      const saved = await f.create(input);
      const { scene } = await f.readRevision(saved.baseRevisionId);
      delete scene.sourceContentHash;
      const image = (background: string) => sharp({ create: { width: scene.source.width, height: scene.source.height, channels: 3, background } }).png().toBuffer();
      const original = await image("#b91421");
      const file = { ...f.source, sourceHash: createHash("sha256").update(original).digest("hex") };
      const assetPath = path.join(f.server.uploadDir, file.objectKey);
      const assets = new LocalDiskAssetStore(f.server.uploadDir);
      await writeFile(assetPath, original);
      expect((await renderStudioCrop(assets, file, scene, input.selection)).webp.length).toBeGreaterThan(0);
      await writeFile(assetPath, await image("#1133b9"));
      await expect(renderStudioCrop(assets, file, scene, input.selection)).rejects.toMatchObject({ code: "missing" });
    } finally { await f.server.close(); }
  });

  it("publishes no enrolled data and checks owner edits, grid drift, choices and grant revocation at the write", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const head = await f.inspect();
      const input = f.makeRequest(head.inspectedVersion, { region, layers: ["geometry"], wholeObjectIds: [], objectIds: [head.objects[1]!.id] });
      const pending = await f.create(input);
      const update = { op: "line.update", id: head.objects[1]!.id, line: { ...door, state: "open" } };
      expect((await f.propose(pending.requestId, pending.baseRevisionId, [update])).status).toBe(200);
      const after = await f.inspect();
      const next = await f.create(f.makeRequest(after.inspectedVersion, input.selection));
      const { items } = await f.owner.json<BuildDetail>("GET", f.base);
      const map = items.find((item) => item.kind === "map")!;
      const blocked = await f.send("POST", "/creatures", { creatures: [{ key: "guard", name: "Different size", size: 3, isPlayerCharacter: false }] });
      expect(await blocked.json()).toMatchObject({ results: [{ key: "guard", saved: false }] });
      expect((await store.findBuildItem(f.id, "creature", "guard"))!.data.size).toBe(2);
      await expect(store.publishBuild({ buildId: f.id, ownerGmId: (await store.findUserById(f.owner.view!.id))!.ownerId,
        assets: [], creatures: [], maps: [], encounters: [], reviewed: [{ kind: "map", key: map.key, updatedAt: map.updatedAt }] },
      UPLOAD_ALLOWANCE, 20)).rejects.toMatchObject({ code: "enrolled" });

      const gridRoute = `${f.base}/maps/chapel/grid`;
      const grid = { cellSize: 50, offsetX: 20, offsetY: 0 };
      expect((await f.owner.request("POST", gridRoute, grid)).status).toBe(409);
      const save = await f.owner.request("POST", gridRoute, grid, { "X-Studio-Authoring-Version": map.authoring!.token });
      expect(save.status, await save.clone().text()).toBe(200);
      const saved = await f.history();
      expect(await f.readRevision(saved.workingRevisionId)).toMatchObject({ actor: "owner", scene: { grid: { offsetX: 20 }, map: { setup: { lines: [wall, door] } } } });
      const stale = await f.propose(next.requestId, next.baseRevisionId, [update]);
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ status: "stale", currentRevisionId: saved.workingRevisionId });
      expect((await f.owner.request("POST", `${f.map}/restore`, {
        revisionId: next.baseRevisionId, expectedCurrentRevisionId: saved.workingRevisionId, operationId: randomUUID(),
      })).status).toBe(409);

      const user = (await store.findUserById(f.owner.view!.id))!;
      await store.setBuildChoices(f.id, user.ownerId, { aiGrid: false, aiWalls: false, aiTerrain: true });
      expect((await f.propose(next.requestId, next.baseRevisionId, [update])).status).toBe(403);
      await store.setBuildChoices(f.id, user.ownerId, { aiGrid: false, aiWalls: true, aiTerrain: true });
      const grant = (await store.listStudioGrants(user.ownerId, new Date().toISOString()))[0]!;
      const execute = store.studioAuthoring.bind(store);
      const revoke = vi.spyOn(store, "studioAuthoring").mockImplementationOnce(async (...args) => {
        await store.revokeStudioGrant(grant.id, new Date().toISOString());
        return execute(...args);
      });
      expect((await f.propose(next.requestId, next.baseRevisionId, [update])).status).toBe(401);
      revoke.mockRestore();
      expect((await f.history()).workingRevisionId).toBe(saved.workingRevisionId);
      expect((await f.history()).revisions).toHaveLength(saved.revisions.length + 1);
    } finally { await f.server.close(); }
  });

  it("retains proposals without reinterpreting them after an independent profile change", async () => {
    const store = makeStore();
    const f = await fixture(store);
    try {
      const initial = await f.inspect();
      const input = f.makeRequest(initial.inspectedVersion, { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] });
      const request = await f.create(input);
      const { items } = await f.owner.json<BuildDetail>("GET", f.base);
      const ownerToken = items.find((item) => item.kind === "map")!.authoring!.token;
      expect((await f.send("PUT", "/profile", { name: "New units", unitsPerCell: 7, unitLabel: "m" })).status).toBe(200);
      const staleOwner = await f.owner.request("PATCH", `${f.base}/maps/chapel`, { name: "Changed" }, { "X-Studio-Authoring-Version": ownerToken });
      expect(staleOwner.status).toBe(409);
      const stale = await f.propose(request.requestId, request.baseRevisionId, [{ op: "terrain.paint", runs: [{ row: 0, start: -1, end: -1, kind: null }] }]);
      expect(stale.status).toBe(409);
      const { revisionId } = await stale.json() as { revisionId: string };
      expect((await f.readRevision(revisionId)).scene.grid.unitsPerCell).toBe(5);
      expect(await f.inspect()).toMatchObject({ drifted: true, inspectedVersion: request.baseRevisionId });
      const snapshot = StudioSnapshot.parse(await f.owner.json("GET", `${f.base}/studio`));
      expect(snapshot.workingBindingChanged).toBe(true);
      expect(snapshot.scene.grid?.unitsPerCell).toBe(5);
      expect((await f.owner.request("POST", `${f.map}/requests`, f.makeRequest(request.baseRevisionId, input.selection))).status).toBe(409);
    } finally { await f.server.close(); }
  });

  it("caps stale history before writing and leaves the working revision intact", async () => {
    const f = await fixture(makeStore());
    try {
      const initial = await f.inspect();
      const input = f.makeRequest(initial.inspectedVersion, { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] });
      const request = await f.create(input);
      const operation = { op: "terrain.paint", runs: [{ row: 0, start: -1, end: -1, kind: null }] };
      const advanced = await f.propose(request.requestId, request.baseRevisionId, [operation]);
      expect(advanced.status).toBe(200);
      const { revisionId } = await advanced.json() as { revisionId: string };
      for (let count = 2; count < 32; count++) expect((await f.propose(request.requestId, request.baseRevisionId, [operation])).status).toBe(409);
      expect(await (await f.propose(request.requestId, request.baseRevisionId, [operation])).json()).toMatchObject({ code: "limit" });
      expect(await f.history()).toMatchObject({ workingRevisionId: revisionId, revisions: expect.any(Array) });
      expect((await f.history()).revisions).toHaveLength(32);

      // A connection filled the history, but the owner's builder save still goes through: it prunes
      // the oldest revisions no pointer uses and keeps the reference and the advanced candidate.
      const { items } = await f.owner.json<BuildDetail>("GET", f.base);
      const map = items.find((item) => item.kind === "map")!;
      const save = await f.owner.request("POST", `${f.base}/maps/chapel/grid`, { cellSize: 50, offsetX: 25, offsetY: 0 },
        { "X-Studio-Authoring-Version": map.authoring!.token });
      expect(save.status, await save.clone().text()).toBe(200);
      const pruned = await f.history();
      expect(pruned.revisions).toHaveLength(AUTHORING_LIMITS.prunedRevisions);
      expect(pruned.revisions.map(({ id }) => id)).toEqual(expect.arrayContaining([request.baseRevisionId, revisionId, pruned.workingRevisionId]));
      const fresh = await f.create(f.makeRequest((await f.inspect()).inspectedVersion, input.selection));
      expect((await f.propose(fresh.requestId, fresh.baseRevisionId, [operation])).status).toBe(200);

      // Ending the correction returns the map and its dependencies to the ordinary builder.
      const resize = async () => (await f.send("POST", "/creatures", { creatures: [{ key: "guard", name: "Guard", size: 3, isPlayerCharacter: false }] })).json();
      expect(await resize()).toMatchObject({ results: [{ key: "guard", saved: false }] });
      expect((await f.owner.request("DELETE", f.map)).status).toBe(200);
      expect((await f.owner.request("GET", `${f.map}/revisions`)).status).toBe(404);
      expect(await resize()).toMatchObject({ results: [{ key: "guard", saved: true }] });
    } finally { await f.server.close(); }
  });

  it("guards only current dependencies and lets the owner delete enrolled drafts", async () => {
    const f = await fixture(makeStore());
    try {
      const head = await f.inspect();
      await f.create(f.makeRequest(head.inspectedVersion, { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] }));
      const resize = async () => (await f.send("POST", "/creatures", { creatures: [{ key: "guard", name: "Guard", size: 1, isPlayerCharacter: false }] })).json();
      expect(await resize()).toMatchObject({ results: [{ key: "guard", saved: false }] });

      // Deleting a creature the scene uses leaves the scene drifted instead of refusing the owner.
      expect((await f.owner.request("DELETE", `${f.base}/items/creature/guard`)).status).toBe(204);
      expect(StudioSnapshot.parse(await f.owner.json("GET", `${f.base}/studio`)).workingBindingChanged).toBe(true);
      const { items } = await f.owner.json<BuildDetail>("GET", f.base);
      const encounter = items.find((item) => item.kind === "encounter")!;
      const cleared = await f.owner.request("PATCH", `${f.base}/encounters/night`, { tokens: [] },
        { "X-Studio-Authoring-Version": encounter.authoring!.token });
      expect(cleared.status, await cleared.clone().text()).toBe(200);
      expect(await f.inspect()).toMatchObject({ drifted: false });
      // The creature no longer belongs to the current scene, so the AI may write it again.
      expect(await resize()).toMatchObject({ results: [{ key: "guard", saved: true }] });

      // Deleting the enrolled encounter ends the correction.
      const stagedResponse = await f.send("POST", "/authoring/chat-selections", { viewId: randomUUID(), sequence: 1, draft: {
        mapKey: "chapel", encounterKey: "night", inspectedVersion: (await f.inspect()).inspectedVersion,
        selection: { region, layers: ["terrain"], objectIds: [], wholeObjectIds: [] },
      } });
      expect(stagedResponse.status).toBe(200);
      const { selectionId } = StudioChatSelectionReference.parse(await stagedResponse.json());
      expect((await f.owner.request("DELETE", `${f.base}/items/encounter/night`)).status).toBe(204);
      expect((await f.owner.request("GET", `${f.map}/revisions`)).status).toBe(404);
      expect((await f.send("POST", `/authoring/chat-selections/${selectionId}/request`, { instruction: "Clear rubble." })).status).toBe(409);
    } finally { await f.server.close(); }
  });

  it("scopes a mark by its whole square", async () => {
    const f = await fixture(makeStore());
    try {
      const head = await f.inspect();
      const request = await f.create(f.makeRequest(head.inspectedVersion, { region, layers: ["geometry"], objectIds: [], wholeObjectIds: [] }));
      const mark = (column: number, row: number) => [{ op: "mark.add", mark: { square: { column, row }, reason: "Check the rubble." } }];
      // Column 4's corner lies on the region's right edge (x 225), but its square covers x 225–275.
      const outside = await f.propose(request.requestId, request.baseRevisionId, mark(4, 0));
      expect(outside.status).toBe(422);
      expect(await outside.json()).toMatchObject({ code: "scope" });
      expect((await f.propose(request.requestId, request.baseRevisionId, mark(3, 3))).status).toBe(200);
    } finally { await f.server.close(); }
  });
});
