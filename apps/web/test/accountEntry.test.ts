import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NEXT, safeNext, signInFor } from "../src/account/safeNext";

/** A localStorage stand-in with key enumeration, installed as the global one. */
function memoryStorage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

describe("where sign-in returns to (gm-home: Account screens)", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/gm-dashboard")).toBe("/gm-dashboard");
    expect(safeNext("/library?tab=dice")).toBe("/library?tab=dice");
    expect(safeNext("/r/abc#board")).toBe("/r/abc#board");
  });

  it("falls back to the dashboard for anything that could leave the site", () => {
    for (const raw of ["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", null]) {
      expect(safeNext(raw)).toBe(DEFAULT_NEXT);
    }
  });

  it("builds a sign-in link that comes back to the page", () => {
    expect(signInFor("/library?tab=dice")).toBe("/signin?next=%2Flibrary%3Ftab%3Ddice");
    expect(safeNext(new URLSearchParams(signInFor("/r/1").split("?")[1]).get("next"))).toBe("/r/1");
  });
});

describe("who is signed in (FR-GM-01, ADR 0017 C3)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const sam = { id: "u1", email: "sam@example.com", displayName: "Sam" };

  it("reads a signed-out visitor as signed out, not as an error", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { account: null }));
    const store = await import("../src/account/accountStore");
    expect(store.accountStore.getState()).toEqual({ status: "loading" });
    await store.loadAccount();
    expect(store.accountStore.getState()).toEqual({ status: "signedOut" });
  });

  it("is signed in after signing in", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { account: sam }));
    const store = await import("../src/account/accountStore");
    await store.signIn("sam@example.com", "correct horse");
    expect(store.accountStore.getState()).toEqual({ status: "signedIn", account: sam });
  });

  it("is signed out once an account request answers 401", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { account: sam }));
    const store = await import("../src/account/accountStore");
    const { api } = await import("../src/net/api");
    await store.loadAccount();
    fetchMock.mockResolvedValueOnce(json(401, { error: "Sign in to do that" }));
    await expect(api.me.rooms()).rejects.toThrow("Sign in to do that");
    expect(store.accountStore.getState()).toEqual({ status: "signedOut" });
  });

  it("keeps the typed message and field of a refused sign-up", async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: "An account with this email already exists", field: "email" }));
    const store = await import("../src/account/accountStore");
    const { ApiError } = await import("../src/net/api");
    const err = await store.signUp("sam@example.com", "correct horse", "Sam").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).detail.field).toBe("email");
  });
});

describe("seats and choices this device keeps (room-membership, gm-dashboard)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forgets only the seats held through the account when this device signs out", async () => {
    const { forgetAccountSeats } = await import("../src/net/identity");
    const storage = memoryStorage({
      "vtt.credentials.r1": JSON.stringify({ roomId: "r1", participantId: "p1", guestToken: "t1", viaAccount: true }),
      "vtt.credentials.r2": JSON.stringify({ roomId: "r2", participantId: "p2", guestToken: "t2" }),
    });
    forgetAccountSeats(storage);
    expect([...storage.data.keys()]).toEqual(["vtt.credentials.r2"]);
  });

  it("drops the retired guest choice and writes no GM token until a guest room starts", async () => {
    const storage = memoryStorage({ "vtt.gmGuest": "1" });
    vi.stubGlobal("localStorage", storage);
    const identity = await import("../src/net/identity");
    identity.dropGuestChoice();
    expect(storage.data.has("vtt.gmGuest")).toBe(false);
    expect(storage.data.has("vtt.gm")).toBe(false);
    // ensureGmToken exists again, but only the guest-room start calls it; this flow never does.
    expect(typeof identity.ensureGmToken).toBe("function");
  });
});
