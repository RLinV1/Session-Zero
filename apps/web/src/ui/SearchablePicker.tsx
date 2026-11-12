import { useRef, useState } from "react";
import { Modal } from "./Modal";
import { useT } from "../i18n/locale";
import type { PickerOption } from "./Picker";

/** A dedicated dialog keeps long animation lists clear of a host form's scroll area. */
export function SearchablePicker({ label, value, options, onChange }: {
  label: string; value: string; options: PickerOption[]; onChange: (key: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filtered = options.filter((option) => option.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <>
    <button type="button" className="secondary" aria-label={label} onClick={() => { setQuery(""); setOpen(true); }}>
      {options.find((option) => option.key === value)?.label ?? t("animationPicker.choose")}
    </button>
    <Modal open={open} title={t("animationPicker.title")} initialFocus={searchRef} onClose={() => setOpen(false)}>
      <div className="stack">
        <input ref={searchRef} type="search" aria-label={t("animationPicker.search")} placeholder={t("animationPicker.search")} value={query} onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
        <div className="stack" role="group" aria-label={t("animationPicker.list")}>
          {filtered.map((option) => <button key={option.key} type="button" className="secondary" aria-pressed={option.key === value}
            onClick={() => { onChange(option.key); setOpen(false); }}>{option.label}{option.detail ? ` (${option.detail})` : ""}</button>)}
          {filtered.length === 0 && <p role="status">{t("animationPicker.none")}</p>}
        </div>
      </div>
    </Modal>
  </>;
}
