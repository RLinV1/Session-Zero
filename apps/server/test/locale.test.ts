import { afterEach, describe, expect, it } from "vitest";
import { startServer } from "./helpers";

describe("request language from Accept-Language (localization)", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  afterEach(async () => {
    await server?.close();
  });

  const languageOf = async (acceptLanguage?: string) => {
    const res = await fetch(`${server.base}/api/auth/me`, {
      headers: acceptLanguage === undefined ? {} : { "accept-language": acceptLanguage },
    });
    return { language: res.headers.get("content-language"), vary: res.headers.get("vary") ?? "" };
  };

  it.each([
    ["zh-TW", "zh-TW"],
    ["zh-HK,zh;q=0.9", "zh-TW"],
    ["fr-FR", "en"],
    ["ja;q=0.9, zh-TW;q=0.5, en;q=0.4", "zh-TW"],
    ["en;q=0.3, zh-TW;q=0.8", "zh-TW"],
    ["zh-CN", "en"],
  ])("%s → %s", async (header, expected) => {
    server = await startServer();
    const { language, vary } = await languageOf(header);
    expect(language).toBe(expected);
    expect(vary).toMatch(/Accept-Language/i);
  });

  it("answers in English when the request names no language", async () => {
    server = await startServer();
    expect((await languageOf()).language).toBe("en");
  });

  it("leaves uploads and other non-API paths alone", async () => {
    server = await startServer();
    const res = await fetch(`${server.base}/uploads/nothing-here.png`, { headers: { "accept-language": "zh-TW" } });
    expect(res.headers.get("content-language")).toBeNull();
  });
});
