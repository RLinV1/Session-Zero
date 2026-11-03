import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { Command, decide, emptyRoomState, reduceAll } from "@vtt/shared";
import type { RoomConnection, RoomSnapshot } from "../src/net/roomConnection";
import { createScenePreparation } from "../src/net/scenePreparation";

function setup() {
  const you = { id: "gm", displayName: "GM", role: "gm" as const };
  let id = 0;
  const state = emptyRoomState("r");
  state.participants = { gm: you };
  const store = createStore<RoomSnapshot>(() => ({ status: "open", state, you, seq: 0, snapshots: 0, endReason: null, refusal: null }));
  const command = vi.fn(async (input) => {
    const before = store.getState();
    const decision = decide(before.state!, you, Command.parse(input), { newId: () => `id-${++id}` });
    if (!decision.ok) return decision;
    store.setState({ state: reduceAll(before.state!, decision.events), seq: before.seq + 1 });
    return { ok: true as const, seq: before.seq + 1 };
  });
  const live = { store, get snapshot() { return store.getState(); }, command, preview: vi.fn(), ephemeral: vi.fn() } as unknown as RoomConnection;
  const preparation = createScenePreparation(live);
  const stop = preparation.start();
  return { live, preparation, stop, command };
}

describe("private scene preparation connection", () => {
  it("creates and edits privately, suppresses previews, and only activates explicitly", async () => {
    const { live, preparation: p, stop, command } = setup();
    try {
      await p.connection.command({ type: "scene.create", name: "Cellar" });
      const sceneId = p.connection.snapshot.state!.activeSceneId!;
      expect(p.preparing).toBe(true);
      expect(live.snapshot.state!.activeSceneId).toBeUndefined();
      expect(command).toHaveBeenLastCalledWith({ type: "scene.create", name: "Cellar", activate: false });
      await p.connection.command({ type: "token.create", name: "Rat", position: { x: 35, y: 35 } });
      expect(Object.values(p.connection.snapshot.state!.tokens)[0]!.name).toBe("Rat");
      expect(live.snapshot.state!.tokens).toEqual({});
      p.connection.ephemeral({ type: "ping", at: { x: 35, y: 35 } });
      expect(live.ephemeral).not.toHaveBeenCalled();
      p.preview("initial");
      expect(p.preparing).toBe(false);
      p.preview(sceneId);
      await p.connection.command({ type: "scene.switch", sceneId });
      expect(p.preparing).toBe(false);
      expect(Object.values(live.snapshot.state!.tokens)[0]!.name).toBe("Rat");
    } finally { stop(); }
  });
  it("drops the private selection when that scene goes live and blocks endPreview while private (FR-GM-25)", async () => {
    const { live, preparation: p, stop } = setup();
    try {
      await p.connection.command({ type: "scene.create", name: "Cellar" });
      const sceneId = p.connection.snapshot.state!.activeSceneId!;
      const endPreview = vi.fn();
      (live as unknown as { endPreview: unknown }).endPreview = endPreview;
      p.connection.endPreview("k", null);
      expect(endPreview).not.toHaveBeenCalled();
      await live.command({ type: "scene.switch", sceneId });
      expect(p.preparing).toBe(false);
    } finally { stop(); }
  });
  it("rejects stale private writes if another tab activates or deletes the scene", async () => {
    const { live, preparation: p, stop } = setup();
    try {
      await p.connection.command({ type: "scene.create", name: "Cellar" });
      const sceneId = p.connection.snapshot.state!.activeSceneId!;
      const staleActivated = p.connection;
      await live.command({ type: "scene.switch", sceneId });
      expect(await staleActivated.command({ type: "token.create", name: "Stale", position: { x: 35, y: 35 } })).toMatchObject({ ok: false, code: "invalid" });
      expect(live.snapshot.state!.tokens).toEqual({});
      p.preview(sceneId);
      await p.connection.command({ type: "scene.create", name: "To delete" });
      const deletedId = p.connection.snapshot.state!.activeSceneId!;
      const staleEditor = p.connection;
      await live.command({ type: "scene.delete", sceneId: deletedId });
      expect(p.preparing).toBe(false);
      expect(p.connection.snapshot.state!.activeSceneId).toBe(sceneId);
      expect(await staleEditor.command({ type: "token.create", name: "Deleted scene edit", position: { x: 35, y: 35 } })).toMatchObject({ ok: false, code: "not_found" });
      expect(live.snapshot.state!.tokens).toEqual({});
    } finally { stop(); }
  });
  it("filters roll subscriptions while a private scene is shown (FR-GM-25)", async () => {
    const { live, preparation: p, stop } = setup();
    const rolled: ((roll: string) => void)[] = [];
    (live as unknown as { onRolled: unknown }).onRolled = (fn: (roll: string) => void) => { rolled.push(fn); return () => {}; };
    try {
      const heard = vi.fn();
      p.connection.onRolled(heard as never);
      rolled[0]!("live");
      expect(heard).toHaveBeenCalledTimes(1);
      await p.connection.command({ type: "scene.create", name: "Cellar" });
      expect(p.preparing).toBe(true);
      const privateHeard = vi.fn();
      p.connection.onRolled(privateHeard as never);
      rolled[1]!("private");
      expect(privateHeard).not.toHaveBeenCalled();
    } finally { stop(); }
  });
});
