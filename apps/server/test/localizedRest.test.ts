import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { serverEn } from "../src/i18n/en";
import { localizeBody, localizeText, serverCatalogDuplicates } from "../src/i18n/localize";
import { startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>> | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const post = (url: string, body: unknown, language?: string) =>
  fetch(server!.base + url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(language ? { "accept-language": language } : {}) },
    body: JSON.stringify(body),
  });

describe("REST errors in the requested language (localization)", () => {
  it("writes a failed sign-in in Traditional Chinese, with the same status", async () => {
    server = await startServer();
    await server!.signUp({ email: "sam@example.com", password: "correct horse battery" });
    const zh = await post("/api/auth/signin", { email: "sam@example.com", password: "wrong password!" }, "zh-TW");
    expect(zh.status).toBe(401);
    expect(zh.headers.get("content-language")).toBe("zh-TW");
    expect(await zh.json()).toEqual({ error: "電子郵件或密碼不正確。" });
    const en = await post("/api/auth/signin", { email: "sam@example.com", password: "wrong password!" });
    expect(en.status).toBe(401);
    expect(await en.json()).toEqual({ error: "Email or password is incorrect." });
  });

  it("writes field errors in Traditional Chinese and keeps the field", async () => {
    server = await startServer();
    const res = await post("/api/auth/signup", { email: "not-an-email", password: "correct horse battery", displayName: "Sam" }, "zh-TW");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; field: string; issues: { message: string }[] };
    expect(body.field).toBe("email");
    expect(body.error).toBe("請輸入有效的電子郵件地址，例如 name@example.com。");
    expect(body.issues[0]!.message).toBe(body.error);
  });

  it("answers a language it doesn't have in English, with the same status", async () => {
    server = await startServer();
    const res = await post("/api/auth/signup", { email: "not-an-email", password: "correct horse battery", displayName: "Sam" }, "fr-FR");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-language")).toBe("en");
    expect(((await res.json()) as { error: string }).error).toBe("Enter an email address like name@example.com");
  });

  it("writes zod's own messages with zod's Traditional Chinese", async () => {
    server = await startServer();
    const gm = await server!.createRoom();
    const res = await post(`/api/invites/${gm.inviteCode}/join`, { displayName: "Sam", guestToken: "short" }, "zh-TW");
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/[㐀-鿿]/);
  });

  it("writes a join refusal from the shared catalog, with the name as typed", async () => {
    server = await startServer();
    const gm = await server!.createRoom("Mara");
    const res = await post(`/api/invites/${gm.inviteCode}/join`, { displayName: "Mara", guestToken: server!.newGuestToken() }, "zh-TW");
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "房間內已有人使用「Mara」，請換個名稱。" });
  });
});

describe("the server catalog (localization)", () => {
  it("has one id per English text, so the reverse lookup is exact", () => {
    expect(serverCatalogDuplicates()).toEqual([]);
  });

  it("translates every catalog entry and the messages written with a value", () => {
    for (const english of Object.values(serverEn)) expect(localizeText("zh-TW", english)).not.toBe(english);
    expect(localizeText("zh-TW", 'This room uses a different map than "Crypt". Save it as a new template instead.'))
      .toBe("這個房間使用的地圖與「Crypt」不同。請另存為新範本。");
    expect(localizeText("zh-TW", "Images must be 10 MB or smaller")).toBe("圖片必須小於或等於 10 MB");
    expect(localizeText("en", "Room not found")).toBe("Room not found");
  });

  it("leaves bodies without people-facing text alone", () => {
    const body = { id: "r1", name: "Room not found" };
    expect(localizeBody("zh-TW", body)).toEqual(body);
    expect(localizeBody("zh-TW", [1, 2])).toEqual([1, 2]);
  });

  it("covers every English error the server's source writes", () => {
    const root = fileURLToPath(new URL("../src", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts") && !full.includes(`${path.sep}i18n${path.sep}`)) files.push(full);
      }
    };
    walk(root);
    // Codes and log lines, not text for people.
    const notForPeople = new Set(["source_changed", "invalid_image", "execution_failed", "Unsupported model"]);
    const missing: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const literals = [
        ...source.matchAll(/(?:error|message)\s*:\s*"((?:[^"\\]|\\.)*)"/g),
        ...source.matchAll(/super\("((?:[^"\\]|\\.)*)"\)/g),
        ...source.matchAll(/refused\([^)]*?,\s*"((?:[^"\\]|\\.)*)"\)/g),
        ...source.matchAll(/return "([A-Z][^"]* [^"]*)";/g),
      ].map((m) => m[1]!.replace(/\\"/g, '"'));
      for (const text of literals) {
        if (notForPeople.has(text) || !/[A-Za-z]{2,} [A-Za-z]/.test(text) && !/^[A-Z][a-z]+( [a-z]+)*$/.test(text)) continue;
        if (localizeText("zh-TW", text) === text) missing.push(`${path.relative(root, file)}: ${text}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
