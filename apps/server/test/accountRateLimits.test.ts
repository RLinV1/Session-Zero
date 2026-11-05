import { describe, expect, it } from "vitest";
import { accountLimits } from "../src/identity/routes";

describe("HTTP request budgets", () => {
  it.each([
    ["signUpPerIp", 50, 60],
    ["signInPerIp", 150, 15],
    ["joinsPerIpPerRoom", 150, 15],
    ["inviteLookupsPerIp", 300, 15],
    ["replaysPerParticipant", 150, 1],
    ["wallDetectionsPerRoom", 50, 15],
    ["uploadsPerOwner", 300, 15],
    ["signInFailuresPerEmail", 10, 15],
    ["passwordChangeFailuresPerUser", 10, 15],
  ] as const)("%s permits its budget, isolates callers and resets after its window", (name, budget, minutes) => {
    let now = 0;
    const limiter = accountLimits(() => now)[name];
    for (let i = 0; i < budget; i++) expect(limiter.hit("one").ok).toBe(true);
    expect(limiter.hit("one")).toEqual({ ok: false, retryAfterSec: minutes * 60 });
    expect(limiter.hit("two").ok).toBe(true);
    now += minutes * 60_000;
    expect(limiter.hit("one").ok).toBe(true);
  });
});
