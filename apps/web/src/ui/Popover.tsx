import { useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type RefObject } from "react";

/**
 * A button that opens a small anchored panel (participants list, share link).
 *
 * Closes on Escape (returning focus to the button), on a second click, and on a pointer
 * press outside. Open state is local UI only; nothing here is persisted or sent.
 *
 * With `placement: "fixed"` the panel is placed against the window instead of its anchor, so a
 * list that scrolls can't clip it. It closes on any scroll or resize rather than drift off its button.
 */
export function PopoverButton({
  label,
  buttonContent,
  title,
  align = "left",
  className = "tool-button",
  tourId,
  buttonRef: outerButtonRef,
  placement = "anchored",
  buttonProps,
  children,
}: {
  /** Accessible name of the button, e.g. "Participants, 3". */
  label: string;
  buttonContent: ReactNode;
  /** Accessible name of the opened panel. */
  title: string;
  /** Which edge of the button the panel lines up with. */
  align?: "left" | "right";
  className?: string;
  /** `data-tour` target for the guided tour. */
  tourId?: string;
  /** Also points at the button, for a caller that moves focus to it. */
  buttonRef?: RefObject<HTMLButtonElement | null>;
  /** "fixed" escapes a scrolling ancestor, e.g. a row in the token roster. */
  placement?: "anchored" | "fixed";
  /** Extra attributes for the button, e.g. drag handlers; never its click, label or ARIA state. */
  buttonProps?: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type" | "aria-label" | "aria-expanded" | "aria-controls">
    & { [data: `data-${string}`]: string };
  /** The panel's content. As a function it gets `close`, for an item that hands off to a modal. */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [fixedStyle, setFixedStyle] = useState<CSSProperties | null>(null);

  // Below the button, or above it when there isn't room, kept inside the window.
  useLayoutEffect(() => {
    if (!open || placement !== "fixed") return setFixedStyle(null);
    const button = buttonRef.current?.getBoundingClientRect();
    const panel = panelRef.current?.getBoundingClientRect();
    if (!button || !panel) return;
    const gap = 8;
    const below = button.bottom + gap + panel.height <= window.innerHeight;
    const top = below ? button.bottom + gap : Math.max(gap, button.top - gap - panel.height);
    const left = align === "right" ? button.right - panel.width : button.left;
    setFixedStyle({ position: "fixed", top, left: Math.max(gap, Math.min(left, window.innerWidth - panel.width - gap)), right: "auto" });
  }, [open, placement, align]);

  useEffect(() => {
    if (!open || placement !== "fixed") return;
    const close = (e: Event) => {
      // Scrolling inside the panel itself is fine.
      if (e.type === "scroll" && panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, placement]);

  useEffect(() => {
    if (!open) return;
    // Capture phase: a board or panel that stops propagation must not keep the popover open.
    // mousedown too, for input that never emits pointer events.
    const outside = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !wrapRef.current?.contains(e.target as Node)) return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="popover-anchor" data-tour={tourId}>
      <button
        {...buttonProps}
        ref={(el) => {
          buttonRef.current = el;
          if (outerButtonRef) outerButtonRef.current = el;
        }}
        type="button"
        className={className}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title={title}
        onClick={() => setOpen((o) => !o)}
      >
        {buttonContent}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={title}
          className={`popover popover-${align}`}
          // Hidden for the one frame before it is measured, so it never flashes in the wrong place.
          style={placement === "fixed" ? fixedStyle ?? { position: "fixed", visibility: "hidden" } : undefined}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}
