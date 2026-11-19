import { describe, expect, it } from "vitest";
import { DEV_ACCOUNT, seedDevAccount } from "../src/identity/devAccount";
import { verifyPassword } from "../src/identity/passwords";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

describe("development account seed", () => {
  it("creates a known account only when opted in, once, and never in production", async () => {
    const store = new MemoryRoomStore();
    expect(await seedDevAccount(store, {})).toBe(false);
    expect(await store.findUserByEmail(DEV_ACCOUNT.email)).toBeNull();
    expect(await seedDevAccount(store, { SEED_DEV_ACCOUNT: "1", NODE_ENV: "production" })).toBe(false);
    expect(await store.findUserByEmail(DEV_ACCOUNT.email)).toBeNull();

    expect(await seedDevAccount(store, { SEED_DEV_ACCOUNT: "1" })).toBe(true);
    expect(await seedDevAccount(store, { SEED_DEV_ACCOUNT: "1" })).toBe(false);
    const user = await store.findUserByEmail(DEV_ACCOUNT.email);
    expect(user).not.toBeNull();
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(await verifyPassword(user!.passwordHash, DEV_ACCOUNT.password)).toBe(true);
  });
});
