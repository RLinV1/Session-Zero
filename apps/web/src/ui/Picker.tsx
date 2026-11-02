import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";

export interface PickerOption {
  /** Stable and unique among the options; what `onChange` reports. */
  key: string;
  label: string;
  /** Muted text on the right, e.g. dice or a distance. */
  detail?: string;
}

/**
 * A compact dropdown in the app's look (attack-section-compact): a closed row with an icon, a
 * bold label and muted detail, opening a popover-style list. Native <select> can't show label
 * and detail in the app's type, so this follows the WAI-ARIA select-only combobox pattern:
 * focus stays on the button, and the highlighted option is announced through
 * aria-activedescendant. Arrow keys, Home and End move, Enter or Space picks, Escape closes.
 */
export function Picker({
  options,
  value,
  onChange,
  label,
  placeholder = "Choose…",
  icon,
  disabled,
}: {
  options: PickerOption[];
  /** The chosen option's key, or null for none yet. */
  value: string | null;
  onChange: (key: string) => void;
  /** Accessible name, e.g. "Target". */
  label: string;
  placeholder?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  const selected = options.findIndex((o) => o.key === value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(selected, 0));
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const chosen = selected >= 0 ? options[selected] : undefined;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // A list can't stay open on a control that no longer takes input, or with nothing in it.
  useEffect(() => {
    if (disabled || options.length === 0) setOpen(false);
  }, [disabled, options.length]);

  // Keep the highlighted option in view while moving through a long list.
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    if (options.length === 0) return;
    setActive(Math.max(selected, 0));
    setOpen(true);
  };
  const choose = (i: number) => {
    const option = options[i];
    if (option) onChange(option.key);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const last = options.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const moves: Record<string, number> = { ArrowDown: Math.min(active + 1, last), ArrowUp: Math.max(active - 1, 0), Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key]!);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="picker">
      <button
        type="button"
        role="combobox"
        className="picker-button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {icon}
        {chosen ? <span className="picker-label">{chosen.label}</span> : <span className="picker-placeholder">{placeholder}</span>}
        {chosen?.detail && <span className="picker-detail">{chosen.detail}</span>}
        <CaretDown size={12} className="picker-caret" aria-hidden="true" />
      </button>
      <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="picker-list" hidden={!open}>
        {options.map((option, i) => (
          <li
            key={option.key}
            id={optionId(i)}
            role="option"
            aria-selected={i === selected}
            className={i === active ? "picker-option active" : "picker-option"}
            // Keep focus on the button, so the keyboard keeps working after a pointer hover.
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <Check size={14} className="picker-check" aria-hidden="true" />
            <span className="picker-label">{option.label}</span>
            {option.detail && <span className="picker-detail">{option.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
