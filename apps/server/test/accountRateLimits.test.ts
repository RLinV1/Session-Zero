import { describe, expect, it } from "vitest";
import { accountLimits } from "../src/identity/routes";
import { startServer } from "./helpers";

describe("HTTP request budgets", () => {
  it.each([
    ["signUpPerIp", 50, 60],
    ["roomCreationsPerAccount", 20, 60],
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

describe("sign-up limit per address (ADR 0069)", () => {
  it("refuses the 51st attempt in an hour without saying whether the email is taken", async () => {
    const server = await startServer();
    try {
      for (let i = 0; i < 50; i++) await server.signUp({ email: `u${i}@example.com` });
      const res = await server.anonymous().request("POST", "/api/auth/signup", { email: "u0@example.com", password: "correct horse battery", displayName: "Sam" });
      expect(res.status).toBe(429);
      expect(res.headers.get("retry-after")).not.toBeNull();
      expect(await res.json()).not.toHaveProperty("field");
      expect(server.app.limits.signUpPerIp.hit("signup:203.0.113.9").ok).toBe(true);
    } finally {
      await server.close();
    }
  });
});
