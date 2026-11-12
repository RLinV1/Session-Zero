import { useState } from "react";
import { X } from "@phosphor-icons/react";
import { areaEffectStage, attackLabel, formatAttackParties, isActive, type AreaEffect, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { PanelSection } from "../ui/PanelSection";
import { pendingRulingCount, pendingRulings, type PendingRuling } from "./attackRoll";
import { ResolveButton, useGoToAreaEffect } from "./AreaEffectPanel";
import { RulingButtons } from "./RulingButtons";
import { useDisplayedHealth } from "../board/nukeHealth";
import { getLocale, t } from "../i18n/locale";

/**
 * The GM's queue of attack rolls to rule on (attack-rulings, ADR 0011): to-hit rolls waiting for
 * Hit or Miss, and damage rolls waiting to be applied. Players roll without asking; the GM rules
 * afterwards, and the app never decides for them (README §7). Rendered for the GM only; the
 * server refuses these commands from anyone else regardless.
 */
/** The busy key for Clear all, which names no single roll. */
const CLEAR_ALL = "clear-all";

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
    <PanelSection
      id="rulings"
      title={count ? t("ruling.title", { n: count }) : t("ruling.titlePlain")}
      // Every attack roll shown, by id, so one made since isn't swept away; never the area effect (ADR 0060).
      actions={pending.length > 0 && (
        <button
          type="button"
          className="small secondary"
          disabled={busy.has(CLEAR_ALL)}
          onClick={() => send(CLEAR_ALL, { type: "roll.dismiss", rollIds: pending.map((item) => item.roll.id) })}
        >
          {t("ruling.clearAll")}
        </button>
      )}
    >
      {count === 0 ? (
        <p className="muted">{t("ruling.nothing")}</p>
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
              onIgnore={() => send(item.roll.id, { type: "roll.dismiss", rollIds: [item.roll.id] })}
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
  const count = t("ruling.targetsN", { n: effect.targets.length });
  const status =
    stage === "started" ? t("ruling.rolled")
    : stage === "rolled" ? t("ruling.damageRolled")
    : yours ? t("ruling.yourDamage")
    : t("ruling.waiting", { name: !caller ? t("common.someone") : isActive(caller) ? caller.displayName : t("area.leftTable", { name: caller.displayName }) });
  return (
    <li className="ruling">
      <span className="ruling-line">
        <span className="ruling-parties">{effect.label ?? t("area.title")} · {count}</span>
        <span className="muted">{status}</span>
      </span>
      <span className="ruling-actions">
        <span className="ruling-buttons">
          {stage === "started" && (
            <>
              <button type="button" disabled={busy} onClick={goTo}>{t("area.call")}</button>
              <ResolveButton stage={stage} disabled={busy} onClick={onResolve} />
            </>
          )}
          {stage === "called" && yours && <button type="button" className="primary" disabled={busy} onClick={goTo}>{t("attack.rollDamage")}</button>}
          {stage === "called" && !yours && (
            <>
              <button type="button" disabled={busy} onClick={goTo}>{t("area.reassign")}</button>
              <button type="button" disabled={busy} onClick={onTakeOver}>{t("area.takeOver")}</button>
            </>
          )}
          {stage === "rolled" && <ResolveButton stage={stage} disabled={busy} onClick={onResolve} />}
          {!(stage === "called" && !yours) && <button type="button" className="secondary" disabled={busy} onClick={onSkip}>{t("area.skip")}</button>}
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
  onIgnore,
}: {
  item: PendingRuling;
  busy: boolean;
  /** The dice are still landing: the total and the controls wait for them. */
  rolling: boolean;
  onRule: (verdict: "hit" | "miss") => void;
  onApply: () => void;
  /** Takes it off the list without ruling; it stays in the roll log (ADR 0060). */
  onIgnore: () => void;
}) {
  const { roll } = item;
  const attack = roll.attack!;
  const label = attackLabel(attack, getLocale());
  const description = `${formatAttackParties(attack, getLocale())}${label ? ` · ${label}` : ""}`;
  return (
    <li className="ruling">
      <span className="ruling-line">
        <span className="ruling-parties">{description}</span>
        <span className="ruling-total">
          <strong>{rolling ? t("home.dice.rolling") : roll.total}</strong> <span className="muted">{roll.expression}</span>
          {roll.visibility === "gm" && <em className="badge">{t("rail.gmOnly")}</em>}
        </span>
      </span>
      <span className="ruling-actions">
        {/* A reference for the GM's own call; nothing here compares it to the roll. */}
        <span className="muted">
          {item.kind === "toHit"
            ? item.ac === null ? t("ruling.noAc") : t("ruling.ac", { n: item.ac })
            : t("ruling.hp", { hp: `${item.hp}${item.maxHp !== null ? `/${item.maxHp}` : ""}` })}
        </span>
        {/* Not even disabled: Apply −N and the buttons' names would give the total away. */}
        {!rolling && <RulingButtons item={item} description={`${description}, ${roll.total}`} busy={busy} onRule={onRule} onApply={onApply} />}
        <button type="button" className="icon-button ruling-ignore" disabled={busy} onClick={onIgnore} aria-label={t("ruling.ignoreNamed", { what: description })} title={t("ruling.ignore")}>
          <X size={14} aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}
