import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

/**
 * A modal on the native `<dialog>` (room-sidebar-layout: GM setup forms open in modals).
 *
 * `showModal()` gives the focus trap, top-layer stacking, inert page and Escape for free;
 * this adds the title bar, backdrop-click dismissal and focus return to the opener.
 */
export function Modal({
  open,
  title,
  className,
  onClose,
  onAfterClose,
  initialFocus,
  headerContent,
  closeLabel = "Close",
  children,
}: {
  open: boolean;
  title: string;
  className?: string;
  onClose: () => void;
  /** Runs once the dialog has closed and returned focus to its opener, e.g. to move focus on from there. */
  onAfterClose?: () => void;
  /** Focused on open instead of the first control, e.g. the safe choice in a confirmation. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Shown in the title bar between the title and Close, so a toolbar needs no row of its own. */
  headerContent?: ReactNode;
  /** The action performed by X, Escape and backdrop dismissal. */
  closeLabel?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  /** Whatever had focus when the modal opened, usually the button that opened it. */
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      initialFocus?.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  return (
    <dialog
      ref={ref}
      className={className ? `modal ${className}` : "modal"}
      aria-labelledby={titleId}
      // Escape: let React state drive the close so `open` stays the source of truth.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        // A stacked confirmation can close with its parent. Never move focus back into
        // the now-closed parent after that parent's close handler restored its opener.
        const parent = opener.current?.closest("dialog");
        if (!parent || parent.open) opener.current?.focus();
        onAfterClose?.();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        // Handle it here rather than relying on the dialog's cancel event, which a focused
        // search field swallows. Stop it so a modal stacked inside another closes alone.
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
      // A click on the dialog element itself is a click on the backdrop; content clicks
      // land on its children.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-head">
            <h2 id={titleId} className="modal-title">
              {title}
            </h2>
            {headerContent}
            <button type="button" className="modal-close" aria-label={closeLabel} onClick={onClose}>
              <svg width="12" height="12" viewBox="0 0 12 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
                <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
