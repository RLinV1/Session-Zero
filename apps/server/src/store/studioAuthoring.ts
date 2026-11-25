import { randomUUID } from "node:crypto";
import { StudioChatSelectionDraft, studioTerrainCoverage, type StudioChatSelectionUpdate, type StudioCorrectionActivity, type StudioCorrectionInput, type StudioEditLayer, type StudioOwnerIds, type StudioOwnerVersion, type StudioProposalInput, type StudioRestoreInput, type StudioSelection } from "@vtt/shared";
import { applyCorrection, captureScene, deriveScope, digest, selectionObjects, StudioAuthoringError, type RevisionScene, type StudioTarget } from "../domain/studioSceneRevision";
import { studioRevisionScene } from "../domain/studioPreparation";
import type { BuildItemRecord, BuildPublishPlan, BuildRecord } from "./buildStore";
import type { StudioBuildAccess, StudioPreparationRecords } from "./studioPreparation";
import type { StudioGrantRecord } from "./studioStore";

export const AUTHORING_LIMITS = {
  revisions: 32, requests: 64, workspaceBytes: 32 * 1024 ** 2, buildBytes: 64 * 1024 ** 2,
  /** An owner write that reaches a limit prunes to this many revisions, so the next saves don't rescan history. */
  prunedRevisions: 24,
} as const;

export interface AuthoringWorkspace extends StudioTarget {
  referenceId: string;
  workingId: string;
  materializedId: string;
  /** What the working and materialized revisions depend on now, recomputed on each write (not all history). */
  creatureKeys: string[];
  fileIds: string[];
  revisions: number;
  requests: number;
  bytes: number;
  historyVersion?: string;
}
export interface StudioRevision {
  id: string; parentId: string | null; restoredFrom?: string; requestId?: string;
  actor: "owner" | "studio"; at: string; scene: RevisionScene;
}
interface CorrectionRequest {
  baseRevisionId: string; instruction: string; scope: StudioSelection;
  /** When it was saved, so pruning removes the oldest first. Absent on requests saved before pruning existed. */
  at?: string;
}
interface Receipt { hash: string; response: Record<string, unknown> }

export type AuthoringEntry = { mapKey: string; id: string } & (
  { kind: "revision"; value: StudioRevision } | { kind: "request"; value: CorrectionRequest; activity?: StudioCorrectionActivity } |
  { kind: "create" | "propose" | "restore"; value: Receipt }
);

type SceneCommand =
  | { kind: "inspect"; mapKey: string; encounterKey?: string | null }
  | { kind: "create"; mapKey: string; input: StudioCorrectionInput; chatSelectionId?: string }
  | { kind: "request"; requestId: string }
  | { kind: "crop"; requestId: string }
  | { kind: "propose"; requestId: string; input: StudioProposalInput }
  | { kind: "history"; mapKey: string }
  | { kind: "revision"; mapKey: string; revisionId: string }
  | { kind: "revisionView"; mapKey: string; revisionId: string }
  | { kind: "restore"; mapKey: string; input: StudioRestoreInput }
  /** The owner ends the correction: the map leaves Studio and its history is removed. */
  | { kind: "end"; mapKey: string };

export type AuthoringCommand = SceneCommand
  | { kind: "stageChatSelection"; update: StudioChatSelectionUpdate }
  | { kind: "startChatCorrection"; selectionId: string; instruction: string };

export const CHAT_SELECTION_LIMITS = { viewsPerBuild: 24, ttlMs: 30 * 60_000 } as const;

export function assertChatSelectionCapacity(activeViews: number) {
  if (activeViews >= CHAT_SELECTION_LIMITS.viewsPerBuild) {
    throw new StudioAuthoringError("limit", "Too many selections on this build. Try again after an older selection expires.");
  }
}

export interface ChatSelectionRecord {
  id: string;
  buildId: string;
  grantId: string;
  viewId: string;
  sequence: number;
  draft: unknown;
  expiresAt: Date;
}

export function nextChatSelection(previous: ChatSelectionRecord | null, buildId: string, grantId: string, update: StudioChatSelectionUpdate, now: number) {
  if (previous && previous.sequence >= update.sequence) {
    if (previous.sequence === update.sequence && previous.expiresAt.getTime() > now && digest(previous.draft) === digest(update.draft)) return previous;
    conflict("The selection changed. Draw the area again before asking in chat.");
  }
  return { id: randomUUID(), buildId, grantId, ...update, expiresAt: new Date(now + CHAT_SELECTION_LIMITS.ttlMs) };
}

export function startChatCorrection(record: ChatSelectionRecord | undefined | null, buildId: string, grantId: string,
  instruction: string, now: number): SceneCommand {
  if (!record || record.buildId !== buildId || record.grantId !== grantId || !record.draft || record.expiresAt.getTime() <= now) {
    conflict("That selection is unavailable. Select the area again in Studio before asking in chat.");
  }
  const { mapKey, ...scope } = StudioChatSelectionDraft.parse(record.draft);
  return { kind: "create", mapKey, chatSelectionId: record.id, input: { ...scope, operationId: record.id, instruction } };
}

export interface StudioAuthoringStore {
  studioOwnerVersions(records: StudioPreparationRecords): Promise<Map<string, StudioOwnerVersion>>;
  studioAuthoring(buildId: string, access: StudioBuildAccess, command: AuthoringCommand): Promise<Record<string, unknown>>;
}
export interface AuthoringWrite {
  workspace: AuthoringWorkspace;
  entries: AuthoringEntry[];
  /** Older entries of this workspace that an owner write pruned to stay within the limits. */
  removed: { kind: AuthoringEntry["kind"]; id: string }[];
}

export function assertStudioAuthoringAccess(access: StudioBuildAccess, command: AuthoringCommand, grant?: StudioGrantRecord) {
  const delegatedOnly = command.kind === "propose" || command.kind === "stageChatSelection" || command.kind === "startChatCorrection";
  if (access.passHash !== undefined || (delegatedOnly && !grant) || (command.kind === "end" && grant)) {
    throw new StudioAuthoringError("access", "Use the authorized Studio connection or the owner's website session.");
  }
}

function checkCorrectionLayers(build: BuildRecord, layers: readonly StudioEditLayer[]) {
  if ((!build.aiWalls && layers.includes("geometry")) || (!build.aiTerrain && layers.includes("terrain"))) {
    throw new StudioAuthoringError("permission", "The owner disabled an authoring choice required for this correction.");
  }
}

function checkRestoreChoices(build: BuildRecord, from: RevisionScene, to: RevisionScene) {
  const geometry = ({ map }: RevisionScene) => [map.setup?.lines ?? [], map.setup?.openings ?? [], map.setup?.marks ?? []];
  const terrain = ({ map }: RevisionScene) => [map.setup?.terrain ?? [], map.setup?.terrainGrid ?? null];
  if ((!build.aiGrid && digest([from.grid, from.map.gridStatus]) !== digest([to.grid, to.map.gridStatus])) ||
      (!build.aiWalls && digest(geometry(from)) !== digest(geometry(to))) ||
      (!build.aiTerrain && digest(terrain(from)) !== digest(terrain(to)))) {
    throw new StudioAuthoringError("permission", "The owner disabled an authoring choice required for this restore.");
  }
}

interface AuthoringResult {
  response: Record<string, unknown>;
  write?: AuthoringWrite;
  touch?: boolean;
  end?: string;
  error?: StudioAuthoringError;
  activity?: { requestId: string; mapKey: string; value: StudioCorrectionActivity; historyVersion: string };
}

/**
 * An owner write reached a limit, but the store loaded only the entries it reads. The store reloads
 * the workspace's whole history in the same transaction and runs the write again.
 */
export class AuthoringHistoryNeeded extends Error {
  constructor() { super("authoring_history_needed"); }
}

/** How an owner write may make room: the entries it can see, and the revisions it must keep. */
interface OwnerPrune { entries: readonly AuthoringEntry[]; complete: boolean; pinned: readonly string[] }

export function authoringEntryIds(command: SceneCommand, workspace?: AuthoringWorkspace, request?: AuthoringEntry) {
  const ids: string[] = [];
  if (workspace && (command.kind === "inspect" || command.kind === "create" || command.kind === "restore" || command.kind === "propose")) {
    ids.push(workspace.workingId, workspace.materializedId);
  }
  if (command.kind === "revision" || command.kind === "revisionView") ids.push(command.revisionId);
  if ("input" in command) ids.push(command.input.operationId);
  if (command.kind === "restore") ids.push(command.input.revisionId);
  if (request?.kind === "request") ids.push(request.value.baseRevisionId);
  return ids;
}

function missing(): never {
  throw new StudioAuthoringError("missing", "This Studio target or revision is unavailable.");
}
function conflict(message: string): never {
  throw new StudioAuthoringError("conflict", message);
}
export function rejectEnrolled(): never {
  throw new StudioAuthoringError("enrolled", "This draft is enrolled in Studio. Use a saved correction request or the signed-in builder to edit it.");
}

export function affectedWorkspaces(workspaces: readonly AuthoringWorkspace[], item: Pick<BuildItemRecord, "kind" | "key">) {
  return workspaces.filter((w) => item.kind === "map" ? w.mapKey === item.key
    : item.kind === "encounter" ? w.encounterKey === item.key : w.creatureKeys.includes(item.key));
}
/**
 * The workspaces an owner's delete ends. Deleting an enrolled map or encounter ends its correction;
 * deleting a creature it uses leaves the scene drifted until the owner fixes the encounter.
 */
export function ownerRemovalEnds(workspaces: readonly AuthoringWorkspace[], item: Pick<BuildItemRecord, "kind" | "key">) {
  return item.kind === "creature" ? [] : affectedWorkspaces(workspaces, item).map((w) => w.mapKey);
}
export function guardStudioPublish(workspaces: readonly AuthoringWorkspace[], plan: BuildPublishPlan) {
  if (plan.reviewed.some((item) => affectedWorkspaces(workspaces, item).length) ||
      plan.assets.some(({ fileId }) => workspaces.some((w) => w.fileIds.includes(fileId)))) {
    throw new StudioAuthoringError("enrolled", "Review the exact Studio candidate before publishing this scene.");
  }
}

/** The creatures and files the given current revisions use: what enrollment guards and publication refuses. */
function dependencies(...scenes: RevisionScene[]): Pick<AuthoringWorkspace, "creatureKeys" | "fileIds"> {
  const creatureKeys = new Set<string>();
  const fileIds = new Set<string>();
  for (const scene of scenes) {
    fileIds.add(scene.source.id);
    for (const creature of scene.creatures) {
      creatureKeys.add(creature.key);
      if (creature.art) fileIds.add(creature.art.id);
    }
  }
  return { creatureKeys: [...creatureKeys].sort(), fileIds: [...fileIds].sort() };
}

const entryBytes = (row: AuthoringEntry) => Buffer.byteLength(JSON.stringify(row.value));
function totals(rows: readonly AuthoringEntry[]) {
  return {
    revisions: rows.filter((row) => row.kind === "revision").length,
    requests: rows.filter((row) => row.kind === "request").length,
    bytes: rows.reduce((sum, row) => sum + entryBytes(row), 0),
  };
}
function withinLimits(workspaces: readonly AuthoringWorkspace[], mapKey: string, size: ReturnType<typeof totals>, revisions: number = AUTHORING_LIMITS.revisions) {
  const others = workspaces.reduce((sum, w) => w.mapKey === mapKey ? sum : sum + w.bytes, 0);
  return size.revisions <= revisions && size.requests <= AUTHORING_LIMITS.requests &&
    size.bytes <= AUTHORING_LIMITS.workspaceBytes && others + size.bytes <= AUTHORING_LIMITS.buildBytes;
}
function historyFull(): never {
  throw new StudioAuthoringError("limit", "This Studio history is full. Review the saved work or discard the build.");
}

/**
 * Adds records to a workspace within the history limits. A Studio write that would pass a limit is
 * refused, so a connection can't push out the owner's history. An owner write is never refused for
 * history: it prunes the oldest revisions no pointer uses, with the requests based on them and the
 * receipts of what it removed (design D14).
 */
function withRevisions(workspaces: readonly AuthoringWorkspace[], workspace: AuthoringWorkspace, additions: AuthoringEntry[], owner?: OwnerPrune): AuthoringWrite {
  const added = totals(additions);
  const next = { ...workspace, historyVersion: randomUUID(), revisions: workspace.revisions + added.revisions, requests: workspace.requests + added.requests, bytes: workspace.bytes + added.bytes };
  if (withinLimits(workspaces, workspace.mapKey, next)) return { workspace: next, entries: additions, removed: [] };
  if (!owner) historyFull();
  if (!owner.complete) throw new AuthoringHistoryNeeded();
  const keep = new Set(owner.pinned);
  const rows = owner.entries.filter((row) => row.mapKey === workspace.mapKey);
  const gone = new Set<AuthoringEntry>();
  const drop = (row: AuthoringEntry) => {
    gone.add(row);
    for (const other of rows) {
      if (gone.has(other)) continue;
      const orphan = other.kind === "request" ? other.value.baseRevisionId === row.id
        : other.kind === "revision" ? false
          : other.value.response.revisionId === row.id || other.value.response.requestId === row.id;
      if (orphan) drop(other);
    }
  };
  const at = (row: AuthoringEntry) => row.kind === "revision" ? row.value.at : row.kind === "request" ? row.value.at ?? "" : "";
  const oldest = (kind: "revision" | "request") => rows.filter((row) => row.kind === kind && !gone.has(row) && !keep.has(row.id))
    .sort((a, b) => at(a).localeCompare(at(b)))[0];
  for (;;) {
    // Recounted from the rows themselves, so the stored totals can't drift.
    const size = totals([...rows.filter((row) => !gone.has(row)), ...additions]);
    if (withinLimits(workspaces, workspace.mapKey, size, AUTHORING_LIMITS.prunedRevisions)) {
      return { workspace: { ...next, ...size }, entries: additions, removed: [...gone].map(({ kind, id }) => ({ kind, id })) };
    }
    const victim = (size.requests > AUTHORING_LIMITS.requests ? oldest("request") : undefined) ?? oldest("revision") ?? oldest("request");
    if (!victim) historyFull();
    drop(victim);
  }
}
function revision(scene: RevisionScene, parentId: string | null, actor: StudioRevision["actor"]): StudioRevision {
  return { id: randomUUID(), parentId, actor, at: new Date().toISOString(), scene };
}
const revisionEntry = (mapKey: string, value: StudioRevision): AuthoringEntry => ({ mapKey, kind: "revision", id: value.id, value });
function getRevision(entries: readonly AuthoringEntry[], id: string, mapKey: string) {
  const row = entries.find((r) => r.kind === "revision" && r.id === id && r.mapKey === mapKey);
  if (row?.kind !== "revision") missing();
  return row.value;
}

function currentBinding(records: StudioPreparationRecords, target: StudioTarget) {
  try { return captureScene(records, target).binding; }
  catch (error) {
    if (error instanceof StudioAuthoringError) return null;
    throw error;
  }
}

function ownerAuthoringVersion(affected: readonly AuthoringWorkspace[], entries: readonly AuthoringEntry[], item: BuildItemRecord,
  bindings: ReadonlyMap<string, string | null>): StudioOwnerVersion | undefined {
  if (!affected.length) return undefined;
  const token = digest({ heads: affected.map((w) => [w.mapKey, w.workingId, bindings.get(w.mapKey)]).sort(), version: item.updatedAt, data: item.data });
  if (item.kind === "creature") return { token };
  const workspace = affected[0]!;
  const scene = getRevision(entries, workspace.materializedId, workspace.mapKey).scene;
  return { token, ids: item.kind === "map" ? { lines: scene.ids.lines, marks: scene.ids.marks } : { placements: scene.ids.placements } };
}

export function readOwnerAuthoringVersions(records: StudioPreparationRecords, workspaces: readonly AuthoringWorkspace[], entries: readonly AuthoringEntry[]) {
  const bindings = new Map(workspaces.map((workspace) => [workspace.mapKey, currentBinding(records, workspace)]));
  return new Map(records.items.flatMap((item) => {
    const authoring = ownerAuthoringVersion(affectedWorkspaces(workspaces, item), entries, item, bindings);
    return authoring ? [[`${item.kind}/${item.key}`, authoring] as const] : [];
  }));
}

/**
 * The owner saves materialized values and the new revision in the same build write. Enrollment never
 * refuses the owner's own edit: a full history is pruned, and a scene that can no longer be captured
 * (a deleted creature, an unusable grid) keeps its working revision and shows as drifted until a
 * later owner save captures it again. `complete` says `entries` holds the affected workspaces' history.
 */
export function ownerAuthoringWrites(records: StudioPreparationRecords, workspaces: readonly AuthoringWorkspace[], entries: readonly AuthoringEntry[], item: BuildItemRecord, token?: string, ids?: StudioOwnerIds, complete = false) {
  const before = records.items.find((old) => old.kind === item.kind && old.key === item.key);
  const affected = affectedWorkspaces(workspaces, item);
  if (!affected.length) return [];
  const bindings = new Map(affected.map((workspace) => [workspace.mapKey, currentBinding(records, workspace)]));
  if (!token || !before || ownerAuthoringVersion(affected, entries, before, bindings)?.token !== token) {
    conflict("This Studio draft changed. Reload the builder before saving your edit.");
  }
  const staged = [...workspaces];
  const updated = { ...records, items: records.items.map((old) => old === before ? item : old) };
  return affected.flatMap((workspace) => {
    const prior = getRevision(entries, workspace.materializedId, workspace.mapKey).scene;
    let scene: RevisionScene;
    try { scene = captureScene(updated, workspace, prior, ids); }
    catch (error) {
      // A "conflict" is an old form's row IDs, which must still refuse the save.
      if (error instanceof StudioAuthoringError && (error.code === "missing" || error.code === "invalid")) return [];
      throw error;
    }
    const next = revision(scene, workspace.workingId, "owner");
    const write = withRevisions(staged, { ...workspace, ...dependencies(scene), workingId: next.id, materializedId: next.id },
      [revisionEntry(workspace.mapKey, next)], { entries, complete, pinned: [workspace.referenceId, workspace.workingId, workspace.materializedId] });
    staged[staged.indexOf(workspace)] = write.workspace;
    return [write];
  });
}

export function projectWorkingRevision(records: StudioPreparationRecords, workspace: AuthoringWorkspace, entries: readonly AuthoringEntry[]) {
  const head = getRevision(entries, workspace.workingId, workspace.mapKey);
  if (records.build.studioContext?.sourceFileId !== head.scene.source.id) return records;
  const target = { mapKey: workspace.mapKey, encounterKey: workspace.encounterKey };
  return { ...records, working: { target, revision: head, drifted: currentBinding(records, target) !== head.scene.binding, historyVersion: workspace.historyVersion } };
}

/** `complete` says `entries` holds the command's workspace's whole history, so an owner write may prune it. */
export function runAuthoring(records: StudioPreparationRecords, workspaces: readonly AuthoringWorkspace[], entries: readonly AuthoringEntry[], command: SceneCommand, complete = false, delegated = false): AuthoringResult {
  const request = "requestId" in command ? entries.find((r) => r.kind === "request" && r.id === command.requestId) : undefined;
  const mapKey = "mapKey" in command ? command.mapKey : request?.mapKey;
  if (mapKey === undefined) missing();
  const workspace = workspaces.find((w) => w.mapKey === mapKey);
  const target = { mapKey, encounterKey: workspace ? workspace.encounterKey : command.kind === "create" ? command.input.encounterKey : command.kind === "inspect" ? command.encounterKey ?? null : null };
  if ((command.kind === "create" && command.input.encounterKey !== target.encounterKey) ||
      (command.kind === "inspect" && command.encounterKey !== undefined && command.encounterKey !== target.encounterKey)) {
    conflict("This map is already enrolled with a different encounter.");
  }
  const live = () => captureScene(records, target);
  const current = () => workspace ? getRevision(entries, workspace.workingId, mapKey) : missing();

  const updateActivity = (value: StudioCorrectionActivity): AuthoringResult["activity"] => request?.kind === "request" &&
    digest(request.activity) !== digest(value) ? { requestId: request.id, mapKey, value, historyVersion: randomUUID() } : undefined;
  function proposalRefused(error: unknown): AuthoringResult {
    if (!(error instanceof StudioAuthoringError)) throw error;
    const { code } = error;
    if (code !== "conflict" && code !== "invalid" && code !== "scope" && code !== "permission" && code !== "limit") throw error;
    return { response: {}, error, activity: updateActivity({ observed: request?.kind === "request" && !!request.activity?.observed, outcome: { status: "refused", code } }) };
  }

  // Permission is checked by the stores before a replay can reveal a retained outcome.
  if (command.kind === "create" && delegated) checkCorrectionLayers(records.build, command.input.selection.layers);
  const hash = "input" in command ? digest(command) : null;
  const receipt = "input" in command ? entries.find((r) => r.kind === command.kind && r.id === command.input.operationId) : undefined;
  if (command.kind === "propose") {
    const walls = command.input.operations.some(({ op }) => op.startsWith("line.") || op.startsWith("opening.") || op.startsWith("mark."));
    const terrain = command.input.operations.some(({ op }) => op === "terrain.paint");
    if ((walls && !records.build.aiWalls) || (terrain && !records.build.aiTerrain)) {
      const error = new StudioAuthoringError("permission", "The owner disabled an authoring choice required for this correction.");
      // A denied replay leaves the original proposal receipt and its reported outcome intact.
      if (receipt?.kind === "propose" && receipt.value.hash === hash) throw error;
      return proposalRefused(error);
    }
  }
  if (receipt?.kind === "create" || receipt?.kind === "propose" || receipt?.kind === "restore") {
    if (receipt.value.hash !== hash) conflict("This retry key was already used for a different operation.");
    return { response: receipt.value.response };
  }
  /** Only the owner's website session can prune history. */
  const recorded = (updated: AuthoringWorkspace, additions: AuthoringEntry[], response: Record<string, unknown>, touch: boolean, pinned?: string[]) => {
    if (!("input" in command) || !hash) throw new Error("Authoring receipt requires a write.");
    additions.push({ mapKey, kind: command.kind, id: command.input.operationId, value: { hash, response } });
    return { response, write: withRevisions(workspaces, updated, additions, pinned && { entries, complete, pinned }), touch };
  };
  const pointers = (w: AuthoringWorkspace) => [w.referenceId, w.workingId, w.materializedId];
  switch (command.kind) {
    case "inspect": {
      const materialized = live();
      const head = workspace ? current() : null;
      const scene = head?.scene ?? materialized;
      return { response: { target, inspectedVersion: head?.id ?? materialized.materializedVersion, materializedVersion: materialized.materializedVersion,
        workingRevisionId: head?.id ?? null, drifted: head ? head.scene.binding !== materialized.binding : false,
        scene: studioRevisionScene(scene), objects: selectionObjects(scene) } };
    }
    case "create": {
      const materialized = live();
      const base = workspace ? current() : revision(materialized, null, "owner");
      if (command.input.inspectedVersion !== (workspace ? base.id : materialized.materializedVersion) || base.scene.binding !== materialized.binding) {
        conflict("The saved scene changed. Review the current draft before requesting a correction.");
      }
      const scope = deriveScope(base.scene, command.input.selection);
      const requestId = command.chatSelectionId ?? randomUUID();
      const additions: AuthoringEntry[] = [{ id: requestId, mapKey, kind: "request",
        value: { baseRevisionId: base.id, instruction: command.input.instruction, scope, at: new Date().toISOString() } }];
      if (!workspace) additions.push(revisionEntry(mapKey, base));
      return recorded(workspace ?? { ...target, referenceId: base.id, workingId: base.id, materializedId: base.id, ...dependencies(base.scene), revisions: 0, requests: 0, bytes: 0 }, additions,
        { requestId, baseRevisionId: base.id, scope }, true, delegated ? undefined : workspace ? pointers(workspace) : []);
    }
    case "request": {
      if (request?.kind !== "request" || !workspace) missing();
      const base = getRevision(entries, request.value.baseRevisionId, mapKey);
      const { scope } = request.value;
      const ids = new Set(scope.objectIds);
      return { response: { requestId: request.id, target, currentRevisionId: workspace.workingId, ...request.value, scene: base.scene,
        objects: selectionObjects(base.scene).filter((object) => ids.has(object.id)),
        terrainCells: scope.layers.includes("terrain") ? studioTerrainCoverage(scope.region, base.scene.grid) : null },
        activity: delegated ? updateActivity({ ...request.activity, observed: true }) : undefined };
    }
    case "crop": {
      if (request?.kind !== "request" || !workspace) missing();
      const base = getRevision(entries, request.value.baseRevisionId, mapKey);
      return { response: { baseRevisionId: base.id, scope: request.value.scope, scene: base.scene } };
    }
    case "propose": {
      if (request?.kind !== "request" || !workspace) missing();
      try {
        if (command.input.baseRevisionId !== request.value.baseRevisionId) conflict("Read the exact revision named by this request before submitting.");
        const base = getRevision(entries, request.value.baseRevisionId, mapKey);
        const candidate = applyCorrection(base.scene, request.value.scope, command.input.operations);
        const applicable = workspace.workingId === base.id && currentBinding(records, target) === base.scene.binding;
        const next = { ...revision(candidate, base.id, "studio"), requestId: request.id };
        const workingId = applicable ? next.id : workspace.workingId;
        const moved = applicable ? dependencies(candidate, getRevision(entries, workspace.materializedId, mapKey).scene) : {};
        const status = applicable ? "advanced" : "stale";
        const result = recorded({ ...workspace, ...moved, workingId }, [revisionEntry(mapKey, next)],
          { status, requestId: request.id, revisionId: next.id, currentRevisionId: workingId }, applicable);
        return { ...result, activity: updateActivity({ observed: !!request.activity?.observed, outcome: { status, revisionId: next.id } }) };
      } catch (error) { return proposalRefused(error); }
    }
    case "revision":
      return { response: { target, revision: getRevision(entries, command.revisionId, mapKey) } };
    case "revisionView": {
      const { scene, ...header } = getRevision(entries, command.revisionId, mapKey);
      return { response: { target, revision: header, scene: studioRevisionScene(scene), objects: selectionObjects(scene) } };
    }
    case "history":
      if (!workspace) missing();
      return { response: { target, referenceRevisionId: workspace.referenceId, workingRevisionId: workspace.workingId,
        revisions: entries.flatMap((r) => {
          if (r.kind !== "revision" || r.mapKey !== mapKey) return [];
          const { id, actor, at, parentId, restoredFrom, requestId } = r.value;
          return [{ id, actor, at, parentId, restoredFrom, requestId }];
        }).sort((a, b) => b.at.localeCompare(a.at)), requests: entries.flatMap((r) => r.kind === "request" && r.mapKey === mapKey
          ? [{ ...r.value, requestId: r.id, activity: r.activity ?? { observed: false } }] : [])
          .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")) } };
    case "restore": {
      if (!workspace) missing();
      if (workspace.workingId !== command.input.expectedCurrentRevisionId) conflict("The working revision changed. Inspect it before restoring.");
      const prior = getRevision(entries, command.input.revisionId, mapKey);
      if (prior.scene.binding !== live().binding) conflict("That revision uses different source, grid or dependencies. Review the current draft.");
      if (delegated) checkRestoreChoices(records.build, current().scene, prior.scene);
      const next = { ...revision(prior.scene, workspace.workingId, delegated ? "studio" : "owner"), restoredFrom: prior.id };
      const materialized = getRevision(entries, workspace.materializedId, mapKey).scene;
      return recorded({ ...workspace, ...dependencies(prior.scene, materialized), workingId: next.id }, [revisionEntry(mapKey, next)],
        { revisionId: next.id, currentRevisionId: next.id }, true, delegated ? undefined : [...pointers(workspace), prior.id]);
    }
    case "end":
      if (!workspace) missing();
      return { response: { mapKey, ended: true }, end: mapKey, touch: true };
  }
}
