import { describe, expect, it } from "vitest";
import { buildFieldLabel } from "../src/build";

describe("a flagged field, named as the owner knows it (FR-GM-27)", () => {
  it("gives the app's own fields their names on the page", () => {
    expect(buildFieldLabel("imageFileId")).toBe("Art");
    expect(buildFieldLabel("maxHp")).toBe("Max HP");
    expect(buildFieldLabel("armorClass")).toBe("AC");
    expect(buildFieldLabel("AC")).toBe("AC");
  });

  it("turns any other code-like name into words", () => {
    expect(buildFieldLabel("terrain")).toBe("Terrain");
    expect(buildFieldLabel("tokenArt")).toBe("Token art");
    expect(buildFieldLabel("start_area")).toBe("Start area");
  });

  it("leaves words already written for people, and acronyms, as they are", () => {
    expect(buildFieldLabel("Hot Broth")).toBe("Hot Broth");
    expect(buildFieldLabel("UVTT")).toBe("UVTT");
  });
});
