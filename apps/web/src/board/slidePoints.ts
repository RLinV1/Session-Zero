import { visibleStretches, type DomainEvent, type Participant, type Point, type RoomState } from "@vtt/shared";

type TokenMoved = Extract<DomainEvent, { type: "TokenMoved" }>;

/**
 * The points and hidden gaps a viewer's board slides a moved token through (token-slide, ADR 0055),
 * live or in a replay. A path arrives already cut to what this viewer may see; a straight move is cut
 * here from the fog and sight their board holds, so a token never slides through fog. The GM sees all.
 */
export function slidePointsFor(moved: TokenMoved, viewer: Pick<Participant, "role">, state: Pick<RoomState, "fog" | "sight">): { points: Point[]; gaps: number[] } {
  if (moved.via?.length) return { points: [moved.from, ...moved.via, moved.to], gaps: moved.gaps ?? [] };
  if (viewer.role === "gm") return { points: [moved.from, moved.to], gaps: [] };
  return visibleStretches([moved.from, moved.to], { fog: state.fog, sight: state.sight ?? null });
}
