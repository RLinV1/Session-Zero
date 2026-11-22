import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { Bug, Camera, Lightbulb, UploadSimple, X } from "@phosphor-icons/react";
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, feedbackPagePath, type FeedbackKind, type FeedbackReceipt, type FeedbackTechnical } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { getLocale, useT } from "../i18n/locale";
import { api } from "../net/api";
import { closeFeedback, useFeedbackState, type FeedbackRoom } from "./feedback";
import { Modal } from "./Modal";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const KIND_ICON = { bug: Bug, idea: Lightbulb, other: null } as const;

interface Shot {
  id: number;
  blob: Blob;
  name: string;
  url: string;
  /** Captured from the board rather than chosen, which is what the GM note is about. */
  captured: boolean;
}

/** The allow-listed technical details (design D4): the page, the browser, and in a room its ids. */
export function technicalDetails(room: FeedbackRoom | null): FeedbackTechnical {
  const technical: FeedbackTechnical = {
    pagePath: feedbackPagePath(location.pathname),
    userAgent: navigator.userAgent.slice(0, 400),
    screen: { width: Math.round(screen.width), height: Math.round(screen.height) },
    viewport: { width: Math.round(innerWidth), height: Math.round(innerHeight) },
    pixelRatio: Math.min(8, Math.max(0.25, devicePixelRatio || 1)),
    locale: getLocale(),
  };
  if (room) Object.assign(technical, { roomId: room.roomId, seq: room.seq, role: room.role });
  return technical;
}

/** The one Feedback dialog (FR-PL-11), mounted once in the app and opened through `openFeedback`. */
export function FeedbackHost() {
  const { open, kind, room } = useFeedbackState();
  return <FeedbackDialog open={open} initialKind={kind} room={room} onClose={closeFeedback} />;
}

export function FeedbackDialog({ open, initialKind, room, onClose }: {
  open: boolean;
  initialKind: FeedbackKind;
  room: (() => FeedbackRoom) | null;
  onClose: () => void;
}) {
  const t = useT();
  const account = useAccount();
  const ids = useId();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [technical, setTechnical] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const nextId = useRef(1);
  const fileInput = useRef<HTMLInputElement>(null);
  const summaryInput = useRef<HTMLInputElement>(null);
  const shotsRef = useRef(shots);
  shotsRef.current = shots;

  // A fresh form each time the dialog opens after a report was sent; a draft survives a close.
  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
    if (receipt) reset();
  }, [open]);
  useEffect(() => () => shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url)), []);

  function reset() {
    shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.url));
    setSummary(""); setDetails(""); setShots([]); setTechnical(true); setProblem(null); setReceipt(null);
  }

  function addFiles(files: readonly { blob: Blob; name: string; captured?: boolean }[]) {
    setProblem(null);
    const room = FEEDBACK_LIMITS.screenshots - shotsRef.current.length;
    const added: Shot[] = [];
    for (const file of files) {
      if (!IMAGE_TYPES.has(file.blob.type)) { setProblem(t("feedback.wrongType", { name: file.name })); continue; }
      if (file.blob.size > FEEDBACK_LIMITS.screenshotBytes) { setProblem(t("feedback.tooBig", { name: file.name })); continue; }
      if (added.length >= room) { setProblem(t("feedback.tooManyImages", { max: FEEDBACK_LIMITS.screenshots })); break; }
      added.push({ id: nextId.current++, blob: file.blob, name: file.name, url: URL.createObjectURL(file.blob), captured: file.captured ?? false });
    }
    if (added.length) setShots((current) => [...current, ...added]);
  }

  function remove(id: number) {
    setShots((current) => {
      const gone = current.find((shot) => shot.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return current.filter((shot) => shot.id !== id);
    });
  }

  async function capture() {
    if (!room) return;
    setCapturing(true);
    try {
      const blob = await room().captureBoard();
      if (blob) addFiles([{ blob, name: `${t("feedback.boardCapture")}.png`, captured: true }]);
      else setProblem(t("feedback.captureFailed"));
    } catch {
      setProblem(t("feedback.captureFailed"));
    } finally {
      setCapturing(false);
    }
  }

  function onPaste(event: ClipboardEvent) {
    const files = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    addFiles(files.map((file) => ({ blob: file, name: file.name || "pasted.png" })));
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    addFiles([...event.dataTransfer.files].map((file) => ({ blob: file, name: file.name })));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!summary.trim()) {
      setProblem(t("feedback.summaryNeeded"));
      summaryInput.current?.focus();
      return;
    }
    setSending(true);
    setProblem(null);
    try {
      const sent = await api.feedback.send(
        { kind, summary: summary.trim(), details: details.trim(), ...(technical && { technical: technicalDetails(room?.() ?? null) }) },
        shots.map((shot) => ({ blob: shot.blob, name: shot.name })),
      );
      setReceipt(sent);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function done() {
    onClose();
    reset();
  }

  const isGm = room?.().role === "gm";
  const gmCaptured = isGm && shots.some((shot) => shot.captured);
  return (
    <Modal open={open} title={t("feedback.title")} className="feedback-modal" onClose={receipt ? done : onClose}>
      {receipt ? (
        <div className="feedback-sent">
          <h3>{t("feedback.sentTitle")}</h3>
          <p>{t("feedback.sentBody", { n: receipt.screenshots })}</p>
          <p className="feedback-reference">
            <span className="muted">{t("feedback.reference")}</span> <strong>{receipt.reference}</strong>
          </p>
          <div className="row modal-actions">
            <button type="button" className="primary" onClick={done}>{t("feedback.done")}</button>
          </div>
        </div>
      ) : (
        <form className="feedback-form" onSubmit={(e) => void submit(e)} onPaste={onPaste} noValidate>
          <fieldset className="feedback-kind segmented">
            <legend className="sr-only">{t("feedback.kind")}</legend>
            {FEEDBACK_KINDS.map((option) => {
              const Icon = KIND_ICON[option];
              return (
                <label key={option}>
                  <input type="radio" name={`${ids}-kind`} value={option} checked={kind === option} onChange={() => setKind(option)} />
                  <span>{Icon && <Icon size={16} aria-hidden="true" />} {t(`feedback.kind.${option}`)}</span>
                </label>
              );
            })}
          </fieldset>

          <div className="feedback-field">
            <div className="feedback-label-row">
              <label htmlFor={`${ids}-summary`}>{t("feedback.summary")}</label>
              <span className="muted small" id={`${ids}-summary-count`}>{t("feedback.count", { n: summary.length, max: FEEDBACK_LIMITS.summary })}</span>
            </div>
            <input
              ref={summaryInput}
              id={`${ids}-summary`}
              value={summary}
              maxLength={FEEDBACK_LIMITS.summary}
              placeholder={t(`feedback.summaryPlaceholder.${kind}`)}
              aria-describedby={`${ids}-summary-count`}
              required
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          <div className="feedback-field">
            <div className="feedback-label-row">
              <label htmlFor={`${ids}-details`}>{t(kind === "bug" ? "feedback.details.bug" : "feedback.details.other")}</label>
              <span className="muted small" id={`${ids}-details-count`}>{t("feedback.count", { n: details.length, max: FEEDBACK_LIMITS.details })}</span>
            </div>
            <textarea id={`${ids}-details`} value={details} rows={4} maxLength={FEEDBACK_LIMITS.details} aria-describedby={`${ids}-details-count`} onChange={(e) => setDetails(e.target.value)} />
          </div>

          <div className="feedback-field">
            <div className="feedback-label-row">
              <span id={`${ids}-shots`}>{t("feedback.screenshots")}</span>
              <span className="muted small">{t("feedback.screenshotCount", { n: shots.length, max: FEEDBACK_LIMITS.screenshots })}</span>
            </div>
            <ul className="feedback-shots" aria-labelledby={`${ids}-shots`} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
              {shots.map((shot) => (
                <li key={shot.id} className="feedback-shot">
                  <img src={shot.url} alt={shot.name} />
                  <button type="button" className="icon-button feedback-shot-remove" aria-label={t("feedback.removeImage", { name: shot.name })} onClick={() => remove(shot.id)}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
              {shots.length < FEEDBACK_LIMITS.screenshots && (
                <li>
                  <button type="button" className="feedback-add" onClick={() => fileInput.current?.click()}>
                    <UploadSimple size={20} aria-hidden="true" />
                    {t("feedback.addImage")}
                  </button>
                </li>
              )}
            </ul>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                addFiles([...(e.target.files ?? [])].map((file) => ({ blob: file, name: file.name })));
                e.target.value = "";
              }}
            />
            <div className="feedback-shot-actions">
              {room && (
                <button type="button" className="secondary" disabled={capturing || shots.length >= FEEDBACK_LIMITS.screenshots} onClick={() => void capture()}>
                  <Camera size={16} aria-hidden="true" /> {capturing ? t("feedback.capturing") : t("feedback.capture")}
                </button>
              )}
              <span className="muted small">{t("feedback.dropHint")}</span>
            </div>
            <p className="muted small">{t("feedback.imageRules")}</p>
            {gmCaptured && <p className="feedback-note small">{t("feedback.gmCaptureNote")}</p>}
          </div>

          <div className="feedback-technical">
            <label className="checkbox-row">
              <input type="checkbox" checked={technical} onChange={(e) => setTechnical(e.target.checked)} />
              {t("feedback.technical")}
            </label>
            <details>
              <summary>{t("feedback.whatsSent")}</summary>
              <p className="muted small">{t("feedback.technicalList")}</p>
              <p className="muted small">{t("feedback.technicalRoom")}</p>
            </details>
          </div>

          {problem && <p role="alert" className="error">{problem}</p>}

          <div className="feedback-footer">
            <span className="muted small">
              {account.status === "signedIn" ? t("feedback.signedInAs", { name: account.account.displayName }) : t("feedback.notSignedIn")}
            </span>
            <div className="row modal-actions">
              <button type="button" className="secondary" onClick={onClose} disabled={sending}>{t("feedback.cancel")}</button>
              <button type="submit" className="primary" disabled={sending}>{sending ? t("feedback.sending") : t("feedback.send")}</button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
