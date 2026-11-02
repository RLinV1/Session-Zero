import { useState } from "react";
import { areaEffectStage, attackLabel, formatAttackParties, isActive, type AreaEffect, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { PanelSection } from "../ui/PanelSection";
import { pendingRulingCount, pendingRulings, type PendingRuling } from "./attackRoll";
import { ResolveButton, useGoToAreaEffect } from "./AreaEffectPanel";
import { RulingButtons } from "./RulingButtons";
import { useDisplayedHealth } from "../board/nukeHealth";

/**
 * The GM's queue of attack rolls to rule on (attack-rulings, ADR 0011): to-hit rolls waiting for
 * Hit or Miss, and damage rolls waiting to be applied. Players roll without asking; the GM rules
 * afterwards, and the app never decides for them (README §7). Rendered for the GM only; the
 * server refuses these commands from anyone else regardless.
 */
export function RulingsPanel({
  connection,
  state,
  you,
  airborne,
  onResolve,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  /** Open the area effect's resolve dialog (ADR 0046). */
  onResolve: () => void;
  /** Rolls whose dice are still in the air on this screen: the total and the controls wait for them. */
  airborne: ReadonlySet<string>;
}) {
  const shown = useDisplayedHealth(state);
  const pending = pendingRulings(shown);
  const count = pendingRulingCount(shown);
  const effect = state.areaEffect ?? null;
  // One request per roll at a time; the server refuses a second apply anyway.
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const send = async (rollId: string, command: Parameters<RoomConnection["command"]>[0]) => {
    setBusy((s) => new Set(s).add(rollId));
    const result = await connection.command(command);
    setBusy((s) => {
      const next = new Set(s);
      next.delete(rollId);
      return next;
    });
    setError(result.ok ? null : result.message);
  };

  return (
    <PanelSection id="rulings" title={count ? `Rulings (${count})` : "Rulings"}>
      {count === 0 ? (
        <p className="muted">Nothing to rule on.</p>
      ) : (
        <ul className="plain rulings">
          {effect && (
            <AreaEffectRow
              effect={effect}
              state={state}
              you={you}
              busy={busy.has(effect.id)}
              onTakeOver={() => send(effect.id, { type: "areaEffect.call", effectId: effect.id, participantId: you.id })}
              onResolve={onResolve}
              onSkip={() => send(effect.id, { type: "areaEffect.close", effectId: effect.id })}
            />
          )}
          {pending.map((item) => (
            <RulingRow
              key={item.roll.id}
              item={item}
              busy={busy.has(item.roll.id)}
              rolling={airborne.has(item.roll.id)}
              onRule={(verdict) => send(item.roll.id, { type: "roll.rule", rollId: item.roll.id, verdict })}
              onApply={() => send(item.roll.id, { type: "roll.applyDamage", rollId: item.roll.id })}
            />
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </PanelSection>
  );
}

/**
 * The open area effect, at every stage (ADR 0046). Take over and Skip act here, and Resolve opens
 * the resolve dialog; the controls that need a choice (who to call, the damage formula) open the
 * Area Effect section.
 */
function AreaEffectRow({ effect, state, you, busy, onTakeOver, onResolve, onSkip }: {
  effect: AreaEffect;
  state: RoomState;
  you: Participant;
  busy: boolean;
  onTakeOver: () => void;
  onResolve: () => void;
  onSkip: () => void;
}) {
  const goTo = useGoToAreaEffect();
  const stage = areaEffectStage(effect);
  const caller = effect.call ? state.participants[effect.call.participantId] : undefined;
  const yours = effect.call?.participantId === you.id;
  const count = `${effect.targets.length} ${effect.targets.length === 1 ? "target" : "targets"}`;
  const status =
    stage === "started" ? "Rolled"
    : stage === "rolled" ? "Damage rolled"
    : yours ? "Your damage roll"
    : `Waiting on ${caller?.displayName ?? "someone"}${caller && !isActive(caller) ? " (left the table)" : ""}`;
  return (
    <li className="ruling">
      <span className="ruling-line">
        <span className="ruling-parties">{effect.label ?? "Area effect"} · {count}</span>
        <span className="muted">{status}</span>
      </span>
      <span className="ruling-actions">
        <span className="ruling-buttons">
          {stage === "started" && (
            <>
              <button type="button" disabled={busy} onClick={goTo}>Call</button>
              <ResolveButton stage={stage} disabled={busy} onClick={onResolve} />
            </>
          )}
          {stage === "called" && yours && <button type="button" className="primary" disabled={busy} onClick={goTo}>Roll damage</button>}
          {stage === "called" && !yours && (
            <>
              <button type="button" disabled={busy} onClick={goTo}>Reassign</button>
              <button type="button" disabled={busy} onClick={onTakeOver}>Take over</button>
            </>
          )}
          {stage === "rolled" && <ResolveButton stage={stage} disabled={busy} onClick={onResolve} />}
          {!(stage === "called" && !yours) && <button type="button" className="secondary" disabled={busy} onClick={onSkip}>Skip</button>}
        </span>
      </span>
    </li>
  );
}

function RulingRow({
  item,
  busy,
  rolling,
  onRule,
  onApply,
}: {
  item: PendingRuling;
  busy: boolean;
  /** The dice are still landing: the total and the controls wait for them. */
  rolling: boolean;
  onRule: (verdict: "hit" | "miss") => void;
  onApply: () => void;
}) {
  const { roll } = item;
  const attack = roll.attack!;
  const label = attackLabel(attack);
  const description = `${formatAttackParties(attack)}${label ? ` · ${label}` : ""}`;
  return (
    <li className="ruling">
      <span className="ruling-line">
        <span className="ruling-parties">{description}</span>
        <span className="ruling-total">
          <strong>{rolling ? "Rolling…" : roll.total}</strong> <span className="muted">{roll.expression}</span>
          {roll.visibility === "gm" && <em className="badge">GM only</em>}
        </span>
      </span>
      <span className="ruling-actions">
        {/* A reference for the GM's own call; nothing here compares it to the roll. */}
        <span className="muted">
          {item.kind === "toHit"
            ? item.ac === null ? "No AC" : `AC ${item.ac}`
            : `${item.hp}${item.maxHp !== null ? `/${item.maxHp}` : ""} HP`}
        </span>
        {/* Not even disabled: Apply −N and the buttons' names would give the total away. */}
        {!rolling && <RulingButtons item={item} description={`${description}, ${roll.total}`} busy={busy} onRule={onRule} onApply={onApply} />}
      </span>
    </li>
  );
}
