import { describe, expect, it } from "vitest";
import { studioIssueText } from "../src/i18n/studioIssues";

describe("Studio native issue localization (FR-GM-27, ADR 0054)", () => {
  it("localizes actual native grid, terrain and placement problems while preserving names", () => {
    expect(studioIssueText("zh-TW", "problem", "Its grid is waiting for you. Check it on the map below, then confirm it.")).toContain("確認");
    expect(studioIssueText("zh-TW", "problem", "Your AI proposed its terrain on 50-pixel squares at offset (0, 0), and the grid is now 60-pixel squares at offset (0, 0). Clear the terrain below, or put the grid back.")).toContain("每格 50 像素");
    const name = "50-pixel squares at offset (1, 2)";
    const blocked = studioIssueText("zh-TW", "problem", `${name} at column 2, row 3 stands on Blocked terrain, so it couldn't move. Move it in the encounter's editor, or clear the terrain.`);
    expect(blocked).toContain(`「${name}」`); expect(blocked).toContain("阻擋地形");
    expect(studioIssueText("zh-TW", "problem", "Opening 4 isn't on this map. It has 2 openings.")).toContain("開口 4");
  });
  it("retains model/source uncertainty and English native messages verbatim", () => {
    const flag = "Terrain: Cannot determine the water depth.";
    expect(studioIssueText("zh-TW", "uncertain", flag)).toBe(flag);
    expect(studioIssueText("en", "problem", "Goblin is off the map.")).toBe("Goblin is off the map.");
  });
});
