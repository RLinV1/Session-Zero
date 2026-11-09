import { describe, expect, it } from "vitest";
import { ApiError } from "../src/net/api";
import { diceLookSaveFailure } from "../src/ui/diceSkinStore";

describe("a refused dice picture says why (upload-limits, FR-GM-02)", () => {
  it("shows the server's message when the upload allowance is full", () => {
    expect(diceLookSaveFailure(new ApiError("Delete library art to make room.", 409))).toBe("Delete library art to make room.");
  });

  it("keeps the generic retry message for anything else", () => {
    expect(diceLookSaveFailure(new ApiError("boom", 500))).toBe("Your dice look could not be saved. Try again.");
    expect(diceLookSaveFailure(new Error("offline"))).toBe("Your dice look could not be saved. Try again.");
  });
});
