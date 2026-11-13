import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";

export interface PickerOption {
  /** Stable and unique among the options; what `onChange` reports. */
  key: string;
  label: string;
  /** Muted text on the right, e.g. dice or a distance. */
  detail?: string;
  /** Listed behind the collapsed `groupLabel` row, after the other options (attack-range). */
  grouped?: boolean;
  /** A second line under the label, in place of `detail`, in the list and on the closed picker (e.g. an attack's range and rolls). */
  summary?: ReactNode;
}

type Row = { kind: "option"; option: PickerOption } | { kind: "group" };

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
  groupLabel,
  note,
  status,
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
  /** The row the `grouped` options sit behind, e.g. "Out of range (2)". It starts collapsed each time the list opens. */
  groupLabel?: string;
  /** A line above the group, e.g. that nothing is in range. */
  note?: string;
  /** Shown on the closed picker, which turns red, e.g. "Out of range" (attack-range). */
  status?: string;
}) {
  const [groupOpen, setGroupOpen] = useState(false);
  const grouped = groupLabel ? options.filter((o) => o.grouped) : [];
  const rows: Row[] = [
    ...options.filter((o) => !groupLabel || !o.grouped).map((option) => ({ kind: "option" as const, option })),
    ...(grouped.length > 0 ? [{ kind: "group" as const }, ...(groupOpen ? grouped.map((option) => ({ kind: "option" as const, option })) : [])] : []),
  ];
  const selected = rows.findIndex((r) => r.kind === "option" && r.option.key === value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(Math.max(selected, 0));
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const chosen = options.find((o) => o.key === value);

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
    // By id: a note row may sit between options, so the position in the list isn't the index.
    if (open) document.getElementById(optionId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const openList = () => {
    if (options.length === 0) return;
    // The group starts collapsed every time; a chosen option inside it is reached through the group row.
    setGroupOpen(false);
    const start = rows.findIndex((r) => r.kind === "option" && r.option.key === value && !(groupLabel && r.option.grouped));
    setActive(start >= 0 ? start : 0);
    setOpen(true);
  };
  const choose = (i: number) => {
    const row = rows[i];
    if (row?.kind === "group") return setGroupOpen((g) => !g);
    if (row) onChange(row.option.key);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const last = rows.length - 1;
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
    <div ref={wrapRef} className={status ? "picker picker-warning" : "picker"}>
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
        {chosen?.summary ? (
          <span className="picker-main">
            <span className="picker-label">{chosen.label}</span>
            <span className="picker-summary">{chosen.summary}</span>
          </span>
        ) : chosen ? <span className="picker-label">{chosen.label}</span> : <span className="picker-placeholder">{placeholder}</span>}
        {chosen?.detail && !chosen.summary && <span className="picker-detail">{chosen.detail}</span>}
        {status && <span className="picker-status">{status}</span>}
        <CaretDown size={12} className="picker-caret" aria-hidden="true" />
      </button>
      <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="picker-list" hidden={!open}>
        {rows.map((row, i) => {
          const common = {
            id: optionId(i),
            // Keep focus on the button, so the keyboard keeps working after a pointer hover.
            onMouseDown: (e: MouseEvent) => e.preventDefault(),
            onMouseEnter: () => setActive(i),
            onClick: () => choose(i),
          };
          if (row.kind === "group") {
            return (
              <Fragment key="__group">
                {note && <li role="presentation" className="picker-note">{note}</li>}
                {/* Chosen like an option, but it opens or closes the options behind it. */}
                <li {...common} role="option" aria-selected={false} aria-expanded={groupOpen}
                  className={i === active ? "picker-option picker-group active" : "picker-option picker-group"}>
                  <CaretDown size={12} className={groupOpen ? "picker-group-caret open" : "picker-group-caret"} aria-hidden="true" />
                  <span className="picker-label">{groupLabel}</span>
                </li>
              </Fragment>
            );
          }
          const { option } = row;
          return (
            <li key={option.key} {...common} role="option" aria-selected={i === selected}
              className={[i === active ? "picker-option active" : "picker-option", option.grouped && groupLabel ? "picker-grouped" : ""].join(" ").trim()}>
              <Check size={14} className="picker-check" aria-hidden="true" />
              {option.summary ? (
                <span className="picker-main">
                  <span className="picker-label">{option.label}</span>
                  <span className="picker-summary">{option.summary}</span>
                </span>
              ) : <span className="picker-label">{option.label}</span>}
              {option.detail && !option.summary && <span className="picker-detail">{option.detail}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
