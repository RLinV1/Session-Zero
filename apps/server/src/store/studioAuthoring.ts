import { randomUUID } from "node:crypto";
import type { StudioCorrectionInput, StudioOwnerIds, StudioOwnerVersion, StudioProposalInput, StudioRestoreInput, StudioSelection } from "@vtt/shared";
import { applyCorrection, captureScene, deriveScope, digest, selectionObjects, StudioAuthoringError, type RevisionScene, type StudioTarget } from "../domain/studioSceneRevision";
import type { BuildItemRecord, BuildPublishPlan } from "./buildStore";
import type { StudioBuildAccess, StudioPreparationRecords } from "./studioPreparation";

export const AUTHORING_LIMITS = { revisions: 32, requests: 64, workspaceBytes: 32 * 1024 ** 2, buildBytes: 64 * 1024 ** 2 } as const;

export interface AuthoringWorkspace extends StudioTarget {
  referenceId: string;
  workingId: string;
  materializedId: string;
  creatureKeys: string[];
  fileIds: string[];
  revisions: number;
  requests: number;
  bytes: number;
}
export interface StudioRevision {
  id: string; parentId: string | null; restoredFrom?: string; requestId?: string;
  actor: "owner" | "studio"; at: string; scene: RevisionScene;
}
interface CorrectionRequest {
  baseRevisionId: string; instruction: string; scope: StudioSelection;
}
interface Receipt { hash: string; response: Record<string, unknown> }

export type AuthoringEntry = { mapKey: string; id: string } & (
  { kind: "revision"; value: StudioRevision } | { kind: "request"; value: CorrectionRequest } |
  { kind: "create" | "propose" | "restore"; value: Receipt }
);

export type AuthoringCommand =
  | { kind: "inspect"; mapKey: string; encounterKey?: string | null }
  | { kind: "create"; mapKey: string; input: StudioCorrectionInput }
  | { kind: "request"; requestId: string }
  | { kind: "propose"; requestId: string; input: StudioProposalInput }
  | { kind: "history"; mapKey: string }
  | { kind: "revision"; mapKey: string; revisionId: string }
  | { kind: "restore"; mapKey: string; input: StudioRestoreInput };

export interface StudioAuthoringStore {
  studioOwnerVersions(records: StudioPreparationRecords): Promise<Map<string, StudioOwnerVersion>>;
  studioAuthoring(buildId: string, access: StudioBuildAccess, command: AuthoringCommand): Promise<Record<string, unknown>>;
}
export interface AuthoringWrite {
  workspace: AuthoringWorkspace;
  entries: AuthoringEntry[];
}

export function authoringEntryIds(command: AuthoringCommand, workspace?: AuthoringWorkspace, request?: AuthoringEntry) {
  const ids: string[] = [];
  if (workspace && (command.kind === "inspect" || command.kind === "create" || command.kind === "restore" || command.kind === "propose")) {
    ids.push(workspace.workingId, workspace.materializedId);
  }
  if (command.kind === "revision") ids.push(command.revisionId);
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
export function guardStudioPublish(workspaces: readonly AuthoringWorkspace[], plan: BuildPublishPlan) {
  if (plan.reviewed.some((item) => affectedWorkspaces(workspaces, item).length) ||
      plan.assets.some(({ fileId }) => workspaces.some((w) => w.fileIds.includes(fileId)))) {
    throw new StudioAuthoringError("enrolled", "Review the exact Studio candidate before publishing this scene.");
  }
}

function withRevisions(workspaces: readonly AuthoringWorkspace[], workspace: AuthoringWorkspace, entries: AuthoringEntry[]): AuthoringWrite {
  const revisions = entries.filter((row) => row.kind === "revision");
  const bytes = entries.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row.value)), 0);
  const count = workspace.revisions + revisions.length;
  const requests = workspace.requests + entries.filter((row) => row.kind === "request").length;
  if (count > AUTHORING_LIMITS.revisions || requests > AUTHORING_LIMITS.requests ||
      workspace.bytes + bytes > AUTHORING_LIMITS.workspaceBytes ||
      workspaces.reduce((sum, w) => sum + w.bytes, 0) + bytes > AUTHORING_LIMITS.buildBytes) {
    throw new StudioAuthoringError("limit", "This Studio history is full. Review the saved work or discard the build.");
  }
  const creatureKeys = new Set(workspace.creatureKeys);
  const fileIds = new Set(workspace.fileIds);
  for (const { value: { scene } } of revisions) {
    fileIds.add(scene.source.id);
    for (const creature of scene.creatures) {
      creatureKeys.add(creature.key);
      if (creature.art) fileIds.add(creature.art.id);
    }
  }
  return { workspace: { ...workspace, revisions: count, requests, bytes: workspace.bytes + bytes, creatureKeys: [...creatureKeys], fileIds: [...fileIds] }, entries };
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

/** The owner saves materialized values and the new revision in the same build write. */
export function ownerAuthoringWrites(records: StudioPreparationRecords, workspaces: readonly AuthoringWorkspace[], entries: readonly AuthoringEntry[], item: BuildItemRecord, token?: string, ids?: StudioOwnerIds) {
  const before = records.items.find((old) => old.kind === item.kind && old.key === item.key);
  const affected = affectedWorkspaces(workspaces, item);
  if (!affected.length) return [];
  const bindings = new Map(affected.map((workspace) => [workspace.mapKey, currentBinding(records, workspace)]));
  if (!token || !before || ownerAuthoringVersion(affected, entries, before, bindings)?.token !== token) {
    conflict("This Studio draft changed. Reload the builder before saving your edit.");
  }
  const staged = [...workspaces];
  const updated = { ...records, items: records.items.map((old) => old === before ? item : old) };
  return affected.map((workspace) => {
    const prior = getRevision(entries, workspace.materializedId, workspace.mapKey).scene;
    const scene = captureScene(updated, workspace, prior, ids);
    const next = revision(scene, workspace.workingId, "owner");
    const write = withRevisions(staged, { ...workspace, workingId: next.id, materializedId: next.id }, [revisionEntry(workspace.mapKey, next)]);
    staged[staged.indexOf(workspace)] = write.workspace;
    return write;
  });
}

export function projectWorkingRevision(records: StudioPreparationRecords, workspace: AuthoringWorkspace, entries: readonly AuthoringEntry[]) {
  const head = getRevision(entries, workspace.workingId, workspace.mapKey);
  if (records.build.studioContext?.sourceFileId !== head.scene.source.id) return records;
  const target = { mapKey: workspace.mapKey, encounterKey: workspace.encounterKey };
  return { ...records, working: { target, revision: head, drifted: currentBinding(records, target) !== head.scene.binding } };
}

export function runAuthoring(records: StudioPreparationRecords, workspaces: readonly AuthoringWorkspace[], entries: readonly AuthoringEntry[], command: AuthoringCommand): { response: Record<string, unknown>; write?: AuthoringWrite; touch?: boolean } {
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

  // Replay after access and proposal choices were checked by the store and this command.
  if (command.kind === "propose") {
    const walls = command.input.operations.some(({ op }) => op.startsWith("line.") || op.startsWith("opening.") || op.startsWith("mark."));
    const terrain = command.input.operations.some(({ op }) => op === "terrain.paint");
    if ((walls && !records.build.aiWalls) || (terrain && !records.build.aiTerrain)) {
      throw new StudioAuthoringError("permission", "The owner disabled an authoring choice required for this correction.");
    }
  }
  const hash = "input" in command ? digest(command) : null;
  if ("input" in command) {
    const receipt = entries.find((r) => r.kind === command.kind && r.id === command.input.operationId);
    if (receipt && (receipt.kind === "create" || receipt.kind === "propose" || receipt.kind === "restore")) {
      if (receipt.value.hash !== hash) conflict("This retry key was already used for a different operation.");
      return { response: receipt.value.response };
    }
  }
  const recorded = (updated: AuthoringWorkspace, additions: AuthoringEntry[], response: Record<string, unknown>, touch: boolean) => {
    if (!("input" in command) || !hash) throw new Error("Authoring receipt requires a write.");
    additions.push({ mapKey, kind: command.kind, id: command.input.operationId, value: { hash, response } });
    return { response, write: withRevisions(workspaces, updated, additions), touch };
  };
  switch (command.kind) {
    case "inspect": {
      const materialized = live();
      const head = workspace ? current() : null;
      return { response: { target, inspectedVersion: head?.id ?? materialized.materializedVersion, materializedVersion: materialized.materializedVersion,
        workingRevisionId: head?.id ?? null, drifted: head ? head.scene.binding !== materialized.binding : false,
        objects: selectionObjects(head?.scene ?? materialized) } };
    }
    case "create": {
      const materialized = live();
      const base = workspace ? current() : revision(materialized, null, "owner");
      if (command.input.inspectedVersion !== (workspace ? base.id : materialized.materializedVersion) || base.scene.binding !== materialized.binding) {
        conflict("The saved scene changed. Review the current draft before requesting a correction.");
      }
      const scope = deriveScope(base.scene, command.input.selection);
      const requestId = randomUUID();
      const additions: AuthoringEntry[] = [{ id: requestId, mapKey, kind: "request", value: { baseRevisionId: base.id, instruction: command.input.instruction, scope } }];
      if (!workspace) additions.push(revisionEntry(mapKey, base));
      return recorded(workspace ?? { ...target, referenceId: base.id, workingId: base.id, materializedId: base.id, creatureKeys: [], fileIds: [], revisions: 0, requests: 0, bytes: 0 }, additions,
        { requestId, baseRevisionId: base.id, scope }, true);
    }
    case "request": {
      if (request?.kind !== "request" || !workspace) missing();
      const base = getRevision(entries, request.value.baseRevisionId, mapKey);
      return { response: { requestId: request.id, target, currentRevisionId: workspace.workingId, ...request.value, scene: base.scene } };
    }
    case "propose": {
      if (request?.kind !== "request" || !workspace) missing();
      if (command.input.baseRevisionId !== request.value.baseRevisionId) conflict("Read the exact revision named by this request before submitting.");
      const base = getRevision(entries, request.value.baseRevisionId, mapKey);
      const candidate = applyCorrection(base.scene, request.value.scope, command.input.operations);
      const applicable = workspace.workingId === base.id && currentBinding(records, target) === base.scene.binding;
      const next = { ...revision(candidate, base.id, "studio"), requestId: request.id };
      const workingId = applicable ? next.id : workspace.workingId;
      return recorded({ ...workspace, workingId }, [revisionEntry(mapKey, next)],
        { status: applicable ? "advanced" : "stale", requestId: request.id, revisionId: next.id, currentRevisionId: workingId }, applicable);
    }
    case "revision":
      return { response: { target, revision: getRevision(entries, command.revisionId, mapKey) } };
    case "history":
      if (!workspace) missing();
      return { response: { target, referenceRevisionId: workspace.referenceId, workingRevisionId: workspace.workingId,
        revisions: entries.flatMap((r) => {
          if (r.kind !== "revision" || r.mapKey !== mapKey) return [];
          const { id, actor, at, parentId, restoredFrom, requestId } = r.value;
          return [{ id, actor, at, parentId, restoredFrom, requestId }];
        }).sort((a, b) => b.at.localeCompare(a.at)) } };
    case "restore": {
      if (!workspace) missing();
      if (workspace.workingId !== command.input.expectedCurrentRevisionId) conflict("The working revision changed. Inspect it before restoring.");
      const prior = getRevision(entries, command.input.revisionId, mapKey);
      if (prior.scene.binding !== live().binding) conflict("That revision uses different source, grid or dependencies. Review the current draft.");
      const next = { ...revision(prior.scene, workspace.workingId, "owner"), restoredFrom: prior.id };
      return recorded({ ...workspace, workingId: next.id }, [revisionEntry(mapKey, next)], { revisionId: next.id, currentRevisionId: next.id }, true);
    }
  }
}
