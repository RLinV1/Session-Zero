import { describe, expect, it } from "vitest";
import { FEEDBACK_LIMITS, FeedbackReceipt, FeedbackReference, FeedbackReport, FeedbackTechnical, feedbackPagePath, feedbackReference } from "../src";

describe("feedback report contract (FR-PL-11)", () => {
  it("trims the summary, defaults details and refuses an empty or long summary", () => {
    expect(FeedbackReport.parse({ kind: "bug", summary: "  Fog stays  " })).toEqual({ kind: "bug", summary: "Fog stays", details: "" });
    expect(FeedbackReport.safeParse({ kind: "bug", summary: "   " }).success).toBe(false);
    expect(FeedbackReport.safeParse({ kind: "bug", summary: "x".repeat(FEEDBACK_LIMITS.summary + 1) }).success).toBe(false);
    expect(FeedbackReport.safeParse({ kind: "bug", summary: "ok", details: "x".repeat(FEEDBACK_LIMITS.details + 1) }).success).toBe(false);
    expect(FeedbackReport.safeParse({ kind: "praise", summary: "ok" }).success).toBe(false);
  });

  it("allows only the listed technical details", () => {
    const technical = { pagePath: "/r/abc", appVersion: "1.2.3", locale: "zh-TW", roomId: "abc_123", seq: 42, role: "gm", screen: { width: 1512, height: 982 }, pixelRatio: 2 };
    expect(FeedbackTechnical.parse(technical)).toEqual(technical);
    expect(FeedbackTechnical.safeParse({ ...technical, tokens: [] }).success).toBe(false);
    expect(FeedbackReport.safeParse({ kind: "idea", summary: "ok", extra: 1 }).success).toBe(false);
  });

  it("never carries a query or fragment in the page path", () => {
    expect(FeedbackTechnical.safeParse({ pagePath: "/join/r1?token=secret" }).success).toBe(false);
    expect(FeedbackTechnical.safeParse({ pagePath: "/r/r1#invite" }).success).toBe(false);
    expect(feedbackPagePath("/join/r1?token=secret#x")).toBe("/join/r1");
    expect(feedbackPagePath("news")).toBe("/news");
    expect(FeedbackTechnical.safeParse({ pagePath: feedbackPagePath("/a b?c") }).success).toBe(true);
  });

  it("draws references from the unambiguous alphabet", () => {
    let n = 0;
    const steps = [0, 0.5, 0.99, 0.31];
    const reference = feedbackReference(() => steps[n++ % steps.length]!);
    expect(reference).toMatch(/^FB-[0-9A-Z]{4}$/);
    expect(FeedbackReference.safeParse(reference).success).toBe(true);
    for (const bad of ["FB-IL0U", "FB-abcd", "FB-12345", "fb-1234"]) expect(FeedbackReference.safeParse(bad).success).toBe(false);
    expect(FeedbackReceipt.safeParse({ reference, screenshots: 4 }).success).toBe(false);
  });
});
