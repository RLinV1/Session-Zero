import { t } from "../../i18n/locale";
import { Cube, Square } from "@phosphor-icons/react";

export function MapStylePicker({ isometric, onChange, disabled = false }: {
  isometric: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return <section className="sight-setting">
    <h3 className="map-editor-heading">{t("mapStyle.title")}</h3>
    <div className="map-editor-modes" role="radiogroup" aria-label={t("mapStyle.title")}>
      {[{ enabled: false, label: t("mapStyle.flat"), Icon: Square }, { enabled: true, label: t("mapStyle.isometric"), Icon: Cube }].map(({ enabled, label, Icon }) => (
        <button key={label} type="button" role="radio" aria-checked={isometric === enabled}
          className="tool-button map-editor-mode" disabled={disabled}
          tabIndex={isometric === enabled ? 0 : -1}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? false : event.key === "End" ? true : !enabled;
            onChange(next);
            event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next ? 1 : 0]?.focus();
          }}
          onClick={() => { if (isometric !== enabled) onChange(enabled); }}>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>
        </button>
      ))}
    </div>
    <p className="muted small-print">{isometric ? t("mapStyle.isometricHint") : t("mapStyle.flatHint")}</p>
  </section>;
}
