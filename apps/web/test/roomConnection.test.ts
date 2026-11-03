import { describe, expect, it, vi } from "vitest";
import { emptyRoomState, type CommittedEvent, type DomainEvent, type Participant, type RoomState, type ServerMessage, type Token } from "@vtt/shared";
import { RoomConnection } from "../src/net/roomConnection";

const you: Participant = { id: "gm", role: "gm", displayName: "GM" };
const token: Token = {
  id: "t1", name: "Goblin", position: { x: 0, y: 0 }, size: 1, rotation: 0, color: "#c0392b", imageUrl: null,
  ownerIds: [], hidden: false, stats: { hp: null, maxHp: null, ac: null }, conditions: [],
};

/** The message handler is private; a test drives it the way the socket does. */
const handle = (c: RoomConnection, msg: ServerMessage) => (c as unknown as { handle(m: ServerMessage): void }).handle(msg);
const event = (seq: number, e: DomainEvent): ServerMessage => ({
  type: "event",
  committed: { seq, at: "2026-01-01T00:00:00Z", actorId: null, event: e } satisfies CommittedEvent,
});
const move = (tokenId: string, x: number, y: number): DomainEvent => ({ type: "TokenMoved", tokenId, from: { x: 0, y: 0 }, to: { x, y } });

function open() {
  const connection = new RoomConnection("room", "guest");
  const state: RoomState = { ...emptyRoomState("room"), participants: { gm: you }, tokens: { t1: token } };
  handle(connection, { type: "welcome", you, seq: 4, state });
  return { connection, state };
}

describe("RoomConnection.onCommitted (KAN-76)", () => {
  it("is not called for a welcome snapshot", () => {
    const connection = new RoomConnection("room", "guest");
    const listener = vi.fn();
    connection.onCommitted(listener);
    handle(connection, { type: "welcome", you, seq: 4, state: emptyRoomState("room") });
    expect(listener).not.toHaveBeenCalled();
  });

  it("is called with the event and the state before and after an in-order event", () => {
    const { connection, state } = open();
    const listener = vi.fn();
    connection.onCommitted(listener);
    handle(connection, event(5, move("t1", 5, 6)));
    expect(listener).toHaveBeenCalledTimes(1);
    const [committed, before, after] = listener.mock.calls[0] as [CommittedEvent, RoomState, RoomState];
    expect(committed.event).toEqual(move("t1", 5, 6));
    expect(before).toBe(state);
    expect(after.tokens.t1!.position).toEqual({ x: 5, y: 6 });
    expect(connection.snapshot.state).toBe(after);
  });

  it("is not called for a redacted event, a seq gap or a failed reduce", () => {
    const { connection } = open();
    const listener = vi.fn();
    connection.onCommitted(listener);
    handle(connection, { type: "redacted", seq: 5 });
    handle(connection, event(9, move("t1", 1, 1)));
    handle(connection, event(6, move("missing", 1, 1)));
    expect(listener).not.toHaveBeenCalled();
    expect(connection.snapshot.seq).toBe(5);
  });

  it("stops calling an unsubscribed listener, and a throwing one does not break the event", () => {
    const { connection } = open();
    const gone = vi.fn();
    connection.onCommitted(gone)();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    connection.onCommitted(() => {
      throw new Error("boom");
    });
    handle(connection, event(5, move("t1", 2, 2)));
    warn.mockRestore();
    expect(gone).not.toHaveBeenCalled();
    expect(connection.snapshot.seq).toBe(5);
  });
});

describe("RoomConnection.preview (KAN-39, FR-SYNC-03)", () => {
  /** What the connection hands to the socket, in order. */
  function sent(connection: RoomConnection) {
    const messages: unknown[] = [];
    (connection as unknown as { send(m: unknown): void }).send = (m) => messages.push(m);
    return messages;
  }
  const drag = (x: number) => ({ type: "tokenDragPreview" as const, tokenId: "t1", at: { x, y: 0 } });

  it("sends at most one message per 50 ms per stream, and always the final value", () => {
    vi.useFakeTimers();
    try {
      const { connection } = open();
      const messages = sent(connection);
      // 30 pointer moves over 100 ms.
      for (let i = 0; i < 30; i++) {
        connection.preview("drag:t1", drag(i));
        vi.advanceTimersByTime(100 / 30);
      }
      vi.runAllTimers();
      expect(messages.length).toBeLessThanOrEqual(3);
      expect(messages.at(-1)).toEqual({ type: "ephemeral", payload: drag(29) });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps separate budgets per stream", () => {
    vi.useFakeTimers();
    try {
      const { connection } = open();
      const messages = sent(connection);
      connection.preview("drag:t1", drag(1));
      connection.preview("drag:t2", { ...drag(2), tokenId: "t2" });
      expect(messages).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a one-shot ping at once, even mid-drag", () => {
    vi.useFakeTimers();
    try {
      const { connection } = open();
      const messages = sent(connection);
      connection.preview("drag:t1", drag(1));
      connection.preview("drag:t1", drag(2));
      connection.ephemeral({ type: "ping", at: { x: 5, y: 5 } });
      expect(messages.at(-1)).toEqual({ type: "ephemeral", payload: { type: "ping", at: { x: 5, y: 5 } } });
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops the unsent value when the stream is cancelled", () => {
    vi.useFakeTimers();
    try {
      const { connection } = open();
      const messages = sent(connection);
      connection.preview("drag:t1", drag(1));
      connection.preview("drag:t1", drag(2));
      connection.cancelPreview("drag:t1");
      vi.runAllTimers();
      expect(messages).toEqual([{ type: "ephemeral", payload: drag(1) }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("RoomConnection.endPreview (KAN-39)", () => {
  const drag = (x: number) => ({ type: "tokenDragPreview" as const, tokenId: "t1", at: { x, y: 0 } });
  function sent(connection: RoomConnection) {
    const messages: unknown[] = [];
    (connection as unknown as { send(m: unknown): void }).send = (m) => messages.push(m);
    return messages;
  }

  it("sends the final value at once in place of the unsent one", () => {
    vi.useFakeTimers();
    try {
      const { connection } = open();
      const messages = sent(connection);
      connection.preview("drag:t1", drag(1));
      connection.preview("drag:t1", drag(2)); // held for the next window
      connection.endPreview("drag:t1", drag(70));
      vi.runAllTimers();
      expect(messages).toEqual([{ type: "ephemeral", payload: drag(1) }, { type: "ephemeral", payload: drag(70) }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends nothing more when there is no final value", () => {
    vi.useFakeTimers();
    try {
      const { connection } = open();
      const messages = sent(connection);
      connection.preview("drag:t1", drag(1));
      connection.preview("drag:t1", drag(2));
      connection.endPreview("drag:t1", null);
      vi.runAllTimers();
      expect(messages).toEqual([{ type: "ephemeral", payload: drag(1) }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("scene changes", () => {
  it("cancels queued previews before they can appear in the next scene", () => {
    vi.useFakeTimers();
    try {
      const { connection, state } = open();
      const messages: unknown[] = [];
      (connection as unknown as { send(m: unknown): void }).send = (message) => messages.push(message);
      connection.preview("ping", { type: "ping", at: { x: 1, y: 1 } });
      connection.preview("ping", { type: "ping", at: { x: 1, y: 1 } });
      handle(connection, { type: "welcome", you, seq: 5, state: { ...state, activeSceneId: "cellar" } });
      vi.runAllTimers();
      expect(messages).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });
});
