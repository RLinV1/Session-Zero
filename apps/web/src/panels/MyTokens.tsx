import { hpFraction, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { ConditionMarker } from "./ConditionMarker";
import { PanelSection } from "../ui/PanelSection";
import { useDisplayedHealth } from "../board/nukeHealth";
import { hpLevel } from "../ui/palette";
import { TokenDisc } from "../ui/TokenDisc";

/**
 * The player's own characters, promoted above everything else (FR-PL-03).
 *
 * A player's board is about their own tokens; the full roster is reference material. This
 * section answers "what is my character's state right now" without scrolling past the GM's
 * administration controls or twenty other tokens.
 *
 * Rendered for the GM too, when they happen to own tokens — the rule is ownership, not role.
 */
export function MyTokens({
  connection,
  state,
  you,
  onFocusToken,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  onFocusToken: (tokenId: string) => void;
}) {
  const displayed = useDisplayedHealth(state);
  const mine = Object.values(state.tokens)
    .filter((t) => t.ownerIds.includes(you.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // A GM controls every token already; the section only earns its place if they own some.
  if (you.role === "gm" && mine.length === 0) return null;

  const activeId = state.initiative?.order[state.initiative.activeIndex] ?? null;

  return (
    <PanelSection id="my-tokens" title="My tokens">
      {mine.length === 0 ? (
        <p className="muted">
          {you.role === "gm"
            ? "You control every token as GM."
            : "The GM has not assigned you a token yet."}
        </p>
      ) : (
      <ul className="plain my-tokens">
        {mine.map((token) => {
          const stats = displayed.tokens[token.id]!.stats;
          const fraction = hpFraction(stats);
          const isActive = token.id === activeId;
          return (
            <li key={token.id} className={isActive ? "my-token active" : "my-token"}>
              <button type="button" className="my-token-head" onClick={() => onFocusToken(token.id)}>
                <TokenDisc name={token.name} color={token.color} image={token.imageUrl} size="1.75rem" className="small" />
                <span className="my-token-name">{token.name}</span>
                {isActive && <span className="badge active-badge">your turn</span>}
              </button>

              {(token.stats.hp !== null || token.stats.ac !== null) && (
                <p className="my-token-stats">
                  {token.stats.hp !== null && (
                    <span className="hp">
                      {stats.hp}
                      {token.stats.maxHp !== null && `/${token.stats.maxHp}`} HP
                    </span>
                  )}
                  {token.stats.ac !== null && <span className="muted num">AC {token.stats.ac}</span>}
                </p>
              )}

              {fraction !== null && (
                <div
                  className="hp-bar"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={token.stats.maxHp ?? 0}
                  aria-valuenow={stats.hp ?? 0}
                  aria-label={`${token.name} hit points`}
                >
                  <span style={{ width: `${fraction * 100}%` }} data-level={hpLevel(fraction)} />
                </div>
              )}

              {token.conditions.length > 0 && (
                <ul className="plain marker-row">
                  {token.conditions.map((c) => (
                    <li key={c}>
                      <ConditionMarker id={c} size={24} />
                    </li>
                  ))}
                </ul>
              )}

              {/* Damage and healing are the two things a player does constantly; typing
                  into the roster's editor for every hit is too slow mid-encounter. */}
              {token.stats.hp !== null && (
                <div className="hp-quick">
                  {[-5, -1, +1, +5].map((delta) => (
                    <button
                      key={delta}
                      type="button"
                      className="chip"
                      onClick={() =>
                        connection.command({
                          type: "token.setStats",
                          tokenId: token.id,
                          stats: {
                            ...token.stats,
                            hp: clamp(token.stats.hp! + delta, token.stats.maxHp),
                          },
                        })
                      }
                      aria-label={`${delta > 0 ? "Heal" : "Damage"} ${token.name} by ${Math.abs(delta)}`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      )}
    </PanelSection>
  );
}

/** The server rejects hp above maxHp, so clamp rather than letting a tap fail. */
const clamp = (hp: number, maxHp: number | null) => (maxHp === null ? hp : Math.min(hp, maxHp));
