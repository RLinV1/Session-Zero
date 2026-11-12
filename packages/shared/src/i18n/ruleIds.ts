import type { DefeatRemoval, DiagonalRule, DifficultTerrainMode } from "../state";

/**
 * Catalog ids for each table rule's choices (ADR 0054), for text in any language: rejections, the
 * activity log and the Settings menu. Type-only imports, so the sentence builders can use them
 * without an import cycle through `state`.
 */
export const DEFEAT_REMOVAL_IDS = { all: "rule.defeatRemoval.all", npc: "rule.defeatRemoval.npc", off: "rule.defeatRemoval.off" } as const satisfies Record<DefeatRemoval, string>;
export const DIAGONAL_RULE_IDS = { equal: "rule.diagonal.equal", alternating: "rule.diagonal.alternating", euclidean: "rule.diagonal.euclidean" } as const satisfies Record<DiagonalRule, string>;
export const DIFFICULT_TERRAIN_IDS = { entry: "rule.difficult.entry", exit: "rule.difficult.exit", both: "rule.difficult.both" } as const satisfies Record<DifficultTerrainMode, string>;
