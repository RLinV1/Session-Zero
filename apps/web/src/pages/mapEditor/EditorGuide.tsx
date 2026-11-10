import { createContext, useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Question } from "@phosphor-icons/react";
import { GuideTour } from "../../ui/GuideTour";
import { t, useLocale } from "../../i18n/locale";
import { editorGuide } from "./mapEditorGuides";

/** The Guide button overlaid on the map's top-right corner: tours the controls of the current step. */
export function EditorGuide({ step }: { step: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const locale = useLocale();
  // Rebuilt when the language changes: titles, bodies and the aria-label selectors all follow it.
  const steps = useMemo(() => editorGuide(step), [step, locale]);
  if (!steps) return null;
  return (
    <>
      <button ref={button} type="button" className="map-editor-guide" aria-label={t("common.guide")} title={t("common.guide")} onClick={() => setOpen(true)}>
        <Question size={20} aria-hidden="true" />
      </button>
      {/* Inside the editor dialog, so its inert page and focus trap do not cover the tour. */}
      {open && createPortal(
        <GuideTour steps={steps} onClose={() => { setOpen(false); button.current?.focus(); }} />,
        button.current?.closest("dialog") ?? document.body,
      )}
    </>
  );
}

/** The current editor step; every map element renders a MapGuide, which shows the button only inside an editor. */
export const GuideStepContext = createContext<string | null>(null);

/** The Guide button anchored to the top-right corner of its (position: relative) map element. */
export function MapGuide() {
  const step = useContext(GuideStepContext);
  return step ? <div className="map-editor-guide-slot"><EditorGuide step={step} /></div> : null;
}
