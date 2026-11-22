import { describe, expect, it, vi } from "vitest";
import { seedAdminAccount } from "../src/identity/adminAccount";
import { hashPassword, verifyPassword } from "../src/identity/passwords";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const ID = "6f1c1a0e-1d8e-4a52-9d44-0b8f7c1e2a33";
const ENV = { ADMIN_ACCOUNT_IDS: ID, ADMIN_EMAIL: "boss@example.com", ADMIN_PASSWORD: "a-long-seeded-secret" };

describe("deploy admin account seed", () => {
  it("creates a verified account with the configured id, email and password", async () => {
    const store = new MemoryRoomStore();
    await seedAdminAccount(store, ENV);
    const user = await store.findUserById(ID);
    expect(user).not.toBeNull();
    expect(user!.email).toBe(ENV.ADMIN_EMAIL);
    expect(user!.emailVerifiedAt).not.toBeNull();
    expect(await verifyPassword(user!.passwordHash, ENV.ADMIN_PASSWORD)).toBe(true);
  });

  it("changes nothing on a second run, even after the admin changed their password", async () => {
    const store = new MemoryRoomStore();
    await seedAdminAccount(store, ENV);
    const before = await store.findUserById(ID);
    await seedAdminAccount(store, ENV);
    expect(await store.findUserById(ID)).toEqual(before);

    await store.setPasswordHash(ID, await hashPassword("a-newer-chosen-secret"), true);
    await seedAdminAccount(store, ENV);
    const after = await store.findUserById(ID);
    expect(await verifyPassword(after!.passwordHash, "a-newer-chosen-secret")).toBe(true);
    expect(await verifyPassword(after!.passwordHash, ENV.ADMIN_PASSWORD)).toBe(false);
  });

  it("creates nothing when a setting is missing", async () => {
    const store = new MemoryRoomStore();
    await seedAdminAccount(store, { ...ENV, ADMIN_EMAIL: "" });
    await seedAdminAccount(store, { ...ENV, ADMIN_PASSWORD: undefined });
    await seedAdminAccount(store, { ADMIN_EMAIL: ENV.ADMIN_EMAIL, ADMIN_PASSWORD: ENV.ADMIN_PASSWORD });
    expect(await store.findUserById(ID)).toBeNull();
    expect(await store.findUserByEmail(ENV.ADMIN_EMAIL)).toBeNull();
  });

  it("creates nothing when ADMIN_ACCOUNT_IDS holds two ids", async () => {
    const store = new MemoryRoomStore();
    const other = "0a7d3c52-5b1f-4f60-8a1e-2d9c4b6e7f10";
    await seedAdminAccount(store, { ...ENV, ADMIN_ACCOUNT_IDS: `${ID},${other}` });
    expect(await store.findUserById(ID)).toBeNull();
    expect(await store.findUserById(other)).toBeNull();
    expect(await store.findUserByEmail(ENV.ADMIN_EMAIL)).toBeNull();
  });

  it("creates nothing and warns without the email when another account holds the email", async () => {
    const store = new MemoryRoomStore();
    const squatter = await store.createUser({
      id: "b2e4d6f8-1a3c-4e5b-9c7d-8f0a1b2c3d4e",
      email: ENV.ADMIN_EMAIL,
      displayName: "Squatter",
      passwordHash: await hashPassword("squatter-own-password"),
      emailVerifiedAt: new Date().toISOString(),
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await seedAdminAccount(store, ENV);
      expect(await store.findUserById(ID)).toBeNull();
      expect(await store.findUserByEmail(ENV.ADMIN_EMAIL)).toEqual(squatter);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).not.toContain(ENV.ADMIN_EMAIL);
    } finally {
      warn.mockRestore();
    }
  });
});
