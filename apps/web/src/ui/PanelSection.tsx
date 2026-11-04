import { createContext, useContext, useId, useRef, type ReactNode } from "react";
import { isBooleanRecord, usePersistentState } from "./usePersistentState";

/**
 * Collapse state for every side-panel section, one record per browser (room-sidebar-layout).
 * UI-only: it never touches room state, so there is nothing to send or filter.
 */
interface SectionCollapse {
  isCollapsed(id: string): boolean;
  /** The user pressed the heading. */
  toggle(id: string): void;
  /** Set by the app, not the user, e.g. opening Attack when a fight starts (attack-ux-polish). */
  setCollapsed(id: string, collapsed: boolean): void;
  /** Whether this browser remembers a state for the section at all. */
  hasChoice(id: string): boolean;
  /** Whether the user toggled the section since the app last set it. In memory only. */
  toggledSince(id: string): boolean;
}

const SectionCollapseContext = createContext<SectionCollapse>({
  isCollapsed: () => false,
  toggle: () => {},
  setCollapsed: () => {},
  hasChoice: () => false,
  toggledSince: () => false,
});

export function SectionCollapseProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = usePersistentState<Record<string, boolean>>("vtt.ui.sections", {}, isBooleanRecord);
  const toggled = useRef(new Set<string>());
  const value: SectionCollapse = {
    isCollapsed: (id) => collapsed[id] === true,
    toggle: (id) => {
      toggled.current.add(id);
      setCollapsed((c) => ({ ...c, [id]: !c[id] }));
    },
    setCollapsed: (id, next) => {
      toggled.current.delete(id);
      setCollapsed((c) => (c[id] === next ? c : { ...c, [id]: next }));
    },
    hasChoice: (id) => id in collapsed,
    toggledSince: (id) => toggled.current.has(id),
  };
  return <SectionCollapseContext.Provider value={value}>{children}</SectionCollapseContext.Provider>;
}

/** For code that opens or collapses a section on the user's behalf. */
export const useSectionCollapse = () => useContext(SectionCollapseContext);

interface Props {
  /** Stable key for the remembered collapse state, e.g. "dice". */
  id: string;
  title: ReactNode;
  /** Controls at the right of the heading, e.g. Create group. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * A titled side-panel section whose heading collapses its body.
 *
 * The body is hidden, not unmounted, so a half-typed dice expression or token name
 * survives a collapse; `hidden` also takes it out of the tab order and the
 * accessibility tree.
 */
export function PanelSection({ id, title, actions, children }: Props) {
  const { isCollapsed, toggle } = useContext(SectionCollapseContext);
  const bodyId = `${useId()}-body`;
  const collapsed = isCollapsed(id);

  return (
    <section className="panel-section" data-tour={id}>
      <div className={actions ? "panel-section-head with-actions" : undefined}>
        <h2 className="panel-section-heading">
          <button
            type="button"
            className="section-toggle"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            onClick={() => toggle(id)}
          >
            <span className="chevron" aria-hidden />
            <span className="section-title">{title}</span>
          </button>
        </h2>
        {!collapsed && actions}
      </div>
      <div id={bodyId} className="panel-section-body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}
