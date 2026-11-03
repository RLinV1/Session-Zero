import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("bounded movement knowledge (FR-GM-15/23)", () => {
  it("terminates for committed unsafe origins on both axes, even when intervals are skipped", () => {
    // A separate process is killed on timeout even if a synchronous traversal loop regresses.
    const shared = new URL("../src/index.ts", import.meta.url).href;
    const fixtures = new URL("./fixtures.ts", import.meta.url).href;
    const script = `
      import assert from "node:assert/strict";
      import { EphemeralPayload, movementFeedbackForViewer, movementRouteKnown } from ${JSON.stringify(shared)};
      import { baseRoom, withToken, alice, gm, run } from ${JSON.stringify(fixtures)};
      let state = run(baseRoom(), gm, { type: "scene.setMap", map: { url: "/map", width: 700, height: 700 } }).state;
      const made = withToken(state, { ownerIds: [alice.id] });
      state = made.state;
      for (const origin of [
        { x: -1e20, y: -1e20 }, { x: -1e20, y: 35 }, { x: 35, y: -1e20 },
        { x: 1e20, y: 1e20 }, { x: -Number.MAX_VALUE, y: -Number.MAX_VALUE },
        { x: 35, y: -70 * 20001 }, { x: -70 * 20001, y: 35 }
      ]) {
        const moved = run(state, alice, { type: "token.move", tokenId: made.token.id, to: origin }).state;
        assert.deepEqual(moved.tokens[made.token.id].position, origin);
        const request = EphemeralPayload.parse({ type: "tokenMovePreview", requestId: "bounded", tokenId: made.token.id, from: origin, to: { x: 35, y: 35 }, boardEpoch: moved.boardEpoch });
        assert.equal(movementFeedbackForViewer(moved, alice, request), "unknown");
        assert.equal(movementRouteKnown(moved, origin, request.to, 1), false);
        // Only the preview is uncertain: ordinary off-map movement remains permitted.
        assert.deepEqual(run(moved, alice, { type: "token.move", tokenId: made.token.id, to: request.to }).state.tokens[made.token.id].position, request.to);
      }
      assert.equal(movementRouteKnown(state, { x: 35, y: 35 }, { x: 245, y: 175 }, 1), true);
      console.log("bounded");
    `;
    expect(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { timeout: 4000, encoding: "utf8", killSignal: "SIGKILL" }).trim()).toBe("bounded");
  }, 6000);
});
