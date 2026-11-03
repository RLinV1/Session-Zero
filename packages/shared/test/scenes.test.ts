import { describe, expect, it } from "vitest";
import { type DiceRoll, Command, decide, emptyRoomState, sceneState, filterEventForViewer, filterStateForViewer, reduceCommitted, replayTo, referencedAssetIds, tableOf, type CommittedEvent, type Participant } from "../src";
import { gm, alice } from "./fixtures";

function room() {
  let state = emptyRoomState("room-1");
  let id = 0;
  const log: CommittedEvent[] = [];
  state.participants = { [gm.id]: gm, [alice.id]: alice };
  const attempt = (input: unknown, actor: Participant = gm) => decide(state, actor, Command.parse(input), { newId: () => `scene-id-${++id}`, random: () => 0.5, lastSeq: log.length });
  const run = (input: unknown, actor: Participant = gm) => {
    const result = attempt(input, actor);
    if (!result.ok) throw new Error(result.message);
    for (const event of result.events) {
      const committed = { event, actorId: actor.id, seq: log.length + 1, at: "2026-11-01T12:00:00Z", commandId: `cmd-${log.length + 1}` };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
    return result.events;
  };
  return { get state() { return state; }, log, run, attempt };
}

describe("terrain across scenes (FR-TAC-03, FR-GM-25)", () => {
  it("keeps private terrain and revisions isolated, rejects stale saves, and restores each scene", () => {
    const r = room();
    const map = { url: "/same.png", width: 700, height: 700 };
    const context = () => ({ boardEpoch: r.state.boardEpoch ?? 0, revision: r.state.terrainRevision ?? 0 });
    r.run({ type: "scene.setMap", map });
    r.run({ type: "terrain.paint", layerId: "base", context: context(), paint: [{ row: 0, start: 0, end: 0, kind: "blocked" }] });
    r.run({ type: "terrain.effect.create", name: "Live secret", context: context() });
    const original = structuredClone(r.state.terrain);
    const liveContext = context();
    r.run({ type: "scene.create", name: "Private", activate: false });
    const sceneId = Object.keys(r.state.savedScenes!)[0]!;
    expect(sceneState(r.state, sceneId)!.terrain).toBeUndefined();
    r.run({ type: "scene.prepare", sceneId, command: { type: "scene.setMap", map, expectedSceneId: sceneId } });
    const projected = sceneState(r.state, sceneId)!;
    const privateContext = { boardEpoch: projected.boardEpoch!, revision: projected.terrainRevision! };
    const command = {
      type: "scene.savePreparation", expectedSceneId: sceneId, expectedMapUrl: map.url, context: privateContext,
      edits: [
        { type: "terrain.paint", layerId: "base", context: privateContext, paint: [{ row: 1, start: 1, end: 1, kind: "difficult" }] },
        { type: "scene.setIsometric", enabled: true },
      ],
    };
    r.run({ type: "scene.prepare", sceneId, command });
    expect(r.state.terrain).toEqual(original);
    expect(context()).toEqual(liveContext);
    expect(sceneState(r.state, sceneId)!.terrain?.base).toEqual([{ row: 1, start: 1, end: 1, kind: "difficult" }]);
    expect(r.attempt({ type: "scene.prepare", sceneId, command })).toMatchObject({ ok: false });
    const player = filterStateForViewer(r.state, alice);
    expect(player.savedScenes).toEqual({});
    expect(JSON.stringify(player)).not.toContain("Live secret");
    r.run({ type: "scene.switch", sceneId });
    expect(r.state.scene.isometric).toBe(true);
    expect(r.state.terrain?.base).toEqual([{ row: 1, start: 1, end: 1, kind: "difficult" }]);
    expect(context().boardEpoch).toBeGreaterThan(liveContext.boardEpoch);
    expect(r.attempt({ ...command, expectedSceneId: "initial", context: context() })).toMatchObject({ ok: false });
    r.run({ type: "scene.switch", sceneId: "initial" });
    expect(r.state.terrain).toEqual(original);
    expect(context().boardEpoch).toBeGreaterThan(liveContext.boardEpoch);
    const replayed = replayTo(r.state.roomId, r.log, r.log.length);
    expect(tableOf(replayed)).toEqual(tableOf(r.state));
    expect(replayed.savedScenes).toEqual(r.state.savedScenes);
    expect(replayed.boardEpoch).toBe(r.state.boardEpoch);
    expect(replayed.terrainRevision).toBe(r.state.terrainRevision);
  });

  it("clears absent terrain when activating a blank scene and invalidates drafts when copying the live board", () => {
    const r = room();
    r.run({ type: "scene.setMap", map: { url: "/live.png", width: 700, height: 700 } });
    r.run({ type: "terrain.paint", layerId: "base", context: { boardEpoch: 1, revision: 1 }, paint: [{ row: 0, start: 0, end: 0, kind: "blocked" }] });
    r.run({ type: "scene.create", name: "Blank", activate: false });
    const sceneId = Object.keys(r.state.savedScenes!)[0]!;
    const before = sceneState(r.state, sceneId)!;
    r.run({ type: "scene.copyCurrent", sceneId });
    const copy = sceneState(r.state, sceneId)!;
    expect(copy.terrain).toEqual(r.state.terrain);
    expect(copy.boardEpoch).toBeGreaterThan(before.boardEpoch!);
    expect(copy.terrainRevision).toBeGreaterThan(before.terrainRevision!);
    expect(r.attempt({ type: "scene.prepare", sceneId, command: { type: "terrain.paint", layerId: "base", context: { boardEpoch: before.boardEpoch!, revision: before.terrainRevision! }, paint: [{ row: 0, start: 0, end: 0, kind: null }] } })).toMatchObject({ ok: false });
    r.run({ type: "scene.create", name: "Normal" });
    expect(r.state.terrain).toBeUndefined();
    r.run({ type: "scene.switch", sceneId: "initial" });
    expect(r.state.terrain?.base).toEqual([{ row: 0, start: 0, end: 0, kind: "blocked" }]);
  });
});

describe("persistent scene switching", () => {
  it("copies the live map and progress into an independent private scene", () => {
    const r = room();
    r.run({ type: "scene.setMap", map: { url: "/live.png", width: 700, height: 700 } });
    r.run({ type: "token.create", name: "Guard", position: { x: 35, y: 35 }, stats: { hp: 3, maxHp: 10, ac: null } });
    const tokenId = Object.keys(r.state.tokens)[0]!;
    r.run({ type: "fog.add", region: { shape: "rect", from: { x: 500, y: 500 }, to: { x: 600, y: 600 } } });
    r.run({ type: "wall.add", walls: [{ a: { x: 500, y: 0 }, b: { x: 500, y: 70 } }] });
    r.run({ type: "group.create", name: "Guards" });
    r.run({ type: "group.assign", groupId: Object.keys(r.state.groups)[0]!, tokenIds: [tokenId] });
    r.run({ type: "initiative.start", entries: [{ tokenId, score: 12 }] });
    r.run({ type: "scene.create", name: "Copy", activate: false });
    const sceneId = Object.keys(r.state.savedScenes!)[0]!;
    const live = tableOf(r.state);
    const groups = r.state.groups;
    r.run({ type: "scene.copyCurrent", sceneId });
    expect(tableOf(r.state)).toEqual(live);
    expect(r.state.savedScenes![sceneId]!.table).toEqual(live);
    expect(r.state.savedScenes![sceneId]!.groups).toEqual(groups);
    expect(r.state.savedScenes![sceneId]!.tokenGroups).toEqual(r.state.tokenGroups);
    expect(filterEventForViewer(r.log.at(-1)!, r.state, alice).kind).toBe("redacted");
    expect(replayTo("room-1", r.log, r.log.length).savedScenes).toEqual(r.state.savedScenes);
    expect(r.attempt({ type: "scene.copyCurrent", sceneId }, alice)).toMatchObject({ ok: false, code: "forbidden" });
    expect(r.attempt({ type: "scene.copyCurrent", sceneId: "initial" })).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt({ type: "scene.copyCurrent", sceneId: "missing" })).toMatchObject({ ok: false, code: "not_found" });
    r.run({ type: "scene.prepare", sceneId, command: { type: "token.setStats", tokenId, stats: { hp: 1, maxHp: 10, ac: null } } });
    expect(r.state.tokens[tokenId]!.stats.hp).toBe(3);
    r.run({ type: "token.move", tokenId, to: { x: 105, y: 35 } });
    expect(r.state.savedScenes![sceneId]!.table.tokens[tokenId]!.position.x).toBe(35);
  });
  it("creates and validates private edits without changing the active board or leaking their events", () => {
    const r = room();
    r.run({ type: "scene.create", name: "Private cellar", activate: false });
    const sceneId = Object.keys(r.state.savedScenes!)[0]!;
    const live = tableOf(r.state);
    expect(r.attempt({ type: "scene.prepare", sceneId, command: { type: "chat.send", text: "Wrong scope" } })).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt({ type: "scene.prepare", sceneId, command: { type: "token.create", name: "Rat", position: { x: 35, y: 35 } } }, alice)).toMatchObject({ ok: false, code: "forbidden" });
    r.run({ type: "scene.prepare", sceneId, command: { type: "scene.setMap", map: { url: "/secret.png", width: 700, height: 700, assetId: "private-map" }, expectedSceneId: sceneId } });
    r.run({ type: "scene.prepare", sceneId, command: { type: "token.create", name: "Secret rat", position: { x: 35, y: 35 } } });
    expect(tableOf(r.state)).toEqual(live);
    expect(referencedAssetIds(r.state).has("private-map")).toBe(true);
    expect(replayTo("room-1", r.log, r.log.length).savedScenes).toEqual(r.state.savedScenes);
    for (const committed of r.log) expect(filterEventForViewer(committed, r.state, alice).kind).toBe("redacted");
    expect(filterStateForViewer(r.state, alice).savedScenes).toEqual({});
    expect(r.attempt({ type: "scene.prepare", sceneId, command: { type: "scene.setGrid", grid: r.state.scene.grid, expectedSceneId: "initial" } })).toMatchObject({ ok: false, code: "invalid" });
    r.run({ type: "scene.switch", sceneId });
    expect(Object.values(r.state.tokens)[0]!.name).toBe("Secret rat");
    expect(r.attempt({ type: "scene.prepare", sceneId, command: { type: "token.create", name: "Stale", position: { x: 35, y: 35 } } })).toMatchObject({ ok: false, code: "invalid" });
  });
  it("rejects a token move or portal toggle sent for another scene, but lets players move (FR-GM-25)", () => {
    const r = room();
    r.run({ type: "token.create", name: "Goblin", position: { x: 35, y: 35 }, ownerIds: [alice.id] });
    const tokenId = Object.keys(r.state.tokens)[0]!;
    expect(r.attempt({ type: "token.move", tokenId, to: { x: 105, y: 35 }, expectedSceneId: "initial" }, alice)).toMatchObject({ ok: true });
    expect(r.attempt({ type: "token.move", tokenId, to: { x: 105, y: 35 }, expectedSceneId: "elsewhere" }, alice)).toMatchObject({ ok: false, code: "invalid", message: "The scene changed. Refresh the board before moving." });
    expect(r.attempt({ type: "portal.setState", wallId: "w", state: "open", expectedSceneId: "elsewhere" }, alice)).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt({ type: "token.move", tokenId, to: { x: 105, y: 35 } }, alice)).toMatchObject({ ok: true });
  });
  it("keeps an open area effect on its original board until the GM closes it", () => {
    const r = room();
    r.run({ type: "scene.create", name: "Cellar" });
    r.run({ type: "token.create", name: "Goblin", position: { x: 35, y: 35 } });
    const tokenId = Object.keys(r.state.tokens)[0]!;
    r.run({ type: "areaEffect.start", tokenIds: [tokenId], expression: "1d20" });
    expect(r.attempt({ type: "scene.switch", sceneId: "initial" })).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt({ type: "scene.create", name: "Courtyard" })).toMatchObject({ ok: false, code: "invalid" });
    const filtered = filterStateForViewer(r.state, alice);
    expect(filtered.sceneNames).toEqual({});
    expect(filtered.savedScenes).toEqual({});
    expect(filtered.areaEffect?.targets[0]?.tokenId).toBe(tokenId);
    r.run({ type: "areaEffect.close", effectId: r.state.areaEffect!.id });
    r.run({ type: "scene.switch", sceneId: "initial" });
    expect(r.state.areaEffect).toBeNull();
  });
  it("refuses stale same-map editor commands after a scene switch", () => {
    const r = room();
    r.run({ type: "scene.create", name: "Cellar" });
    const grid = r.state.scene.grid;
    for (const input of [
      { type: "wall.clear", expectedSceneId: "initial" },
      { type: "scene.setLineOfSight", expectedSceneId: "initial", enabled: true },
      { type: "scene.setGrid", expectedSceneId: "initial", grid },
      { type: "scene.setMap", expectedSceneId: "initial", map: { url: "/a.png", width: 500, height: 500 } },
    ]) expect(r.attempt(input)).toMatchObject({ ok: false, code: "invalid" });
  });
  it("preserves each board, token identities, owners, stats, fog, groups and initiative", () => {
    const r = room();
    r.run({ type: "scene.setMap", map: { url: "/a.png", width: 1000, height: 800, assetId: "map-a" } });
    r.run({ type: "token.create", name: "Rogue", position: { x: 35, y: 35 }, ownerIds: [alice.id], stats: { hp: 3, maxHp: 10, ac: null } });
    const tokenId = Object.keys(r.state.tokens)[0]!;
    r.run({ type: "fog.add", region: { shape: "rect", from: { x: 600, y: 600 }, to: { x: 700, y: 700 } } });
    r.run({ type: "group.create", name: "Party" });
    r.run({ type: "group.assign", groupId: Object.keys(r.state.groups)[0]!, tokenIds: [tokenId] });
    r.run({ type: "initiative.start", entries: [{ tokenId, score: 12 }] });
    const first = tableOf(r.state);
    const groups = r.state.groups;
    const assignments = r.state.tokenGroups;
    r.run({ type: "scene.create", name: "Cellar" });
    const firstId = Object.keys(r.state.savedScenes!)[0]!;
    const cellarId = r.state.activeSceneId!;
    expect(r.state.tokens).toEqual({});
    expect(r.state.scene.map).toBeNull();
    expect(referencedAssetIds(r.state).has("map-a")).toBe(true);
    r.run({ type: "token.create", name: "Rat", position: { x: 35, y: 35 } });
    const cellar = tableOf(r.state);
    r.run({ type: "scene.switch", sceneId: firstId });
    expect(tableOf(r.state)).toEqual(first);
    expect(r.state.groups).toEqual(groups);
    expect(r.state.tokenGroups).toEqual(assignments);
    expect(r.state.tokens[tokenId]!.stats.hp).toBe(3);
    r.run({ type: "scene.switch", sceneId: cellarId });
    expect(tableOf(r.state)).toEqual(cellar);
    expect(r.state.undo.every((entry) => entry.events.every((e) => e.type === "RollRuled"))).toBe(true);
  });

  it("never sends inactive boards or scene names to players", () => {
    const r = room();
    r.run({ type: "token.create", name: "Secret monster", position: { x: 35, y: 35 }, hidden: true });
    const before = r.state;
    r.run({ type: "scene.create", name: "Secret cellar" });
    const filtered = filterStateForViewer(r.state, alice);
    expect(filtered.savedScenes).toEqual({});
    expect(filtered.sceneNames).toEqual({});
    expect(JSON.stringify(filtered)).not.toContain("Secret");
    const last = r.log.at(-1)!;
    expect(filterEventForViewer(last, before, alice).kind).toBe("resync");
  });

  it("rejects player scene management, duplicate names and deletion of the active scene", () => {
    const r = room();
    for (const input of [{ type: "scene.create", name: "Cellar" }, { type: "scene.switch", sceneId: "missing" }, { type: "scene.rename", sceneId: "missing", name: "New" }, { type: "scene.delete", sceneId: "missing" }]) {
      expect(r.attempt(input, alice)).toMatchObject({ ok: false, code: "forbidden" });
    }
    r.run({ type: "scene.create", name: "Cellar" });
    expect(r.attempt({ type: "scene.create", name: " cellar " })).toMatchObject({ ok: false });
    expect(r.attempt({ type: "scene.delete", sceneId: r.state.activeSceneId })).toMatchObject({ ok: false });
    expect(r.attempt({ type: "scene.switch", sceneId: "missing" })).toMatchObject({ ok: false });
    const inactive = Object.keys(r.state.savedScenes!)[0]!;
    r.run({ type: "scene.rename", sceneId: inactive, name: "Tavern" });
    expect(r.state.sceneNames![inactive]).toBe("Tavern");
    r.run({ type: "scene.delete", sceneId: inactive });
    expect(r.state.savedScenes![inactive]).toBeUndefined();
    expect(r.state.sceneNames![inactive]).toBeUndefined();
    expect(Command.safeParse({ type: "scene.create", name: "  " }).success).toBe(false);
  });

  it("caps scenes and rebuilds saved scenes from the event log", () => {
    const r = room();
    for (let n = 1; n < 20; n++) r.run({ type: "scene.create", name: `Room ${n}` });
    expect(r.attempt({ type: "scene.create", name: "Too many" })).toMatchObject({ ok: false });
    const replayed = replayTo("room-1", r.log, r.log.length);
    expect(replayed.activeSceneId).toBe(r.state.activeSceneId);
    expect(replayed.savedScenes).toEqual(r.state.savedScenes);
    expect(replayed.sceneNames).toEqual(r.state.sceneNames);
  });

describe("scene ids and rolls (FR-GM-25)", () => {
  it.each(["__proto__", "constructor", "toString"])("treats %s as a missing scene", (sceneId) => {
    const r = room();
    for (const command of [{ type: "scene.switch", sceneId }, { type: "scene.copyCurrent", sceneId }, { type: "scene.delete", sceneId }, { type: "scene.rename", sceneId, name: "X" },
      { type: "scene.prepare", sceneId, command: { type: "token.create", name: "A", position: { x: 35, y: 35 } } }]) {
      expect(r.attempt(command), command.type).toMatchObject({ ok: false, code: "not_found" });
    }
    expect(sceneState(r.state, sceneId)).toBeNull();
  });
  it("applies damage only in the scene the roll was made in", () => {
    const r = room();
    r.run({ type: "token.create", name: "Guard", position: { x: 35, y: 35 }, stats: { hp: 10, maxHp: 10, ac: null } });
    r.run({ type: "token.create", name: "Rogue", position: { x: 105, y: 35 } });
    const [target, attacker] = Object.keys(r.state.tokens) as [string, string];
    r.run({ type: "dice.roll", expression: "1d4", visibility: "public", attack: { kind: "damage", actorTokenId: attacker, targetTokenId: target } });
    const roll = r.state.rolls.at(-1)! as DiceRoll;
    expect(roll.sceneId).toBe("initial");
    r.run({ type: "scene.create", name: "Copy", activate: false });
    const sceneId = Object.keys(r.state.savedScenes!)[0]!;
    r.run({ type: "scene.copyCurrent", sceneId });
    r.run({ type: "scene.switch", sceneId });
    expect(r.attempt({ type: "roll.applyDamage", rollId: roll.id })).toMatchObject({ ok: false, code: "invalid" });
    r.run({ type: "scene.switch", sceneId: "initial" });
    expect(r.attempt({ type: "roll.applyDamage", rollId: roll.id })).toMatchObject({ ok: true });
  });
});
});
