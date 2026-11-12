import { useState } from "react";
import { presetOf, rolledDamageFor, type AreaEffect, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { ResolveResults, ResolveTargetBody, type ResolveResult } from "./ResolveTarget";
import { damageRollId, savesRollId } from "../board/tokenDice";
import { amountText, applyToAll, resolveRows, resolveTargets, type ResolveDraft } from "./resolveDraft";
import { t } from "../i18n/locale";

/**
 * The resolve step of an Area Effect (ADR 0046), docked low on the screen so most of the map stays
 * in view: one target at a time, its amount and the conditions to add, then Confirm resolution. Closing
 * sends nothing; the draft lives with the caller, so reopening brings it back.
 */
export function ResolveDialog({
  connection,
  state,
  effect,
  draft,
  onDraft,
  open,
  onClose,
  airborne,
}: {
  /** Rolls whose dice are still dropping: their totals wait (ADR 0046). */
  airborne: ReadonlySet<string>;
  connection: RoomConnection;
  state: RoomState;
  effect: AreaEffect;
  draft: ResolveDraft;
  onDraft: (next: ResolveDraft) => void;
  open: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conditionsOn = presetOf(state).features.conditions;
  const targets = resolveTargets(effect, state);
  const step = Math.min(draft.step, Math.max(0, targets.length - 1));
  const target = targets[step];
  const token = target ? state.tokens[target.tokenId] : undefined;
  const rolled = target ? rolledDamageFor(effect, target.tokenId) : null;
  const go = (next: number) => onDraft({ ...draft, step: next });
  const setAmount = (text: string) => target && onDraft({ ...draft, amounts: { ...draft.amounts, [target.tokenId]: text } });

  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setError(result.ok ? null : result.message);
  };
  const confirm = () => {
    const built = resolveRows(draft, effect, state);
    if (!built.ok) {
      go(built.step);
      return setError(built.message);
    }
    void send({ type: "areaEffect.resolve", effectId: effect.id, rows: built.rows });
  };

  const effectName = effect.label ?? t("area.title");
  // The token is what the GM is deciding about, so it is the title; the effect and step sit beside it.
  const position = target ? `${effectName} · ${step + 1} of ${targets.length}` : effectName;
  const rollShown = target?.roll ? (airborne.has(savesRollId(effect.id)) ? "…" : String(target.roll.total)) : null;
  const damageShown = rolled === null ? null : airborne.has(damageRollId(effect.id)) ? "…" : String(rolled);
  const fieldId = target ? `resolve-amount-${target.tokenId}` : "resolve-amount";
  const text = target ? amountText(draft, effect, target.tokenId) : "";
  const results: ResolveResult[] = [
    ...(rollShown !== null ? [{ label: t("home.dice.roll"), value: rollShown, detail: effect.expression }] : []),
    ...(damageShown !== null ? [{ label: t("resolve.damage"), value: damageShown, detail: effect.damage?.expression }] : []),
  ];

  return (
    <Modal
      open={open}
      title={target?.name ?? t("resolve.noTargets")}
      className="resolve-dock"
      onClose={onClose}
      // The roll, damage and HP sit beside the token's name, so they never scroll out of view.
      headerContent={
        <div className="resolve-head">
          {target && token && <ResolveResults results={results} token={token} />}
          <span className="resolve-position" aria-live="polite">{position}</span>
        </div>
      }
    >
      {target && token && (
        <ResolveTargetBody
          name={target.name}
          token={token}
          fieldId={fieldId}
          amount={text}
          rolled={rolled ?? 0}
          onAmount={setAmount}
          conditionsOn={conditionsOn}
          added={draft.added[target.tokenId] ?? []}
          onAdded={(next) => onDraft({ ...draft, added: { ...draft.added, [target.tokenId]: next } })}
        >
          {targets.length > 1 && (
            <button
              type="button"
              className="secondary small resolve-apply-all"
              disabled={(draft.added[target.tokenId] ?? []).length === 0}
              onClick={() => onDraft(applyToAll(draft, targets.map((t) => t.tokenId), target.tokenId, (id) => state.tokens[id]?.conditions ?? []))}
            >
              {t("resolve.applyConditions")}
            </button>
          )}
        </ResolveTargetBody>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      <div className="resolve-actions">
        <button type="button" className="secondary" disabled={step === 0} onClick={() => go(step - 1)}>{t("resolve.previous")}</button>
        <button type="button" className={step >= targets.length - 1 ? undefined : "primary"} disabled={step >= targets.length - 1} onClick={() => go(step + 1)}>{t("tour.next")}</button>
        <span className="resolve-actions-gap" />
        {/* Quiet until the last target, so stepping through with Next is the obvious path. */}
        <button type="button" className={step >= targets.length - 1 ? "primary" : undefined} disabled={busy} onClick={confirm}>{t("resolve.confirm")}</button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void send({ type: "areaEffect.close", effectId: effect.id })}>{t("area.skip")}</button>
      </div>
    </Modal>
  );
}
