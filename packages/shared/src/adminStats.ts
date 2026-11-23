import { z } from "zod";

/**
 * Launch stats for site admins (docs/adr/0080-admin-launch-stats.md): aggregate counts per UTC day,
 * computed from what the server already stores. Counts only: no ids, names, emails, addresses,
 * room names or chat ever appear here.
 */

/** A calendar day in UTC, `YYYY-MM-DD`. */
export const StatsDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  // Runs after a failed regex too (zod keeps checking), so it must not throw on any string.
  .refine((day) => {
    const ms = Date.parse(`${day}T00:00:00.000Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === day;
  }, "not a real date");

/** The longest range one request may ask for. */
export const MAX_STATS_DAYS = 366;

/** `GET /api/admin/stats?from=&to=`: an inclusive range of UTC days; both optional (last 30 days). */
export const LaunchStatsQuery = z.strictObject({ from: StatsDay.optional(), to: StatsDay.optional() });
export type LaunchStatsQuery = z.infer<typeof LaunchStatsQuery>;

const Count = z.number().int().nonnegative();

export const ReferralSource = z.enum(["tiktok", "youtube", "instagram"]);
export type ReferralSource = z.infer<typeof ReferralSource>;
const ReferralSignups = z.record(ReferralSource, Count);

export const LaunchStatsCounts = z.object({
  /** Accounts signed up. */
  accountsCreated: Count,
  /** Rooms opened (temporary encounter-editing rooms aside), and who hosted them. */
  roomsCreated: Count,
  roomsCreatedByGuests: Count,
  roomsCreatedByAccounts: Count,
  /** Rooms where at least one participant joined or did something. */
  activeRooms: Count,
  /** Rooms where 2+ different people (AI seats aside) joined or did something on the same day. */
  playedRooms: Count,
  /** Active rooms that had also been active on an earlier day. */
  returningRooms: Count,
  /** Seats an AI app took through the MCP server (ADR 0052). */
  aiSeatsJoined: Count,
  /**
   * People at tables: seats (AI aside) that joined or did something. One person in two rooms is
   * two seats. The range total counts each seat once.
   */
  peopleActive: Count,
  /** Growth: accounts that exist and were created by the end of the day (range total: by its last day). */
  accountsToDate: Count,
  /** Growth: rooms that exist and were opened by the end of the day, temporary rooms aside. */
  roomsToDate: Count,
});
export type LaunchStatsCounts = z.infer<typeof LaunchStatsCounts>;

export const LaunchStatsDayRow = LaunchStatsCounts.extend({ date: StatsDay });
export type LaunchStatsDayRow = z.infer<typeof LaunchStatsDayRow>;

export const LaunchStatsResponse = z.object({
  range: z.object({ from: StatsDay, to: StatsDay }),
  /** One row per day of the range, oldest first, days with nothing included. */
  days: z.array(LaunchStatsDayRow),
  /**
   * The whole range. Room and seat counts are distinct, so a room played on three days counts
   * once; the to-date counts are the last day's; the other counts are sums.
   */
  totals: LaunchStatsCounts,
  referralSignups: ReferralSignups.optional(),
});
export type LaunchStatsResponse = z.infer<typeof LaunchStatsResponse>;
