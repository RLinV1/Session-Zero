import { IconAction } from "../ui/IconAction";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowCounterClockwise, CaretDown, CheckCircle, CopySimple, PencilSimple, Trash, UploadSimple } from "@phosphor-icons/react";
import type { BodyName } from "../ui/diceGeometry";
import { BODIES, DICE_PROMPT, SKIN_FILE_TYPES, type DiceSkin } from "../ui/diceSkin";
import { Link } from "../Link";
import { signInFor } from "../account/safeNext";
import {
  browserLookCount,
  copyTemplate,
  copyText,
  deleteDiceLook,
  readSkinFile,
  saveBrowserLooksToAccount,
  saveDiceLook,
  setActiveDiceLook,
  useDiceLooks,
} from "../ui/diceSkinStore";
import { Die3D, layoutDice } from "../ui/Die3D";
import { Modal } from "../ui/Modal";
import { PopoverButton } from "../ui/Popover";
import { t } from "../i18n/locale";

const SIDES: Record<BodyName, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

/**
 * The asset library's Dice tab (dice-image-skins): your dice looks, laid out like the other
 * tabs. The page's toolbar holds the search and "New dice look"; this is the grid of looks.
 * Each look holds a picture per die type, painted on that die's template (by hand or by an
 * image AI) or one square picture for every face. Signed in, looks are saved to the account
 * (dice-looks); signed out, they live in this browser.
 */
export function DiceLookCards({ query, onEdit }: { query: string; onEdit: (id: string) => void }) {
  const { looks, activeId, ready, kept } = useDiceLooks();
  const q = query.trim().toLowerCase();
  const shown = q ? looks.filter((l) => l.name.toLowerCase().includes(q)) : looks;

  if (!ready) {
    return (
      <p className="muted" aria-busy="true">
        {t("common.loading")}
      </p>
    );
  }
  return (
    <>
      {shown.length === 0 && (
        <p className="muted">
          {q
            ? t("dice.noLookMatch")
            : `${t("dice.noLooksBefore")}${
                kept === "account"
                  ? t("dice.savedToAccount")
                  : t("dice.keptInBrowser")
              }`}
        </p>
      )}
      <ul className="plain asset-grid" role="tabpanel">
        {shown.map((look) => (
          <DiceLookCard key={look.id} look={look} active={look.id === activeId} onEdit={() => onEdit(look.id)} />
        ))}
      </ul>
    </>
  );
}

function DiceLookCard({ look, active, onEdit }: { look: DiceSkin; active: boolean; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="asset-card dice-look-card">
      <div className="asset-thumb">
        <DicePreview look={look} bodies={["d6", "d20"]} />
      </div>
      <strong className="asset-name" title={look.name}>
        {look.name}
      </strong>
      <span className="muted asset-meta">
        {coverage(look)}
        {active && t("dice.inUse")}
      </span>
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={t("common.deleteNamedQ", { name: look.name })}>
          <p>{t("dice.deleteBody", { name: look.name })}</p>
          <div className="row">
            <button type="button" className="secondary small" onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="small danger-fill" onClick={() => void deleteDiceLook(look.id)}>
              {t("common.delete")}
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          {!active && <IconAction icon={<CheckCircle size={16} aria-hidden="true" />} label={t("common.use")} onClick={() => setActiveDiceLook(look.id)} />}
          <IconAction icon={<PencilSimple size={16} aria-hidden="true" />} label={t("common.edit")} onClick={onEdit} />
          <IconAction icon={<Trash size={16} aria-hidden="true" />} label={t("common.delete")} danger onClick={() => setConfirming(true)} />
        </div>
      )}
    </li>
  );
}

function coverage(look: DiceSkin): string {
  const covered = BODIES.filter((b) => look.images[b]);
  if (covered.length === 0) return t("dice.noPictures");
  if (covered.length === BODIES.length) return t("dice.everyDie");
  return covered.join(", ");
}

/** The look being edited, in a dialog like the creature form's. */
export function DiceLookModal({ lookId, onClose }: { lookId: string | null; onClose: () => void }) {
  const { looks, activeId } = useDiceLooks();
  const look = looks.find((l) => l.id === lookId) ?? null;
  return (
    <Modal open={look !== null} title={t("dice.editLook")} className="dice-look-modal" onClose={onClose}>
      {look && <DiceLookEditor key={look.id} look={look} active={activeId === look.id} onDone={onClose} />}
    </Modal>
  );
}

function DiceLookEditor({ look, active, onDone }: { look: DiceSkin; active: boolean; onDone: () => void }) {
  const [name, setName] = useState(look.name);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), STATUS_MS);
    return () => clearTimeout(timer);
  }, [note]);
  const rename = () => {
    const next = name.trim().slice(0, 40);
    if (next && next !== look.name) saveDiceLook({ ...look, name: next }).catch(() => setName(look.name));
    else setName(look.name);
  };
  return (
    <div className="stack dice-look-form">
      <label>
        {t("common.name")}
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && rename()}
          aria-describedby="dice-look-name-hint"
        />
        <span id="dice-look-name-hint" className="muted">
          {t("dice.lookHint")}
        </span>
      </label>
      <div className="stack">
        <div className="row dice-look-pictures-head">
          <span className="field-label">{t("dice.pictures")}</span>
          <button
            type="button"
            className="link"
            onClick={() => void copyText(DICE_PROMPT).then((ok) => setNote(ok ? t("dice.promptCopied") : t("dice.copyBlocked")))}
          >
            {t("dice.copyPrompt")}
          </button>
        </div>
        <p className="muted small-print">
          {note ?? t("dice.picturesHint")}
        </p>
        <ul className="plain die-card-grid">
          {BODIES.map((b, i) => (
            <DieCard key={b} look={look} body={b} index={i} />
          ))}
        </ul>
      </div>
      <div className="row modal-actions">
        {!active && (
          <button type="button" className="secondary" onClick={() => setActiveDiceLook(look.id)}>
            {t("dice.useAtTable")}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            rename();
            onDone();
          }}
        >
          {t("common.done")}
        </button>
      </div>
    </div>
  );
}

/** How long a die card's "copied" or "uploaded" line stays. */
const STATUS_MS = 4000;

/**
 * One die in the look: its preview and state, and a single Edit menu with everything you can
 * do to it, so six dice don't repeat the same four buttons.
 */
function DieCard({ look, body, index }: { look: DiceSkin; body: BodyName; index: number }) {
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const image = look.images[body];

  useEffect(() => {
    if (!status) return;
    // An error stays longer, to be read; it still clears, since it sits over the die.
    const timer = setTimeout(() => setStatus(null), status.error ? STATUS_MS * 2 : STATUS_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const result = await readSkinFile(file);
    if (typeof result === "string") return setStatus({ text: result, error: true });
    setStatus({ text: result.layout === "sheet" ? t("dice.templateOn") : t("dice.squareOn") });
    try {
      await saveDiceLook({ ...look, images: { ...look.images, [body]: result } });
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : t("dice.pictureFailed"), error: true });
    }
  };

  return (
    <li className="die-card" style={{ "--index": index } as CSSProperties}>
      <div className="asset-thumb die-card-thumb">
        <DicePreview look={look} bodies={[body]} size={64} />
        {/* What just happened, for a moment, over the die: the card itself never changes size. */}
        {status && (
          <p className={status.error ? "die-card-toast error" : "die-card-toast"} role={status.error ? "alert" : "status"}>
            {status.text}
          </p>
        )}
      </div>
      <div className="die-card-foot">
        <strong className="die-card-name">{body}</strong>
        <PopoverButton
          label={t("dice.editDie", { die: body })}
          title={t("dice.editDie", { die: body })}
          align="right"
          className="secondary small die-card-edit"
          buttonContent={
            <>
              <PencilSimple size={14} aria-hidden="true" />
              {t("common.edit")}
              <CaretDown size={12} aria-hidden="true" />
            </>
          }
        >
          {(close) => (
            <ul className="plain die-menu">
              <li>
                <button
                  type="button"
                  className="die-menu-item"
                  onClick={() => {
                    // Straight from the click: the clipboard only takes an image during one.
                    const copying = copyTemplate(body);
                    close();
                    void copying.then((how) =>
                      setStatus({ text: how === "copied" ? t("dice.templateCopied") : t("dice.templateSaved", { die: body }) }),
                    );
                  }}
                >
                  <CopySimple size={16} aria-hidden="true" />
                  {t("dice.copyTemplate")}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="die-menu-item"
                  onClick={() => {
                    // The file dialog also needs the click itself.
                    input.current?.click();
                    close();
                  }}
                >
                  <UploadSimple size={16} aria-hidden="true" />
                  {image ? t("dice.replacePicture") : t("dice.uploadPicture")}
                </button>
              </li>
              {image && (
                <li>
                  <button
                    type="button"
                    className="die-menu-item danger"
                    onClick={() => {
                      const images = { ...look.images };
                      delete images[body];
                      saveDiceLook({ ...look, images }).catch(() => setStatus({ text: t("dice.resetFailed"), error: true }));
                      setStatus({ text: t("dice.backToClassic") });
                      close();
                    }}
                  >
                    <ArrowCounterClockwise size={16} aria-hidden="true" />
                    {t("dice.resetToClassic")}
                  </button>
                </li>
              )}
            </ul>
          )}
        </PopoverButton>
      </div>
      <input
        ref={input}
        type="file"
        accept={SKIN_FILE_TYPES.join(",")}
        hidden
        aria-label={t("dice.uploadDiePicture", { die: body })}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </li>
  );
}

/** Dice at rest in a look, each showing its highest face. */
function DicePreview({ look, bodies, size = 44 }: { look: DiceSkin; bodies: BodyName[]; size?: number }) {
  const dice = useMemo(
    () => bodies.map((b) => layoutDice({ id: `preview-${b}`, sides: SIDES[b], dice: [SIDES[b]] }, size)[0]!),
    [bodies.join(","), size],
  );
  return (
    <div className="dice-look-preview" aria-hidden="true" style={{ "--die": `${size}px` } as CSSProperties}>
      {dice.map((die, i) => (
        <Die3D key={i} die={die} skin={look} />
      ))}
    </div>
  );
}

/**
 * Signed in, with looks this browser made before: offer to save them to the account, beside the
 * account's own (dice-looks: Bring this browser's dice looks into the account). Only when chosen.
 */
export function SaveBrowserLooksOffer() {
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ saved: number; failed: string[] } | null>(null);
  useEffect(() => {
    let live = true;
    void browserLookCount().then((n) => live && setCount(n));
    return () => {
      live = false;
    };
  }, [result]);

  async function save() {
    setBusy(true);
    try {
      setResult(await saveBrowserLooksToAccount());
    } finally {
      setBusy(false);
    }
  }

  if (result && result.failed.length === 0) {
    return (
      <p role="status" className="notice">
        {t("dice.savedCount", { n: result.saved })}
      </p>
    );
  }
  if (count === 0) return null;
  return (
    <div className="notice save-browser-looks">
      <p>
        {t("dice.localCount", { n: count })}
      </p>
      {result && result.failed.length > 0 && (
        <p role="alert" className="error">
          {t("dice.notSaved", { names: result.failed })}
        </p>
      )}
      <button className="primary" type="button" onClick={() => void save()} disabled={busy}>
        {busy ? t("common.saving") : t("dice.saveToAccount")}
      </button>
    </div>
  );
}

/** Signed out on the Dice tab: a quiet way to keep looks on every device, never a wall (gm-dashboard). */
export function DiceSignInLine() {
  return (
    <p className="muted small-print">
      {t("dice.browserOnly.before")}<Link href={signInFor("/library?tab=dice")}>{t("dice.browserOnly.link")}</Link>{t("dice.browserOnly.after")}
    </p>
  );
}
