import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_NUKE_DAMAGE, presetOf, type LibraryAnimation, type Point, type RoomState } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { DEFAULT_BOARD_SIZE } from "../board/gridRenderLimit";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { t } from "../i18n/locale";

/** The persisted map origin. Each viewer renders the blast at their own screen centre. */
export function mapCentre(state: Pick<RoomState, "scene">): Point {
  const size = state.scene.map ?? DEFAULT_BOARD_SIZE;
  return { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
}

/** Value of the animation select for the built-in blast. */
const BUILTIN = "builtin";

/**
 * The GM's table effects (ADR 0038): the map nuke. Animation preferences live in Settings.
 * The nuke damages every token with HP, so it asks for confirmation first; the server decides
 * everything else, and players never get this section. Undo is in the activity log.
 */
export function EffectsPanel({
  connection,
  state,
}: {
  connection: RoomConnection;
  state: RoomState;
}) {
  const nukeAllowed = presetOf(state).features.attacks;
  const signedIn = useAccount().status === "signedIn";
  const [library, setLibrary] = useState<LibraryAnimation[]>([]);
  const [amount, setAmount] = useState("10");
  const [animationId, setAnimationId] = useState(BUILTIN);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The GM's own nuke animations, when signed in; the built-in is always there.
  useEffect(() => {
    if (!signedIn || !nukeAllowed) return;
    let current = true;
    api.library.animations.list().then(
      (list) => current && setLibrary(list.filter((a) => a.def.shape === "nuke")),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [signedIn, nukeAllowed]);

  const amountValue = Number(amount);
  const amountValid = Number.isInteger(amountValue) && amountValue >= 1 && amountValue <= MAX_NUKE_DAMAGE;
  // Every board draws the blast in the middle of its own screen; the damage hits every token.
  const epicenter = mapCentre(state);
  const chosen = library.find((a) => a.id === animationId);

  const ask = (e: FormEvent) => {
    e.preventDefault();
    if (amountValid) setConfirming(true);
  };

  const detonate = async () => {
    if (busy || !amountValid) return;
    setBusy(true);
    const result = await connection.command({
      type: "nuke.detonate",
      amount: amountValue,
      origin: epicenter,
      ...(chosen && { animation: chosen.def }),
    });
    if (!live.current) return;
    setBusy(false);
    setConfirming(false);
    setError(result.ok ? null : result.message);
    setStatus(result.ok ? t("effects.nuked", { n: amountValue }) : "");
  };

  return (
    <PanelSection id="gm-effects" title={t("effects.title")}>
      <div className="stack">
        {nukeAllowed && (
          <form className="stack nuke-form" onSubmit={ask} aria-label={t("effects.nuke")}>
            <h3 className="field-label">{t("effects.nuke")}</h3>
            <label>
              {t("effects.nukeHint")}
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_NUKE_DAMAGE}
                step={1}
                value={amount}
                aria-invalid={!amountValid}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {!amountValid && <p className="error" role="alert">{t("effects.amountInvalid", { max: MAX_NUKE_DAMAGE })}</p>}
            <label>
              {t("home.attack.animation")}
              <select value={animationId} onChange={(e) => setAnimationId(e.target.value)}>
                <option value={BUILTIN}>{t("effects.builtIn")}</option>
                {library.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="danger-fill" disabled={!amountValid || busy}>
              {t("effects.detonateMenu")}
            </button>
          </form>
        )}
        {error && <p role="alert" className="error">{error}</p>}
        <p className="sr-only" role="status">{status}</p>
      </div>

      <Modal open={confirming} title={t("effects.detonateQ")} onClose={() => setConfirming(false)}>
        <div className="stack">
          <p>
            {t("effects.confirmBody", { n: amountValid ? String(amountValue) : "?" })}
          </p>
          <div className="row nuke-confirm-actions">
            <button type="button" className="danger-fill" disabled={busy} onClick={() => void detonate()}>
              {busy ? t("common.detonating") : t("effects.detonate")}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </Modal>
    </PanelSection>
  );
}
