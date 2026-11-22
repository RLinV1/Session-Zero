import { MAX_STATS_DAYS, type LaunchStatsCounts, type LaunchStatsDayRow, type LaunchStatsQuery, type LaunchStatsResponse } from "@vtt/shared";
import type { LaunchStatsFacts } from "../store/statsStore";

/** The default range: the last 30 UTC days, today included. */
export const DEFAULT_STATS_DAYS = 30;

const DAY_MS = 24 * 60 * 60_000;

/** An inclusive range of UTC days, and the `[from, to)` window of ISO times it covers. */
export interface StatsRange {
  from: string;
  to: string;
  window: { from: string; to: string };
}

const dayStart = (day: string) => Date.parse(`${day}T00:00:00.000Z`);
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The range a query asks for, with today (by `now`) as the default end and 30 days back from the
 * end as the default start. Null when the start is after the end or it spans more than
 * `MAX_STATS_DAYS` days.
 */
export function resolveStatsRange(query: LaunchStatsQuery, now: number): StatsRange | null {
  const to = query.to ?? dayOf(now);
  const from = query.from ?? dayOf(dayStart(to) - (DEFAULT_STATS_DAYS - 1) * DAY_MS);
  const span = (dayStart(to) - dayStart(from)) / DAY_MS + 1;
  if (span < 1 || span > MAX_STATS_DAYS) return null;
  return { from, to, window: { from: new Date(dayStart(from)).toISOString(), to: new Date(dayStart(to) + DAY_MS).toISOString() } };
}

const zero = (): LaunchStatsCounts => ({
  accountsCreated: 0,
  roomsCreated: 0,
  roomsCreatedByGuests: 0,
  roomsCreatedByAccounts: 0,
  activeRooms: 0,
  playedRooms: 0,
  returningRooms: 0,
  aiSeatsJoined: 0,
  peopleActive: 0,
  accountsToDate: 0,
  roomsToDate: 0,
});

/**
 * Turns stored facts into counts per UTC day and for the whole range (ADR 0080). Pure. Only
 * counts come out: the ids in `facts` are used to tell rooms and people apart and are dropped.
 *
 * - A room is active on a day when any participant joined it or did something in it that day.
 * - It was played that day when at least two different participants did, not counting AI seats.
 *   A person who joins twice as two guests counts twice; a person who only watched counts not at
 *   all, because only events are stored.
 * - It is returning on a day when it is active and its first event was on an earlier day.
 * - People active is seats (AI aside) that joined or acted that day, summed over rooms.
 * - The to-date counts run on from the accounts and rooms that existed before the range.
 */
export function aggregateLaunchStats(facts: LaunchStatsFacts, range: StatsRange): LaunchStatsResponse {
  const rows = new Map<string, LaunchStatsDayRow>();
  for (let ms = dayStart(range.from); ms <= dayStart(range.to); ms += DAY_MS) {
    const date = dayOf(ms);
    rows.set(date, { date, ...zero() });
  }
  const totals = zero();
  const inWindow = (at: string) => at >= range.window.from && at < range.window.to;

  for (const account of facts.accounts) {
    const row = rows.get(account.at.slice(0, 10));
    if (!row) continue;
    row.accountsCreated++;
    totals.accountsCreated++;
  }
  for (const room of facts.rooms) {
    const row = rows.get(room.at.slice(0, 10));
    if (!row) continue;
    row.roomsCreated++;
    totals.roomsCreated++;
    if (room.host === "guest") {
      row.roomsCreatedByGuests++;
      totals.roomsCreatedByGuests++;
    } else if (room.host === "account") {
      row.roomsCreatedByAccounts++;
      totals.roomsCreatedByAccounts++;
    }
  }

  const aiSeats = new Set(facts.aiSeats.map((s) => `${s.roomId}/${s.participantId}`));
  for (const seat of facts.aiSeats) {
    if (!inWindow(seat.at)) continue;
    const row = rows.get(seat.at.slice(0, 10));
    if (!row) continue;
    row.aiSeatsJoined++;
    totals.aiSeatsJoined++;
  }

  // Room -> day -> the people (AI seats aside) active in it that day; AI-only days stay as empty sets.
  const people = new Map<string, Map<string, Set<string>>>();
  for (const { roomId, day, participantId } of facts.activity) {
    if (!rows.has(day)) continue;
    const days = people.get(roomId) ?? new Map<string, Set<string>>();
    people.set(roomId, days);
    const set = days.get(day) ?? new Set<string>();
    days.set(day, set);
    if (!aiSeats.has(`${roomId}/${participantId}`)) set.add(participantId);
  }
  for (const [, days] of people) {
    for (const [day, set] of days) rows.get(day)!.peopleActive += set.size;
  }
  totals.peopleActive = new Set(facts.activity.filter((a) => rows.has(a.day) && !aiSeats.has(`${a.roomId}/${a.participantId}`)).map((a) => `${a.roomId}/${a.participantId}`)).size;

  const firstDay = new Map(facts.firstDays.map((f) => [f.roomId, f.day]));
  for (const [roomId, days] of people) {
    let played = false;
    let returning = false;
    const first = firstDay.get(roomId);
    for (const [day, set] of days) {
      const row = rows.get(day)!;
      row.activeRooms++;
      if (set.size >= 2) {
        row.playedRooms++;
        played = true;
      }
      if (first !== undefined && first < day) {
        row.returningRooms++;
        returning = true;
      }
    }
    totals.activeRooms++;
    if (played) totals.playedRooms++;
    if (returning) totals.returningRooms++;
  }

  // Growth: running totals from what existed before the range, so the last day is the total to date.
  let accounts = facts.accountsBefore;
  let rooms = facts.roomsBefore;
  for (const row of rows.values()) {
    accounts += row.accountsCreated;
    rooms += row.roomsCreated;
    row.accountsToDate = accounts;
    row.roomsToDate = rooms;
  }
  totals.accountsToDate = accounts;
  totals.roomsToDate = rooms;

  return { range: { from: range.from, to: range.to }, days: [...rows.values()], totals };
}
