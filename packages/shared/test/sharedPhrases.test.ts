import { describe, expect, it } from "vitest";
import {
  CONDITIONS,
  conditionAbbr,
  conditionLabel,
  describePortalChange,
  describeUndo,
  formatAttackRoll,
  replayPoints,
  type CommittedEvent,
  type UndoEntry,
} from "../src";
import { alice, gm } from "./fixtures";

const move: UndoEntry = {
  commandId: "c1",
  actorId: gm.id,
  undoable: true,
  events: [{ type: "TokenMoved", tokenId: "t1", from: { x: 0, y: 0 }, to: { x: 70, y: 0 } }],
  tokenNames: { t1: "Goblin" },
  rollLabels: {},
} as UndoEntry;

describe("shared phrases in Traditional Chinese (localization)", () => {
  it("phrases an undo for the button and the log, in each language", () => {
    expect(describeUndo(move, {})).toEqual({ verb: "move Goblin", noun: "the move of Goblin" });
    expect(describeUndo(move, {}, "zh-TW")).toEqual({ verb: "移動 Goblin", noun: "Goblin 的移動" });
  });

  it("phrases portal changes, with the right measure word for doors and windows", () => {
    const door = { kind: "door", state: "closed" } as const;
    expect(describePortalChange(door, { ...door, state: "open" })).toMatchObject({ past: "opened a door", verb: "open a door" });
    expect(describePortalChange(door, { ...door, state: "open" }, "zh-TW")).toEqual({ past: "將一扇門打開", verb: "打開一扇門", gerund: "打開一扇門" });
    expect(describePortalChange(null, { kind: "window", state: "locked" }, "zh-TW").past).toBe("把一面牆改成了一扇上鎖的窗");
    expect(describePortalChange(door, null, "zh-TW").past).toBe("把一扇門改回了牆");
  });

  it("names every condition, with one distinct character for each marker in Chinese", () => {
    expect(conditionLabel("prone")).toBe("Prone");
    expect(conditionAbbr("prone")).toBe("PR");
    expect(conditionLabel("prone", "zh-TW")).toBe("倒地");
    expect(conditionAbbr("prone", "zh-TW")).toBe("倒");
    const abbrs = CONDITIONS.map((c) => conditionAbbr(c.id, "zh-TW"));
    expect(new Set(abbrs).size).toBe(CONDITIONS.length);
    for (const abbr of abbrs) expect([...abbr]).toHaveLength(1);
  });

  it("formats attack rolls in each language, names as recorded", () => {
    const roll = {
      expression: "1d20+5", total: 17, verdict: "hit" as const, damageApplied: false,
      attack: { kind: "toHit" as const, actor: { tokenId: "a", name: "Aria", hidden: false }, target: { tokenId: "g", name: "Goblin", hidden: false }, label: "Longsword" },
    };
    expect(formatAttackRoll(roll)).toBe("Aria → Goblin · Longsword · 1d20+5 = 17 · Hit");
    expect(formatAttackRoll(roll, "zh-TW")).toBe("Aria → Goblin · Longsword · 1d20+5 = 17 · 命中");
    expect(formatAttackRoll({ ...roll, verdict: undefined, attack: { ...roll.attack, kind: "damage" as const, label: null, target: null } }, "zh-TW"))
      .toBe("Aria → 未知 · 傷害 · 1d20+5 = 17");
  });

  it("labels replay points in each language; a GM still sees the checkpoint's own name", () => {
    const at = "2026-11-10T12:00:00.000Z";
    const events: CommittedEvent[] = [
      { seq: 1, actorId: gm.id, at, event: { type: "RoomCreated", name: "Dungeon" } },
      { seq: 2, actorId: gm.id, at, event: { type: "CheckpointCreated", checkpoint: { id: "k1", name: "Before the ambush", seq: 2, at } } } as CommittedEvent,
    ];
    expect(replayPoints(events, alice).map((p) => p.label)).toEqual(["Start of the room", "Checkpoint 1"]);
    expect(replayPoints(events, alice, "zh-TW").map((p) => p.label)).toEqual(["房間的開始", "存檔點 1"]);
    expect(replayPoints(events, gm, "zh-TW").map((p) => p.label)).toEqual(["房間的開始", "Before the ambush"]);
  });
});
