import {
  squareSizeOf, StudioPublishReview, type BuildCreatureValues, type StudioPublicationReceipt,
  type StudioPublishCommitInput, type StudioPublishReviewInput, type StudioRevisionView,
} from "@vtt/shared";
import { BuildPublishConflictError, type BuildItemRecord, type BuildFileRecord, type BuildPublishPlan, type BuildPublishResult } from "../store/buildStore";
import { publicBoard } from "../store/libraryPreparation";
import type { LibraryAssetRecord } from "../store/libraryStore";
import type { AuthoringEntry, AuthoringWorkspace, StudioRevision } from "../store/studioAuthoring";
import type { StudioPreparationRecords } from "../store/studioPreparation";
import { planPublish, type PublishDependencies, type PublishTrace } from "./buildPublish";
import { studioRevisionScene } from "./studioPreparation";
import { candidateNeedsGridConfirmation, captureScene, digest, selectionObjects, StudioAuthoringError } from "./studioSceneRevision";

export interface PublicationContext {
  records: StudioPreparationRecords;
  workspaces: AuthoringWorkspace[];
  entries: AuthoringEntry[];
}

export interface StoredPublication { inputHash: string; receipt: StudioPublicationReceipt }

export function publicationReplay(stored: StoredPublication, inputHash: string) {
  if (stored.inputHash !== inputHash) throw new BuildPublishConflictError("This operation was already used for a different publication.");
  return stored.receipt;
}

export const publicationSelection = ({ selection }: StudioPublishReviewInput) => ({
  creatures: [...new Set(selection.creatures)].sort(), maps: [...new Set(selection.maps)].sort(),
  encounters: [...new Set(selection.encounters)].sort(),
});

function revisionView(target: StudioRevisionView["target"], { scene, ...revision }: StudioRevision): StudioRevisionView {
  return { target, revision, scene: studioRevisionScene(scene), objects: selectionObjects(scene) };
}

const reviewImage = (file: BuildFileRecord) => file.studio ? file.url + "?variant=preview" : file.url;
const itemKey = ({ kind, key }: Pick<BuildItemRecord, "kind" | "key">) => `${kind}/${key}`;
const version = ({ mapKey, workingId, referenceId, materializedId }: AuthoringWorkspace) =>
  ({ mapKey, workingId, referenceId, materializedId });

function creatureValues({ name, size, hp, maxHp, ac, attacks, color, conditions }: BuildCreatureValues) {
  return { name, size, hp, maxHp, ac, attacks, color, conditions };
}

export async function resolveStudioPublication(store: PublishDependencies, context: PublicationContext,
  input: StudioPublishReviewInput, now: string) {
  const { records, entries, workspaces } = context;
  const selection = publicationSelection(input);
  const affectedMaps = new Set(selection.maps);
  for (const row of records.items) {
    if (row.kind === "encounter" && selection.encounters.includes(row.key) && typeof row.data.mapKey === "string") {
      affectedMaps.add(row.data.mapKey);
    }
  }
  const problems: StudioPublishReview["problems"] = [];
  const candidates: StudioPublishReview["candidates"] = [];
  const materializations = new Map<string, BuildItemRecord>();
  const heads: AuthoringWorkspace[] = [];
  const pinnedMaps = new Set<string>();
  const getRevision = (mapKey: string, id: string) => {
    const entry = entries.find((entry) => entry.kind === "revision" && entry.mapKey === mapKey && entry.id === id);
    if (entry?.kind !== "revision") throw new StudioAuthoringError("missing", "This Studio revision is unavailable.");
    return entry.value;
  };
  if (input.candidate && (!affectedMaps.has(input.candidate.mapKey) ||
      !workspaces.some(({ mapKey }) => mapKey === input.candidate?.mapKey))) {
    throw new StudioAuthoringError("missing", "This Studio candidate is unavailable for the selection.");
  }

  for (const workspace of workspaces.filter((w) => affectedMaps.has(w.mapKey)).sort((a, b) => a.mapKey.localeCompare(b.mapKey))) {
    const { mapKey, encounterKey, workingId } = workspace;
    const map = records.items.find((row) => row.kind === "map" && row.key === mapKey);
    if (!map || (map.publishedId && input.candidate?.mapKey !== mapKey)) continue;
    const pinned = input.candidate?.mapKey === mapKey ? input.candidate.revisionId : workingId;
    const candidate = getRevision(mapKey, pinned);
    const reference = getRevision(mapKey, workspace.referenceId);
    const target = { mapKey, encounterKey };
    const encounter = records.items.find((row) => row.kind === "encounter" && row.key === encounterKey);
    let current: StudioRevision["scene"] | undefined;
    try { current = captureScene(records, target, undefined, undefined, true); }
    catch (error) { if (!(error instanceof StudioAuthoringError)) throw error; }
    const matches = current?.binding === candidate.scene.binding;
    const gridNeedsConfirmation = candidateNeedsGridConfirmation(candidate.scene, current);
    candidates.push({ candidate: revisionView(target, candidate), reference: revisionView(target, reference), workingRevisionId: workingId,
      confirmGrid: matches && pinned === workingId && gridNeedsConfirmation,
      materializesEncounter: encounter && !encounter.publishedId && candidate.scene.encounter ? encounter.key : null });
    if (pinned !== workingId) problems.push({ item: mapKey, message: "Restore this candidate and review the new working revision before publishing." });
    else if (!matches) problems.push({ item: mapKey, message: "The source, grid or draft dependencies changed. Review the current draft." });
    else if (gridNeedsConfirmation) problems.push({ item: mapKey, message: "Confirm this candidate’s grid before publishing." });

    if (!map.publishedId) {
      materializations.set(itemKey(map), { ...map, data: { ...candidate.scene.map } });
      pinnedMaps.add(mapKey);
      heads.push({ ...workspace, materializedId: pinned, finalized: true });
    }
    if (encounter && !encounter.publishedId && candidate.scene.encounter) {
      materializations.set(itemKey(encounter), { ...encounter, data: { ...candidate.scene.encounter } });
    }
  }

  const items = records.items.map((item) => materializations.get(itemKey(item)) ?? item);
  const trace: PublishTrace = { items: [], files: new Map(), maps: new Map(), creatures: new Map() };
  const planner = await planPublish(store, records.build, {
    ...selection, reviewed: Object.fromEntries([["profile", squareSizeOf(records.build.gameProfile)], ...items.map((item) => [itemKey(item), item.updatedAt])]),
  }, now, { files: records.files, items, trace, pinnedMaps });
  if (!planner.ok) problems.push(...planner.problems);
  const plan = planner.ok ? planner.plan : null;
  if (plan && !plan.assets.length && !plan.creatures.length && !plan.maps.length && !plan.encounters.length) {
    problems.push({ item: "", message: "Choose unpublished items before publishing." });
  }

  const newAssets = new Map(plan?.assets.map(({ fileId, record }) => [record.id, records.files.find((file) => file.id === fileId)!]));
  // Invalid plans can still preview dependencies already assembled by the planner.
  for (const asset of [...trace.maps.values(), ...[...trace.creatures.values()].flatMap(({ art }) => art ? [art] : [])]) {
    if (!newAssets.has(asset.id)) {
      const fromDraft = [...trace.files.values()].find((file) => !file.publishedAssetId &&
        (asset.studioOriginal?.key ?? asset.objectKey) === file.objectKey);
      if (fromDraft) newAssets.set(asset.id, fromDraft);
    }
  }
  const artwork = (asset: LibraryAssetRecord) => {
    const file = newAssets.get(asset.id);
    return { identity: file?.id ?? asset.id, name: asset.name, width: asset.width, height: asset.height,
      previewUrl: file ? reviewImage(file) : asset.url, private: !!asset.studioOriginal && !!file, reused: !file };
  };
  const normalizeId = (id: string) => newAssets.get(id)?.id ?? id;
  // The preview uses owner-scoped source URLs. The writer alone uses freshly allocated library IDs and aliases.
  const encounters = (plan?.encounters ?? []).map(({ key, record: { data } }) => ({
    key, data: { ...data, map: { ...data.map, assetId: normalizeId(data.map.assetId) },
      tokens: data.tokens.map((token) => {
        const file = token.assetId && newAssets.get(token.assetId);
        return file ? { ...token, assetId: file.id, imageUrl: reviewImage(file) } : token;
      }) },
  }));
  const otherEncounters = items.flatMap((item) => item.kind === "encounter" && !selection.encounters.includes(item.key) &&
    typeof item.data.mapKey === "string" && affectedMaps.has(item.data.mapKey)
    ? [{ key: item.key, mapKey: item.data.mapKey, name: String(item.data.name) }] : []);
  const dependencies = trace.items.map((item) => {
    const map = item.kind === "map" ? trace.maps.get(item.key) : undefined;
    const creature = item.kind === "creature" ? trace.creatures.get(item.key) : undefined;
    const pinned = candidates.find((view) => view.candidate.target.mapKey === item.key || view.materializesEncounter === item.key);
    const setup = map && item.data.setup as import("@vtt/shared").DraftMapSetup | undefined;
    const flags = [...item.flags, ...(setup?.marks.map(({ reason }) => ({ field: "geometry", message: reason })) ?? []),
      ...(setup?.openings.flatMap((opening) => opening.kind === "leave" && opening.reason ? [{ field: "geometry", message: opening.reason }] : []) ?? [])];
    return {
      kind: item.kind, key: item.key, name: map?.name ?? creature?.values.name ?? String(item.data.name),
      reused: !!item.publishedId, libraryId: item.publishedId, flags,
      version: digest({ updatedAt: item.updatedAt, data: item.data, revision: pinned?.candidate.revision.id,
        map: map && { art: artwork(map), grid: map.grid, board: publicBoard(map.board) },
        creature: creature && { values: creatureValues(creature.values), art: creature.art && artwork(creature.art) },
        encounter: item.kind === "encounter" ? encounters.find(({ key }) => key === item.key)?.data : null }),
    };
  });
  const values = {
    items: dependencies, candidates, encounters, otherEncounters, problems,
    maps: [...trace.maps].map(([key, asset]) => ({ key, art: artwork(asset), grid: asset.grid, board: publicBoard(asset.board) })),
    creatures: [...trace.creatures].map(([key, { values, art }]) => ({
      key, values: creatureValues(values), reused: trace.items.some((item) => item.kind === "creature" && item.key === key && !!item.publishedId),
      art: art ? artwork(art) : null,
    })),
    disclosesOriginals: !!plan?.assets.some(({ record }) => record.studioOriginal),
  };
  const files = [...trace.files.values()].map(({ id, objectKey, sourceHash, studio, publishedAssetId, sizeBytes }) =>
    ({ id, objectKey, sourceHash, original: studio?.originalSha256, canonical: studio?.canonicalId, publishedAssetId, sizeBytes }));
  const usedWorkspaces = workspaces.filter((w) => affectedMaps.has(w.mapKey) || trace.items.some((item) =>
    item.kind === "creature" && w.creatureKeys.includes(item.key)) || w.fileIds.some((id) => trace.files.has(id)));
  const review = StudioPublishReview.parse({ ...values, digest: problems.length ? null : digest({
    selection, folder: records.build.name, choices: [records.build.aiGrid, records.build.aiWalls, records.build.aiTerrain],
    profile: squareSizeOf(records.build.gameProfile), values, files,
    items: trace.items.map(({ kind, key, updatedAt, publishedId, data }) => ({ kind, key, updatedAt, publishedId, data })),
    materializations: [...materializations.values()],
    workspaces: usedWorkspaces.map(version).sort((a, b) => a.mapKey.localeCompare(b.mapKey)),
  }) });
  return { review, plan, materializations: [...materializations.values()], heads };
}

export function requireReviewedPublication(result: Awaited<ReturnType<typeof resolveStudioPublication>>, input: StudioPublishCommitInput) {
  if (!result.plan || result.review.digest !== input.digest) {
    throw new BuildPublishConflictError("The candidate or a publication dependency changed. Review the latest version.");
  }
  return result.plan;
}

export function publicationReceipt(input: StudioPublishCommitInput, review: StudioPublishReview, plan: BuildPublishPlan,
  published: BuildPublishResult): StudioPublicationReceipt {
  return { operationId: input.operationId, digest: input.digest, selection: publicationSelection(input),
    candidates: review.candidates.map(({ candidate }) => ({ mapKey: candidate.target.mapKey, revisionId: candidate.revision.id })),
    dependencies: review.items.map(({ kind, key, reused, version, libraryId }) => ({ kind, key, reused, version, libraryId })),
    assetIds: plan.assets.map(({ record }) => record.id), published };
}
