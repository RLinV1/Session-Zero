/**
 * What the admin launch stats are counted from (docs/adr/0080-admin-launch-stats.md). Every fact is
 * read from rows the server already keeps; nothing is recorded for stats. The ids here let the
 * counter tell rooms and people apart, and never leave the server: `aggregateLaunchStats` turns
 * these into counts.
 *
 * The window is `[from, to)`, two ISO times. Temporary encounter-editing rooms (ADR 0033) are left
 * out throughout. Deleted rooms are gone from every fact, because deletion erases them (ADR 0009).
 */
export interface LaunchStatsFacts {
  /** Accounts created before the window that still exist. */
  accountsBefore: number;
  /** Rooms opened before the window that still exist. */
  roomsBefore: number;
  /** Accounts created in the window. */
  accounts: { id: string; at: string }[];
  /**
   * Rooms created in the window and who hosts them: a guest identity, an account, or neither
   * (a room from before accounts, owned by a device identity or nobody).
   */
  rooms: { id: string; at: string; host: "guest" | "account" | "other" }[];
  /** Each room, UTC day (`YYYY-MM-DD`) and participant with at least one event in the window. */
  activity: { roomId: string; day: string; participantId: string }[];
  /** For every room in `activity`: the UTC day of its first event ever, which may be before the window. */
  firstDays: { roomId: string; day: string }[];
  /** For every room in `activity`: the seats that joined with the AI label (ADR 0052), whenever they joined. */
  aiSeats: { roomId: string; participantId: string; at: string }[];
}

/** " (AI)", which `apps/mcp` appends to every AI seat's name (ADR 0052; apps/mcp/src/joinRoom.ts). */
export const AI_SEAT_LABEL = " (AI)";

export interface StatsStore {
  launchStatsFacts(from: string, to: string): Promise<LaunchStatsFacts>;
}
