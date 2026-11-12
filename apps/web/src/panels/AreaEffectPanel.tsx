import { useState, type FormEvent } from "react";
import {
  areaEffectStage,
  isActive,
  MAX_ATTACK_LABEL,
  parseDiceExpression,
  type AreaEffect,
  type AreaEffectStage,
  type CommandInput,
  type DamageMode,
  type Participant,
  type RoomState,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { PanelSection, useSectionCollapse } from "../ui/PanelSection";
import { defaultCaller } from "./attackRoll";
import { GroupSelectionList, type GroupSelection } from "./GroupSelection";
import { damageRollId, savesRollId } from "../board/tokenDice";
import { t } from "../i18n/locale";

/** The section's collapse key, also how the Rulings list finds it. */
export const AREA_EFFECT_SECTION = "area-effect";

/** Open the Area Effect section and bring it into view, e.g. from its Rulings row. */
export function useGoToAreaEffect() {
  const sections = useSectionCollapse();
  return () => {
    sections.setCollapsed(AREA_EFFECT_SECTION, false);
    // After the body is shown, so the browser can scroll to and focus what is in it.
    requestAnimationFrame(() => {
      const section = document.querySelector<HTMLElement>(`[data-tour="${AREA_EFFECT_SECTION}"]`);
      section?.scrollIntoView({ block: "start", behavior: "smooth" });
      section?.querySelector<HTMLElement>("[data-area-effect-focus]")?.focus();
    });
  };
}

/** A participant's name, saying so when they have left. */
function callerName(state: RoomState, participantId: string): string {
  const p = state.participants[participantId];
  if (!p) return t("room.someone");
  return isActive(p) ? p.displayName : t("area.leftTable", { name: p.displayName });
}

const effectTitle = (effect: Pick<AreaEffect, "label">) => effect.label ?? t("area.title");

/** Sends one command at a time and keeps the server's refusal to show. */
function useSender(connection: RoomConnection) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (command: CommandInput) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setError(result.ok ? null : result.message);
    return result.ok;
  };
  return { busy, error, setError, send };
}

/**
 * The GM's Area Effect (ADR 0046): roll a formula for every selected token, call someone to roll
 * the damage (themselves included), then resolve each token's outcome as one undoable action.
 * Every step after the first can be skipped. The saves are advisory: nothing here decides.
 */
export function AreaEffectPanel({ connection, state, you, selection, onResolve, airborne }: {
  /** Rolls whose dice are still dropping: their totals wait (ADR 0046). */
  airborne: ReadonlySet<string>;
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  selection: GroupSelection;
  /** Open the resolve dialog, which keeps its draft between openings. */
  onResolve: () => void;
}) {
  const effect = state.areaEffect ?? null;
  return (
    <PanelSection id={AREA_EFFECT_SECTION} title={effect ? t("area.titleNamed", { name: effectTitle(effect) }) : t("area.titleCaps")}>
      {effect ? (
        <OpenEffect key={effect.id} connection={connection} state={state} you={you} effect={effect} onResolve={onResolve} airborne={airborne} />
      ) : (
        <StartForm connection={connection} state={state} selection={selection} />
      )}
    </PanelSection>
  );
}

function StartForm({ connection, state, selection }: { connection: RoomConnection; state: RoomState; selection: GroupSelection }) {
  const [expression, setExpression] = useState("1d20");
  const [label, setLabel] = useState("");
  const { busy, error, setError, send } = useSender(connection);
  const parsed = parseDiceExpression(expression);
  const tokenIds = selection.tokenIds.filter((id) => state.tokens[id]);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    if (await send({ type: "areaEffect.start", tokenIds, expression, label: label.trim() || undefined })) selection.clear();
  };

  return (
    <form onSubmit={start} className="stack">
      <GroupSelectionList selection={selection} state={state} idPrefix="area-effect" />
      <label htmlFor="area-effect-expression">{t("area.rollEach")}</label>
      <div className="dice-row">
        <input id="area-effect-expression" value={expression} onChange={(e) => { setExpression(e.target.value); setError(null); }} placeholder="1d20+2" autoComplete="off" aria-invalid={expression.trim() !== "" && !parsed.ok} data-area-effect-focus />
        <button className="primary" type="submit" disabled={busy || tokenIds.length === 0 || !parsed.ok} title={tokenIds.length === 0 ? t("area.selectFirst") : undefined}>
          {t("area.start")}
        </button>
      </div>
      <label htmlFor="area-effect-label">{t("area.effectName")} <span className="muted">{t("area.optional")}</span></label>
      <input id="area-effect-label" value={label} maxLength={MAX_ATTACK_LABEL} onChange={(e) => setLabel(e.target.value)} placeholder={t("area.newEffect")} autoComplete="off" />
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

function OpenEffect({ connection, state, you, effect, onResolve, airborne }: { connection: RoomConnection; state: RoomState; you: Participant; effect: AreaEffect; onResolve: () => void; airborne: ReadonlySet<string> }) {
  const stage = areaEffectStage(effect);
  const { busy, error, send } = useSender(connection);
  const skip = () => void send({ type: "areaEffect.close", effectId: effect.id });
  const skipButton = <button type="button" className="quiet-action area-effect-skip" disabled={busy} onClick={skip}>{t("area.skip")}</button>;

  return (
    <div className="stack area-effect">
      <TargetList state={state} effect={effect} rolling={airborne.has(savesRollId(effect.id))} />
      {effect.damage && <DamageSummary state={state} effect={effect} rolling={airborne.has(damageRollId(effect.id))} />}

      {stage === "started" && <CallForm connection={connection} state={state} you={you} effect={effect} label="call" />}

      {stage === "called" && effect.call && (
        effect.call.participantId === you.id ? (
          <>
            <DamageRollForm connection={connection} effect={effect} visibleTargets={effect.targets.length} />
            <CallForm connection={connection} state={state} you={you} effect={effect} label="reassign" />
            <div className="area-effect-footer">{skipButton}</div>
          </>
        ) : (
          <>
            <p className="area-effect-waiting" role="status">{t("area.waiting", { name: callerName(state, effect.call.participantId) })}</p>
            <CallForm connection={connection} state={state} you={you} effect={effect} label="reassign" />
            <div className="area-effect-footer">
              <button type="button" className="secondary" disabled={busy} onClick={() => void send({ type: "areaEffect.call", effectId: effect.id, participantId: you.id })}>{t("area.takeOver")}</button>
              {skipButton}
            </div>
          </>
        )
      )}

      {stage !== "called" && (
        <div className="area-effect-footer">
          <ResolveButton stage={stage} disabled={busy} onClick={onResolve} />
          {skipButton}
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

/**
 * Opens the resolve dialog (ADR 0046). Before damage is rolled it looks like Skip, since resolving
 * then skips the damage roll; once damage is in, it looks like Call, the next step.
 */
export function ResolveButton({ stage, disabled, onClick }: { stage: AreaEffectStage; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={stage === "rolled" ? undefined : "secondary"} disabled={disabled} onClick={onClick} title={stage === "rolled" ? undefined : t("area.noDamageRoll")}>
      {t("area.resolve")}
    </button>
  );
}

/** Each target with its advisory save and current HP; the GM's alone. */
function TargetList({ state, effect, rolling }: { state: RoomState; effect: AreaEffect; rolling: boolean }) {
  return (
    <ul className="plain area-effect-targets" aria-label={t("area.targets")}>
      {effect.targets.map((target) => {
        const token = state.tokens[target.tokenId];
        return (
          <li key={target.tokenId} className={token ? undefined : "muted"}>
            <span className="area-effect-name">{target.name}</span>
            <span className="area-effect-figures">
              {target.roll && <span>{effect.expression} <strong>{rolling ? "…" : target.roll.total}</strong></span>}
              {!token ? <em className="badge">{t("area.gone")}</em> : token.stats.hp !== null && <span className="muted">{token.stats.hp}{token.stats.maxHp !== null ? `/${token.stats.maxHp}` : ""} {t("creature.stat.hp")}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function DamageSummary({ state, effect, rolling }: { state: RoomState; effect: AreaEffect; rolling: boolean }) {
  const damage = effect.damage!;
  const who = state.participants[damage.byParticipantId]?.displayName ?? t("room.someone");
  return (
    <p className="area-effect-damage" role="status">
      {damage.mode === "single"
        ? <>{t("area.rolledSingle", { who, expr: damage.expression })}<strong>{rolling ? "…" : damage.total}</strong></>
        : t("area.rolledEach", { who, expr: damage.expression })}
    </p>
  );
}

/** Choose who rolls the damage: pre-filled with the active token's owner, else the GM (ADR 0046). */
function CallForm({ connection, state, you, effect, label }: { connection: RoomConnection; state: RoomState; you: Participant; effect: AreaEffect; label: "call" | "reassign" }) {
  const current = effect.call?.participantId ?? null;
  const candidates = Object.values(state.participants).filter((p) => isActive(p) && p.id !== current);
  const preferred = defaultCaller(state, you.id);
  const [choice, setChoice] = useState(candidates.some((p) => p.id === preferred) ? preferred : candidates[0]?.id ?? you.id);
  const { busy, error, send } = useSender(connection);
  // The one just called drops out of the list; fall back to whoever is first.
  const selected = candidates.some((p) => p.id === choice) ? choice : candidates[0]?.id ?? "";
  const id = `area-effect-${label}`;
  // Nobody else to hand it to (the GM alone): an empty list and a dead button is noise.
  if (label === "reassign" && candidates.length === 0) return null;
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) void send({ type: "areaEffect.call", effectId: effect.id, participantId: selected });
      }}
    >
      <label htmlFor={id}>{label === "call" ? t("area.whoRolls") : t("area.giveCall")}</label>
      <div className="dice-row">
        <select id={id} value={selected} onChange={(e) => setChoice(e.target.value)} data-area-effect-focus>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>{p.id === you.id ? t("area.you", { name: p.displayName }) : p.displayName}</option>
          ))}
        </select>
        <button className={label === "call" ? "primary" : "secondary"} type="submit" disabled={busy || !selected}>{t(label === "call" ? "area.call" : "area.reassign")}</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

/** Whoever holds the call writes the formula and picks one roll or one per target (ADR 0046). */
function DamageRollForm({ connection, effect, visibleTargets }: { connection: RoomConnection; effect: AreaEffect; visibleTargets: number }) {
  const [expression, setExpression] = useState("");
  const [mode, setMode] = useState<DamageMode>("single");
  const { busy, error, setError, send } = useSender(connection);
  const parsed = parseDiceExpression(expression);
  const roll = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    void send({ type: "areaEffect.rollDamage", effectId: effect.id, expression, mode });
  };
  const name = `damage-mode-${effect.id}`;
  return (
    <form onSubmit={roll} className="stack damage-roll-form">
      <label htmlFor={`damage-expression-${effect.id}`}>{t("area.damageFor", { n: visibleTargets })}</label>
      <div className="dice-row">
        <input
          id={`damage-expression-${effect.id}`}
          value={expression}
          onChange={(e) => { setExpression(e.target.value); setError(null); }}
          placeholder={t("area.damageFormula")}
          autoComplete="off"
          aria-invalid={expression.trim() !== "" && !parsed.ok}
          data-area-effect-focus
        />
        <button type="submit" className="primary" disabled={busy || !parsed.ok}>{t("home.dice.roll")}</button>
      </div>
      <fieldset className="damage-mode segmented">
        <legend className="sr-only">{t("area.howToRoll")}</legend>
        <label>
          <input type="radio" name={name} checked={mode === "single"} onChange={() => setMode("single")} />
          <span>{t("area.oneForAll")}</span>
        </label>
        <label>
          <input type="radio" name={name} checked={mode === "perTarget"} onChange={() => setMode("perTarget")} />
          <span>{t("area.onePerTarget")}</span>
        </label>
      </fieldset>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

/**
 * A player's damage call (ADR 0046), in their Play tab while they hold it. They see only the
 * targets the server let them see.
 */
export function DamageCallPrompt({ connection, state, you }: { connection: RoomConnection; state: RoomState; you: Participant }) {
  const effect = state.areaEffect ?? null;
  if (!effect || effect.call?.participantId !== you.id || areaEffectStage(effect) !== "called") return null;
  return (
    <PanelSection id="damage-call" title={t("area.rollDamageNamed", { name: effectTitle(effect) })}>
      <div className="stack">
        <p>{t("area.gmAsked", { name: effectTitle(effect) })}</p>
        {effect.targets.length > 0 && (
          <ul className="plain area-effect-targets" aria-label={t("area.visibleTargets")}>
            {effect.targets.map((t) => <li key={t.tokenId}>{t.name}</li>)}
          </ul>
        )}
        <DamageRollForm connection={connection} effect={effect} visibleTargets={effect.targets.length} />
      </div>
    </PanelSection>
  );
}
