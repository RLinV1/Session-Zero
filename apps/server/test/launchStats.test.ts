import { describe, expect, it } from "vitest";
import { aggregateLaunchStats, resolveStatsRange, type StatsRange } from "../src/domain/launchStats";
import type { LaunchStatsFacts } from "../src/store/statsStore";

const NOW = Date.parse("2026-11-21T15:00:00.000Z");
const range = (from: string, to: string): StatsRange => resolveStatsRange({ from, to }, NOW)!;
const empty = (): LaunchStatsFacts => ({ accounts: [], rooms: [], activity: [], firstDays: [], aiSeats: [] });

describe("launch stats range (ADR 0079)", () => {
  it("defaults to the last 30 UTC days, today included", () => {
    const r = resolveStatsRange({}, NOW)!;
    expect(r).toEqual({
      from: "2026-10-23",
      to: "2026-11-21",
      window: { from: "2026-10-23T00:00:00.000Z", to: "2026-11-22T00:00:00.000Z" },
    });
  });

  it("counts 30 days back from a given end", () => {
    expect(resolveStatsRange({ to: "2026-11-30" }, NOW)).toMatchObject({ from: "2026-11-01", to: "2026-11-30" });
  });

  it("refuses a start after the end and a range over 366 days", () => {
    expect(resolveStatsRange({ from: "2026-11-02", to: "2026-11-01" }, NOW)).toBeNull();
    expect(resolveStatsRange({ from: "2025-01-01", to: "2026-01-02" }, NOW)).toBeNull();
    expect(resolveStatsRange({ from: "2025-01-02", to: "2026-01-02" }, NOW)).not.toBeNull();
  });
});

describe("aggregateLaunchStats (ADR 0079)", () => {
  it("has a row for every day, empty days included", () => {
    const stats = aggregateLaunchStats(empty(), range("2026-11-01", "2026-11-03"));
    expect(stats.days.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(stats.days[1]).toEqual({
      date: "2026-11-02", accountsCreated: 0, roomsCreated: 0, roomsCreatedByGuests: 0, roomsCreatedByAccounts: 0,
      activeRooms: 0, playedRooms: 0, returningRooms: 0, aiSeatsJoined: 0,
    });
  });

  it("counts accounts and rooms by day and host, and leaves other hosts out of the split", () => {
    const facts = empty();
    facts.accounts = [{ id: "u1", at: "2026-11-01T01:00:00.000Z" }, { id: "u2", at: "2026-11-01T23:59:59.999Z" }, { id: "u3", at: "2026-11-02T00:00:00.000Z" }];
    facts.rooms = [
      { id: "r1", at: "2026-11-01T10:00:00.000Z", host: "guest" },
      { id: "r2", at: "2026-11-01T11:00:00.000Z", host: "account" },
      { id: "r3", at: "2026-11-02T11:00:00.000Z", host: "other" },
    ];
    const stats = aggregateLaunchStats(facts, range("2026-11-01", "2026-11-02"));
    expect(stats.days[0]).toMatchObject({ accountsCreated: 2, roomsCreated: 2, roomsCreatedByGuests: 1, roomsCreatedByAccounts: 1 });
    expect(stats.days[1]).toMatchObject({ accountsCreated: 1, roomsCreated: 1, roomsCreatedByGuests: 0, roomsCreatedByAccounts: 0 });
    expect(stats.totals).toMatchObject({ accountsCreated: 3, roomsCreated: 3, roomsCreatedByGuests: 1, roomsCreatedByAccounts: 1 });
  });

  it("counts a room played only on a day two different people acted in it, AI seats aside", () => {
    const facts = empty();
    facts.activity = [
      // r1: GM and a player on day 1.
      { roomId: "r1", day: "2026-11-01", participantId: "gm1" },
      { roomId: "r1", day: "2026-11-01", participantId: "p1" },
      // r2: GM and an AI seat only.
      { roomId: "r2", day: "2026-11-01", participantId: "gm2" },
      { roomId: "r2", day: "2026-11-01", participantId: "ai2" },
      // r3: the GM on day 1, a player on day 2: never two on one day.
      { roomId: "r3", day: "2026-11-01", participantId: "gm3" },
      { roomId: "r3", day: "2026-11-02", participantId: "p3" },
    ];
    facts.firstDays = [{ roomId: "r1", day: "2026-11-01" }, { roomId: "r2", day: "2026-11-01" }, { roomId: "r3", day: "2026-11-01" }];
    facts.aiSeats = [{ roomId: "r2", participantId: "ai2", at: "2026-11-01T12:00:00.000Z" }];
    const stats = aggregateLaunchStats(facts, range("2026-11-01", "2026-11-02"));
    expect(stats.days[0]).toMatchObject({ activeRooms: 3, playedRooms: 1, aiSeatsJoined: 1 });
    expect(stats.days[1]).toMatchObject({ activeRooms: 1, playedRooms: 0 });
    expect(stats.totals).toMatchObject({ activeRooms: 3, playedRooms: 1, aiSeatsJoined: 1 });
  });

  it("marks a room returning on a day after its first, even when its first was before the range", () => {
    const facts = empty();
    facts.activity = [
      { roomId: "old", day: "2026-11-01", participantId: "gm" },
      { roomId: "new", day: "2026-11-01", participantId: "gm" },
      { roomId: "new", day: "2026-11-02", participantId: "gm" },
      { roomId: "new", day: "2026-11-03", participantId: "gm" },
    ];
    facts.firstDays = [{ roomId: "old", day: "2026-10-01" }, { roomId: "new", day: "2026-11-01" }];
    const stats = aggregateLaunchStats(facts, range("2026-11-01", "2026-11-03"));
    expect(stats.days.map((d) => d.returningRooms)).toEqual([1, 1, 1]);
    // Distinct rooms over the range: "new" returned on two days but counts once.
    expect(stats.totals.returningRooms).toBe(2);
    expect(stats.totals.activeRooms).toBe(2);
  });

  it("does not count an AI seat that joined before the range, but still keeps it out of played", () => {
    const facts = empty();
    facts.activity = [
      { roomId: "r", day: "2026-11-02", participantId: "gm" },
      { roomId: "r", day: "2026-11-02", participantId: "ai" },
    ];
    facts.firstDays = [{ roomId: "r", day: "2026-10-20" }];
    facts.aiSeats = [{ roomId: "r", participantId: "ai", at: "2026-10-20T09:00:00.000Z" }];
    const stats = aggregateLaunchStats(facts, range("2026-11-01", "2026-11-02"));
    expect(stats.totals).toMatchObject({ aiSeatsJoined: 0, playedRooms: 0, activeRooms: 1, returningRooms: 1 });
  });

  it("returns counts only: no id from the facts appears in the result", () => {
    const facts = empty();
    facts.accounts = [{ id: "account-secret", at: "2026-11-01T01:00:00.000Z" }];
    facts.rooms = [{ id: "room-secret", at: "2026-11-01T01:00:00.000Z", host: "account" }];
    facts.activity = [{ roomId: "room-secret", day: "2026-11-01", participantId: "person-secret" }];
    facts.firstDays = [{ roomId: "room-secret", day: "2026-11-01" }];
    const json = JSON.stringify(aggregateLaunchStats(facts, range("2026-11-01", "2026-11-01")));
    expect(json).not.toMatch(/secret/);
  });
});
