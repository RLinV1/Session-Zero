import { randomBytes, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import {
  BUILD_LIMITS,
  BUILD_PASS_PREFIX,
  BuildChoicesChange,
  BuildKey,
  BuildPass,
  DEFAULT_GRID,
  DraftCreature,
  DraftEncounter,
  DraftMap,
  DraftMapSetup,
  DraftMapSetupChange,
  DraftProposedGrid,
  EMPTY_MAP_SETUP,
  GameProfile,
  LibraryUploadFields,
  MAX_ASSET_EDGE,
  MAX_ENCOUNTER_TEMPLATES,
  UvttError,
  canRenderGrid,
  changesWalls,
  checkBuild,
  creatureProblems,
  describeDraftLine,
  draftMapBoard,
  draftTerrainProblems,
  draftTerrainState,
  footprintCenter,
  listOpenings,
  mapOpenings,
  mapSetupProblems,
  normalizeTerrain,
  readDraftMap,
  terrainGridOf,
  terrainTally,
  type DraftCreatureState,
  type DraftEncounterState,
  type DraftMapState,
  type GridSpec,
} from "@vtt/shared";
import { planPublish } from "../domain/buildPublish";
import { mapOverlay, type OverlayRegion } from "../domain/mapOverlay";
import { hashToken } from "../domain/credentials";
import { enqueueDetection, type GridDetectionDispatcher } from "../domain/gridDetection";
import { inspectMapUpload } from "../domain/uploadAnalysis";
import { requireAccount } from "../identity/middleware";
import { refused, type AccountLimits } from "../identity/routes";
import type { Sessions } from "../identity/sessions";
import type { AssetStore } from "../store/assetStore";
import {
  BuildChoiceOffError,
  BuildClosedError,
  BuildItemChangedError,
  BuildItemLockedError,
  type BuildWriteGuard,
  BuildLimitError,
  BuildPublishConflictError,
  type BuildFileKind,
  type BuildFileRecord,
  type BuildItemKind,
  type BuildItemRecord,
  type BuildRecord,
} from "../store/buildStore";
import { CreatureImageMissingError, EncounterLimitError, EncounterMapMissingError, UPLOAD_ALLOWANCE, UploadAllowanceError } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import { receiveUvtt, writeUvttImage } from "../uvtt/uploads";
import type { UvttValidationPool } from "../uvtt/validationPool";
import { MAX_IMAGE_BYTES, imageUploader } from "./imageUpload";

const FILE_LIMITS = { files: BUILD_LIMITS.filesPerBuild, maps: BUILD_LIMITS.mapsPerBuild, bytes: BUILD_LIMITS.storageBytesPerBuild };
const PREVIEW_EDGE = 1500;
/** Shrinking a very large map is the heaviest thing a pass can ask for, so only this many run at once. */
const MAX_PREVIEWS_AT_ONCE = 2;

const NOT_A_PASS = "That build pass isn't valid. Ask the user to make a new one on the build page.";
const PASS_EXPIRED = "That build pass has expired. Ask the user to make a new one on the build page.";
const WRONG_FILE_TYPE = "A build takes PNG, JPEG or WebP images and UVTT files. Rules and character sheets stay in your AI app.";
const NOT_FOUND = "No such build.";
const WALLS_NOT_ALLOWED = 'The owner hasn\'t let the AI set walls, doors and windows on this build. They can tick "Let my AI set walls, doors and windows" on the build page.';
const TERRAIN_NOT_ALLOWED = 'The owner hasn\'t let the AI propose terrain on this build. They can tick "Let my AI propose terrain" on the build page.';
/** Said after a refusal of a save that had a part the owner allows, so the AI knows that part wasn't saved either. */
const NOTHING_SAVED = " Nothing was saved. Send only what's allowed.";
const OWNER_TERRAIN_CLEAR_ONLY = "Here you can only clear the terrain your AI proposed. Paint terrain in the map editor after publishing.";
const AI_READ_OLD_VERSION = "This map changed while you were saving, perhaps by another save at the same moment. Read it again with get_map_setup, then save once more.";
const OWNER_SAW_OLD_VERSION = "Your AI changed this map since you looked. Check it again, then make your change.";

/** Every choice is off unless the owner ticks it (ADR 0053, ADR 0071). */
const StartBuild = z.strictObject({
  name: z.string().trim().min(1).max(80), aiGrid: z.boolean().default(false), aiWalls: z.boolean().default(false), aiTerrain: z.boolean().default(false),
});
const UploadKind = z.enum(["map", "token", "uvtt"]);
const ItemKind = z.enum(["creature", "map", "encounter"]);
const FileId = z.uuid();
const RenameMap = z.strictObject({ name: LibraryUploadFields.shape.name });
const PublishRequest = z.strictObject({
  creatures: z.array(BuildKey).max(BUILD_LIMITS.creaturesPerBuild).default([]),
  maps: z.array(BuildKey).max(BUILD_LIMITS.mapsPerBuild).default([]),
  encounters: z.array(BuildKey).max(BUILD_LIMITS.encountersPerBuild).default([]),
  /** The version of each draft item the person was looking at, as `kind/key`. Required: a person always looks first. */
  reviewed: z.record(z.string().max(80), z.string().max(40)),
}).refine((r) => r.creatures.length + r.maps.length + r.encounters.length > 0, { message: "Choose something to publish." });
const RemovePublished = z.strictObject({ ids: z.array(z.uuid()).max(1000).optional() });
/**
 * The owner's whole setup for a map, and the version of the map the page showed. Terrain left out
 * stays as it was, and `terrain: []` clears it (ADR 0071); the page can't paint terrain.
 */
const OwnerSetupSave = z.strictObject({ setup: DraftMapSetup, updatedAt: z.string().max(40) });
const WALL_PARTS = ["openings", "lines", "marks"] as const;

/** Whether two JSON values are the same, whatever their keys' order: Postgres's jsonb doesn't keep it. */
function sameJson(a: unknown, b: unknown): boolean {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)).map(([k, value]) => [k, stable(value)])) : v;
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
const Square = z.coerce.number().int().min(0).max(100_000);
/** `view_file`'s options: the grid, walls and numbered openings drawn on a map, whole or a block of squares. */
const PreviewQuery = z.object({
  overlay: z.enum(["1", "true"]).optional(),
  fromColumn: Square.optional(), toColumn: Square.optional(), fromRow: Square.optional(), toRow: Square.optional(),
}).refine((q) => [q.fromColumn, q.toColumn, q.fromRow, q.toRow].every((v) => v === undefined) || [q.fromColumn, q.toColumn, q.fromRow, q.toRow].every((v) => v !== undefined), {
  message: "Give all of fromColumn, toColumn, fromRow and toRow, or none.",
});

/** A pass, 256 random bits, shown once. Only its hash is ever stored (ADR 0002's approach, ADR 0053). */
function newBuildPass(): string {
  return `${BUILD_PASS_PREFIX}${randomBytes(32).toString("base64url")}`;
}

const issueText = (error: z.ZodError) => error.issues.map((i) => `${i.path.join(".") || "value"}: ${i.message}`).join("; ");

/** Plain text of limited length, with control characters removed, so a file name can't break a listing. */
const shownName = (name: string) => name.replace(/\p{Cc}/gu, "").trim().slice(0, 200) || "unnamed";

/** What an AI may see of a file: no storage address, because `view_file` returns pictures only. */
function fileForPass(file: BuildFileRecord) {
  return {
    id: file.id, kind: file.kind, name: file.originalName, width: file.width, height: file.height, sizeBytes: file.sizeBytes,
    fromUvtt: file.grid !== null,
    grid: file.grid,
    walls: file.board?.walls.length ?? 0,
    /** Numbered from 1 in `get_map_setup` and in the picture. */
    openings: mapOpenings(file.board).length,
    detection: file.detectionStatus ? { status: file.detectionStatus, suggestion: file.detectionResult } : null,
  };
}

/** The owner's own view also carries the address and the file's walls, to draw them on the build page. */
const fileForOwner = (file: BuildFileRecord) => ({ ...fileForPass(file), url: file.url, published: file.publishedAssetId !== null, board: file.board });

/** The units a grid confirmed for this build gets: the game profile's, or the app's default. */
const unitsOf = (build: BuildRecord) => ({
  unitsPerCell: build.gameProfile?.unitsPerCell ?? DEFAULT_GRID.unitsPerCell,
  unitLabel: build.gameProfile?.unitLabel ?? DEFAULT_GRID.unitLabel,
});

/**
 * A draft map as it reads now: its grid status follows the owner's choice and detection (ADR 0053).
 * Only ever for reading and sending. What is stored stays as it was saved.
 */
const readMap = (build: BuildRecord, data: DraftMapState, file: BuildFileRecord | null | undefined) =>
  readDraftMap(data, file ?? null, build.aiGrid, unitsOf(build));

function itemView(item: BuildItemRecord, read?: { build: BuildRecord; files: ReadonlyMap<string, BuildFileRecord> }) {
  const data = item.kind === "map" && read
    ? readMap(read.build, item.data as unknown as DraftMapState, read.files.get((item.data as unknown as DraftMapState).fileId))
    : item.data;
  return {
    kind: item.kind, key: item.key, data, flags: item.flags, notCarriedOver: item.notCarriedOver,
    editedByUser: item.editedByUser, published: item.publishedId !== null, updatedAt: item.updatedAt,
  };
}

function buildSummary(build: BuildRecord) {
  return {
    id: build.id, name: build.name, status: build.status, createdAt: build.createdAt, updatedAt: build.updatedAt,
    passExpiresAt: build.passExpiresAt,
    /** When the 14-day sweep will close it, if nothing changes before then. */
    closesAt: new Date(Date.parse(build.updatedAt) + BUILD_LIMITS.abandonedAfterDays * 24 * 60 * 60_000).toISOString(),
    choices: { aiGrid: build.aiGrid, aiWalls: build.aiWalls, aiTerrain: build.aiTerrain },
  };
}

/** What the owner lets the AI do, as a pass reads it. Only the owner can change these. */
const allowedOf = (build: BuildRecord) => ({ grids: build.aiGrid, walls: build.aiWalls, terrain: build.aiTerrain });

/** Why a map's terrain can't be used as it stands, in the AI's words (ADR 0071). */
function terrainProblems(setup: DraftMapSetup, grid: Parameters<typeof draftTerrainState>[1], file: BuildFileRecord): string[] {
  const state = draftTerrainState(setup, grid);
  if (state === "noGrid") return ["The terrain needs a grid. Propose one with save_map."];
  if (state === "otherGrid") {
    const was = setup.terrainGrid!;
    return [`The terrain was proposed on ${was.cellSize}-pixel squares at offset (${was.offsetX}, ${was.offsetY}), not on the grid the map has now. Save it again, or clear it with terrain: [].`];
  }
  return state === "ready" ? draftTerrainProblems(setup.terrain ?? [], grid, file) : [];
}

/** A map's walls, doors and windows as the AI sees them: numbered openings, its lines and marks, and what's allowed. */
function setupView(build: BuildRecord, key: string, data: DraftMapState, file: BuildFileRecord | null) {
  const read = readMap(build, data, file);
  const grid = read.grid ?? read.proposedGrid;
  const setup = data.setup ?? EMPTY_MAP_SETUP;
  const board = file ? draftMapBoard(file.board, setup, grid, file) : null;
  const columns = grid && file ? Math.ceil((file.width - grid.offsetX) / grid.cellSize) : null;
  const rows = grid && file ? Math.ceil((file.height - grid.offsetY) / grid.cellSize) : null;
  const terrain = setup.terrain ?? [];
  return {
    map: key,
    allowed: allowedOf(build),
    grid: grid ? { cellSize: grid.cellSize, offsetX: grid.offsetX, offsetY: grid.offsetY, status: read.gridStatus, by: read.gridBy ?? null } : null,
    columns,
    rows,
    /**
     * Every square terrain can cover, inclusive. With an offset, column -1 or row -1 is the strip
     * the map's edge crops, as is a last column or row that runs past the edge.
     */
    terrainSquares: grid && columns !== null && rows !== null
      ? { columns: { from: grid.offsetX > 0 ? -1 : 0, to: columns - 1 }, rows: { from: grid.offsetY > 0 ? -1 : 0, to: rows - 1 } }
      : null,
    plainWalls: (file?.board?.walls.length ?? 0) - mapOpenings(file?.board ?? null).length,
    openings: listOpenings(file?.board ?? null, setup, grid).map(({ a: _a, b: _b, ...opening }) => opening),
    lines: setup.lines.map((line, index) => ({ line: index + 1, ...line })),
    marks: setup.marks,
    /** Permanent terrain you proposed (ADR 0071). Squares not listed are Normal. */
    terrain: {
      runs: terrain,
      squares: terrainTally(terrain),
      proposedOn: setup.terrainGrid ?? null,
      state: draftTerrainState(setup, grid),
    },
    problems: [
      ...(!board ? [] : board.ok
        ? board.blockedLines.map((i) => `${describeDraftLine(setup.lines[i]!, i)} sits on a wall it doesn't cut, so the wall still blocks it.`)
        : board.problems),
      ...(file ? terrainProblems(setup, grid, file) : []),
    ],
  };
}

interface Deps {
  store: RoomStore;
  assets: AssetStore;
  uploadDir: string;
  limits: AccountLimits;
  detection: GridDetectionDispatcher;
  pool: UvttValidationPool;
  sessions: Sessions;
  now: () => number;
}

const passBuild = (res: Response) => res.locals.build as BuildRecord;

/**
 * The AI game builder (FR-GM-26, FR-GM-27, ADR 0053). Two route families that never overlap:
 *
 * - `/api/builds/*` takes the owner's session cookie and nothing else.
 * - `/api/build/*` takes a build pass and nothing else.
 *
 * No other route knows a pass exists, so everywhere else a pass is no credential at all.
 */
export function registerBuildRoutes(app: Express, deps: Deps) {
  const { store, assets, uploadDir, limits, detection, pool, sessions, now } = deps;
  const receiveImage = imageUploader(uploadDir, MAX_IMAGE_BYTES, { anyDeclaredType: true });
  let previewsRunning = 0;

  const failed = (res: Response) => (err: unknown) => {
    console.error("[vtt] build request failed", err instanceof Error ? err.name : "error");
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Try again." });
  };

  const makePass = async (build: Pick<BuildRecord, "id" | "ownerGmId">) => {
    const pass = newBuildPass();
    const expiresAt = new Date(now() + BUILD_LIMITS.passLifetimeMs).toISOString();
    if (!await store.setBuildPass(build.id, build.ownerGmId, hashToken(pass), expiresAt)) return null;
    return { pass, expiresAt };
  };

  // ---------- The owner's signed-in routes ----------

  app.post("/api/builds", (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const account = requireAccount(res);
      if (!account) return;
      const body = StartBuild.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: issueText(body.error) });
      let build: BuildRecord;
      try {
        build = await store.createBuild({ id: randomUUID(), ownerGmId: account.user.ownerId, ...body.data }, BUILD_LIMITS.openBuildsPerAccount);
      } catch (err) {
        if (err instanceof BuildLimitError) return void res.status(409).json({ error: err.message });
        throw err;
      }
      const made = await makePass(build);
      res.status(201).json({ build: buildSummary(build), ...made });
    })().catch(failed(res));
  });

  app.get("/api/builds", (_req, res) => {
    void (async () => {
      const account = requireAccount(res);
      if (!account) return;
      res.json((await store.listBuilds(account.user.ownerId)).map(buildSummary));
    })().catch(failed(res));
  });

  /** The caller's own open or closed build, or 404 for any other, so the two read the same. */
  const ownerBuild = async (req: Request, res: Response) => {
    const account = requireAccount(res);
    if (!account) return null;
    const id = FileId.safeParse(req.params.id);
    const build = id.success ? await store.findBuild(id.data, account.user.ownerId) : null;
    if (!build) {
      res.status(404).json({ error: NOT_FOUND });
      return null;
    }
    return { build, account };
  };

  app.get("/api/builds/:id", (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const found = await ownerBuild(req, res);
      if (!found) return;
      const { build } = found;
      const [files, items] = await Promise.all([store.listBuildFiles(build.id), store.listBuildItems(build.id)]);
      const read = { build, files: new Map(files.map((f) => [f.id, f])) };
      res.json({
        build: buildSummary(build),
        profile: build.gameProfile,
        files: files.map(fileForOwner),
        items: items.map((item) => itemView(item, read)),
      });
    })().catch(failed(res));
  });

  /** The owner's choices for what the AI may set up on maps. A pass can read them and never change them. */
  app.put("/api/builds/:id/choices", (req, res) => {
    void (async () => {
      const found = await ownerBuild(req, res);
      if (!found) return;
      const body = BuildChoicesChange.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: issueText(body.error) });
      // A page from before the terrain choice doesn't send it; the store keeps it, inside its write (ADR 0071).
      const build = await store.setBuildChoices(found.build.id, found.build.ownerGmId, body.data);
      if (!build) return void res.status(409).json({ error: "This build is closed." });
      res.json({ build: buildSummary(build) });
    })().catch(failed(res));
  });

  app.post("/api/builds/:id/pass", (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const found = await ownerBuild(req, res);
      if (!found) return;
      const made = await makePass(found.build);
      if (!made) return void res.status(409).json({ error: "This build is closed." });
      res.status(201).json(made);
    })().catch(failed(res));
  });

  app.delete("/api/builds/:id/pass", (req, res) => {
    void (async () => {
      const found = await ownerBuild(req, res);
      if (!found) return;
      await store.clearBuildPass(found.build.id, found.build.ownerGmId);
      res.status(204).end();
    })().catch(failed(res));
  });

  app.post("/api/builds/:id/files", (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const found = await ownerBuild(req, res);
      if (!found) return;
      const { build, account } = found;
      await acceptFile(req, res, build, () => sessions.isLive(account.session.tokenHash), fileForOwner);
    })().catch(failed(res));
  });

  /** A draft item of the owner's open build, or the response already sent. */
  const ownerItem = async (req: Request, res: Response, kind: BuildItemKind) => {
    const found = await ownerBuild(req, res);
    if (!found) return null;
    const item = await store.findBuildItem(found.build.id, kind, String(req.params.key));
    if (!item) {
      res.status(404).json({ error: "No such item." });
      return null;
    }
    return { ...found, item };
  };

  /** Filling in a value answers the flag on that field. Blanking one doesn't. */
  const flagsAfter = (item: BuildItemRecord, patch: Record<string, unknown>) => {
    const answered = new Set(Object.entries(patch)
      .filter(([field, value]) => value !== null && JSON.stringify(value) !== JSON.stringify(item.data[field]))
      .map(([field]) => field.toLowerCase()));
    return item.flags.filter((f) => !answered.has(f.field.toLowerCase()));
  };

  /** Writes the owner's change, or answers why it can't be written. */
  async function saveOwnerEdit(res: Response, item: Parameters<RoomStore["editBuildItem"]>[0], build?: BuildRecord, guard?: BuildWriteGuard) {
    try {
      const saved = await store.editBuildItem(item, guard);
      const files = build && saved.kind === "map" ? new Map((await store.listBuildFiles(build.id)).map((f) => [f.id, f])) : null;
      res.json({ item: itemView(saved, build && files ? { build, files } : undefined) });
    } catch (err) {
      if (err instanceof BuildItemChangedError) return void res.status(409).json({ error: OWNER_SAW_OLD_VERSION });
      if (!(err instanceof BuildItemLockedError || err instanceof BuildClosedError)) throw err;
      res.status(409).json({ error: err.message });
    }
  }

  app.patch("/api/builds/:id/creatures/:key", (req, res) => {
    void (async () => {
      const found = await ownerItem(req, res, "creature");
      if (!found) return;
      const { build, item } = found;
      const patch = (req.body ?? {}) as Record<string, unknown>;
      const parsed = DraftCreature.safeParse({ ...item.data, ...patch, key: item.key, flags: flagsAfter(item, patch), notCarriedOver: item.notCarriedOver });
      if (!parsed.success) return void res.status(422).json({ error: issueText(parsed.error) });
      const { key, flags, notCarriedOver, ...data } = parsed.data;
      if (data.imageFileId && (await store.findBuildFile(build.id, data.imageFileId))?.kind !== "token") {
        return void res.status(422).json({ error: "imageFileId: choose token art from this build." });
      }
      await saveOwnerEdit(res, { buildId: build.id, kind: "creature", key, data, flags, notCarriedOver });
    })().catch(failed(res));
  });

  app.patch("/api/builds/:id/maps/:key", (req, res) => {
    void (async () => {
      const found = await ownerItem(req, res, "map");
      if (!found) return;
      const { build, item } = found;
      const body = RenameMap.safeParse(req.body);
      if (!body.success) return void res.status(422).json({ error: issueText(body.error) });
      await saveOwnerEdit(res, { buildId: build.id, kind: "map", key: item.key, data: { ...item.data, name: body.data.name }, flags: item.flags, notCarriedOver: item.notCarriedOver }, build);
    })().catch(failed(res));
  });

  /**
   * The owner's fix to a map's walls, doors and windows: the whole setup, as the page now has it,
   * with the version of the map the page showed. Openings are numbered for one file, so a change
   * made against an older version, such as the AI having moved the map to another file, is refused.
   * Marks the map edited, so the AI can't change it again (ADR 0053).
   */
  app.put("/api/builds/:id/maps/:key/setup", (req, res) => {
    void (async () => {
      const found = await ownerItem(req, res, "map");
      if (!found) return;
      const { build, item } = found;
      const body = OwnerSetupSave.safeParse(req.body);
      if (!body.success) return void res.status(422).json({ error: issueText(body.error) });
      if (body.data.updatedAt !== item.updatedAt) return void res.status(409).json({ error: OWNER_SAW_OLD_VERSION });
      const map = item.data as unknown as DraftMapState;
      const file = await store.findBuildFile(build.id, map.fileId);
      if (!file) return void res.status(409).json({ error: "This map's file isn't in the build any more." });
      const before = map.setup ?? EMPTY_MAP_SETUP;
      // The server keeps the grid terrain was proposed on; the page's copy is never taken.
      const { terrain, terrainGrid: _shown, ...walls } = body.data.setup;
      const kept = before.terrain?.length ? { terrain: before.terrain, ...(before.terrainGrid ? { terrainGrid: before.terrainGrid } : {}) } : {};
      if (terrain?.length && !sameJson(normalizeTerrain(terrain), normalizeTerrain(before.terrain ?? []))) {
        return void res.status(422).json({ error: OWNER_TERRAIN_CLEAR_ONLY });
      }
      const setup: DraftMapSetup = { ...walls, ...(terrain?.length === 0 ? {} : kept) };
      // Clearing terrain alone isn't held back by walls a grid correction has since put off the map.
      const wallsChanged = WALL_PARTS.some((part) => !sameJson(walls[part], before[part]));
      const read = readMap(build, map, file);
      const problems = wallsChanged ? mapSetupProblems(file.board, setup, read.grid ?? read.proposedGrid, file) : [];
      if (problems.length > 0) return void res.status(422).json({ error: problems.join("\n") });
      await saveOwnerEdit(res, { buildId: build.id, kind: "map", key: item.key, data: { ...item.data, setup }, flags: item.flags, notCarriedOver: item.notCarriedOver }, build, { expectedUpdatedAt: body.data.updatedAt });
    })().catch(failed(res));
  });

  /** Only a person can confirm a grid (KAN-09). Distance per square comes from the game profile. */
  app.post("/api/builds/:id/maps/:key/grid", (req, res) => {
    void (async () => {
      const found = await ownerItem(req, res, "map");
      if (!found) return;
      const { build, item } = found;
      const body = DraftProposedGrid.safeParse(req.body);
      if (!body.success) return void res.status(422).json({ error: issueText(body.error) });
      const map = item.data as unknown as DraftMapState;
      const file = await store.findBuildFile(build.id, map.fileId);
      if (!file) return void res.status(409).json({ error: "This map's file isn't in the build any more." });
      if (!canRenderGrid(body.data.cellSize, file) || body.data.cellSize > Math.max(file.width, file.height)) {
        return void res.status(422).json({ error: "That square size doesn't fit this map." });
      }
      const grid: GridSpec = { ...body.data, ...unitsOf(build) };
      const data: DraftMapState = { ...map, grid, gridStatus: "confirmed" };
      await saveOwnerEdit(res, { buildId: build.id, kind: "map", key: item.key, data: { ...data }, flags: item.flags.filter((f) => f.field.toLowerCase() !== "grid"), notCarriedOver: item.notCarriedOver }, build);
    })().catch(failed(res));
  });

  app.patch("/api/builds/:id/encounters/:key", (req, res) => {
    void (async () => {
      const found = await ownerItem(req, res, "encounter");
      if (!found) return;
      const { build, item } = found;
      const patch = (req.body ?? {}) as Record<string, unknown>;
      const parsed = DraftEncounter.safeParse({ ...item.data, ...patch, key: item.key, flags: flagsAfter(item, patch), notCarriedOver: item.notCarriedOver });
      if (!parsed.success) return void res.status(422).json({ error: issueText(parsed.error) });
      const { key, flags, notCarriedOver, ...data } = parsed.data;
      const refused_ = await encounterProblem(build, data);
      if (refused_) return void res.status(422).json({ error: refused_ });
      await saveOwnerEdit(res, { buildId: build.id, kind: "encounter", key, data, flags, notCarriedOver });
    })().catch(failed(res));
  });

  app.delete("/api/builds/:id/items/:kind/:key", (req, res) => {
    void (async () => {
      const found = await ownerBuild(req, res);
      if (!found) return;
      const kind = ItemKind.safeParse(req.params.kind);
      if (!kind.success) return void res.status(404).json({ error: "No such item." });
      try {
        if (!await store.removeBuildItem(found.build.id, kind.data, String(req.params.key), true)) return void res.status(404).json({ error: "No such item." });
      } catch (err) {
        if (err instanceof BuildItemLockedError || err instanceof BuildClosedError) return void res.status(409).json({ error: err.message });
        throw err;
      }
      res.status(204).end();
    })().catch(failed(res));
  });

  /**
   * Publishing needs the owner's session from the app itself: no pass and no tool can do it, so a
   * person always looks first (ADR 0053). Adds ordinary library items, all together or not at all.
   */
  app.post("/api/builds/:id/publish", (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const found = await ownerBuild(req, res);
      if (!found) return;
      const { build } = found;
      const selection = PublishRequest.safeParse(req.body);
      if (!selection.success) return void res.status(400).json({ error: issueText(selection.error) });
      if (build.status !== "open") return void res.status(409).json({ error: "This build is closed." });
      try {
        const planned = await planPublish(store, build, selection.data, new Date(now()).toISOString());
        if (!planned.ok) return void res.status(422).json({ error: planned.problems.map((p) => `${p.item}: ${p.message}`).join("\n"), problems: planned.problems });
        res.json({ published: await store.publishBuild(planned.plan, UPLOAD_ALLOWANCE, MAX_ENCOUNTER_TEMPLATES) });
      } catch (err) {
        if (err instanceof UploadAllowanceError || err instanceof EncounterLimitError || err instanceof BuildClosedError || err instanceof BuildPublishConflictError) {
          return void res.status(409).json({ error: err.message });
        }
        if (err instanceof EncounterMapMissingError || err instanceof CreatureImageMissingError) return void res.status(409).json({ error: new BuildPublishConflictError().message });
        throw err;
      }
    })().catch(failed(res));
  });

  app.delete("/api/builds/:id", (req, res) => {
    void (async () => {
      const found = await ownerBuild(req, res);
      if (!found) return;
      await discard(found.build.id, found.build.ownerGmId);
      res.status(204).end();
    })().catch(failed(res));
  });

  async function discard(id: string, ownerGmId: string) {
    const closed = await store.closeBuild(id, ownerGmId);
    for (const key of closed?.objectKeys ?? []) {
      await assets.delete(key).catch(() => console.error("[vtt] could not delete a file of a closed build"));
    }
  }

  /** What this build published, and where each thing is in use, so the page can warn before removing. */
  app.get("/api/builds/:id/published", (req, res) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const found = await ownerBuild(req, res);
      if (!found) return;
      const { build } = found;
      res.json({ published: await listPublished(build) });
    })().catch(failed(res));
  });

  async function listPublished(build: BuildRecord) {
    const owner = build.ownerGmId;
    const [files, items] = await Promise.all([store.listBuildFiles(build.id), store.listBuildItems(build.id)]);
    const result: { type: "asset" | "creature" | "encounter"; id: string; name: string; rooms: { id: string; name: string }[]; creatures: { id: string; name: string }[]; encounters: { id: string; name: string }[] }[] = [];
    for (const file of files) {
      if (!file.publishedAssetId) continue;
      const asset = await store.findAsset(file.publishedAssetId, owner);
      if (!asset) continue;
      result.push({
        type: "asset", id: asset.id, name: asset.name,
        rooms: await store.assetUsage(asset.id, owner),
        creatures: await store.creaturesUsingImage(asset.id, owner),
        encounters: await store.encountersUsingMap(asset.id, owner),
      });
    }
    for (const item of items) {
      if (!item.publishedId) continue;
      if (item.kind === "creature") {
        const creature = await store.findCreature(item.publishedId, owner);
        if (creature) result.push({ type: "creature", id: creature.id, name: creature.name, rooms: [], creatures: [], encounters: [] });
      } else if (item.kind === "encounter") {
        const encounter = await store.findEncounter(item.publishedId, owner);
        if (encounter) result.push({ type: "encounter", id: encounter.id, name: encounter.name, rooms: [], creatures: [], encounters: [] });
      }
    }
    return result;
  }

  /**
   * Removes library items this build created, through the library's own deletes. Only ids the
   * build recorded are touched, so nothing else in the library can be named here. Rooms stay.
   * Something already deleted by hand is skipped.
   */
  app.post("/api/builds/:id/remove-published", (req, res) => {
    void (async () => {
      const found = await ownerBuild(req, res);
      if (!found) return;
      const { build } = found;
      const body = RemovePublished.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: issueText(body.error) });
      const wanted = body.data.ids ? new Set(body.data.ids) : null;
      const owner = build.ownerGmId;
      const [files, items] = await Promise.all([store.listBuildFiles(build.id), store.listBuildItems(build.id)]);
      const chosen = (id: string | null): id is string => id !== null && (!wanted || wanted.has(id));
      const forgetItems: { kind: BuildItemKind; key: string }[] = [];
      let removed = 0;

      for (const item of items) {
        if (item.kind === "map" || !chosen(item.publishedId)) continue;
        if (item.kind === "encounter" ? await store.deleteEncounter(item.publishedId, owner) : await store.deleteCreature(item.publishedId, owner)) removed++;
        forgetItems.push({ kind: item.kind, key: item.key });
      }
      const forgetFiles: string[] = [];
      for (const file of files) {
        if (!chosen(file.publishedAssetId)) continue;
        const deleted = await store.deleteAsset(file.publishedAssetId, owner);
        if (deleted) {
          removed++;
          // As a library delete does: rooms still naming this address draw the usual stand-in.
          await assets.delete(deleted.objectKey).catch(() => console.error("[vtt] could not delete a published build file"));
        }
        forgetFiles.push(file.id);
        for (const item of items) if (item.kind === "map" && item.publishedId === file.publishedAssetId) forgetItems.push({ kind: "map", key: item.key });
      }
      await store.forgetPublished(build.id, { fileIds: forgetFiles, items: forgetItems });
      res.json({ removed });
    })().catch(failed(res));
  });

  /** Runs the 14-day sweep: closes builds nobody has changed for that long, as if discarded. */
  const sweepAbandoned = async () => {
    const before = new Date(now() - BUILD_LIMITS.abandonedAfterDays * 24 * 60 * 60_000).toISOString();
    for (const { id, ownerGmId } of await store.listAbandonedBuilds(before)) {
      await discard(id, ownerGmId).catch(() => console.error("[vtt] could not close an abandoned build"));
    }
  };

  // ---------- The pass routes ----------

  /** Everything under /api/build/:buildId. `current` means the build the pass belongs to. */
  const passGuard: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    void (async () => {
      res.setHeader("Cache-Control", "no-store");
      const address = `pass:${req.ip}`;
      if (refused(res, limits.buildPassFailuresPerIp.check(address), "Too many attempts with an invalid build pass. Try again later.")) return;
      const header = req.headers.authorization;
      const token = header?.startsWith("Bearer ") ? BuildPass.safeParse(header.slice(7)) : null;
      const build = token?.success ? await store.findBuildByPassHash(hashToken(token.data)) : null;
      if (!build || build.status !== "open") {
        limits.buildPassFailuresPerIp.hit(address);
        return void res.status(401).json({ error: NOT_A_PASS });
      }
      if (!build.passExpiresAt || Date.parse(build.passExpiresAt) <= now()) return void res.status(401).json({ error: PASS_EXPIRED });
      if (refused(res, limits.buildPassRequests.hit(`pass:${build.id}`), "Too many requests with this pass: at most 120 a minute. Wait a minute, then continue.")) return;
      // Another build, on this account or any other, reads exactly as one that doesn't exist.
      if (req.params.buildId !== "current" && req.params.buildId !== build.id) return void res.status(404).json({ error: NOT_FOUND });
      res.locals.build = build;
      next();
    })().catch(failed(res));
  };

  const passHashOf = (req: Request) => hashToken(req.headers.authorization!.slice(7));
  const passStillLive = async (req: Request, build: BuildRecord) => (await store.findBuildByPassHash(passHashOf(req)))?.id === build.id;

  app.get("/api/build/:buildId", passGuard, (_req, res) => {
    void (async () => {
      const build = passBuild(res);
      const [files, items] = await Promise.all([store.listBuildFiles(build.id), store.listBuildItems(build.id)]);
      const read = { build, files: new Map(files.map((f) => [f.id, f])) };
      res.json({
        build: { id: build.id, name: build.name, passExpiresAt: build.passExpiresAt },
        ownerName: await store.findBuildOwnerName(build.ownerGmId),
        /** What the owner lets the AI set up on maps (ADR 0053). Only the owner can change these. */
        allowed: allowedOf(build),
        profile: build.gameProfile,
        files: files.map(fileForPass),
        items: items.map((item) => itemView(item, read)),
        limits: BUILD_LIMITS,
      });
    })().catch(failed(res));
  });

  app.post("/api/build/:buildId/files", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      await acceptFile(req, res, build, () => passStillLive(req, build), fileForPass);
    })().catch(failed(res));
  });

  app.get("/api/build/:buildId/files/:fileId/preview", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      const fileId = FileId.safeParse(req.params.fileId);
      const file = fileId.success ? await store.findBuildFile(build.id, fileId.data) : null;
      if (!file) return void res.status(404).json({ error: "This build has no file with that id." });
      const query = PreviewQuery.safeParse(req.query);
      if (!query.success) return void res.status(422).json({ error: issueText(query.error) });
      const { overlay: wantOverlay, fromColumn, toColumn, fromRow, toRow } = query.data;
      const region = fromColumn !== undefined && toColumn !== undefined && fromRow !== undefined && toRow !== undefined ? { fromColumn, toColumn, fromRow, toRow } : null;
      const layout = wantOverlay && file.kind === "map" ? await overlayFor(build, file, region) : null;
      if (region && !layout?.gridShown) return void res.status(422).json({ error: "Looking at a block of squares needs a grid. Propose one with save_map first." });
      if (previewsRunning >= MAX_PREVIEWS_AT_ONCE) {
        res.setHeader("Retry-After", "2");
        return void res.status(503).json({ error: "Busy making other pictures. Try again in a moment." });
      }
      previewsRunning++;
      try {
        const bytes = await assets.readPrivate(file.objectKey, MAX_IMAGE_BYTES * 2);
        if (!bytes) return void res.status(404).json({ error: "This file's picture isn't available." });
        const image = sharp(bytes, { sequentialRead: true, limitInputPixels: MAX_ASSET_EDGE ** 2 }).rotate();
        const small = layout
          ? await image.extract(layout.layout.crop).resize(layout.layout.out.width, layout.layout.out.height, { fit: "fill" })
            .composite([{ input: Buffer.from(layout.layout.svg), top: 0, left: 0 }]).webp({ quality: 80 }).toBuffer()
          : await image.resize(PREVIEW_EDGE, PREVIEW_EDGE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        res.type("image/webp").send(small);
      } finally {
        previewsRunning--;
      }
    })().catch(failed(res));
  });

  app.put("/api/build/:buildId/profile", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      const profile = GameProfile.safeParse(req.body);
      if (!profile.success) return void res.status(422).json({ error: issueText(profile.error) });
      if (!await refuseClosed(res, () => store.saveGameProfile(build.id, profile.data))) return;
      res.json({ profile: profile.data });
    })().catch(failed(res));
  });

  /** Each creature stands alone, so one bad sheet doesn't lose the others. */
  app.post("/api/build/:buildId/creatures", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      const list = z.array(z.unknown()).min(1).max(BUILD_LIMITS.creaturesPerCall).safeParse((req.body as { creatures?: unknown } | undefined)?.creatures);
      if (!list.success) return void res.status(422).json({ error: `Send 1 to ${BUILD_LIMITS.creaturesPerCall} creatures in "creatures".` });
      const features = build.gameProfile?.features ?? GameProfile.parse({ name: "x" }).features;
      const results = [];
      for (const raw of list.data) {
        const given = typeof raw === "object" && raw !== null && "key" in raw ? String(raw.key).slice(0, 64) : null;
        const parsed = DraftCreature.safeParse(raw);
        if (!parsed.success) { results.push({ key: given, saved: false, error: issueText(parsed.error) }); continue; }
        const { key, flags, notCarriedOver, ...data } = parsed.data;
        if (data.imageFileId && (await store.findBuildFile(build.id, data.imageFileId))?.kind !== "token") {
          results.push({ key, saved: false, error: `imageFileId: this build has no token art with id ${data.imageFileId}.` });
          continue;
        }
        try {
          await store.saveBuildItem({ buildId: build.id, kind: "creature", key, data, flags, notCarriedOver }, BUILD_LIMITS.creaturesPerBuild);
          results.push({ key, saved: true, problems: creatureProblems(data, flags, features) });
        } catch (err) {
          if (!(err instanceof BuildItemLockedError || err instanceof BuildLimitError || err instanceof BuildClosedError)) throw err;
          results.push({ key, saved: false, error: err.message });
        }
      }
      res.json({ results });
    })().catch(failed(res));
  });

  app.post("/api/build/:buildId/maps", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      const parsed = DraftMap.safeParse(req.body);
      if (!parsed.success) return void res.status(422).json({ error: issueText(parsed.error) });
      const { key, flags, notCarriedOver, ...input } = parsed.data;
      const file = await store.findBuildFile(build.id, input.fileId);
      if (file?.kind !== "map") return void res.status(422).json({ error: `fileId: this build has no map file with id ${input.fileId}.` });
      // One library map per file: two drafts of one picture could otherwise confirm different grids.
      const sharing = (await store.listBuildItems(build.id)).find((i) => i.kind === "map" && i.key !== key && (i.data as unknown as DraftMapState).fileId === input.fileId);
      if (sharing) return void res.status(422).json({ error: `fileId: map "${sharing.key}" already uses this file.` });
      const proposed = file.grid ? null : input.proposedGrid;
      if (proposed && (!canRenderGrid(proposed.cellSize, file) || proposed.cellSize > Math.max(file.width, file.height))) {
        return void res.status(422).json({ error: "proposedGrid: that square size doesn't fit this map." });
      }
      // Saving the map again keeps its walls, doors and windows, unless it now uses another file,
      // whose openings are numbered differently. The setup carried over must still be the latest,
      // so a setup saved at the same moment isn't silently undone.
      const earlierItem = await store.findBuildItem(build.id, "map", key);
      const earlier = earlierItem?.data as unknown as DraftMapState | undefined;
      const setup = earlier?.fileId === input.fileId ? earlier.setup : undefined;
      const data: DraftMapState = {
        name: input.name, fileId: input.fileId, proposedGrid: proposed, gridStatus: file.grid ? "confirmed" : proposed ? "proposed" : "none", grid: file.grid,
        ...(setup ? { setup } : {}),
      };
      await saveItem(res, { buildId: build.id, kind: "map", key, data: { ...data }, flags, notCarriedOver }, BUILD_LIMITS.mapsPerBuild, build,
        setup && earlierItem ? { expectedUpdatedAt: earlierItem.updatedAt } : undefined);
    })().catch(failed(res));
  });

  /** A draft map with its file, or the response already sent. */
  const passMap = async (res: Response, build: BuildRecord, key: string) => {
    const item = BuildKey.safeParse(key).success ? await store.findBuildItem(build.id, "map", key) : null;
    if (!item) {
      res.status(404).json({ error: `This build has no map "${key.slice(0, 64)}".` });
      return null;
    }
    const data = item.data as unknown as DraftMapState;
    return { item, data, file: await store.findBuildFile(build.id, data.fileId) };
  };

  /** A map's numbered openings, the AI's lines and marks, and what the owner allows. Reading is always allowed. */
  app.get("/api/build/:buildId/maps/:key/setup", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      const found = await passMap(res, build, String(req.params.key));
      if (!found) return;
      res.json(setupView(build, found.item.key, found.data, found.file));
    })().catch(failed(res));
  });

  /**
   * Sets a map's openings, lines and marks (ADR 0053) and its permanent terrain (ADR 0071), each as
   * far as the owner allows: walls for openings, lines and marks, terrain for terrain, judged by the
   * parts actually sent, so a terrain-only save works with walls off. A save with any part not
   * allowed writes nothing. Each part sent replaces that part; `terrain: []` clears it. A map the
   * owner edited, or one already published, is refused by the store. The store checks again, in the
   * write, that the parts sent are still allowed and that the map is still the version read here, so
   * the owner turning a choice off, or another save at the same moment, wins.
   */
  app.put("/api/build/:buildId/maps/:key/setup", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      // Judged on what was sent before it is checked, so a part not allowed is refused, not explained.
      const sent = typeof req.body === "object" && req.body !== null ? req.body as Record<string, unknown> : {};
      const wantsWalls = WALL_PARTS.some((part) => sent[part] !== undefined), wantsTerrain = sent.terrain !== undefined;
      /** Why the parts sent aren't all allowed, or null. */
      const refusal = (allows: Pick<BuildRecord, "aiWalls" | "aiTerrain">) => {
        const wallsOff = wantsWalls && !allows.aiWalls, terrainOff = wantsTerrain && !allows.aiTerrain;
        if (!wallsOff && !terrainOff) return null;
        const reason = [wallsOff ? WALLS_NOT_ALLOWED : "", terrainOff ? TERRAIN_NOT_ALLOWED : ""].filter(Boolean).join(" ");
        // When the other part was allowed, say it wasn't saved either.
        return wallsOff !== terrainOff && wantsWalls && wantsTerrain ? `${reason}${NOTHING_SAVED}` : reason;
      };
      if (!wantsWalls && !wantsTerrain && !build.aiWalls && !build.aiTerrain) return void res.status(403).json({ error: WALLS_NOT_ALLOWED });
      const refused_ = refusal(build);
      if (refused_) return void res.status(403).json({ error: refused_ });
      const change = DraftMapSetupChange.safeParse(req.body);
      if (!change.success) return void res.status(422).json({ error: issueText(change.error) });
      const found = await passMap(res, build, String(req.params.key));
      if (!found) return;
      const { item, data, file } = found;
      if (!file) return void res.status(409).json({ error: "This map's file isn't in the build any more." });
      const read = readMap(build, data, file);
      const grid = read.grid ?? read.proposedGrid;
      const { terrain, ...wallParts } = change.data;
      const { terrain: _terrain, terrainGrid: _terrainGrid, ...rest } = { ...(data.setup ?? EMPTY_MAP_SETUP), ...wallParts };
      const before = data.setup ?? EMPTY_MAP_SETUP;
      let setup: DraftMapSetup = { ...rest, ...(before.terrain?.length ? { terrain: before.terrain, ...(before.terrainGrid ? { terrainGrid: before.terrainGrid } : {}) } : {}) };
      // Each part is checked only when sent, so saving one isn't held back by another the grid has since moved.
      const problems = changesWalls(change.data) ? mapSetupProblems(file.board, setup, grid, file) : [];
      if (terrain !== undefined) {
        problems.push(...draftTerrainProblems(terrain, grid, file));
        // Stored with the grid it was proposed on, so a grid correction can't silently move it (ADR 0071).
        setup = { ...rest, ...(terrain.length > 0 && grid ? { terrain: normalizeTerrain(terrain), terrainGrid: terrainGridOf(grid) } : {}) };
      }
      if (problems.length > 0) return void res.status(422).json({ error: problems.join("\n") });
      try {
        await store.saveBuildItem({ buildId: build.id, kind: "map", key: item.key, data: { ...item.data, setup }, flags: item.flags, notCarriedOver: item.notCarriedOver }, BUILD_LIMITS.mapsPerBuild,
          { requireAiWalls: wantsWalls, requireAiTerrain: wantsTerrain, expectedUpdatedAt: item.updatedAt });
      } catch (err) {
        if (err instanceof BuildChoiceOffError) {
          const now_ = await store.findBuild(build.id, build.ownerGmId);
          return void res.status(403).json({ error: refusal(now_ ?? { aiWalls: false, aiTerrain: false }) ?? WALLS_NOT_ALLOWED });
        }
        if (err instanceof BuildItemChangedError) return void res.status(409).json({ error: AI_READ_OLD_VERSION });
        if (!(err instanceof BuildItemLockedError || err instanceof BuildLimitError || err instanceof BuildClosedError)) throw err;
        return void res.status(409).json({ error: err.message });
      }
      res.json(setupView(build, item.key, { ...data, setup }, file));
    })().catch(failed(res));
  });

  app.post("/api/build/:buildId/encounters", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      const parsed = DraftEncounter.safeParse(req.body);
      if (!parsed.success) return void res.status(422).json({ error: issueText(parsed.error) });
      const { key, flags, notCarriedOver, ...input } = parsed.data;
      const problem = await encounterProblem(build, input);
      if (problem) return void res.status(422).json({ error: problem });
      await saveItem(res, { buildId: build.id, kind: "encounter", key, data: { ...input }, flags, notCarriedOver }, BUILD_LIMITS.encountersPerBuild);
    })().catch(failed(res));
  });

  app.delete("/api/build/:buildId/items/:kind/:key", passGuard, (req, res) => {
    void (async () => {
      const build = passBuild(res);
      const kind = ItemKind.safeParse(req.params.kind);
      if (!kind.success) return void res.status(404).json({ error: "No such item." });
      let removed: boolean;
      try {
        removed = await store.removeBuildItem(build.id, kind.data as BuildItemKind, String(req.params.key));
      } catch (err) {
        if (err instanceof BuildItemLockedError || err instanceof BuildClosedError) return void res.status(409).json({ error: err.message });
        throw err;
      }
      if (!removed) return void res.status(404).json({ error: "No such item." });
      res.status(204).end();
    })().catch(failed(res));
  });

  app.get("/api/build/:buildId/check", passGuard, (_req, res) => {
    void (async () => {
      const build = passBuild(res);
      const [files, items] = await Promise.all([store.listBuildFiles(build.id), store.listBuildItems(build.id)]);
      const fileById = new Map(files.map((f) => [f.id, f]));
      const ofKind = <T>(kind: BuildItemKind) => items.filter((i) => i.kind === kind).map((i) => ({ key: i.key, data: i.data as unknown as T, flags: i.flags }));
      res.json({
        issues: checkBuild({
          profile: build.gameProfile,
          aiWalls: build.aiWalls,
          files,
          creatures: ofKind<DraftCreatureState>("creature"),
          maps: ofKind<DraftMapState>("map").map((m) => ({ ...m, data: readMap(build, m.data, fileById.get(m.data.fileId)) })),
          encounters: ofKind<DraftEncounterState>("encounter"),
        }),
      });
    })().catch(failed(res));
  });

  /**
   * What `view_file` draws on a map (ADR 0053): the grid the map has now (or detection's suggestion,
   * before the AI saves the map), the walls as they would publish, and the numbered openings.
   */
  async function overlayFor(build: BuildRecord, file: BuildFileRecord, region: OverlayRegion | null) {
    const mapItem = (await store.listBuildItems(build.id)).find((i) => i.kind === "map" && (i.data as unknown as DraftMapState).fileId === file.id);
    const data = mapItem?.data as unknown as DraftMapState | undefined;
    const read = data ? readMap(build, data, file) : null;
    const suggestion = file.detectionStatus === "suggested" ? file.detectionResult : null;
    const grid = read ? read.grid ?? read.proposedGrid : file.grid ?? suggestion;
    const setup = data?.setup;
    const built = draftMapBoard(file.board, setup, grid, file);
    const layout = mapOverlay({
      width: file.width, height: file.height, grid, region, maxEdge: PREVIEW_EDGE,
      walls: built.ok ? built.board.walls : file.board?.walls ?? [],
      openings: listOpenings(file.board, setup, grid),
      marks: grid ? setup?.marks ?? [] : [],
      // Only terrain that fits this grid: stale terrain would be drawn in the wrong squares (ADR 0071).
      terrain: grid && draftTerrainState(setup, grid) === "ready" ? setup?.terrain ?? [] : [],
    });
    return { layout, gridShown: grid !== null };
  }

  // ---------- Shared by both families ----------

  /** Why an encounter can't be saved, naming what's wrong: an unknown map or creature, or a square off the map. */
  async function encounterProblem(build: BuildRecord, input: DraftEncounterState): Promise<string | null> {
    const items = await store.listBuildItems(build.id);
    const mapItem = items.find((i) => i.kind === "map" && i.key === input.mapKey);
    if (!mapItem) return `mapKey: this build has no map "${input.mapKey}".`;
    const creatures = new Map(items.filter((i) => i.kind === "creature").map((i) => [i.key, i.data as unknown as DraftCreatureState]));
    const map = mapItem.data as unknown as DraftMapState;
    const grid = map.grid ?? map.proposedGrid;
    const file = await store.findBuildFile(build.id, map.fileId);
    for (const token of input.tokens) {
      const creature = creatures.get(token.creatureKey);
      if (!creature) return `tokens: this build has no creature "${token.creatureKey}".`;
      if (token.square && grid && file && !footprintCenter(token.square, creature.size, grid, file)) {
        return `tokens: ${token.name ?? creature.name} is off the map at column ${token.square.column}, row ${token.square.row}.`;
      }
    }
    return null;
  }

  /** False when the build wasn't open, with the response already sent. */
  async function refuseClosed(res: Response, write: () => Promise<unknown>) {
    try {
      await write();
      return true;
    } catch (err) {
      if (!(err instanceof BuildClosedError)) throw err;
      res.status(409).json({ error: err.message });
      return false;
    }
  }

  async function saveItem(res: Response, item: Parameters<RoomStore["saveBuildItem"]>[0], max: number, build?: BuildRecord, guard?: BuildWriteGuard) {
    try {
      const saved = await store.saveBuildItem(item, max, guard);
      const files = build && saved.kind === "map" ? new Map((await store.listBuildFiles(build.id)).map((f) => [f.id, f])) : null;
      res.json({ item: itemView(saved, build && files ? { build, files } : undefined) });
    } catch (err) {
      if (err instanceof BuildItemChangedError) return void res.status(409).json({ error: AI_READ_OLD_VERSION });
      if (!(err instanceof BuildItemLockedError || err instanceof BuildLimitError || err instanceof BuildClosedError)) throw err;
      res.status(409).json({ error: err.message });
    }
  }

  /**
   * One upload, by either route. The account's shared budget and the build's limits come first,
   * so a full build can't make the server read a large body. What the file really is comes from
   * its own bytes. Anything refused leaves nothing behind.
   */
  async function acceptFile(req: Request, res: Response, build: BuildRecord, stillAllowed: () => Promise<boolean>, view: (file: BuildFileRecord) => object) {
    const kind = UploadKind.safeParse(req.query.kind);
    if (!kind.success) return void res.status(400).json({ error: 'Add ?kind=map, ?kind=token or ?kind=uvtt to say what this file is.' });
    if (build.status !== "open") return void res.status(409).json({ error: "This build is closed." });
    // Counted only once a file is stored, so a pass, which a build's file limit caps, can't use up
    // the budget the owner's own library and room uploads share by sending refused requests.
    const budget = `upload:${build.ownerGmId}`;
    if (refused(res, limits.uploadsPerOwner.check(budget), "Too many uploads. Try again later.")) return;
    const usage = await store.buildFileUsage(build.id);
    if (usage.files >= FILE_LIMITS.files) return void res.status(409).json({ error: `A build can hold up to ${FILE_LIMITS.files} files. Remove some, or start another build.` });
    if (kind.data !== "token" && usage.maps >= FILE_LIMITS.maps) return void res.status(409).json({ error: `A build can hold up to ${FILE_LIMITS.maps} maps.` });

    const base = {
      id: randomUUID(), buildId: build.id, sourceHash: null, detectionSourceHash: null, detectionVersion: null, detectionError: null, detectionStatus: null,
      detectionAttempt: 0, detectionResult: null, detectionUpdatedAt: null, publishedAssetId: null, createdAt: new Date(now()).toISOString(),
    };
    const store_ = async (file: BuildFileRecord, diagnostics?: unknown) => {
      try {
        await store.addBuildFile(file, FILE_LIMITS);
      } catch (err) {
        await assets.delete(file.objectKey).catch(() => {});
        if (err instanceof BuildLimitError || err instanceof BuildClosedError) return void res.status(409).json({ error: err.message });
        throw err;
      }
      limits.uploadsPerOwner.hit(budget);
      if (file.detectionStatus === "queued") await enqueueDetection(store, detection, { scope: "build", fileId: file.id }, 1);
      res.status(201).json({ file: view(file), ...(diagnostics ? { diagnostics } : {}) });
    };

    if (kind.data === "uvtt") {
      let received: Awaited<ReturnType<typeof receiveUvtt>>;
      try {
        received = await receiveUvtt(req, res, pool, DEFAULT_GRID);
      } catch (err) {
        if (err instanceof multer.MulterError) return void res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: "Use one UVTT file, at most 40 MiB." });
        if (err instanceof UvttError) {
          const code = err.issues[0]?.code;
          const status = code === "unsupported_file" ? 415 : code === "validation_busy" ? 503 : 422;
          return void res.status(status).json({ error: status === 415 ? WRONG_FILE_TYPE : err.message, issues: err.issues });
        }
        throw err;
      }
      if (!await stillAllowed()) return void res.status(401).json({ error: NOT_A_PASS });
      const { validated, filename } = received;
      const image = await writeUvttImage(assets, uploadDir, validated);
      return store_({
        ...base, kind: "map", objectKey: image.key, url: image.url, originalName: shownName(filename), width: validated.width, height: validated.height,
        sizeBytes: validated.image.length, grid: validated.grid, board: { walls: validated.walls, fog: [] },
      }, validated.diagnostics);
    }

    const upload = await receiveImage(req, res);
    if (!upload.ok) return void res.status(upload.status).json({ error: upload.status === 415 ? WRONG_FILE_TYPE : upload.error });
    const { image } = upload;
    if (!await stillAllowed()) {
      await unlink(image.path).catch(() => {});
      return void res.status(401).json({ error: NOT_A_PASS });
    }
    const fileKind: BuildFileKind = kind.data;
    const analysis = fileKind === "map" ? await inspectMapUpload(image.path, { width: image.width, height: image.height }) : null;
    const url = await assets.put(image.path, image.key, image.contentType);
    return store_({
      ...base, kind: fileKind, objectKey: image.key, url, originalName: shownName(image.originalName), width: image.width, height: image.height,
      sizeBytes: image.bytes, grid: null, board: null,
      ...(analysis && {
        sourceHash: analysis.sourceHash, detectionSourceHash: analysis.detectionSourceHash, detectionVersion: analysis.detectionVersion,
        detectionError: analysis.detectionError, detectionStatus: analysis.detectionStatus, detectionAttempt: analysis.detectionAttempt,
      }),
    });
  }

  return { sweepAbandoned };
}
