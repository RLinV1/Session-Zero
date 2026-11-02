import { describe, expect, it } from "vitest";
import { GridDetectionCandidate, GridDetectionStatus, RoomUploadPurpose } from "../src/gridDetection";
import { DirectUploadFields } from "../src/protocol";

describe("private grid detection HTTP contract (FR-GM-03)", () => {
  it("accepts finite canonical image-pixel candidates", () => {
    const candidate = { cellSize: 64, offsetX: 0, offsetY: 63.5 };
    expect(GridDetectionCandidate.parse(candidate)).toEqual(candidate);
    expect(GridDetectionStatus.parse({ status: "suggested", attempt: 2, candidate })).toEqual({ status: "suggested", attempt: 2, candidate });
  });

  it("rejects nonfinite, noncanonical and out-of-range detector results", () => {
    for (const candidate of [
      { cellSize: Number.NaN, offsetX: 0, offsetY: 0 },
      { cellSize: 64, offsetX: 64, offsetY: 0 },
      { cellSize: 64, offsetX: -1, offsetY: 0 },
      { cellSize: 2001, offsetX: 0, offsetY: 0 },
    ]) expect(GridDetectionCandidate.safeParse(candidate).success).toBe(false);
  });

  it("keeps omitted direct-upload purpose compatible with token callers", () => {
    expect(DirectUploadFields.parse({}).purpose).toBe("token");
    expect(DirectUploadFields.safeParse({ purpose: "map" }).success).toBe(false);
    expect(RoomUploadPurpose.parse("token")).toBe("token");
    expect(RoomUploadPurpose.safeParse("wall").success).toBe(false);
  });
});
