import { describe, expect, it } from "vitest";
import { Command, formatActivity, reduce, Scene, DEFAULT_GRID } from "../src";
import { alice, attempt, baseRoom, gm, run } from "./fixtures";

const ON = { type: "scene.setIsometric", enabled: true } as const;

describe("2.5D map style (FR-GM-19)", () => {
  it("defaults to flat for scenes from before the field existed", () => {
    expect(Scene.parse({ map: null, grid: DEFAULT_GRID }).isometric).toBeUndefined();
    expect(run(baseRoom(), gm, ON).events[0]).toMatchObject({ from: false });
  });

  it("lets the GM set it, recording the replaced value", () => {
    const { state, events } = run(baseRoom(), gm, ON);
    expect(events).toEqual([{ type: "IsometricSet", from: false, to: true }]);
    expect(state.scene.isometric).toBe(true);
    expect(reduce(state, { type: "IsometricSet", from: true, to: false }, { commandId: "c", actorId: gm.id }).scene.isometric).toBe(false);
  });

  it("forbids players and rejects a no-op", () => {
    expect(attempt(baseRoom(), alice, ON)).toMatchObject({ ok: false, code: "forbidden" });
    expect(attempt(baseRoom(), gm, { type: "scene.setIsometric", enabled: false })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("rejects a forged payload", () => {
    expect(Command.safeParse({ type: "scene.setIsometric", enabled: "yes" }).success).toBe(false);
    expect(Command.safeParse({ ...ON, extra: 1 }).success).toBe(false);
  });

  it("writes the activity line", () => {
    expect(formatActivity({ type: "IsometricSet", from: false, to: true }, "Mara", baseRoom())).toBe("Mara set the map style to 2.5D isometric");
  });
});
