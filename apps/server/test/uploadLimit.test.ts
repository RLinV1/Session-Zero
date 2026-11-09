import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

/** 1x1 transparent PNG: the server reads the real format from these bytes. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const imageForm = (fields: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([PNG], { type: "image/png" }), "art.png");
  return form;
};
const roomUpload = (guestToken: string) =>
  fetch(`${server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${guestToken}` }, body: imageForm() });
const libraryUpload = (cookie: string) =>
  fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: imageForm({ kind: "map", name: "Cave", width: "100", height: "100" }) });

describe("image upload limit (FR-GM-02)", () => {
  it("counts one budget per account, across its rooms and its library", async () => {
    const hit = vi.spyOn(server.app.limits.uploadsPerOwner, "hit");
    const { cookie } = await server.signUp();
    const a = await server.createRoom("GM", { cookie, roomName: "A" });
    const b = await server.createRoom("GM", { cookie, roomName: "B" });
    const other = await server.createRoom("GM", { roomName: "Other" });

    expect((await roomUpload(a.guestToken)).status).toBe(200);
    expect((await roomUpload(b.guestToken)).status).toBe(200);
    expect((await libraryUpload(cookie)).status).toBe(201);
    expect((await roomUpload(other.guestToken)).status).toBe(200);

    const keys = hit.mock.calls.map(([key]) => key);
    expect(keys).toHaveLength(4);
    expect(new Set(keys.slice(0, 3)).size).toBe(1);
    expect(keys[3]).not.toBe(keys[0]);
  });

  it("refuses a room upload once that account's budget is spent, even from a new room", async () => {
    const { cookie } = await server.signUp();
    const first = await server.createRoom("GM", { cookie, roomName: "A" });
    const ownerId = (await server.store.findRoomOwner(first.roomId))!;
    for (let i = 0; i < 300; i++) server.app.limits.uploadsPerOwner.hit(`upload:${ownerId}`);
    const fresh = await server.createRoom("GM", { cookie, roomName: "B" });
    expect((await roomUpload(fresh.guestToken)).status).toBe(429);
    expect((await libraryUpload(cookie)).status).toBe(429);
    // A UVTT import stores an image too: refused before the file is read.
    expect((await fetch(`${server.base}/api/library/uvtt/imports`, { method: "POST", headers: { cookie }, body: imageForm() })).status).toBe(429);
    expect((await fetch(`${server.base}/api/rooms/${fresh.roomId}/uvtt/imports`, { method: "POST", headers: { authorization: `Bearer ${fresh.guestToken}` }, body: imageForm() })).status).toBe(429);
  });
});
