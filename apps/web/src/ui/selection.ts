import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NONE: ReadonlySet<string> = new Set();

/**
 * The selection after one click on `id` (library-organize). A plain click turns that item on or
 * off. A Shift-click turns on every item from the last one clicked to this one, in `order`, the
 * way a file manager does; with no earlier click still shown it is a plain click.
 */
export function clickSelection(selected: ReadonlySet<string>, order: readonly string[], id: string, anchor: string | null, range: boolean): ReadonlySet<string> {
  const from = range && anchor !== null ? order.indexOf(anchor) : -1;
  const to = order.indexOf(id);
  if (from >= 0 && to >= 0) {
    const next = new Set(selected);
    for (const each of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(each);
    return next;
  }
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** The selected ids that are still shown: a search or another folder never leaves hidden items chosen. */
export function keepShown(selected: ReadonlySet<string>, order: readonly string[]): ReadonlySet<string> {
  const shown = new Set(order);
  const kept = [...selected].filter((id) => shown.has(id));
  return kept.length === selected.size ? selected : new Set(kept);
}

/** One card's part in a selection: whether to show its box, whether it is chosen, and how to change that. */
export interface CardSelection {
  active: boolean;
  selected: boolean;
  toggle: (range: boolean) => void;
}

export interface Selection {
  /** Selecting: the cards show their boxes and a click chooses rather than opens. */
  active: boolean;
  selected: ReadonlySet<string>;
  /** The chosen ids in the order they are shown. */
  ids: string[];
  start: () => void;
  /** Leaves selecting and lets everything go. */
  stop: () => void;
  selectAll: () => void;
  clear: () => void;
  card: (id: string) => CardSelection;
}

/**
 * Choosing several items in a grid of cards (library-organize). `order` is every selectable item
 * as it is shown; anything that stops being shown drops out of the selection. Escape stops
 * selecting, unless a dialog is open to take it.
 */
export function useSelection(order: readonly string[]): Selection {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(NONE);
  const anchor = useRef<string | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const orderKey = order.join("\n");

  useEffect(() => {
    setSelected((was) => keepShown(was, orderRef.current));
    if (anchor.current !== null && !orderRef.current.includes(anchor.current)) anchor.current = null;
  }, [orderKey]);

  const active = selecting || selected.size > 0;
  const stop = useCallback(() => {
    setSelecting(false);
    setSelected(NONE);
    anchor.current = null;
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // A dialog's own Escape closes the dialog, not the selection behind it.
      if (e.target instanceof Element && e.target.closest("dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      stop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, stop]);

  return useMemo(() => {
    const ids = order.filter((id) => selected.has(id));
    return {
      active,
      selected,
      ids,
      start: () => setSelecting(true),
      stop,
      selectAll: () => setSelected(new Set(orderRef.current)),
      clear: () => {
        setSelected(NONE);
        anchor.current = null;
      },
      card: (id: string) => ({
        active,
        selected: selected.has(id),
        toggle: (range: boolean) => {
          // Read now: React may run the updater after the next line has moved the anchor.
          const from = anchor.current;
          setSelected((was) => clickSelection(was, orderRef.current, id, from, range));
          anchor.current = id;
        },
      }),
    };
    // `order` is read through its key, so a new array with the same ids keeps this object.
  }, [active, selected, orderKey, stop]);
}
