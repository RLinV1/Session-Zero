// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState, type Token } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import { AttackPanel, PresetEditor } from "../src/panels/AttackPanel";

afterEach(cleanup);

const gm: Participant = { id: "gm", role: "gm", displayName: "GM" };
const token = (id: string, over: Partial<Token> = {}): Token => ({
  id, name: id, position: { x: 100, y: 100 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [], ...over,
});
const state: RoomState = {
  ...emptyRoomState("r"),
  participants: { gm },
  tokens: {
    a: token("a", { attacks: [{ name: "Fireball", toHit: null, damage: { count: 2, sides: 6, modifier: 0 }, maxTargets: 2 }] }),
    b: token("b", { position: { x: 150, y: 100 } }),
    c: token("c", { position: { x: 200, y: 100 } }),
    d: token("d", { position: { x: 250, y: 100 } }),
  },
};

describe("multi-target attacks (FR-TAC-09)", () => {
  it("rolls once per chosen target, up to the attack's count", async () => {
    const command = vi.fn(async (_command: unknown) => ({ ok: true as const, seq: null }));
    const connection = { command, ephemeral: vi.fn(), snapshot: { seq: 0, state: null } } as unknown as RoomConnection;
    render(
      <AttackPanel
        connection={connection} state={state} you={gm} pick={{ attackerId: "a", targetId: "b" }} onPick={() => {}}
        reset={{ count: 0, clearedRollId: null }} rolling={false}
        onPickOnBoard={() => {}} onShowPing={() => {}} visibility="public" onVisibility={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Targets" }));
    // Aria picks b, then c; the count is 2 in total, so d is now off limits.
    fireEvent.click(screen.getByRole("checkbox", { name: /^c/ }));
    expect((screen.getByRole("checkbox", { name: /^d/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /: Fireball against/ }));
    await waitFor(() => expect(command).toHaveBeenCalledTimes(2));
    const targets = command.mock.calls.map((c) => (c[0] as { attack: { targetTokenId: string } }).attack.targetTokenId);
    expect(targets).toHaveLength(2);
    expect(new Set(targets).size).toBe(2);
  });

  it("saves a target count only when the attack can hit several", () => {
    const save = vi.fn();
    render(<PresetEditor initial={null} taken={[]} onSave={save} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sweep" } });
    fireEvent.click(screen.getByRole("button", { name: /save|add/i }));
    expect(save.mock.calls[0]![0]).not.toHaveProperty("maxTargets");
  });
});
