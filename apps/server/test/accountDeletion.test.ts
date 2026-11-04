import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function addMap(cookie: string) {
  const form = new FormData();
  for (const [k, v] of Object.entries({ kind: "map", name: "Cave", width: "100", height: "100" })) form.append(k, v);
  form.append("file", new Blob([PNG], { type: "image/png" }), "art.png");
  const res = await fetch(server.base + "/api/library", { method: "POST", headers: { cookie }, body: form });
  expect(res.status).toBe(201);
}

describe("account deletion (FR-GM-01)", () => {
  it("erases the account, its rooms and its library, and clears the cookie", async () => {
    const account = await server.signUp({ password: "correct horse battery" });
    const room = await server.createRoom("GM", { cookie: account.cookie });
    await addMap(account.cookie);
    const ownerId = (await server.store.findUserById(account.view!.id))!.ownerId;
    expect((await server.store.listAssets(ownerId)).length).toBe(1);

    const res = await account.request("DELETE", "/api/auth/account", { password: "correct horse battery" });
    expect(res.status).toBe(204);
    expect(res.headers.getSetCookie().join(";")).toContain("Max-Age=0");
    expect(account.cookie).toBe("");

    expect(await server.store.roomExists(room.roomId)).toBe(false);
    expect(await server.store.listAssets(ownerId)).toEqual([]);
    expect(await server.store.findUserById(account.view!.id)).toBeNull();
    expect((await server.anonymous().request("GET", `/api/rooms/${room.roomId}`)).status).toBe(404);
    expect((await server.signIn(account.email, "correct horse battery").catch(() => null))).toBeNull();
  });

  it("refuses a wrong password with 403 on the password field and deletes nothing", async () => {
    const account = await server.signUp();
    const res = await account.request("DELETE", "/api/auth/account", { password: "not it at all" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ field: "password" });
    expect(await account.me()).not.toBeNull();
  });

  it("answers 401 when signed out", async () => {
    const res = await server.anonymous().request("DELETE", "/api/auth/account", { password: "whatever long" });
    expect(res.status).toBe(401);
  });

  it("keeps a room owned by someone else and removes the deleted account's membership", async () => {
    const owner = await server.createRoom("GM");
    const guest = await server.signUp();
    const joined = await server.joinAs(guest, owner.inviteCode, "Alice");
    expect(joined.status).toBe(200);
    expect(await server.store.findMember(owner.roomId, guest.view!.id)).not.toBeNull();

    const res = await guest.request("DELETE", "/api/auth/account", { password: guest.password });
    expect(res.status).toBe(204);
    expect(await server.store.roomExists(owner.roomId)).toBe(true);
    expect(await server.store.findMember(owner.roomId, guest.view!.id)).toBeNull();
  });
});
