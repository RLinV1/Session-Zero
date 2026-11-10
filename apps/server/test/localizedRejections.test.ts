import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

async function room() {
  const gmCreds = await server.createRoom("Mara");
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  clients.push(gm, alice);
  return { gm, alice };
}

describe("rejections carry their message id (localization, ADR 0052)", () => {
  it("sends the id with the English message unchanged", async () => {
    const { gm } = await room();
    expect(await gm.command({ type: "room.setJoinsLocked", locked: false })).toEqual({
      type: "rejected", clientCommandId: expect.any(String), code: "invalid",
      message: "The room is already unlocked", messageId: "reject.roomAlreadyUnlocked",
    });
  });

  it("sends the params a message names, so the client can write it in its own language", async () => {
    const { alice } = await room();
    expect(await alice.command({ type: "participant.rename", displayName: "Mara" })).toMatchObject({
      type: "rejected", code: "invalid",
      message: 'The name "Mara" is already taken in this room. Choose another name.',
      messageId: "reject.displayNameTaken", params: { name: "Mara" },
    });
  });

  it("covers refusals from outside decide: authorization and not-found", async () => {
    const { alice, gm } = await room();
    expect(await alice.command({ type: "room.setJoinsLocked", locked: true })).toMatchObject({
      code: "forbidden", message: "You are not allowed to do that", messageId: "reject.forbidden",
    });
    expect(await gm.command({ type: "token.move", tokenId: "11111111-1111-4111-8111-111111111111", to: { x: 0, y: 0 } })).toMatchObject({
      code: "not_found", message: "No such token", messageId: "reject.notFound.token",
    });
  });
});
