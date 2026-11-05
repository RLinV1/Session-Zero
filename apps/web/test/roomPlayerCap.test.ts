import { describe, expect, it } from "vitest";
import { ROOM_FULL, ROOM_LOCKED, type Participant } from "@vtt/shared";
import { ApiError } from "../src/net/api";
import { joinFailure } from "../src/pages/joinFailure";
import { playerSeats } from "../src/ui/ParticipantsButton";

const person = (n: number, role: Participant["role"] = "player"): Participant => ({ id: `p-${n}`, role, displayName: `P${n}` });

describe("a full room on the join page (room-player-cap, FR-PL-01)", () => {
  it("shows the server's message without blaming the name", () => {
    const full = new ApiError("This room is full: it holds 32 players. Ask the GM for a seat.", 409, { code: ROOM_FULL });
    expect(joinFailure(full)).toEqual({ message: "This room is full: it holds 32 players. Ask the GM for a seat.", nameIsCause: false });
  });

  it("doesn't blame the name for a locked room (ADR 0051)", () => {
    const locked = new ApiError("This room is locked, so no one new can join. Ask the GM to unlock it.", 409, { code: ROOM_LOCKED });
    expect(joinFailure(locked).nameIsCause).toBe(false);
  });

  it("doesn't blame the name for too many joins from this address (security-hardening)", () => {
    const limited = new ApiError("Too many joins from this address. Try again later.", 429, { retryAfterSec: 60 });
    expect(joinFailure(limited)).toEqual({ message: "Too many joins from this address. Try again later.", nameIsCause: false });
  });

  it("still marks the name for a name conflict and other refusals", () => {
    expect(joinFailure(new ApiError('The name "Kim" is already taken in this room. Choose another name.', 409))).toMatchObject({ nameIsCause: true });
    expect(joinFailure(new ApiError("Invite not found", 404))).toMatchObject({ nameIsCause: true });
    expect(joinFailure("offline")).toEqual({ message: "Could not join", nameIsCause: true });
  });
});

describe("the GM's count of player seats (room-player-cap)", () => {
  it("counts players only, out of 32", () => {
    const table = [person(0, "gm"), ...Array.from({ length: 12 }, (_, i) => person(i + 1))];
    expect(playerSeats(table)).toBe("12 of 32 player seats taken");
    expect(playerSeats([person(0, "gm")])).toBe("0 of 32 player seats taken");
  });
});
