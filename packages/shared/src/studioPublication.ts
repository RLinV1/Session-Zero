import { z } from "zod";
import { TokenAttacks } from "./attackPresets";
import { BUILD_LIMITS, BuildFlag, BuildKey, DraftCreature } from "./build";
import { EncounterTemplateData } from "./encounters";
import { GridSpec } from "./geometry";
import { LibraryMapBoard } from "./libraryBoard";
import { StudioRevisionView } from "./studioAuthoring";

const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const ItemKind = z.enum(["map", "creature", "encounter"]);
const Item = z.object({ kind: ItemKind, key: BuildKey, name: z.string(), reused: z.boolean(), version: Digest, libraryId: z.uuid().nullable(), flags: z.array(BuildFlag) });
export const StudioCandidate = z.strictObject({ mapKey: BuildKey, revisionId: z.uuid() });
export type StudioCandidate = z.infer<typeof StudioCandidate>;
export const StudioPublishSelection = z.strictObject({
  maps: z.array(BuildKey).max(BUILD_LIMITS.mapsPerBuild),
  encounters: z.array(BuildKey).max(BUILD_LIMITS.encountersPerBuild),
  creatures: z.array(BuildKey).max(BUILD_LIMITS.creaturesPerBuild),
}).refine((items) => items.maps.length + items.encounters.length + items.creatures.length > 0);
export const StudioPublishReviewInput = z.strictObject({
  selection: StudioPublishSelection, candidate: StudioCandidate.optional(),
});
export type StudioPublishReviewInput = z.infer<typeof StudioPublishReviewInput>;
export const StudioPublishCommitInput = StudioPublishReviewInput.extend({
  digest: Digest, operationId: z.uuid(),
});
export type StudioPublishCommitInput = z.infer<typeof StudioPublishCommitInput>;

const CandidateView = z.object({
  candidate: StudioRevisionView, reference: StudioRevisionView, workingRevisionId: z.uuid(),
  confirmGrid: z.boolean(), materializesEncounter: BuildKey.nullable(),
});
const Artwork = z.object({
  identity: z.string(), name: z.string(), previewUrl: z.string(), width: z.number(), height: z.number(),
  private: z.boolean(), reused: z.boolean(),
});
const { name, size, hp, maxHp, ac, color, conditions } = DraftCreature.shape;
const CreatureValues = z.object({ name, size, hp, maxHp, ac, attacks: TokenAttacks, color, conditions });
export const StudioPublishReview = z.object({
  digest: Digest.nullable(),
  candidates: z.array(CandidateView),
  items: z.array(Item),
  maps: z.array(z.object({ key: BuildKey, art: Artwork, grid: GridSpec.nullable(), board: LibraryMapBoard.nullable() })),
  creatures: z.array(z.object({ key: BuildKey, reused: z.boolean(), values: CreatureValues, art: Artwork.nullable() })),
  encounters: z.array(z.object({ key: BuildKey, data: EncounterTemplateData })),
  otherEncounters: z.array(z.object({ key: BuildKey, name: z.string(), mapKey: BuildKey })),
  problems: z.array(z.object({ item: z.string(), message: z.string() })),
  disclosesOriginals: z.boolean(),
});
export type StudioPublishReview = z.infer<typeof StudioPublishReview>;

const PublishedItem = z.object({ key: BuildKey, id: z.uuid() });
export const StudioPublicationReceipt = z.object({
  operationId: z.uuid(), digest: Digest,
  candidates: z.array(StudioCandidate),
  selection: StudioPublishSelection,
  dependencies: z.array(Item.omit({ name: true, flags: true })),
  assetIds: z.array(z.uuid()),
  published: z.object({
    assets: z.number().int().nonnegative(), creatures: z.array(PublishedItem), maps: z.array(PublishedItem),
    encounters: z.array(PublishedItem.extend({ name: z.string() })),
  }),
});
export type StudioPublicationReceipt = z.infer<typeof StudioPublicationReceipt>;
