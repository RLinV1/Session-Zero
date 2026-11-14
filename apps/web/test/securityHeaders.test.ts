import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "../securityHeaders";

const caddyfile = readFileSync(new URL("../../../deploy/Caddyfile", import.meta.url), "utf8");

describe("security headers (security-review-findings)", () => {
  it("the Caddyfile holds every header name and value from the constant", () => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(caddyfile).toContain(`${name} "${value}"`);
    }
  });

  it("forbids framing and requires HSTS", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toContain("max-age=");
    expect(caddyfile).toContain("Strict-Transport-Security");
    expect(caddyfile).toContain('X-Frame-Options "DENY"');
  });

  it("never allows eval", () => {
    expect(caddyfile).not.toContain("unsafe-eval");
    expect(JSON.stringify(SECURITY_HEADERS)).not.toContain("unsafe-eval");
  });
});
