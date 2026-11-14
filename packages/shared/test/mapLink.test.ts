import { describe, expect, it } from "vitest";
import { Command, decide, emptyRoomState, filterEventForViewer, reduce, reduceCommitted, sceneState, type CommittedEvent, type Participant } from "../src";
import { alice, gm } from "./fixtures";

function room() {
  let state = emptyRoomState("room-1");
  let id = 0;
  const log: CommittedEvent[] = [];
  state.participants = { [gm.id]: gm, [alice.id]: alice };
  const attempt = (input: unknown, actor: Participant = gm) => decide(state, actor, Command.parse(input), { newId: () => `id-${++id}`, random: () => 0.5, lastSeq: log.length });
  const run = (input: unknown, actor: Participant = gm) => {
    const result = attempt(input, actor);
    if (!result.ok) throw new Error(result.message);
    for (const event of result.events) {
      const committed = { event, actorId: actor.id, seq: log.length + 1, at: "2026-11-13T12:00:00Z", commandId: `cmd-${log.length + 1}` };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
    return result.events;
  };
  return { get state() { return state; }, log, run, attempt };
}

const map = { url: "/uploads/cave.png", width: 700, height: 700 };

describe("scene.linkMap links the board's map to its library copy (FR-GM-17, ADR 0070)", () => {
  it("records the new link with the one it replaced, and changes nothing else", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    const before = r.state;
    const events = r.run({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-1" });
    expect(events).toEqual([{ type: "MapLinked", assetId: "asset-1", previous: null }]);
    expect(r.state.scene.map).toEqual({ ...map, assetId: "asset-1" });
    expect({ ...r.state, scene: before.scene, undo: before.undo }).toEqual(before);
    expect(r.run({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: "asset-1", assetId: "asset-2" })).toEqual([{ type: "MapLinked", assetId: "asset-2", previous: "asset-1" }]);
  });

  it("is deterministic on replay", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    const event = { type: "MapLinked", assetId: "asset-1", previous: null } as const;
    expect(reduce(r.state, event)).toEqual(reduce(r.state, event));
  });

  it("is the GM's alone", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    expect(r.attempt({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-1" }, alice)).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses when the link changed since the board was read, so two saves can't both link (ADR 0070)", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    r.run({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-1" });
    expect(r.attempt({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-2" })).toMatchObject({ ok: false });
  });

  it("refuses when the live scene changed since the board was read", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    expect(r.attempt({ type: "scene.linkMap", expectedSceneId: "other-scene", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-1" })).toMatchObject({ ok: false });
  });

  it("refuses when the map changed or there is none", () => {
    const r = room();
    expect(r.attempt({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-1" })).toMatchObject({ ok: false });
    r.run({ type: "scene.setMap", map });
    expect(r.attempt({ type: "scene.linkMap", expectedMapUrl: "/uploads/other.png", expectedAssetId: null, assetId: "asset-1" })).toMatchObject({ ok: false });
  });

  it("is not an undoable action", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    r.run({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-1" });
    expect(r.state.undo.at(-1)).toMatchObject({ undoable: false, events: [] });
  });

  it("links a scene being prepared privately, without touching the live board", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    r.run({ type: "scene.create", name: "Crypt", activate: false });
    const sceneId = Object.keys(r.state.savedScenes!)[0]!;
    const crypt = { url: "/uploads/crypt.png", width: 700, height: 700 };
    r.run({ type: "scene.prepare", sceneId, command: { type: "scene.setMap", map: crypt } });
    const events = r.run({ type: "scene.prepare", sceneId, command: { type: "scene.linkMap", expectedMapUrl: crypt.url, expectedAssetId: null, assetId: "asset-9" } });
    expect(events[0]?.type).toBe("ScenePrepared");
    expect(sceneState(r.state, sceneId)!.scene.map).toEqual({ ...crypt, assetId: "asset-9" });
    expect(r.state.scene.map).toEqual(map);
  });

  it("reaches players on the live board; a private scene's link stays redacted", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    const before = r.state;
    r.run({ type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-1" });
    expect(filterEventForViewer(r.log.at(-1)!, before, alice)).toMatchObject({ kind: "event" });
    r.run({ type: "scene.create", name: "Crypt", activate: false });
    const sceneId = Object.keys(r.state.savedScenes!)[0]!;
    r.run({ type: "scene.prepare", sceneId, command: { type: "scene.setMap", map } });
    const prepared = r.state;
    r.run({ type: "scene.prepare", sceneId, command: { type: "scene.linkMap", expectedMapUrl: map.url, expectedAssetId: null, assetId: "asset-2" } });
    expect(filterEventForViewer(r.log.at(-1)!, prepared, alice)).toMatchObject({ kind: "redacted" });
  });
});

describe("linking and undo (FR-REC-02, ADR 0070)", () => {
  it("counts a link as a change to the map, so the map change before it can no longer be undone", () => {
    const r = room();
    r.run({ type: "scene.setMap", map });
    r.run({ type: "scene.setMap", map: { url: "/uploads/crypt.png", width: 700, height: 700 } });
    const changed = r.log.at(-1)!.commandId!;
    r.run({ type: "scene.linkMap", expectedMapUrl: "/uploads/crypt.png", expectedAssetId: null, assetId: "asset-1" });
    expect(r.attempt({ type: "history.undo", commandId: changed })).toMatchObject({ ok: false, message: "Can't undo: the map has changed since." });
  });
});
