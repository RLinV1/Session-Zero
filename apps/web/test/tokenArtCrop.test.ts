import { describe, expect, it } from "vitest";
import { clampOffset, clampZoom, coverScale, sourceRect } from "../src/ui/tokenArtCrop";

// FR-GM-08: token art framing math.
describe("token art crop math (FR-GM-08)", () => {
  it("cover-fits the short edge", () => {
    expect(coverScale(400, 200, 100)).toBe(0.5);
    expect(coverScale(200, 400, 100)).toBe(0.5);
  });

  it("clamps pan so the circle stays covered", () => {
    // 400x200 at zoom 1, view 100: scale .5 -> 200x100, can pan 50 horizontally, 0 vertically.
    expect(clampOffset({ x: 999, y: 999 }, 400, 200, 1, 100)).toEqual({ x: 50, y: 0 });
    expect(clampOffset({ x: -999, y: 5 }, 400, 200, 1, 100)).toEqual({ x: -50, y: 0 });
    // Zoom 2 doubles the slack.
    expect(clampOffset({ x: 999, y: 999 }, 400, 200, 2, 100)).toEqual({ x: 150, y: 50 });
  });

  it("clamps zoom to 1..4", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(9)).toBe(4);
  });

  it("initial framing is the centred square of the short edge", () => {
    expect(sourceRect(400, 200, 1, { x: 0, y: 0 }, 100)).toEqual({ sx: 100, sy: 0, size: 200 });
  });

  it("panning right shows the image's left; zooming shrinks the region", () => {
    expect(sourceRect(400, 200, 1, { x: 50, y: 0 }, 100)).toEqual({ sx: 0, sy: 0, size: 200 });
    expect(sourceRect(400, 200, 2, { x: 0, y: 0 }, 100)).toEqual({ sx: 150, sy: 50, size: 100 });
  });
});
