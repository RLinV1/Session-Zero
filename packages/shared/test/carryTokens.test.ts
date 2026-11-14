import { describe, expect, it } from "vitest";
import {
  Command,
  DEFAULT_GRID,
  TableState,
  decide,
  emptyRoomState,
  filterEventForViewer,
  filterStateForViewer,
  footprintsOverlap,
  referencedAssetIds,
  snapTokenCenter,
  reduceCommitted,
  replayTo,
  saveScene,
  sceneState,
  tableOf,
  undoableAction,
  type CommandInput,
  type CommittedEvent,
  type DomainEvent,
  type Participant,
  type ResolvedEncounter,
  type RoomState,
  type Token,
} from "../src";
import { alice, bob, gm } from "./fixtures";

const ENCOUNTER: ResolvedEncounter = {
  id: "tpl-1",
  name: "Goblin ambush",
  scene: { map: { url: "/uploads/cave.png", width: 700, height: 700, assetId: "asset-cave" }, grid: DEFAULT_GRID },
  tokens: [
    { name: "Goblin", position: { x: 385, y: 385 }, size: 1, rotation: 0, color: "#22aa44", imageUrl: null, hidden: false, stats: { hp: 7, maxHp: 7, ac: 15 }, conditions: [] },
  ],
  fog: [],
};

/** A room as the server runs it: `encounter.apply` resolves from a one-template shelf. */
function room() {
  let n = 0;
  const log: CommittedEvent[] = [];
  let state: RoomState = emptyRoomState("room-1");
  const commit = (events: DomainEvent[], actorId: string | null) => {
    const commandId = `cmd-${log.length + 1}`;
    for (const event of events) {
      const committed: CommittedEvent = { seq: log.length + 1, at: "2026-11-13T12:00:00.000Z", actorId, commandId, event };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
    return commandId;
  };
  commit([{ type: "RoomCreated", name: "Keep" }, ...[gm, alice, bob].map((p) => ({ type: "ParticipantJoined" as const, participant: p }))], null);
  const attempt = (actor: Participant, input: CommandInput) =>
    decide(state, actor, Command.parse(input), {
      newId: () => `id-${++n}`,
      random: () => 0.5,
      encounterTemplate: (id) => (id === ENCOUNTER.id ? ENCOUNTER : null),
    });
  return {
    get state() { return state; },
    log,
    attempt,
    run(actor: Participant, input: CommandInput) {
      const decision = attempt(actor, input);
      if (!decision.ok) throw new Error(`${decision.code}: ${decision.message}`);
      return commit(decision.events, actor.id);
    },
  };
}

const named = (tokens: Record<string, Token>, name: string) => Object.values(tokens).find((t) => t.name === name);
const cell = (col: number, row: number) => ({ x: col * 70 + 35, y: row * 70 + 35 });

/** A tavern with Aria (Alice's), Borin (Bob's) and an ownerless barkeep, and an empty Crypt scene. */
function party() {
  const r = room();
  r.run(gm, { type: "scene.setMap", map: { url: "/uploads/tavern.png", width: 700, height: 700 } });
  r.run(gm, { type: "token.create", name: "Aria", position: cell(1, 1), ownerIds: [alice.id] });
  r.run(gm, { type: "token.create", name: "Borin", position: cell(2, 1), ownerIds: [bob.id] });
  r.run(gm, { type: "token.create", name: "Barkeep", position: cell(5, 5) });
  const aria = named(r.state.tokens, "Aria")!;
  const borin = named(r.state.tokens, "Borin")!;
  const barkeep = named(r.state.tokens, "Barkeep")!;
  r.run(gm, { type: "scene.create", name: "Crypt", activate: false });
  const tavernId = r.state.activeSceneId ?? "initial";
  const cryptId = Object.keys(r.state.savedScenes!).find((id) => id !== tavernId)!;
  r.run(gm, { type: "scene.prepare", sceneId: cryptId, command: { type: "scene.setMap", map: { url: "/uploads/crypt.png", width: 700, height: 700 }, expectedSceneId: cryptId } });
  return { r, aria, borin, barkeep, tavernId, cryptId };
}

describe("TableState staging area (ADR 0068)", () => {
  it("old tables parse with nothing staged, and tableOf leaves an empty one out", () => {
    const table = tableOf(emptyRoomState("r"));
    expect(table.staged).toBeUndefined();
    expect(TableState.parse({ ...table }).staged).toBeUndefined();
  });

  it("round-trips staged tokens through tableOf, saveScene and sceneState", () => {
    const { r, aria, cryptId } = party();
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    expect(tableOf(r.state).staged?.[aria.id]?.name).toBe("Aria");
    expect(TableState.parse(tableOf(r.state)).staged?.[aria.id]?.name).toBe("Aria");
    const saved = saveScene(r.state);
    expect(saved.table.staged?.[aria.id]).toEqual(aria);
    expect(sceneState({ ...r.state, activeSceneId: "other", savedScenes: { ...r.state.savedScenes, s: saved } }, "s")!.staged[aria.id]).toEqual(aria);
  });
});

describe("Carry tokens across a scene switch (FR-GM-25, ADR 0068)", () => {
  it("moves the chosen tokens, unchanged, into the next scene's staging area", () => {
    const { r, aria, borin, barkeep, tavernId, cryptId } = party();
    r.run(gm, { type: "token.setStats", tokenId: aria.id, stats: { hp: 7, maxHp: 18, ac: 14 } });
    r.run(gm, { type: "token.setConditions", tokenId: aria.id, conditions: ["poisoned"] });
    const before = r.state.tokens[aria.id]!;
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id, borin.id] });

    expect(r.state.activeSceneId).toBe(cryptId);
    expect(r.state.tokens).toEqual({});
    expect(r.state.staged[aria.id]).toEqual(before);
    expect(r.state.staged[borin.id]!.ownerIds).toEqual([bob.id]);
    // Gone from the tavern; the barkeep stayed.
    const tavern = r.state.savedScenes![tavernId]!.table;
    expect(Object.keys(tavern.tokens)).toEqual([barkeep.id]);
    expect(tavern.staged).toBeUndefined();
  });

  it("leaves unticked tokens behind", () => {
    const { r, aria, borin, tavernId, cryptId } = party();
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    expect(Object.keys(r.state.staged)).toEqual([aria.id]);
    expect(r.state.savedScenes![tavernId]!.table.tokens[borin.id]).toBeDefined();
  });

  it("takes carried tokens out of the outgoing turn order, keeping the turn on the same token", () => {
    const { r, aria, borin, barkeep, tavernId, cryptId } = party();
    r.run(gm, { type: "initiative.start", entries: [{ tokenId: aria.id, score: 20 }, { tokenId: barkeep.id, score: 15 }, { tokenId: borin.id, score: 10 }] });
    r.run(gm, { type: "initiative.advance" });
    expect(r.state.initiative!.order[r.state.initiative!.activeIndex]).toBe(barkeep.id);
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id, borin.id] });
    const order = r.state.savedScenes![tavernId]!.table.initiative!;
    expect(order.order).toEqual([barkeep.id]);
    expect(order.order[order.activeIndex]).toBe(barkeep.id);
  });

  it("passes the turn to the next token when the active one is carried, and ends an emptied order", () => {
    const { r, aria, borin, barkeep, tavernId, cryptId } = party();
    r.run(gm, { type: "initiative.start", entries: [{ tokenId: aria.id, score: 20 }, { tokenId: barkeep.id, score: 15 }, { tokenId: borin.id, score: 10 }] });
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    const order = r.state.savedScenes![tavernId]!.table.initiative!;
    expect(order.order[order.activeIndex]).toBe(barkeep.id);

    const p = party();
    p.r.run(gm, { type: "initiative.start", entries: [{ tokenId: p.aria.id, score: 20 }] });
    p.r.run(gm, { type: "scene.switch", sceneId: p.cryptId, carryTokenIds: [p.aria.id] });
    expect(p.r.state.savedScenes![p.tavernId]!.table.initiative).toBeNull();
  });

  it("starts the next round when the active token was last in the order and is carried", () => {
    const { r, aria, barkeep, tavernId, cryptId } = party();
    r.run(gm, { type: "initiative.start", entries: [{ tokenId: barkeep.id, score: 20 }, { tokenId: aria.id, score: 10 }] });
    r.run(gm, { type: "initiative.advance" });
    const round = r.state.initiative!.round;
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    expect(r.state.savedScenes![tavernId]!.table.initiative).toMatchObject({ order: [barkeep.id], activeIndex: 0, round: round + 1 });
  });

  it("records the turn order the carry changed, and the destination tokens it replaced (invariant 6)", () => {
    const { r, aria, barkeep, cryptId } = party();
    r.run(gm, { type: "initiative.start", entries: [{ tokenId: aria.id, score: 20 }, { tokenId: barkeep.id, score: 10 }] });
    const order = r.state.initiative;
    r.run(gm, { type: "scene.copyCurrent", sceneId: cryptId });
    const copy = r.state.savedScenes![cryptId]!.table.tokens[aria.id]!;
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    const event = r.log.at(-1)!.event;
    expect(event).toMatchObject({ type: "SceneSwitched", carriedTokenIds: [aria.id], replacedTokens: [copy], previousInitiative: order });
  });

  it("leaves both out when the carry overwrote nothing", () => {
    const { r, aria, cryptId } = party();
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    const event = r.log.at(-1)!.event;
    expect(event).not.toHaveProperty("replacedTokens");
    expect(event).not.toHaveProperty("previousInitiative");
  });

  it("counts a staged token's library art as in use, here and in saved scenes (ADR 0004)", () => {
    const { r, cryptId } = party();
    r.run(gm, { type: "token.create", name: "Imp", position: cell(4, 4), ownerIds: [alice.id], imageUrl: "/uploads/imp.png", assetId: "asset-imp" });
    const imp = named(r.state.tokens, "Imp")!;
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [imp.id] });
    expect(referencedAssetIds(r.state).has("asset-imp")).toBe(true);
    r.run(gm, { type: "scene.create", name: "Vault", activate: false });
    const vaultId = Object.keys(r.state.savedScenes!).find((id) => r.state.sceneNames![id] === "Vault")!;
    r.run(gm, { type: "scene.switch", sceneId: vaultId });
    expect(r.state.savedScenes![cryptId]!.table.staged?.[imp.id]).toBeDefined();
    expect(referencedAssetIds(r.state).has("asset-imp")).toBe(true);
  });

  it("drops carried tokens from the outgoing scene's groups", () => {
    const { r, aria, tavernId, cryptId } = party();
    r.run(gm, { type: "group.create", name: "Party" });
    const groupId = Object.keys(r.state.groups)[0]!;
    r.run(gm, { type: "group.assign", groupId, tokenIds: [aria.id] });
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    expect(r.state.savedScenes![tavernId]!.tokenGroups[aria.id]).toBeUndefined();
  });

  it("replaces a same-id copy in the destination (scene.copyCurrent copies ids)", () => {
    const { r, aria, cryptId } = party();
    r.run(gm, { type: "scene.copyCurrent", sceneId: cryptId });
    r.run(gm, { type: "token.setStats", tokenId: aria.id, stats: { hp: 3, maxHp: 18, ac: 14 } });
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    expect(r.state.tokens[aria.id]).toBeUndefined();
    expect(r.state.staged[aria.id]!.stats.hp).toBe(3);
    expect(Object.values({ ...r.state.tokens, ...r.state.staged }).filter((t) => t.name === "Aria")).toHaveLength(1);
  });

  it("carries staged tokens again on the next switch", () => {
    const { r, aria, cryptId } = party();
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    r.run(gm, { type: "scene.create", name: "Vault", activate: false });
    const vaultId = Object.keys(r.state.savedScenes!).find((id) => r.state.sceneNames![id] === "Vault")!;
    r.run(gm, { type: "scene.switch", sceneId: vaultId, carryTokenIds: [aria.id] });
    expect(r.state.staged[aria.id]).toBeDefined();
    expect(r.state.savedScenes![cryptId]!.table.staged).toBeUndefined();
  });

  it("rejects a forged id and a player's carry, changing nothing", () => {
    const { r, cryptId } = party();
    const before = r.state;
    expect(r.attempt(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: ["nope"] }))
      .toMatchObject({ ok: false, code: "invalid", message: "A token to carry isn't on this board." });
    expect(r.attempt(alice, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [Object.keys(r.state.tokens)[0]!] }))
      .toMatchObject({ ok: false, code: "forbidden" });
    expect(r.state).toBe(before);
  });

  it("rejects duplicate ids at the schema", () => {
    expect(Command.safeParse({ type: "scene.switch", sceneId: "s", carryTokenIds: ["a", "a"] }).success).toBe(false);
    expect(Command.safeParse({ type: "scene.switch", sceneId: "s", carryTokenIds: Array.from({ length: 61 }, (_, i) => `t${i}`) }).success).toBe(false);
  });

  it("replays to the same state", () => {
    const { r, aria, cryptId } = party();
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    const replayed = replayTo("room-1", r.log, r.log.length);
    expect(replayed.staged).toEqual(r.state.staged);
  });
});

describe("Carry tokens into an encounter template (FR-GM-13, ADR 0068)", () => {
  it("stages the carried tokens beside the template's tokens", () => {
    const { r, aria, borin } = party();
    r.run(gm, { type: "encounter.apply", templateId: ENCOUNTER.id, carryTokenIds: [aria.id, borin.id] });
    expect(Object.values(r.state.tokens).map((t) => t.name)).toEqual(["Goblin"]);
    expect(r.state.staged[aria.id]).toEqual(aria);
    expect(r.state.staged[borin.id]!.ownerIds).toEqual([bob.id]);
  });

  it("carries with keepMapSetup on the template's own map", () => {
    const r = room();
    r.run(gm, { type: "scene.setMap", map: ENCOUNTER.scene.map! });
    r.run(gm, { type: "token.create", name: "Aria", position: cell(1, 1), ownerIds: [alice.id] });
    const aria = named(r.state.tokens, "Aria")!;
    r.run(gm, { type: "encounter.apply", templateId: ENCOUNTER.id, keepMapSetup: true, carryTokenIds: [aria.id] });
    expect(r.state.staged[aria.id]).toEqual(aria);
  });

  it("undoes the apply exactly, carried tokens back where they were", () => {
    const { r, aria } = party();
    const before = tableOf(r.state);
    const commandId = r.run(gm, { type: "encounter.apply", templateId: ENCOUNTER.id, carryTokenIds: [aria.id] });
    r.run(gm, { type: "history.undo", commandId });
    expect(tableOf(r.state)).toEqual(before);
    expect(r.state.staged).toEqual({});
  });

  it("refuses to carry from inside a private scene preparation", () => {
    const { r, aria, cryptId } = party();
    expect(r.attempt(gm, { type: "scene.prepare", sceneId: cryptId, command: { type: "encounter.apply", templateId: ENCOUNTER.id, carryTokenIds: [aria.id] } }))
      .toMatchObject({ ok: false, code: "invalid", message: "Tokens can only be carried onto the live board." });
  });
});

describe("Staged tokens are off the map (ADR 0068)", () => {
  function staged() {
    const p = party();
    p.r.run(gm, { type: "scene.switch", sceneId: p.cryptId, carryTokenIds: [p.aria.id, p.borin.id] });
    return p;
  }

  it("cannot be moved, targeted or attacked", () => {
    const { r, aria, borin } = staged();
    expect(r.attempt(alice, { type: "token.move", tokenId: aria.id, to: cell(3, 3) })).toMatchObject({ ok: false, code: "not_found" });
    expect(r.attempt(gm, { type: "token.move", tokenId: aria.id, to: cell(3, 3) })).toMatchObject({ ok: false, code: "not_found" });
    expect(r.attempt(alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: aria.id, targetTokenId: borin.id } })).toMatchObject({ ok: false });
    expect(r.attempt(gm, { type: "initiative.start", entries: [{ tokenId: aria.id, score: 10 }] })).toMatchObject({ ok: false });
  });

  it("gives no sight: a player whose only token is staged sees nothing through it", () => {
    const { r } = staged();
    r.run(gm, { type: "scene.setLineOfSight", enabled: true });
    const view = filterStateForViewer(r.state, alice);
    expect(view.tokens).toEqual({});
    expect(view.sight ?? []).toEqual([]);
  });

  it("shows a player only their own visible staged tokens", () => {
    const { r, aria, borin } = staged();
    expect(Object.keys(filterStateForViewer(r.state, alice).staged)).toEqual([aria.id]);
    expect(Object.keys(filterStateForViewer(r.state, bob).staged)).toEqual([borin.id]);
    expect(Object.keys(filterStateForViewer(r.state, gm).staged).sort()).toEqual([aria.id, borin.id].sort());
  });

  it("withholds a hidden staged token, even from its owner", () => {
    const p = party();
    p.r.run(gm, { type: "token.setHidden", tokenId: p.aria.id, hidden: true });
    p.r.run(gm, { type: "scene.switch", sceneId: p.cryptId, carryTokenIds: [p.aria.id, p.barkeep.id] });
    expect(filterStateForViewer(p.r.state, alice).staged).toEqual({});
    expect(filterStateForViewer(p.r.state, bob).staged).toEqual({});
  });

  it("keeps staged tokens of inactive scenes out of players' snapshots", () => {
    const { r, aria, tavernId } = staged();
    r.run(gm, { type: "scene.switch", sceneId: tavernId });
    expect(r.state.savedScenes![Object.keys(r.state.savedScenes!)[0]!]).toBeDefined();
    const view = filterStateForViewer(r.state, alice);
    expect(view.staged).toEqual({});
    expect(JSON.stringify(view)).not.toContain(aria.id);
  });
});

describe("Place staged tokens with one click (ADR 0068)", () => {
  function staged(ids?: (p: ReturnType<typeof party>) => string[]) {
    const p = party();
    p.r.run(gm, { type: "scene.switch", sceneId: p.cryptId, carryTokenIds: ids ? ids(p) : [p.aria.id, p.borin.id] });
    return p;
  }

  it("puts the first on the clicked square and the next on a neighbouring free one", () => {
    const { r, aria, borin } = staged();
    r.run(gm, { type: "token.placeStaged", origin: { x: 250, y: 250 } });
    expect(r.state.staged).toEqual({});
    expect(r.state.tokens[aria.id]!.position).toEqual(cell(3, 3));
    const b = r.state.tokens[borin.id]!.position;
    expect(Math.max(Math.abs(b.x - cell(3, 3).x), Math.abs(b.y - cell(3, 3).y))).toBe(70);
    expect(r.state.tokens[aria.id]!.ownerIds).toEqual([alice.id]);
  });

  it("keeps the group together on a fractional grid (70.3 px squares), with no gap around the first", () => {
    const { r, aria, borin } = staged();
    const grid = { ...DEFAULT_GRID, cellSize: 70.3, offsetX: 54, offsetY: 43 };
    r.run(gm, { type: "scene.setMap", map: { url: "/uploads/keep.png", width: 2000, height: 2000 }, grid });
    // The click that left a one-square ring empty before footprints allowed for float rounding.
    r.run(gm, { type: "token.placeStaged", origin: { x: 1000, y: 1000 } });
    const a = r.state.tokens[aria.id]!.position, b = r.state.tokens[borin.id]!.position;
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeCloseTo(70.3, 6);
  });

  it("places only the named tokens, leaving the rest staged", () => {
    const { r, aria, borin } = staged();
    r.run(gm, { type: "token.placeStaged", origin: cell(1, 1), tokenIds: [borin.id] });
    expect(r.state.tokens[borin.id]!.position).toEqual(cell(1, 1));
    expect(Object.keys(r.state.staged)).toEqual([aria.id]);
    r.run(gm, { type: "token.placeStaged", origin: cell(8, 8), tokenIds: [aria.id] });
    expect(r.state.tokens[aria.id]!.position).toEqual(cell(8, 8));
    expect(r.state.staged).toEqual({});
  });

  it("never overlaps another token or crosses a wall", () => {
    const { r, aria, borin } = staged();
    // A ghoul beside the click, and a wall through the middle of column 4: no square there is legal.
    r.run(gm, { type: "token.create", name: "Ghoul", position: cell(2, 3) });
    r.run(gm, { type: "wall.add", walls: [{ a: { x: 315, y: 0 }, b: { x: 315, y: 700 } }] });
    r.run(gm, { type: "token.placeStaged", origin: cell(3, 3) });
    const ghoul = named(r.state.tokens, "Ghoul")!;
    for (const id of [aria.id, borin.id]) {
      const token = r.state.tokens[id]!;
      expect(footprintsOverlap(token, ghoul, DEFAULT_GRID)).toBe(false);
      expect(token.position.x).not.toBe(cell(4, 0).x);
    }
  });

  it("gives a large token a whole free footprint, placed first", () => {
    const p = party();
    p.r.run(gm, { type: "token.create", name: "Ogre", position: { x: 140, y: 560 }, size: 2, ownerIds: [bob.id] });
    const ogre = named(p.r.state.tokens, "Ogre")!;
    p.r.run(gm, { type: "scene.switch", sceneId: p.cryptId, carryTokenIds: [p.aria.id, ogre.id, p.borin.id] });
    p.r.run(gm, { type: "token.placeStaged", origin: cell(4, 4) });
    const placed = Object.values(p.r.state.tokens);
    expect(placed).toHaveLength(3);
    // The ogre goes on the click, as a 2x2 token snaps there.
    expect(p.r.state.tokens[ogre.id]!.position).toEqual(snapTokenCenter(cell(4, 4), 2, DEFAULT_GRID));
    for (const a of placed) {
      for (const b of placed) if (a !== b) expect(footprintsOverlap(a, b, DEFAULT_GRID)).toBe(false);
    }
  });

  it("refuses with Not enough space on an occupied square, off the map, or when the party can't fit", () => {
    const { r } = staged();
    r.run(gm, { type: "token.create", name: "Ghoul", position: cell(3, 3) });
    const before = r.state;
    expect(r.attempt(gm, { type: "token.placeStaged", origin: cell(3, 3) })).toMatchObject({ ok: false, code: "invalid", message: "Not enough space" });
    expect(r.attempt(gm, { type: "token.placeStaged", origin: { x: 900, y: 900 } })).toMatchObject({ ok: false, message: "Not enough space" });
    // A 1x1 room: the first fits, the second can't.
    r.run(gm, { type: "scene.setMap", map: { url: "/uploads/closet.png", width: 70, height: 70 } });
    expect(r.attempt(gm, { type: "token.placeStaged", origin: cell(0, 0) })).toMatchObject({ ok: false, message: "Not enough space" });
    expect(before.staged).toEqual(r.state.staged);
  });

  it("counts only the tokens being placed toward space", () => {
    const { r, aria } = staged();
    r.run(gm, { type: "scene.setMap", map: { url: "/uploads/closet.png", width: 70, height: 70 } });
    r.run(gm, { type: "token.placeStaged", origin: cell(0, 0), tokenIds: [aria.id] });
    expect(r.state.tokens[aria.id]!.position).toEqual(cell(0, 0));
  });

  it("rejects ids that are not staged, a player, and an empty staging area", () => {
    const { r, aria } = staged();
    r.run(gm, { type: "token.create", name: "Ghoul", position: cell(8, 8) });
    const ghoul = named(r.state.tokens, "Ghoul")!;
    expect(r.attempt(gm, { type: "token.placeStaged", origin: cell(1, 1), tokenIds: [ghoul.id] })).toMatchObject({ ok: false, message: "That token isn't waiting to be placed." });
    expect(r.attempt(gm, { type: "token.placeStaged", origin: cell(1, 1), tokenIds: ["nope"] })).toMatchObject({ ok: false, message: "That token isn't waiting to be placed." });
    expect(r.attempt(alice, { type: "token.placeStaged", origin: cell(1, 1), tokenIds: [aria.id] })).toMatchObject({ ok: false, code: "forbidden" });
    r.run(gm, { type: "token.placeStaged", origin: cell(1, 1) });
    expect(r.attempt(gm, { type: "token.placeStaged", origin: cell(5, 5) })).toMatchObject({ ok: false, message: "No tokens are waiting to be placed." });
  });

  it("rejects a placement aimed at a scene that is no longer live", () => {
    const { r, tavernId, cryptId } = staged();
    expect(r.attempt(gm, { type: "token.placeStaged", origin: cell(1, 1), expectedSceneId: tavernId })).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt(gm, { type: "token.placeStaged", origin: cell(1, 1), expectedSceneId: cryptId })).toMatchObject({ ok: true });
  });

  it("is undoable, putting the tokens back to wait", () => {
    const { r, aria, borin } = staged();
    const commandId = r.run(gm, { type: "token.placeStaged", origin: cell(3, 3) });
    expect(undoableAction(r.state.undo, commandId)).toBeDefined();
    r.run(gm, { type: "history.undo", commandId });
    expect(Object.keys(r.state.staged).sort()).toEqual([aria.id, borin.id].sort());
    expect(r.state.tokens).toEqual({});
    expect(r.state.staged[aria.id]!.position).toEqual(aria.position);
  });

  it("refuses to undo a placement after a placed token moved", () => {
    const { r, aria } = staged();
    const commandId = r.run(gm, { type: "token.placeStaged", origin: cell(3, 3) });
    r.run(gm, { type: "token.move", tokenId: aria.id, to: cell(6, 6) });
    expect(r.attempt(gm, { type: "history.undo", commandId })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses to undo a placement once a placed token is in the turn order", () => {
    const { r, aria } = staged();
    const commandId = r.run(gm, { type: "token.placeStaged", origin: cell(3, 3) });
    r.run(gm, { type: "initiative.start", entries: [{ tokenId: aria.id, score: 12 }] });
    expect(r.attempt(gm, { type: "history.undo", commandId })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("refuses to undo an apply once its carried tokens are placed, until the placement is undone", () => {
    const { r, aria } = party();
    const applyId = r.run(gm, { type: "encounter.apply", templateId: ENCOUNTER.id, carryTokenIds: [aria.id] });
    const placeId = r.run(gm, { type: "token.placeStaged", origin: cell(1, 1) });
    expect(r.attempt(gm, { type: "history.undo", commandId: applyId })).toMatchObject({ ok: false });
    r.run(gm, { type: "history.undo", commandId: placeId });
    expect(r.attempt(gm, { type: "history.undo", commandId: applyId })).toMatchObject({ ok: true });
  });

  it("resyncs players instead of sending them the placement", () => {
    const { r } = staged();
    const before = r.state;
    r.run(gm, { type: "token.placeStaged", origin: cell(3, 3) });
    const committed = r.log.at(-1)!;
    expect(committed.event.type).toBe("StagedTokensPlaced");
    expect(filterEventForViewer(committed, before, alice)).toEqual({ kind: "resync" });
    expect(filterEventForViewer(committed, before, gm)).toMatchObject({ kind: "event" });
  });
});

describe("Select and place on a new map (ADR 0068)", () => {
  /** The tavern, Aria and Borin owned, the barkeep not, all in a running encounter. */
  function tavern() {
    const p = party();
    p.r.run(gm, { type: "initiative.start", entries: [{ tokenId: p.aria.id, score: 20 }, { tokenId: p.barkeep.id, score: 15 }, { tokenId: p.borin.id, score: 10 }] });
    return p;
  }
  const newMap = { url: "/uploads/cellar.png", width: 1400, height: 1400 };

  it("sends the ticked tokens to wait and removes the rest, in one action with the map", () => {
    const { r, aria, borin, barkeep } = tavern();
    const ariaNow = r.state.tokens[aria.id]!;
    r.run(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [aria.id, borin.id] });
    expect(r.state.scene.map).toEqual(newMap);
    expect(r.state.tokens).toEqual({});
    expect(Object.keys(r.state.staged).sort()).toEqual([aria.id, borin.id].sort());
    expect(r.state.staged[aria.id]).toEqual(ariaNow);
    expect(r.state.staged[barkeep.id]).toBeUndefined();
    // None of them is on the map, so none keeps a turn.
    expect(r.state.initiative).toBeNull();
    const types = r.log.slice(-6).map((c) => c.event.type);
    expect(types[types.indexOf("MapSet") + 1]).toBe("StagedTokensRestaged");
    expect(types).toContain("TokenDeleted");
  });

  it("then places them with one click, like carried tokens", () => {
    const { r, aria, borin } = tavern();
    r.run(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [aria.id, borin.id] });
    r.run(gm, { type: "token.placeStaged", origin: cell(10, 10) });
    expect(r.state.tokens[aria.id]!.position).toEqual(cell(10, 10));
    expect(r.state.staged).toEqual({});
  });

  it("removes every token when none is ticked", () => {
    const { r } = tavern();
    r.run(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [] });
    expect(r.state.tokens).toEqual({});
    expect(r.state.staged).toEqual({});
  });

  it("undoes as one action: the old map, every token back where it stood, removed ones too", () => {
    const { r } = party();
    const before = tableOf(r.state);
    const commandId = r.run(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [Object.keys(r.state.tokens)[0]!] });
    expect(undoableAction(r.state.undo, commandId)).toBeDefined();
    r.run(gm, { type: "history.undo", commandId });
    expect(tableOf(r.state)).toEqual(before);
  });

  it("refuses that undo once a waiting token was placed", () => {
    const { r, aria } = party();
    const commandId = r.run(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [aria.id] });
    r.run(gm, { type: "token.placeStaged", origin: cell(4, 4) });
    expect(r.attempt(gm, { type: "history.undo", commandId })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("leaves tokens already waiting alone", () => {
    const { r, aria, cryptId } = party();
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    r.run(gm, { type: "token.create", name: "Rat", position: cell(2, 2) });
    r.run(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [] });
    expect(Object.keys(r.state.staged)).toEqual([aria.id]);
    expect(r.state.tokens).toEqual({});
  });

  it("rejects an id that isn't on the map, and a player", () => {
    const { r, aria, cryptId } = party();
    expect(r.attempt(gm, { type: "scene.setMap", map: newMap, placeTokenIds: ["nope"] })).toMatchObject({ ok: false, code: "invalid" });
    expect(r.attempt(alice, { type: "scene.setMap", map: newMap, placeTokenIds: [aria.id] })).toMatchObject({ ok: false, code: "forbidden" });
    r.run(gm, { type: "scene.switch", sceneId: cryptId, carryTokenIds: [aria.id] });
    // Waiting already: not a token on the map to keep.
    expect(r.attempt(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [aria.id] })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("works for a UVTT import too", () => {
    const { r, aria } = party();
    const state = r.state;
    const prep = { map: newMap, grid: state.scene.grid, walls: [], baseline: { map: state.scene.map, grid: state.scene.grid, walls: state.walls, fog: state.fog, terrainRevision: state.terrainRevision ?? 0 } };
    const decision = decide(state, gm, Command.parse({ type: "scene.importUVTT", importId: "p", revision: 1, placeTokenIds: [aria.id] }), { newId: () => "w", preparedUvtt: prep });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events.map((e) => e.type)).toEqual(["MapSet", "StagedTokensRestaged", "TokenDeleted", "TokenDeleted"]);
  });

  it("shows players only their own waiting tokens, and resyncs them", () => {
    const { r, aria } = party();
    const before = r.state;
    r.run(gm, { type: "scene.setMap", map: newMap, placeTokenIds: [aria.id] });
    expect(Object.keys(filterStateForViewer(r.state, alice).staged)).toEqual([aria.id]);
    expect(filterStateForViewer(r.state, bob).staged).toEqual({});
    const staging = r.log.find((c) => c.event.type === "StagedTokensRestaged")!;
    expect(filterEventForViewer(staging, before, bob)).toEqual({ kind: "resync" });
  });
});
