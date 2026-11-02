import { describe, expect, it } from "vitest";
import { activityHistory, DomainEvent, filterEventForViewer, formatActivity, HistoryQuery, HistoryResponse, tableOf,
  type CommittedEvent, type DomainEventType } from "../src";
import { alice, baseRoom, gm, withToken } from "./fixtures";

const { state, token } = withToken(baseRoom(), { name: "Goblin" });
const initiative = { order: [token.id], activeIndex: 0, round: 1 };
const roll = { id: "roll", expression: "1d20", byParticipantId: alice.id, dice: [15], modifier: 0, total: 15, visibility: "public" as const };
const effect = {
  id: "e1", label: "Fireball", expression: "1d20+2", byParticipantId: gm.id,
  targets: [{ tokenId: token.id, name: "Goblin", hidden: false, roll: { dice: [12], total: 14 } }], call: null, damage: null,
};
const areaTemplate = { id: "t1", shape: "cone" as const, origin: { x: 70, y: 70 }, toward: { x: 210, y: 70 }, size: 20, ownerId: alice.id, gmOnly: false };
const fogRect = { id: "f1", shape: "rect" as const, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }] };
const wall = { id: "w1", a: { x: 0, y: 0 }, b: { x: 70, y: 0 } };
const committed = (event: DomainEvent, seq = 1, actorId: string | null = gm.id): CommittedEvent =>
  ({ seq, actorId, at: "2026-09-24T12:00:00.000Z", event });

describe("Human-readable activity formatter (FR-REC-01)", () => {
  const cases: Record<DomainEventType, [DomainEvent, string]> = {
    RoomCreated: [{ type: "RoomCreated", name: "Dungeon" }, "Mara created room Dungeon"],
    ParticipantJoined: [{ type: "ParticipantJoined", participant: alice }, "Mara joined the room as a player"],
    ParticipantLeft: [{ type: "ParticipantLeft", participant: alice }, "Alice left the table"],
    ParticipantRevoked: [{ type: "ParticipantRevoked", participant: alice }, "Mara removed Alice from the room"],
    ParticipantRenamed: [{ type: "ParticipantRenamed", participantId: alice.id, previous: "Alice", displayName: "Tomas" }, "Mara renamed Alice to Tomas"],
    ParticipantDiceLookSet: [
      { type: "ParticipantDiceLookSet", participantId: alice.id, look: null, previous: { lookId: alice.id, version: 1, faces: {} } },
      "Mara put Alice's dice back to classic",
    ],
    MapSet: [{ type: "MapSet", map: { url: "/map.png", width: 100, height: 100 }, previous: null }, "Mara set the map"],
    GridSet: [{ type: "GridSet", grid: state.scene.grid, previous: state.scene.grid }, "Mara updated the grid"],
    LineOfSightSet: [{ type: "LineOfSightSet", from: false, to: true }, "Mara turned line of sight on"],
    SightRangeSet: [{ type: "SightRangeSet", from: null, to: 60 }, "Mara set sight range to 60 ft"],
    TokenCreated: [{ type: "TokenCreated", token }, "Mara created Goblin"],
    TokenMoved: [{ type: "TokenMoved", tokenId: token.id, from: { x: 35, y: 35 }, to: { x: 105, y: 35 } }, "Mara moved Goblin from (35, 35) to (105, 35)"],
    TokenAppearanceSet: [{ type: "TokenAppearanceSet", tokenId: token.id, name: "Ogre", size: 2, rotation: 90, previous: { name: "Goblin", size: 1, rotation: 0 } }, "Mara updated Goblin to Ogre (size 2, rotation 90°)"],
    TokenDeleted: [{ type: "TokenDeleted", token }, "Mara deleted Goblin"],
    TokenOwnersSet: [{ type: "TokenOwnersSet", tokenId: token.id, ownerIds: [alice.id], previous: [] }, "Mara assigned Goblin to Alice"],
    TokenHiddenSet: [{ type: "TokenHiddenSet", tokenId: token.id, hidden: true, previous: false }, "Mara hid Goblin"],
    TokenStatsSet: [{ type: "TokenStatsSet", tokenId: token.id, stats: { hp: 4, maxHp: 10, ac: 12 }, previous: token.stats }, "Mara updated Goblin's stats: HP 4/10, AC 12"],
    TokenConditionsSet: [{ type: "TokenConditionsSet", tokenId: token.id, conditions: ["prone"], previous: [] }, "Mara set Goblin's conditions to prone"],
    TokenAttacksSet: [{ type: "TokenAttacksSet", tokenId: token.id, attacks: [{ name: "Scimitar", toHit: { count: 1, sides: 20, modifier: 4 }, damage: null }, { name: "Bite", toHit: null, damage: { count: 1, sides: 6, modifier: 1 } }], previous: [] }, "Mara set Goblin's attacks to Scimitar, Bite"],
    InitiativeStarted: [{ type: "InitiativeStarted", initiative, previous: null }, "Mara started initiative: Goblin"],
    InitiativeAdvanced: [{ type: "InitiativeAdvanced", initiative: { ...initiative, round: 2 }, previous: initiative }, "Mara advanced to round 2, Goblin's turn"],
    InitiativeEnded: [{ type: "InitiativeEnded", previous: initiative }, "Mara ended initiative"],
    InitiativeStartUndone: [{ type: "InitiativeStartUndone", initiative: null, previous: initiative, scores: [] }, "Mara took back the start of initiative"],
    GroupCreated: [{ type: "GroupCreated", group: { id: "g1", name: "Gate guards" } }, 'Mara created group "Gate guards"'],
    GroupRenamed: [{ type: "GroupRenamed", groupId: "g1", name: "Patrol", previous: "Gate guards" }, 'Mara renamed group "Gate guards" to "Patrol"'],
    GroupDeleted: [{ type: "GroupDeleted", group: { id: "g1", name: "Gate guards" }, members: [] }, 'Mara deleted group "Gate guards"'],
    TokensGrouped: [{ type: "TokensGrouped", groupId: null, changes: [{ tokenId: token.id, previous: "g1" }] }, "Mara took Goblin out of their group"],
    DiceRolled: [{ type: "DiceRolled", roll }, "Mara rolled 1d20: 15"],
    GroupRolled: [
      { type: "GroupRolled", roll: { kind: "group", id: "g1", expression: "1d20+2", label: "Dex save", byParticipantId: gm.id, visibility: "public", entries: [{ tokenId: token.id, name: "Goblin", hidden: false, dice: [12], total: 14 }] } },
      "Mara rolled 1d20+2 (Dex save) for 1 token: Goblin 14",
    ],
    AreaEffectStarted: [{ type: "AreaEffectStarted", effect }, 'Mara started area effect "Fireball" on Goblin (1d20+2)'],
    AreaEffectCalled: [{ type: "AreaEffectCalled", effectId: "e1", participantId: alice.id, previous: null }, "Mara called Alice to roll damage for an area effect"],
    AreaEffectDamageRolled: [
      { type: "AreaEffectDamageRolled", effectId: "e1", damage: { mode: "single", expression: "8d6", byParticipantId: alice.id, dice: [3, 4, 5, 6, 1, 2, 3, 4], total: 28 } },
      "Mara rolled 8d6 damage for an area effect: 28",
    ],
    AreaEffectResolved: [{ type: "AreaEffectResolved", effect, amounts: [] }, 'Mara resolved area effect "Fireball" on 1 token'],
    AreaEffectClosed: [{ type: "AreaEffectClosed", effect }, 'Mara closed area effect "Fireball" without applying it'],
    // A roll no longer in state; attackRulings.test.ts covers the named forms (ADR 0011).
    RollRuled: [{ type: "RollRuled", rollId: "gone", verdict: "hit", previous: null }, "Mara ruled an earlier roll a hit"],
    RollDamageApplied: [{ type: "RollDamageApplied", rollId: "gone", amount: 7 }, "Mara applied 7 damage from an earlier roll"],
    TokenImageSet: [{ type: "TokenImageSet", tokenId: token.id, imageUrl: "/uploads/new.png", assetId: null, previous: { imageUrl: null, assetId: null } }, "Mara changed Goblin's image"],
    TemplatePlaced: [{ type: "TemplatePlaced", template: areaTemplate }, "Mara placed a 20 ft cone"],
    TemplateRemoved: [{ type: "TemplateRemoved", template: { ...areaTemplate, gmOnly: true } }, "Mara removed a 20 ft cone (GM only)"],
    ReducedEffectsSet: [{ type: "ReducedEffectsSet", enabled: true, previous: false }, "Mara turned reduced animations on for the table"],
    MapNuked: [{ type: "MapNuked", amount: 12, origin: { x: 50, y: 50 } }, "Mara detonated a nuke (12 damage)"],
    MapNukeUndone: [{ type: "MapNukeUndone", amount: 12, origin: { x: 50, y: 50 } }, "Mara took back a nuke (12 damage)"],
    RollDamageUnapplied: [{ type: "RollDamageUnapplied", rollId: "gone", amount: 7 }, "Mara took back 7 damage from an earlier roll"],
    ChatMessageSent: [{ type: "ChatMessageSent", message: { id: "m1", senderId: alice.id, senderName: "Alice", text: "Watch the door" } }, "Mara said: Watch the door"],
    // An action no longer in the undo history; undo.test.ts covers the named form (ADR 0013).
    FogAdded: [{ type: "FogAdded", region: fogRect }, "Mara added a fog rectangle"],
    FogRemoved: [{ type: "FogRemoved", region: { ...fogRect, shape: "polygon" } }, "Mara removed a fog polygon"],
    WallUpdated: [{ type: "WallUpdated", wall: { id: "wall", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } }, previous: { id: "wall", a: { x: 0, y: 0 }, b: { x: 2, y: 2 } } }, "Mara edited a wall"],
    WallsAdded: [{ type: "WallsAdded", walls: [wall, { ...wall, id: "w2" }] }, "Mara added 2 walls"],
    WallsRemoved: [{ type: "WallsRemoved", walls: [wall] }, "Mara removed 1 wall"],
    PortalChanged: [{ type: "PortalChanged", wallId: wall.id, from: { kind: "door", state: "locked" }, to: { kind: "door", state: "closed" } }, "Mara unlocked a door"],
    CheckpointCreated: [{ type: "CheckpointCreated", checkpoint: { id: "c1", name: "Before the ambush", seq: 4 } }, 'Mara saved checkpoint "Before the ambush"'],
    CheckpointDeleted: [{ type: "CheckpointDeleted", checkpoint: { id: "c1", name: "Before the ambush", seq: 3 } }, 'Mara deleted checkpoint "Before the ambush"'],
    CheckpointRestored: [{ type: "CheckpointRestored", checkpointId: "c1", name: "Before the ambush", restored: tableOf(state), previous: tableOf(state) }, 'Mara restored checkpoint "Before the ambush"'],
    EncounterApplied: [{ type: "EncounterApplied", templateId: "t1", name: "Goblin ambush", applied: tableOf(state), previous: tableOf(state) }, 'Mara applied encounter template "Goblin ambush"'],
    ActionUndone: [{ type: "ActionUndone", commandId: "gone" }, "Mara undid an action"],
  };
  it.each(Object.entries(cases))("formats %s", (_type, [event, sentence]) => {
    expect(DomainEvent.safeParse(event).success).toBe(true);
    expect(formatActivity(event, "Mara", state)).toBe(sentence);
  });
  it("describes private rolls, cleared fields and missing entities", () => {
    expect(formatActivity({ type: "DiceRolled", roll: { ...roll, visibility: "gm" } }, "Tomas", state)).toBe("Tomas rolled 1d20: 15 (GM only)");
    expect(formatActivity({ type: "TokenConditionsSet", tokenId: "missing", conditions: [], previous: [] }, "System", state)).toBe("System set an unknown token's conditions to none");
    expect(formatActivity({ type: "TokenOwnersSet", tokenId: token.id, ownerIds: [], previous: [] }, "Mara", state)).toBe("Mara assigned Goblin to no players");
  });
  it("rounds move coordinates to at most 2 decimal places", () => {
    const moved: DomainEvent = { type: "TokenMoved", tokenId: token.id, from: { x: 1987.9, y: 829.1000000000001 }, to: { x: 2057.3456, y: 829.1000000000001 } };
    expect(formatActivity(moved, "Mara", state)).toBe("Mara moved Goblin from (1987.9, 829.1) to (2057.35, 829.1)");
  });
});

describe("History projection and visibility (FR-REC-01)", () => {
  const log = [
    committed({ type: "RoomCreated", name: "Dungeon" }, 1),
    committed({ type: "ParticipantJoined", participant: gm }, 2),
    committed({ type: "ParticipantJoined", participant: alice }, 3, alice.id),
    committed({ type: "TokenCreated", token }, 4),
    committed({ type: "TokenMoved", tokenId: token.id, from: token.position, to: { x: 1, y: 2 } }, 5, alice.id),
    committed({ type: "ParticipantRenamed", participantId: alice.id, previous: "Alice", displayName: "Tomas" }, 6, alice.id),
    committed({ type: "TokenDeleted", token }, 7),
    committed({ type: "DiceRolled", roll: { ...roll, visibility: "gm" } }, 8),
    committed({ type: "DiceRolled", roll }, 9, alice.id),
    committed({ type: "GridSet", grid: state.scene.grid, previous: state.scene.grid }, 10, null),
  ];
  it("keeps historical actor/token names and searches before pagination", () => {
    const result = activityHistory("room", log, gm, HistoryQuery.parse({ player: " ALi " }));
    expect(result.entries.map((e) => e.committed.seq)).toEqual([6, 5, 3]);
    expect(result.entries[1]?.sentence).toBe("Alice moved Goblin from (35, 35) to (1, 2)");
    expect(activityHistory("room", log, gm, HistoryQuery.parse({ player: "tomas" })).entries[0]?.sentence).toBe("Tomas rolled 1d20: 15");
    const full = activityHistory("room", log, gm, HistoryQuery.parse({}));
    expect(full.entries.at(-1)?.actorName).toBe("GM");
    expect(full.entries[0]?.actorName).toBe("System");
    expect(HistoryResponse.safeParse(full).success).toBe(true);
  });
  it("returns exclusive newest-first pages and a terminal null cursor", () => {
    const page = activityHistory("room", log, gm, HistoryQuery.parse({ limit: "3" }));
    expect(page.entries.map((e) => e.committed.seq)).toEqual([10, 9, 8]);
    expect(page.nextBefore).toBe(8);
    const next = activityHistory("room", log, gm, HistoryQuery.parse({ before: "8" }));
    expect(next.entries.map((e) => e.committed.seq)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(next.nextBefore).toBeNull();
    expect(activityHistory("room", log, gm, HistoryQuery.parse({ before: "1" })).entries).toEqual([]);
  });
  it("denies player projection entirely and filters hidden/private events", () => {
    expect(activityHistory("room", log, alice, HistoryQuery.parse({}))).toEqual({ entries: [], nextBefore: null });
    const hidden = { ...token, hidden: true };
    const hiddenState = { ...state, tokens: { [token.id]: hidden } };
    const privateEvents: DomainEvent[] = [
      { type: "TokenCreated", token: hidden }, { type: "TokenDeleted", token: hidden },
      { type: "TokenMoved", tokenId: token.id, from: token.position, to: { x: 2, y: 3 } },
      { type: "DiceRolled", roll: { ...roll, visibility: "gm" } },
    ];
    for (const event of privateEvents) {
      expect(filterEventForViewer(committed(event), hiddenState, alice).kind).toBe("redacted");
      expect(filterEventForViewer(committed(event), hiddenState, gm).kind).toBe("event");
    }
    expect(filterEventForViewer(committed({ type: "TokenHiddenSet", tokenId: token.id, hidden: false, previous: true }), hiddenState, alice).kind).toBe("resync");
  });
  it("does not mutate its inputs and supplies an unknown-actor fallback", () => {
    const original = structuredClone(log);
    activityHistory("room", log, gm, HistoryQuery.parse({}));
    expect(log).toEqual(original);
    expect(activityHistory("room", [committed({ type: "RoomCreated", name: "Test" }, 1, "absent")], gm, HistoryQuery.parse({})).entries[0]?.actorName).toBe("Unknown participant");
  });
});

describe("History query validation (FR-REC-01)", () => {
  it.each([{ limit: "0" }, { limit: "101" }, { limit: "2.5" }, { before: "-1" }, { before: "9007199254740992" }, { limit: ["1", "2"] }, { player: "a".repeat(41) }, { role: "gm" }])("rejects %j", (query) => {
    expect(HistoryQuery.safeParse(query).success).toBe(false);
  });
  it("defaults to a bounded page", () => expect(HistoryQuery.parse({})).toEqual({ limit: 50, player: "" }));
});
