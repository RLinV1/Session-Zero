import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../src/net/api";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Save to library and library export requests (asset-library, ADR 0070)", () => {
  it("posts the room's GM credential and, while preparing a scene, its id; the result is checked", async () => {
    const fetch = vi.fn(async () => json({ assetId: "a1", name: "Crypt", created: true }, 201));
    vi.stubGlobal("fetch", fetch);
    expect(await api.saveMapToLibrary("room 1", "tok", { sceneId: "s1" })).toEqual({ assetId: "a1", name: "Crypt", created: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/rooms/room%201/map/library");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toEqual({ sceneId: "s1" });
  });

  it("refuses a malformed result and surfaces the server's reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ assetId: "a1" }, 201)));
    await expect(api.saveMapToLibrary("r", "tok")).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Apply a map before saving it to the library." }, 400)));
    await expect(api.saveMapToLibrary("r", "tok")).rejects.toThrow("Apply a map before saving it to the library.");
  });

  it("downloads a library map's UVTT file", async () => {
    const fetch = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await api.library.export("map 1")).toBeInstanceOf(Blob);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("/api/library/map%201/export");
  });
});
