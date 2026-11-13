import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { encounterIncludes, groupedTokens, includedInEncounter } from "../src/panels/tokenGroups";
import { TokenEditor, TokenRoster } from "../src/panels/TokenRoster";
import { InitiativeTracker } from "../src/panels/InitiativeTracker";

const gm: Participant = { id: "gm", role: "gm", displayName: "Mara" };
const alice: Participant = { id: "alice", role: "player", displayName: "Alice" };
const gone: Participant = { id: "gone", role: "player", displayName: "Gone", left: true };

const tok = (id: string, name: string, extra: Partial<Token> = {}): Token => ({
  id, name, position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, assetId: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [], ...extra,
});

function room(): RoomState {
  return {
    ...emptyRoomState("r1"),
    participants: { gm, alice, gone },
    tokens: {
      g1: tok("g1", "Goblin"),
      g2: tok("g2", "Goblin 2"),
      c1: tok("c1", "Cultist"),
      f1: tok("f1", "Fighter", { ownerIds: ["alice"] }),
      o1: tok("o1", "Orphan", { ownerIds: ["gone"] }),
    },
    groups: { gate: { id: "gate", name: "Gate guards" }, back: { id: "back", name: "Back room" }, empty: { id: "empty", name: "Reinforcements" } },
    tokenGroups: { g1: "gate", g2: "gate", c1: "back", deleted: "gate" },
  };
}

const connection = { command: async () => ({ ok: true, seq: 1 }) } as unknown as RoomConnection;
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ");

describe("grouped roster helper (KAN-82)", () => {
  it("lists groups in creation order, empty ones too, then Ungrouped, skipping deleted members", () => {
    const state = room();
    const sections = groupedTokens(state, Object.values(state.tokens));
    expect(sections.map((s) => [s.group?.name ?? null, s.tokens.map((t) => t.id)])).toEqual([
      ["Gate guards", ["g1", "g2"]],
      ["Back room", ["c1"]],
      ["Reinforcements", []],
      [null, ["f1", "o1"]],
    ]);
  });

  it("picks the chosen groups' tokens, and active players' tokens only with Players' tokens ticked", () => {
    expect([...encounterIncludes(room(), ["gate"], true)].sort()).toEqual(["f1", "g1", "g2"]);
    expect([...encounterIncludes(room(), ["gate", "back"], true)].sort()).toEqual(["c1", "f1", "g1", "g2"]);
    expect([...encounterIncludes(room(), [], true)]).toEqual(["f1"]);
    expect([...encounterIncludes(room(), ["gate"], false)].sort()).toEqual(["g1", "g2"]);
    expect([...encounterIncludes(room(), [], false)]).toEqual([]);
  });
});

describe("the GM's grouped roster (KAN-82)", () => {
  const render = (you: Participant) => renderToStaticMarkup(
    <TokenRoster connection={connection} state={room()} you={you} token="t" onFocusToken={() => {}} onPlaceToken={() => {}} onDuplicateToken={() => {}} editingTokenId={null} onEditToken={() => {}} />,
  );

  it("shows group headings with Add tokens, one Hide/Show all button, Rename, Delete, collapse and a New group form", () => {
    const html = render(gm);
    const t = text(html);
    expect(t.indexOf("Gate guards")).toBeLessThan(t.indexOf("Back room"));
    expect(t.indexOf("Back room")).toBeLessThan(t.indexOf("Ungrouped"));
    for (const label of ["Add tokens to Gate guards", "Hide all of Gate guards", "Rename Gate guards", "Delete group Gate guards"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('aria-expanded="true"');
    expect(t).toContain("No tokens in this group yet");
    expect(html).toContain(`aria-label="Create group"`);
  });

  it("gives players one flat list with no group names", () => {
    const state = { ...room(), groups: {}, tokenGroups: {} };
    const html = renderToStaticMarkup(
      <TokenRoster connection={connection} state={state} you={alice} token="t" onFocusToken={() => {}} onPlaceToken={() => {}} onDuplicateToken={() => {}} editingTokenId={null} onEditToken={() => {}} />,
    );
    expect(html).not.toContain("Ungrouped");
    expect(html).not.toContain("Create group");
  });
});

describe("token editor: group and duplicate (KAN-82)", () => {
  const render = (isGm: boolean) => renderToStaticMarkup(
    <TokenEditor
      token={tok("g1", "Goblin")}
      roomToken="room"
      isGm={isGm}
      players={[]}
      departedOwner={null}
      error={null}
      groups={Object.values(room().groups)}
      groupId="gate"
      onSave={async () => {}}
      onDelete={() => {}}
      onDuplicate={() => {}}
    />,
  );

  it("offers the GM a Group field preset to the token's group, and Duplicate with no count (token-placement-flow)", () => {
    const html = render(true);
    expect(html).toMatch(/<option value="gate" selected="">Gate guards<\/option>/);
    expect(text(html)).toContain("Duplicate");
    expect(text(html)).not.toContain("Copies");
    expect(html).toContain("Click squares on the board to place copies.");
  });

  it("offers a player neither", () => {
    const html = render(false);
    expect(html).not.toContain("Gate guards");
    expect(text(html)).not.toContain("Duplicate");
  });
});

describe("Start encounter dialog (KAN-82, FR-GM-21)", () => {
  const none = new Set<string>();
  it("includes every token when no group is chosen", () => {
    expect(includedInEncounter("c1", null, none, none)).toBe(true);
  });

  it("includes only the groups' and players' tokens once groups are chosen, and lets the GM adjust", () => {
    const fromGroups = encounterIncludes(room(), ["gate"], true);
    expect(["g1", "g2", "c1", "f1"].map((id) => includedInEncounter(id, fromGroups, none, none))).toEqual([true, true, false, true]);
    expect(includedInEncounter("c1", fromGroups, none, new Set(["c1"]))).toBe(true);
    expect(includedInEncounter("g1", fromGroups, new Set(["g1"]), none)).toBe(false);
  });

  it("renders for the GM without error", () => {
    const html = renderToStaticMarkup(<InitiativeTracker connection={connection} state={room()} you={gm} onFocusToken={() => {}} />);
    expect(text(html)).toContain("Start encounter");
  });
});
