// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type ServerMessage } from "@vtt/shared";

/** A stand-in socket: the test plays the server by calling `serve`. */
const fake = vi.hoisted(() => {
  const handlers = new Map<string, (payload: unknown) => void>();
  const sent: unknown[] = [];
  return {
    handlers,
    sent,
    socket: {
      on: (event: string, fn: (payload: unknown) => void) => handlers.set(event, fn),
      emit: (_event: string, payload: unknown) => sent.push(payload),
      volatile: { emit: () => {} },
      disconnect: () => {},
    },
  };
});
vi.mock("socket.io-client", () => ({ io: () => fake.socket }));

const { RoomConnection } = await import("../src/net/roomConnection");
const { api } = await import("../src/net/api");
const { chooseLocale, resetLocaleForTests } = await import("../src/i18n/locale");

const serve = (msg: ServerMessage) => fake.handlers.get("event")!(msg);
const gm: Participant = { id: "11111111-1111-4111-8111-111111111111", role: "gm", displayName: "GM" };

function openRoom() {
  const connection = new RoomConnection("room-1", "a-guest-token-of-enough-length");
  connection.start();
  serve({ type: "welcome", you: gm, seq: 0, state: { ...emptyRoomState("room-1"), participants: { [gm.id]: gm } } });
  return connection;
}

/** Sends a command and answers it with `reply`, built from the command's own id. */
async function refuse(connection: InstanceType<typeof RoomConnection>, reply: (id: string) => ServerMessage) {
  const result = connection.command({ type: "chat.send", text: "hello" } as Parameters<typeof connection.command>[0]);
  const sent = fake.sent.at(-1) as { clientCommandId: string };
  serve(reply(sent.clientCommandId));
  return result;
}

beforeEach(async () => {
  localStorage.clear();
  fake.handlers.clear();
  fake.sent.length = 0;
  await resetLocaleForTests();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  localStorage.clear();
  await resetLocaleForTests();
});

describe("rejections in the viewer's language (localization)", () => {
  it("formats a rejection's message id in the language on screen when it arrives", async () => {
    const connection = openRoom();
    await chooseLocale("zh-TW");
    const result = await refuse(connection, (id) => ({
      type: "rejected", clientCommandId: id, code: "invalid", message: "Something went wrong", messageId: "common.unknownError",
    }));
    expect(result).toEqual({ ok: false, code: "invalid", message: "發生錯誤" });
  });

  it("shows the server's English when this build doesn't know the id, or none was sent", async () => {
    const connection = openRoom();
    await chooseLocale("zh-TW");
    const unknown = await refuse(connection, (id) => ({
      type: "rejected", clientCommandId: id, code: "invalid", message: "A newer server's reason", messageId: "reject.fromTheFuture",
    }));
    expect(unknown).toMatchObject({ message: "A newer server's reason" });
    const plain = await refuse(connection, (id) => ({ type: "rejected", clientCommandId: id, code: "bad_request", message: "Bad request" }));
    expect(plain).toMatchObject({ message: "Bad request" });
  });

  it("writes its own messages in the current language", async () => {
    const connection = new RoomConnection("room-1", "a-guest-token-of-enough-length");
    await chooseLocale("zh-TW");
    expect(await connection.command({ type: "chat.send", text: "hi" } as Parameters<typeof connection.command>[0]))
      .toEqual({ ok: false, code: "offline", message: "尚未連線" });
  });
});

describe("API requests name the chosen language (localization)", () => {
  it("sends Accept-Language with the current choice, not the browser's", async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit = {}) => {
      seen.push(new Headers(init.headers).get("accept-language"));
      return new Response(JSON.stringify({ account: null }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await api.auth.me();
    await chooseLocale("zh-TW");
    await api.auth.me();
    expect(seen).toEqual(["en", "zh-TW"]);
  });
});
