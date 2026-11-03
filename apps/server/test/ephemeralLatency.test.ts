import { afterEach, describe, expect, it } from "vitest";
import type { EphemeralPayload, ServerEphemeralPayload, ServerMessage, Token } from "@vtt/shared";
import { startServer, TestClient } from "./helpers";
import { BENCHMARK_PROFILE, startLatencyProxy } from "./latencyProxy";

/**
 * Ephemeral latency benchmark (README §6 "Ephemeral Interaction Latency", KAN-39, FR-SYNC-03).
 * Every client sits behind its own link with the benchmark profile; the 95th percentile from
 * the sender's send call to each receiver's handler must stay at or under 150 ms.
 * Set VTT_SKIP_BENCH=1 to skip it on an overloaded machine.
 */
const TARGET_P95_MS = 150;
const MESSAGES = 100; // of each kind
const KINDS = 3;
const SEND_EVERY_MS = 33; // ~30 messages a second, under the server's 40/s per-connection cap

let cleanup: Array<() => unknown> = [];
afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

describe.skipIf(process.env.VTT_SKIP_BENCH === "1")("ephemeral latency benchmark (KAN-39, FR-SYNC-03)", () => {
  it("adds the profile's delay to a round trip through the proxy", async () => {
    const server = await startServer();
    cleanup.push(() => server.close());
    const proxy = await startLatencyProxy(Number(new URL(server.base).port));
    cleanup.push(() => proxy.close());
    const client = await TestClient.connect(proxy.base, await server.createRoom());
    cleanup.push(() => client.close());
    const started = performance.now();
    await client.command({ type: "dice.roll", expression: "1d20" });
    // Out and back: at least two one-way delays, less the jitter.
    expect(performance.now() - started).toBeGreaterThanOrEqual(2 * (BENCHMARK_PROFILE.delayMs - BENCHMARK_PROFILE.jitterMs));
  });

  it(`delivers pings, drag previews and area aims within ${TARGET_P95_MS} ms at p95 under the benchmark profile`, async () => {
    const server = await startServer();
    cleanup.push(() => server.close());
    const port = Number(new URL(server.base).port);
    /** Each participant gets its own delayed link. */
    const viaLink = async (creds: Parameters<typeof server.connect>[0]) => {
      const proxy = await startLatencyProxy(port, BENCHMARK_PROFILE);
      cleanup.push(() => proxy.close());
      const client = await TestClient.connect(proxy.base, creds);
      cleanup.push(() => client.close());
      return client;
    };

    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
    const gm = await viaLink(gmCreds);
    const alice = await viaLink(aliceCreds);
    const bob = await viaLink(bobCreds);

    await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 2000, height: 2000 } });
    await gm.command({ type: "token.create", name: "Fighter", position: { x: 35, y: 35 }, ownerIds: [alice.participantId] });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    const fighter = (Object.values(gm.state.tokens) as Token[])[0]!;

    // Message i carries i in `at.x`, so a receiver can match it to its send time.
    const sentAt = new Map<string, number>();
    const key = (p: ServerEphemeralPayload) =>
      `${p.type}:${p.type === "tokenMovePreview" || p.type === "tokenMoveFeedback" ? p.requestId : p.type === "diceDrop" ? p.to.x : p.type === "templatePreview" ? (p.preview?.origin.x ?? -1) : p.at.x}`;
    const latencies = new Map<TestClient, number[]>([[gm, []], [bob, []]]);
    for (const [receiver, values] of latencies) {
      receiver.onMessage((msg: ServerMessage) => {
        if (msg.type !== "ephemeral") return;
        const sent = sentAt.get(key(msg.payload));
        if (sent !== undefined) values.push(performance.now() - sent);
      });
    }

    // Pings, drag previews and area aims (KAN-35), interleaved.
    for (let i = 1; i <= MESSAGES * KINDS; i++) {
      const n = Math.ceil(i / KINDS);
      const payload: EphemeralPayload = i % KINDS === 1
        ? { type: "ping", at: { x: n, y: 10 } }
        : i % KINDS === 2
          ? { type: "tokenDragPreview", tokenId: fighter.id, at: { x: n, y: 10 } }
          : { type: "templatePreview", preview: { shape: "cone", origin: { x: n, y: 10 }, toward: { x: n + 100, y: 10 }, size: 15, gmOnly: false } };
      sentAt.set(key(payload), performance.now());
      alice.send({ type: "ephemeral", payload });
      await new Promise((r) => setTimeout(r, SEND_EVERY_MS));
    }
    // Let the last messages cross both links.
    await new Promise((r) => setTimeout(r, 500));

    for (const [receiver, values] of latencies) {
      const who = receiver === gm ? "GM" : "Bob";
      const p50 = percentile(values, 50);
      const p95 = percentile(values, 95);
      console.log(`[bench] ${who}: ${values.length}/${MESSAGES * KINDS} received, p50 ${p50.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, max ${Math.max(...values).toFixed(1)} ms`);
      // Drag previews are volatile and may drop under backpressure; nearly all should arrive.
      expect(values.length).toBeGreaterThanOrEqual(MESSAGES * KINDS * 0.9);
      expect(p95).toBeLessThanOrEqual(TARGET_P95_MS);
    }
  }, 30_000);
});
