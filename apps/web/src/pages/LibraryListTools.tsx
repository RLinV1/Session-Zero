import { useRef, type MouseEvent, type ReactNode } from "react";
import { CheckSquare, SortAscending, X } from "@phosphor-icons/react";
import { Modal } from "../ui/Modal";
import { Picker } from "../ui/Picker";
import type { CardSelection, Selection } from "../ui/selection";
import { t } from "../i18n/locale";
import { SORT_KEYS, SORT_LABELS, isSortKey, type SortKey } from "./librarySort";

/**
 * The pieces every library grid shares (library-organize): how it is sorted, choosing several
 * cards, and acting on the ones chosen. Each tab decides which actions it offers.
 */

/** The row above a grid: the tab's own filters on the left, sort and Select on the right. */
export function ListBar({ children, sort, onSort, selection }: {
  children?: ReactNode;
  sort: SortKey;
  onSort: (key: SortKey) => void;
  selection?: Selection;
}) {
  return (
    <div className="library-listbar">
      <div className="library-listbar-start">{children}</div>
      <div className="library-listbar-end">
        <div className="sort-picker">
          <Picker
            label={t("library.sort.label")}
            icon={<SortAscending size={16} aria-hidden="true" />}
            value={sort}
            onChange={(key) => isSortKey(key) && onSort(key)}
            options={SORT_KEYS.map((key) => ({ key, label: t(SORT_LABELS[key]) }))}
          />
        </div>
        {selection && (
          <button
            type="button"
            className="secondary select-toggle"
            aria-pressed={selection.active}
            onClick={selection.active ? selection.stop : selection.start}
          >
            <CheckSquare size={16} aria-hidden="true" />
            {selection.active ? t("library.selectDone") : t("library.select")}
          </button>
        )}
      </div>
    </div>
  );
}

/** What a click on a selecting card must leave alone: its own controls. */
const OWN_CONTROLS = "button, a, input, select, textarea, label, form, dialog, [role='alertdialog']";

/**
 * A card in a grid that can be chosen. Its box shows while selecting, and on hover or focus
 * before that so a mouse can start a selection from any card. While selecting, a click anywhere
 * on the card chooses it (Shift-click chooses a run) and the card's own actions step aside.
 */
export function SelectableCard({ className, name, selection, children }: {
  className: string;
  /** What the box is called for assistive tech: "Select Goblin". */
  name: string;
  selection?: CardSelection;
  children: ReactNode;
}) {
  const active = selection?.active ?? false;
  const classes = [className, selection && "selectable", active && "selecting", selection?.selected && "selected"].filter(Boolean).join(" ");
  const onCardClick = (e: MouseEvent<HTMLLIElement>) => {
    if (!selection || !(e.target instanceof Element) || e.target.closest(OWN_CONTROLS)) return;
    selection.toggle(e.shiftKey);
  };
  return (
    // The box is the keyboard's way to choose the card; a click on the rest of it is a larger target for a pointer.
    <li className={classes} onClick={active ? onCardClick : undefined}>
      {selection && (
        <label className="select-box">
          <input
            type="checkbox"
            checked={selection.selected}
            aria-label={t("library.selectNamed", { name })}
            // The click carries Shift, which a change event does not; the change itself is that click.
            onChange={() => {}}
            onClick={(e) => {
              e.stopPropagation();
              selection.toggle(e.shiftKey);
            }}
          />
        </label>
      )}
      {children}
    </li>
  );
}

/** The bar that follows a selection down the page: how many are chosen, select all, and the tab's actions. */
export function SelectionBar({ selection, total, hint, children }: {
  selection: Selection;
  /** How many could be chosen, for Select all. */
  total: number;
  /** Shown while nothing is chosen yet, in place of the general hint. */
  hint?: string;
  children?: ReactNode;
}) {
  if (!selection.active) return null;
  const count = selection.ids.length;
  return (
    <div className="selection-bar" role="region" aria-label={t("library.selection")}>
      <div className="selection-count">
        <strong aria-live="polite">{t("library.selectedN", { count })}</strong>
        {count < total ? (
          <button type="button" className="link" onClick={selection.selectAll}>{t("library.selectAll", { count: total })}</button>
        ) : (
          <button type="button" className="link" onClick={selection.clear}>{t("library.selectNone")}</button>
        )}
      </div>
      {count === 0 && <span className="muted selection-hint">{hint ?? t("library.selectHint")}</span>}
      <div className="selection-actions">{children}</div>
      <button type="button" className="icon-button selection-close" title={t("library.stopSelecting")} aria-label={t("library.stopSelecting")} onClick={selection.stop}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** "Goblin, Orc, Troll and 4 more": the first few names a bulk action touches, so a confirmation is specific. */
export function nameList(names: readonly string[], shown = 6): string {
  const head = names.slice(0, shown).join(t("library.listSeparator"));
  const more = names.length - shown;
  return more > 0 ? `${head} ${t("library.bulk.andMore", { count: more })}` : head;
}

/** Confirms deleting several items at once, naming them; Cancel is focused, as in every delete. */
export function BulkDeleteDialog({ open, title, names, busy, error, onCancel, onConfirm, children }: {
  open: boolean;
  title: string;
  names: readonly string[];
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  /** What else happens: rooms that use a map, creatures that lose their art. */
  children?: ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal open={open} title={title} onClose={() => !busy && onCancel()} initialFocus={cancelRef}>
      <div className="stack bulk-delete">
        <p><strong>{nameList(names)}</strong></p>
        {children}
        {error && <p role="alert" className="error">{error}</p>}
        <div className="row modal-actions">
          <button ref={cancelRef} type="button" className="secondary" disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" className="danger-fill" disabled={busy || names.length === 0} onClick={onConfirm}>
            {busy ? t("common.deleting") : t("library.bulk.deleteN", { count: names.length })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
