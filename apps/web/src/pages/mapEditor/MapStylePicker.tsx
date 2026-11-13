import { Cube, Square } from "@phosphor-icons/react";

export function MapStylePicker({ isometric, onChange, disabled = false }: {
  isometric: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return <section className="sight-setting">
    <h3 className="map-editor-heading">Map view</h3>
    <div className="map-editor-modes" role="radiogroup" aria-label="Map view">
      {[{ enabled: false, label: "Flat", Icon: Square }, { enabled: true, label: "Isometric", Icon: Cube }].map(({ enabled, label, Icon }) => (
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
    <p className="muted small-print">{isometric ? "Outline buildings in the Buildings step, then drag their roofs up to add height." : "Play with the map viewed from above."}</p>
  </section>;
}
