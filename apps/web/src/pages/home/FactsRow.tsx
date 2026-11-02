import { MAX_PLAYERS_PER_ROOM } from "@vtt/shared";

/**
 * How fast a ping reaches the other screens at the table: the p95 target the ephemeral benchmark
 * holds the server to (apps/server/test/ephemeralLatency.test.ts, TARGET_P95_MS). A server test
 * can't be imported here, so homeFacts.test.tsx reads that file and fails when the two disagree.
 */
export const PING_TARGET_MS = 150;

/**
 * Four facts under the hero, each from the product's own limits or a target its tests measure
 * (gm-home: "Figures are sourced"). Undo names what it covers: the table can't undo every action
 * (a deleted token, a chat message or a roll stays), so the row doesn't say it can.
 */
export function FactsRow() {
  return (
    <ul className="plain facts-row" aria-label="At a glance">
      <li>
        <strong>No account</strong> <span>for players. They join from a link, in any browser.</span>
      </li>
      <li>
        <strong>
          Up to <span className="num">{MAX_PLAYERS_PER_ROOM}</span>
        </strong>{" "}
        <span>players in one room.</span>
      </li>
      <li>
        <strong>
          Under <span className="num">{PING_TARGET_MS} ms</span>
        </strong>{" "}
        <span>for a ping to reach everyone at the table.</span>
      </li>
      <li>
        <strong>Undo</strong> <span>for moves, fog, walls and hit points.</span>
      </li>
    </ul>
  );
}
