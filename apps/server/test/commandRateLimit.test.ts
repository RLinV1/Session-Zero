import { afterEach, describe, expect, it } from "vitest";
import { startServer, type TestClient } from "./helpers";

/**
 * A joined player's commits are backstopped by a per-seat rate cap so the append-only log can't be
 * grown without bound (security-hardening). `chat.send` and dice-look changes keep their own tighter
 * limits; this covers the general cap over every other command (dice.roll, template.place, ...).
 */
let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

describe("per-seat command rate limit (security-hardening)", () => {
  it("accepts commands up to the window, then rejects the overflow, leaving other seats untouched", async () => {
    server = await startServer(undefined, { commandRateLimit: { limit: 3, windowMs: 60_000 } });
    const owner = await server.createRoom("GM");
    const player = await server.join(owner.inviteCode, "Flood");
    const gm = await server.connect(owner);
    const pc = await server.connect(player);
    clients.push(gm, pc);

    for (let i = 0; i < 3; i++) {
      expect((await pc.command({ type: "dice.roll", expression: "1d20", visibility: "public" })).type).toBe("ack");
    }
    // The next command for this seat is refused as over-rate — it never reaches the log.
    const over = await pc.command({ type: "dice.roll", expression: "1d20", visibility: "public" });
    expect(over).toMatchObject({ type: "rejected", code: "invalid" });

    // The cap is per seat: the GM, a different participant, still has a full budget.
    expect((await gm.command({ type: "dice.roll", expression: "1d20", visibility: "public" })).type).toBe("ack");
  });

  it("shares one budget across a participant's connections, so a second tab gets no extra (security-hardening D3)", async () => {
    server = await startServer(undefined, { commandRateLimit: { limit: 2, windowMs: 60_000 } });
    const owner = await server.createRoom("GM");
    const player = await server.join(owner.inviteCode, "Flood");
    const tabA = await server.connect(player);
    const tabB = await server.connect(player);
    clients.push(tabA, tabB);

    expect((await tabA.command({ type: "dice.roll", expression: "1d20", visibility: "public" })).type).toBe("ack");
    expect((await tabB.command({ type: "dice.roll", expression: "1d20", visibility: "public" })).type).toBe("ack");
    // The seat's budget of 2 is spent regardless of which socket sent the commands.
    expect((await tabB.command({ type: "dice.roll", expression: "1d20", visibility: "public" })).type).toBe("rejected");
  });
});
