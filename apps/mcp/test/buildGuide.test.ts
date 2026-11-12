import { describe, expect, it } from "vitest";
import { FIELD_GUIDE } from "../src/buildGuide";

describe("how the AI is told to write for the owner (FR-GM-27, build page layout 2026-11-11)", () => {
  it("asks for ASD-STE100 Simplified Technical English, to at least 80% of its rules", () => {
    expect(FIELD_GUIDE.writing).toContain("ASD-STE100 Simplified Technical English");
    expect(FIELD_GUIDE.writing).toContain("at least 80% of its rules");
    expect(FIELD_GUIDE.writing).toMatch(/one topic per sentence/);
    expect(FIELD_GUIDE.writing).toMatch(/at most 20 words in an instruction and 25 in a description/);
  });

  it("asks for one labelled line per topic, which the build page lays out as a list", () => {
    expect(FIELD_GUIDE.writing).toContain("'Label: text'");
    expect(FIELD_GUIDE.creature.fields.notCarriedOver).toContain("'Label: text'");
    expect(FIELD_GUIDE.gameProfile).toContain("'Label: text'");
  });

  it("points flags at the same writing rules", () => {
    expect(FIELD_GUIDE.creature.fields.flags).toContain("as 'writing' says");
  });
});
