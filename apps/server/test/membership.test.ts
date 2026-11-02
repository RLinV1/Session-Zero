import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ALREADY_MEMBER, GM_TOKEN_HEADER, type MyRoomsResponse, type RoomPreview } from "@vtt/shared";
import { hashToken } from "../src/domain/credentials";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { SESSION_IDLE_MS } from "../src/identity/sessions";
import { newGuestToken, startServer, type HttpAccount, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
let now = Date.parse("2026-10-01T12:00:00.000Z");

beforeEach(async () => {
  now = Date.parse("2026-10-01T12:00:00.000Z");
  server = await startServer(new MemoryRoomStore(), { now: () => now });
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

const connect = async (creds: { roomId: string; guestToken: string }) => {
  const client = await server.connect(creds);
  clients.push(client);
  return client;
};

/** Sam hosts "Goblin Cave"; returns his laptop account and the room. */
async function samsRoom() {
  const sam = await server.signUp({ email: "sam@example.com", password: "correct horse", displayName: "Sam" });
  const room = await server.createRoom("Sam", { cookie: sam.cookie, roomName: "Goblin Cave" });
  return { sam, room };
}

const myRooms = (who: HttpAccount) => who.json<MyRoomsResponse>("GET", "/api/me/rooms");

/** Leaving ends the seat and disconnects at once, with no ack (ADR 0006). */
async function leave(client: TestClient) {
  client.send({ type: "command", clientCommandId: "leave", command: { type: "participant.leave" } });
  await client.disconnected;
}

describe("seats taken while signed in belong to the account (room-membership, FR-GM-01)", () => {
  it("keeps a signed-in join on the account and lists it under Playing", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    const joined = await server.joinAs(kim, room.inviteCode, "Kim");
    expect(joined.status).toBe(200);
    expect((await myRooms(kim)).playing.map((r) => r.name)).toEqual(["Goblin Cave"]);
  });

  it("keeps the creator's GM seat and lists the room under Hosting, not Playing", async () => {
    const { sam } = await samsRoom();
    const rooms = await myRooms(sam);
    expect(rooms.hosting.map((r) => r.name)).toEqual(["Goblin Cave"]);
    expect(rooms.playing).toEqual([]);
  });

  it("refuses a second seat for the same person and adds no participant", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    const first = await server.joinAs(kim, room.inviteCode, "Kim");
    const gm = await connect(room);
    const seq = gm.seq;
    const tablet = await server.signIn("kim@example.com", "correct horse");
    const again = await server.joinAs(tablet, room.inviteCode, "Kimberly");
    expect(again.status).toBe(409);
    expect(again.body.code).toBe(ALREADY_MEMBER);
    expect(Object.values(gm.state.participants).map((p) => p.displayName).sort()).toEqual(["Kim", "Sam"]);
    expect(gm.seq).toBe(seq);
    expect(first.body.participantId).toBeTruthy();
  });

  it("tells the invite page about the account's seat there, and nobody else", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    await server.joinAs(kim, room.inviteCode, "Kim");
    const tablet = await server.signIn("kim@example.com", "correct horse");
    expect(await tablet.json("GET", `/api/invites/${room.inviteCode}/seat`)).toEqual({
      roomId: room.roomId, displayName: "Kim", role: "player",
    });
    const alex = await server.signUp();
    expect((await alex.request("GET", `/api/invites/${room.inviteCode}/seat`)).status).toBe(404);
    expect((await server.anonymous().request("GET", `/api/invites/${room.inviteCode}/seat`)).status).toBe(401);
  });

  it("lets two simultaneous joins from one account get exactly one seat", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp();
    const results = await Promise.all([server.joinAs(kim, room.inviteCode, "Kim"), server.joinAs(kim, room.inviteCode, "Kim B")]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("lets a person who left join again, replacing the ended seat on the account", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp();
    const first = await server.joinAs(kim, room.inviteCode, "Kim");
    const kimClient = await connect({ roomId: room.roomId, guestToken: first.guestToken });
    await leave(kimClient);
    const back = await server.joinAs(kim, room.inviteCode, "Kim again");
    expect(back.status).toBe(200);
    expect(back.body.participantId).not.toBe(first.body.participantId);
    const resumed = await server.resume(kim, room.roomId);
    expect(resumed.body.participantId).toBe(back.body.participantId);
  });

  it("keeps a removed person out, even from a valid invite link", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp();
    const joined = await server.joinAs(kim, room.inviteCode, "Kim");
    const gm = await connect(room);
    const removed = await gm.command({ type: "participant.revoke", participantId: joined.body.participantId! });
    expect(removed.type).toBe("ack");
    const again = await server.joinAs(kim, room.inviteCode, "Kim");
    expect(again.status).toBe(403);
  });
});

describe("resume a seat on any device (room-membership)", () => {
  it("lets the GM open the room on a second device as the same participant, with no event", async () => {
    const { room } = await samsRoom();
    const laptop = await connect(room);
    const phone = await server.signIn("sam@example.com", "correct horse");
    const seat = await server.resume(phone, room.roomId);
    expect(seat.status).toBe(200);
    expect(seat.body).toMatchObject({ participantId: room.participantId, role: "gm" });
    const phoneClient = await connect(seat);
    expect(phoneClient.participantId).toBe(room.participantId);
    expect(phoneClient.seq).toBe(laptop.seq);
    expect(Object.keys(phoneClient.state.participants)).toHaveLength(1);
    // The laptop is still connected and still hears the room.
    const moved = await phoneClient.command({ type: "chat.send", text: "from the phone" });
    expect(moved.type).toBe("ack");
    await laptop.waitForSeq((moved as { seq: number }).seq);
  });

  it("lets a player carry on from another device with their tokens", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    const joined = await server.joinAs(kim, room.inviteCode, "Kim");
    const gm = await connect(room);
    const made = await gm.command({ type: "token.create", name: "Rogue", position: { x: 10, y: 10 } });
    await gm.waitForSeq((made as { seq: number }).seq);
    const tokenId = Object.keys(gm.state.tokens)[0]!;
    await gm.command({ type: "token.setOwners", tokenId, ownerIds: [joined.body.participantId!] });

    const tablet = await server.signIn("kim@example.com", "correct horse");
    const seat = await server.resume(tablet, room.roomId);
    expect(seat.body).toMatchObject({ participantId: joined.body.participantId, role: "player" });
    const kimOnTablet = await connect(seat);
    const moved = await kimOnTablet.command({ type: "token.move", tokenId, to: { x: 50, y: 50 } });
    expect(moved.type).toBe("ack");
  });

  it("answers 404 to a stranger and 401 with no session, issuing nothing", async () => {
    const { room } = await samsRoom();
    const alex = await server.signUp();
    expect((await server.resume(alex, room.roomId)).status).toBe(404);
    expect((await server.resume(alex, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await server.resume(server.anonymous(), room.roomId)).status).toBe(401);
  });

  it("refuses an ended seat with its reason", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp();
    const joined = await server.joinAs(kim, room.inviteCode, "Kim");
    const kimClient = await connect({ roomId: room.roomId, guestToken: joined.guestToken });
    await leave(kimClient);
    const res = await server.resume(kim, room.roomId);
    expect(res.status).toBe(403);
    expect(res.body.reason).toBe("left");
  });

  it("gives the owner the GM seat of a room moved in from a legacy device", async () => {
    // A room from before accounts: owned by a device identity, its GM seat on no account.
    const deviceToken = newGuestToken();
    const deviceOwner = await server.store.registerGm(hashToken(deviceToken));
    const roomId = randomUUID();
    const gmId = randomUUID();
    await server.store.createRoom(roomId, "legacy1", { ownerGmId: deviceOwner, name: "Old cave" });
    await server.store.append(roomId, 0, [
      { actorId: null, event: { type: "RoomCreated", name: "Old cave" } },
      { actorId: gmId, event: { type: "ParticipantJoined", participant: { id: gmId, role: "gm", displayName: "Sam" } } },
    ]);
    const sam = await server.signUp();
    const moved = await sam.request("POST", "/api/gm/legacy/claim", undefined, { [GM_TOKEN_HEADER]: deviceToken });
    expect(moved.status).toBe(200);

    const seat = await server.resume(sam, roomId);
    expect(seat.status).toBe(200);
    expect(seat.body).toMatchObject({ participantId: gmId, role: "gm" });
    expect((await myRooms(sam)).hosting.map((r) => r.name)).toEqual(["Old cave"]);
  });
});

describe("keep a guest seat on the account (room-membership)", () => {
  const keep = (who: HttpAccount, roomId: string, guestToken: string) =>
    who.request("POST", `/api/rooms/${roomId}/seat/keep`, undefined, { authorization: `Bearer ${guestToken}` });

  it("keeps the same participant and changes nothing in the room", async () => {
    const { room } = await samsRoom();
    const guest = await server.join(room.inviteCode, "Kim");
    const gm = await connect(room);
    const seq = gm.seq;
    const kim = await server.signUp();
    expect((await keep(kim, room.roomId, guest.guestToken)).status).toBe(204);
    expect((await myRooms(kim)).playing.map((r) => r.id)).toEqual([room.roomId]);
    expect((await server.resume(kim, room.roomId)).body.participantId).toBe(guest.participantId);
    expect(gm.seq).toBe(seq);
  });

  it("refuses when the account already has a seat in the room, changing nothing", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp();
    await server.joinAs(kim, room.inviteCode, "Kim");
    const second = await server.join(room.inviteCode, "Kimberly");
    const res = await keep(kim, room.roomId, second.guestToken);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe("account_has_seat");
  });

  it("refuses a seat another account already kept", async () => {
    const { room } = await samsRoom();
    const guest = await server.join(room.inviteCode, "Kim");
    const kim = await server.signUp();
    const alex = await server.signUp();
    await keep(kim, room.roomId, guest.guestToken);
    const res = await keep(alex, room.roomId, guest.guestToken);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { reason: string }).reason).toBe("seat_taken");
  });

  it("keeps only this room's seat", async () => {
    const { room } = await samsRoom();
    const other = await server.createRoom("Sam", { roomName: "Crypt" });
    const here = await server.join(room.inviteCode, "Kim");
    await server.join(other.inviteCode, "Kim");
    const kim = await server.signUp();
    await keep(kim, room.roomId, here.guestToken);
    expect((await myRooms(kim)).playing.map((r) => r.name)).toEqual(["Goblin Cave"]);
  });

  it("refuses a credential from another room", async () => {
    const { room } = await samsRoom();
    const other = await server.createRoom("Sam", { roomName: "Crypt" });
    const elsewhere = await server.join(other.inviteCode, "Kim");
    const kim = await server.signUp();
    expect((await keep(kim, room.roomId, elsewhere.guestToken)).status).toBe(404);
  });
});

describe("a device's seats end with its sign-in (room-membership, ADR 0017 M4)", () => {
  it("closes this device's room connection on sign-out, and keeps the other device and guests", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    const joined = await server.joinAs(kim, room.inviteCode, "Kim");
    const libraryComputer = await connect({ roomId: room.roomId, guestToken: joined.guestToken });
    const laptop = await server.signIn("kim@example.com", "correct horse");
    const laptopSeat = await server.resume(laptop, room.roomId);
    const laptopClient = await connect(laptopSeat);
    const guest = await server.join(room.inviteCode, "Guest");
    const guestClient = await connect(guest);

    await kim.request("POST", "/api/auth/signout");
    const ended = await libraryComputer.waitFor((m) => m.type === "sessionEnded");
    expect(ended).toEqual({ type: "sessionEnded", reason: "signed_out" });
    await expect(server.connect({ roomId: room.roomId, guestToken: joined.guestToken })).rejects.toThrow();

    const said = await laptopClient.command({ type: "chat.send", text: "still here" });
    expect(said.type).toBe("ack");
    await guestClient.waitForSeq((said as { seq: number }).seq);
  });

  it("brings the person back as the same participant after signing in again", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com", password: "correct horse" });
    const joined = await server.joinAs(kim, room.inviteCode, "Kim");
    await kim.request("POST", "/api/auth/signout");
    const again = await server.signIn("kim@example.com", "correct horse");
    const seat = await server.resume(again, room.roomId);
    expect(seat.body.participantId).toBe(joined.body.participantId);
    await expect(connect(seat)).resolves.toBeTruthy();
  });

  it("refuses a seat whose session expired before the sweep ran", async () => {
    const { room } = await samsRoom();
    now += SESSION_IDLE_MS + 1000;
    await expect(server.connect(room)).rejects.toThrow(/signed_out/);
  });

  it("closes the other devices' seats on a password change", async () => {
    const { room } = await samsRoom();
    const laptop = await connect(room);
    const phone = await server.signIn("sam@example.com", "correct horse");
    const phoneSeat = await server.resume(phone, room.roomId);
    const phoneClient = await connect(phoneSeat);
    await phone.json("POST", "/api/auth/password", { currentPassword: "correct horse", newPassword: "new password" });
    const ended = await laptop.waitFor((m) => m.type === "sessionEnded");
    expect(ended).toEqual({ type: "sessionEnded", reason: "signed_out" });
    const said = await phoneClient.command({ type: "chat.send", text: "phone stays" });
    expect(said.type).toBe("ack");
  });

  it("closes a connection whose session was ended by another process, at the next sweep", async () => {
    const { sam, room } = await samsRoom();
    const laptop = await connect(room);
    // As the operator reset does from its own process: the rows go, this server isn't told.
    await server.store.deleteUserSessions(sam.view!.id);
    await server.app.sweep();
    expect(await laptop.waitFor((m) => m.type === "sessionEnded")).toEqual({ type: "sessionEnded", reason: "signed_out" });
  });

  it("leaves guests who never signed in exactly as before", async () => {
    const { room } = await samsRoom();
    const guest = await server.join(room.inviteCode, "Guest");
    (await connect(guest)).close();
    await expect(connect(guest)).resolves.toBeTruthy();
  });
});

describe("your rooms (room-membership, ADR 0017 M5)", () => {
  it("lists active player seats only, and drops left and deleted rooms", async () => {
    const { sam, room } = await samsRoom();
    const crypt = await server.createRoom("Sam", { cookie: sam.cookie, roomName: "Crypt" });
    const kim = await server.signUp();
    const here = await server.joinAs(kim, room.inviteCode, "Kim");
    await server.joinAs(kim, crypt.inviteCode, "Kim");
    expect((await myRooms(kim)).playing.map((r) => r.name).sort()).toEqual(["Crypt", "Goblin Cave"]);

    const kimClient = await connect({ roomId: room.roomId, guestToken: here.guestToken });
    await leave(kimClient);
    await sam.request("DELETE", `/api/rooms/${crypt.roomId}`);
    expect((await myRooms(kim)).playing).toEqual([]);
  });

  it("needs a session", async () => {
    expect((await server.anonymous().request("GET", "/api/me/rooms")).status).toBe(401);
  });
});

describe("a hosted room's board preview (gm-dashboard, FR-GM-01)", () => {
  const previewPath = (roomId: string) => `/api/me/rooms/${roomId}/preview`;

  it("shows the owner the board as the GM sees it, hidden tokens and fog included", async () => {
    const { sam, room } = await samsRoom();
    const gm = await connect(room);
    await gm.command({ type: "scene.setMap", map: { url: "/uploads/cave.png", width: 700, height: 420 } });
    await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 } });
    await gm.command({ type: "token.create", name: "Shadow Lurker", position: { x: 315, y: 35 }, hidden: true });
    await gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 140, y: 140 } } });

    const preview = await sam.json<RoomPreview>("GET", previewPath(room.roomId));
    expect(preview.map).toEqual({ url: "/uploads/cave.png", width: 700, height: 420 });
    expect(preview.tokens.map((t) => [t.position.x, t.hidden])).toEqual([[35, false], [315, true]]);
    expect(preview.fog).toHaveLength(1);
    // Only what the picture draws: no token names reach the dashboard.
    expect(JSON.stringify(preview)).not.toContain("Shadow Lurker");
  });

  it("answers 404 to anyone but the owner, players in the room included", async () => {
    const { room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com" });
    await server.joinAs(kim, room.inviteCode, "Kim");
    expect((await kim.request("GET", previewPath(room.roomId))).status).toBe(404);
    expect((await kim.request("GET", previewPath(randomUUID()))).status).toBe(404);
    expect((await server.anonymous().request("GET", previewPath(room.roomId))).status).toBe(401);
  });
});

describe("account data stays out of rooms (user-accounts)", () => {
  it("never sends either side the other's email or account id", async () => {
    const { sam, room } = await samsRoom();
    const kim = await server.signUp({ email: "kim@example.com" });
    const joined = await server.joinAs(kim, room.inviteCode, "Kim");
    const gm = await connect(room);
    const player = await connect({ roomId: room.roomId, guestToken: joined.guestToken });
    const said = await player.command({ type: "chat.send", text: "hello" });
    await gm.waitForSeq((said as { seq: number }).seq);
    const history = await fetch(`${server.base}/api/rooms/${room.roomId}/history`, {
      headers: { authorization: `Bearer ${room.guestToken}` },
    });
    const everything = [gm.rawLog.join("\n"), player.rawLog.join("\n"), await history.text()].join("\n");
    for (const secret of ["sam@example.com", "kim@example.com", sam.view!.id, kim.view!.id]) {
      expect(everything).not.toContain(secret);
    }
  });
});
