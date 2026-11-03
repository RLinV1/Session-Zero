import { afterEach, describe, expect, it } from "vitest";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
  server = null;
});

describe("2.5D map style over the wire (FR-GM-19)", () => {
  it("lets the GM set it, reaches the player, and refuses the player", async () => {
    server = await startServer();
    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds);
    const alice = await server.connect(aliceCreds);
    clients.push(gm, alice);

    expect(alice.state.scene.isometric).toBeUndefined();
    const refused = await alice.command({ type: "scene.setIsometric", enabled: true });
    expect(refused).toMatchObject({ type: "rejected", code: "forbidden" });

    const ack = await gm.command({ type: "scene.setIsometric", enabled: true });
    expect(ack.type).toBe("ack");
    await alice.waitForSeq((ack as { seq: number }).seq);
    expect(alice.state.scene.isometric).toBe(true);
  });
});
