import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReplayBar } from "../src/ui/ReplayBar";
import { playFrom, playTick, stepLabel, stepTo } from "../src/ui/replaySteps";
import { replayConnection } from "../src/net/previewConnection";
import type { RoomConnection } from "../src/net/roomConnection";

describe("replay steps (FR-PL-07)", () => {
  it("steps forward and back inside the replay", () => {
    expect(stepTo(0, 1, 3)).toBe(1);
    expect(stepTo(2, 1, 3)).toBe(3);
    expect(stepTo(3, 1, 3)).toBe(3);
    expect(stepTo(1, -1, 3)).toBe(0);
    expect(stepTo(0, -1, 3)).toBe(0);
  });

  it("plays to the last step, then stops", () => {
    let state = { index: 0, playing: true };
    const seen: number[] = [];
    while (state.playing) {
      state = playTick(state.index, 3);
      seen.push(state.index);
    }
    expect(seen).toEqual([1, 2, 3]);
    expect(state).toEqual({ index: 3, playing: false });
  });

  it("starts again from the point when play is pressed at the end", () => {
    expect(playFrom(3, 3)).toBe(0);
    expect(playFrom(1, 3)).toBe(1);
  });

  it("labels the position", () => {
    expect(stepLabel(0, 12)).toBe("Start · 12 changes");
    expect(stepLabel(0, 1)).toBe("Start · 1 change");
    expect(stepLabel(4, 12)).toBe("Step 4 of 12");
  });
});

describe("the replay bar (FR-PL-07)", () => {
  const html = renderToStaticMarkup(<ReplayBar roomId="r1" token="t" onShow={() => {}} onExit={() => {}} />);

  it("offers a point picker, step controls, a slider and a way back", () => {
    expect(html).toContain("Replay from");
    expect(html).toContain('aria-label="Back one step"');
    expect(html).toContain('aria-label="Forward one step"');
    expect(html).toContain('aria-label="Replay position"');
    expect(html).toContain("Back to the live table");
  });

  it("says nothing reaches the table, in a polite live region", () => {
    expect(html).toContain("Nothing you do here reaches the table");
    expect(html).toContain('aria-live="polite"');
  });
});

describe("the replay connection (FR-PL-07)", () => {
  it("refuses every command and drops ephemeral messages", async () => {
    const sent: unknown[] = [];
    const real = {
      command: async (c: unknown) => { sent.push(c); return { ok: true, seq: 1 }; },
      ephemeral: (p: unknown) => sent.push(p),
      preview: (p: unknown) => sent.push(p),
      endPreview: (p: unknown) => sent.push(p),
    } as unknown as RoomConnection;
    const guarded = replayConnection(real);
    const result = await guarded.command({ type: "chat.send", text: "hi" });
    expect(result).toMatchObject({ ok: false, code: "forbidden", message: expect.stringContaining("replay") });
    guarded.ephemeral({ type: "ping", at: { x: 0, y: 0 } } as never);
    expect(sent).toEqual([]);
  });
});
