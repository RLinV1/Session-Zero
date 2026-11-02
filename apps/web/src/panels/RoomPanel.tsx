import { useEffect, useRef, useState, type ReactNode } from "react";
import { presetOf } from "@vtt/shared";
import { DiceFive, MapTrifold, Sword, UserList } from "@phosphor-icons/react";
import { can, type DiceVisibility, type GridSpec, type Participant, type Point, type RoomState } from "@vtt/shared";
import type { DiceBoard } from "../board/Board";
import type { TokenDraft } from "../board/placement";
import type { RoomConnection } from "../net/roomConnection";
import { GmPanel } from "../pages/GmPanel";
import type { GridDraft } from "../pages/gridDraft";
import { DicePanel } from "./DicePanel";
import { AreaEffectPanel, DamageCallPrompt } from "./AreaEffectPanel";
import type { GroupSelection } from "./GroupSelection";
import { ResolveDialog } from "./ResolveDialog";
import { draftFor, type ResolveDraft } from "./resolveDraft";
import { InitiativeTracker } from "./InitiativeTracker";
import { AttackPanel, type AttackPick } from "./AttackPanel";
import type { AttackReset } from "./attackSession";
import type { RollThrow } from "./DicePanel";
import { attackSectionChange, type EncounterView } from "./attackRoll";
import { MyTokens } from "./MyTokens";
import { RulingsPanel } from "./RulingsPanel";
import { TokenRoster } from "./TokenRoster";
import { useSectionCollapse } from "../ui/PanelSection";
import { FULL_ROOM, type RoomFeatures } from "../pages/encounterEdit/roomFeatures";

/**
 * The room's side panel, composed per role and per screen size (FR-PL-03).
 *
 * Ordered by what the viewer acts on most: their own tokens, then the turn they are
 * waiting for, then the roster, then dice. GM administration comes last because it is
 * setup, not play.
 *
 * The content is split into tabs on every screen size. On a phone a single scrolling column
 * would bury the board under several screens of controls; on a desktop it mixed play and
 * setup in one long column. The tab buttons live in the room's top bar on wide screens.
 *
 * Composition is by ownership and role, never by hiding: a player is not sent GM data and
 * then told not to look at it. The administration controls simply are not rendered, and
 * the server would refuse the commands anyway (FR-GM-15).
 */

export type TabId = "play" | "tokens" | "dice" | "gm";

export const isTabId = (v: unknown): v is TabId => v === "play" || v === "tokens" || v === "dice" || v === "gm";

/** The panel's tabs for this role. Manage is the GM's only; a player is never offered it. */
export function panelTabs(isGm: boolean, offered: readonly TabId[] = FULL_ROOM.tabs): { id: TabId; label: string; icon: ReactNode }[] {
  const tabs: { id: TabId; label: string; icon: ReactNode }[] = [
    { id: "play", label: "Play", icon: <Sword size={16} aria-hidden="true" /> },
    { id: "tokens", label: "Tokens", icon: <UserList size={16} aria-hidden="true" /> },
    { id: "dice", label: "Dice", icon: <DiceFive size={16} aria-hidden="true" /> },
    ...(isGm ? [{ id: "gm" as const, label: "Manage", icon: <MapTrifold size={16} aria-hidden="true" /> }] : []),
  ];
  return tabs.filter((t) => offered.includes(t.id));
}

/** Ids shared by the tab buttons (in the top bar or the panel) and the one tab panel. */
export const tabButtonId = (tab: TabId) => `room-tab-${tab}`;
export const TAB_PANEL_ID = "room-tabpanel";

/**
 * The tab buttons, as an ARIA tablist with a roving tab stop. Rendered in the room's top bar
 * on wide screens and above the panel on phones; either way they drive the same panel.
 */
/** A small mark after a tab's label: a count, or a dot when there is none (attack-ux-polish). */
export type TabBadges = Partial<Record<TabId, { count?: number; label: string }>>;

export function PanelTabs({
  isGm,
  tab,
  onTab,
  badges = {},
  className = "tabbar",
  offered,
}: {
  isGm: boolean;
  /** The tabs this room offers (ADR 0033); all of them when absent. */
  offered?: readonly TabId[];
  badges?: TabBadges;
  tab: TabId;
  /** `reselected` is true when the already-selected tab was pressed again. */
  onTab: (tab: TabId, reselected: boolean) => void;
  className?: string;
}) {
  const tabs = panelTabs(isGm, offered);
  /** Set when the arrow keys moved the selection, so focus can follow it. */
  const movedByKeyboard = useRef(false);

  // In the ARIA tabs pattern focus must travel with the selection. Without this the user
  // is left focused on a tab that now has tabIndex -1, the next arrow press comes from a
  // detached element, and a screen reader never announces the tab they just moved to.
  useEffect(() => {
    if (!movedByKeyboard.current) return;
    movedByKeyboard.current = false;
    document.getElementById(tabButtonId(tab))?.focus();
  }, [tab]);

  return (
    <div className={className} role="tablist" aria-label="Room panels" data-tour="panel-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={tabButtonId(t.id)}
          data-tour={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={tab === t.id ? TAB_PANEL_ID : undefined}
          // Roving tabindex: the tablist is one tab stop, arrows move within it.
          tabIndex={tab === t.id ? 0 : -1}
          className={tab === t.id ? "tab selected" : "tab"}
          onClick={() => onTab(t.id, tab === t.id)}
          onKeyDown={(e) => {
            const i = tabs.findIndex((x) => x.id === tab);
            const next =
              e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length]
              : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length]
              : e.key === "Home" ? tabs[0]
              : e.key === "End" ? tabs.at(-1)
              : null;
            if (!next) return;
            e.preventDefault();
            movedByKeyboard.current = true;
            onTab(next.id, false);
          }}
        >
          {t.icon}
          {t.label}
          {badges[t.id] && (
            <>
              <span className={badges[t.id]!.count ? "tab-badge" : "tab-badge dot"} aria-hidden="true">
                {badges[t.id]!.count ?? ""}
              </span>
              <span className="sr-only">, {badges[t.id]!.label}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

interface Props {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  token: string;
  onFocusToken: (tokenId: string) => void;
  /** Who attacks whom, shared with the board's Pick on board (attack-targeting). */
  attackPick: AttackPick;
  onAttackPick: (pick: AttackPick) => void;
  /** The last encounter end, which clears the Attack section (attack-panel-encounter-reset). */
  attackReset: AttackReset;
  /** Which rolls are still being thrown, the one that just landed, and how to say it landed (throw-dice-on-board). */
  rollThrow: RollThrow;
  onPickOnBoard: (attackerId: string) => void;
  onShowPing: (at: Point) => void;
  /** The board, for dice thrown onto it from the Dice panel (throw-dice-on-board). */
  diceBoard?: DiceBoard;
  attackVisibility: DiceVisibility;
  onAttackVisibility: (visibility: DiceVisibility) => void;
  gridDraft: GridDraft;
  hasGridDraft: boolean;
  onGridDraftChange: (draft: GridDraft) => void;
  onGridDraftCancel: () => void;
  onGridApply: (grid: GridSpec) => Promise<boolean>;
  gridApplying: boolean;
  gridError: string | null;
  /** GM: place a token filled in by New Token or Saved Creatures, once per click (token-placement-flow). */
  onPlaceToken: (draft: TokenDraft) => void;
  /** GM: place copies of a token, once per click (token-placement-flow, ADR 0033). */
  onDuplicateToken: (tokenId: string) => void;
  /** The token whose editor is open in the Tokens tab, and how to open or close it (token-card-actions). */
  editingTokenId: string | null;
  onEditToken: (tokenId: string | null) => void;
  /** GM: the tokens chosen on the board for a group roll or an area effect (ADR 0046). */
  groupSelection: GroupSelection;
  /** True on narrow screens, where the tab buttons sit above the panel instead of in the top bar. */
  compact: boolean;
  /** The GM is previewing as a player (gm-view-as-player): the panels' controls do nothing. */
  readOnly?: boolean;
  tab: TabId;
  onTab: (tab: TabId) => void;
  /** GM only: open the review of a departed player's tokens (KAN-58). */
  onReviewDeparture: (participantId: string) => void;
  /** Marks on the tabs, e.g. pending rulings on Play (attack-ux-polish). */
  tabBadges?: TabBadges;
  /** What this room offers; a template being edited offers less (ADR 0033). */
  features?: RoomFeatures;
}

/**
 * Renders the selected tab's sections. The tabs separate what a viewer does at the table
 * (Play, Tokens, Dice) from the GM's setup (Manage), instead of one long column.
 */
export function RoomPanel({
  connection, state, you, token, onFocusToken, onPlaceToken, onDuplicateToken, editingTokenId, onEditToken, groupSelection,
  attackPick, onAttackPick, attackReset, rollThrow, onPickOnBoard, onShowPing, diceBoard, attackVisibility, onAttackVisibility,
  gridDraft, hasGridDraft, onGridDraftChange, onGridDraftCancel, onGridApply, gridApplying, gridError,
  compact, tab, onTab, onReviewDeparture, tabBadges, readOnly, features: roomFeatures = FULL_ROOM,
}: Props) {
  const isGm = you.role === "gm";
  useQuietAttackSection(state, you);

  // Role is server-owned, so it can change under us. Don't strand the panel on a tab that
  // no longer exists.
  useEffect(() => {
    if (tab === "gm" && !isGm) onTab("play");
  }, [tab, isGm, onTab]);

  // What the room's game preset turns on (KAN-63). The server enforces it; this only hides controls.
  const features = presetOf(state).features;
  // The area effect's resolve dialog (ADR 0046): here, so the Rulings row and the Area Effect
  // section open the same one, and its draft outlives a close or a tab change.
  const effect = state.areaEffect ?? null;
  const [savedDraft, setDraft] = useState<ResolveDraft | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const draft = draftFor(savedDraft, effect);
  const effectId = effect?.id ?? null;
  useEffect(() => {
    // Resolved or closed, from here or anywhere else: the dialog and its draft go.
    setResolveOpen(false);
    setDraft((d) => (d && d.effectId === effectId ? d : null));
  }, [effectId]);
  const openResolve = () => setResolveOpen(true);
  const sections: Record<TabId, ReactNode> = {
    play: (
      <>
        {!isGm && <DamageCallPrompt connection={connection} state={state} you={you} />}
        {isGm && features.attacks && <RulingsPanel connection={connection} state={state} you={you} airborne={rollThrow.airborne} onResolve={openResolve} />}
        <MyTokens connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
        {/* The encounter first: whose turn it is decides who attacks. */}
        <InitiativeTracker connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
        {features.attacks && <AttackPanel
          connection={connection}
          state={state}
          you={you}
          pick={attackPick}
          onPick={onAttackPick}
          reset={attackReset}
          rolling={rollThrow.rolling}
          onPickOnBoard={onPickOnBoard}
          onShowPing={onShowPing}
          visibility={attackVisibility}
          onVisibility={onAttackVisibility}
        />}
        {isGm && features.attacks && <AreaEffectPanel connection={connection} state={state} you={you} selection={groupSelection} onResolve={openResolve} airborne={rollThrow.airborne} />}
      </>
    ),
    tokens: (
      <TokenRoster connection={connection} state={state} you={you} token={token} onFocusToken={onFocusToken} onPlaceToken={onPlaceToken} onDuplicateToken={onDuplicateToken} editingTokenId={editingTokenId} onEditToken={onEditToken} />
    ),
    dice: <DicePanel connection={connection} state={state} isGm={isGm} rollThrow={rollThrow} board={diceBoard} selection={isGm ? groupSelection : undefined} />,
    gm: isGm ? (
      <GmPanel
        connection={connection}
        state={state}
        token={token}
        onReviewDeparture={onReviewDeparture}
        gridDraft={gridDraft}
        hasGridDraft={hasGridDraft}
        onGridDraftChange={onGridDraftChange}
        onGridDraftCancel={onGridDraftCancel}
        onGridApply={onGridApply}
        gridApplying={gridApplying}
        gridError={gridError}
        features={roomFeatures}
      />
    ) : null,
  };

  return (
    <div className="tabbed">
      {compact && <PanelTabs isGm={isGm} tab={tab} badges={tabBadges} onTab={(t) => onTab(t)} offered={roomFeatures.tabs} />}
      <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={tabButtonId(tab)} tabIndex={0} className="tabpanel">
        {/* A disabled fieldset turns every control off but leaves the content readable by screen readers (gm-view-as-player). */}
        <fieldset className="preview-fieldset" disabled={readOnly}>
          {sections[tab === "gm" && !isGm ? "play" : tab]}
        </fieldset>
        {isGm && !readOnly && effect && draft && (
          <ResolveDialog connection={connection} state={state} effect={effect} draft={draft} onDraft={setDraft} open={resolveOpen} onClose={() => setResolveOpen(false)} airborne={rollThrow.airborne} />
        )}
      </div>
    </div>
  );
}

/**
 * The Attack section outside combat (attack-ux-polish): collapsed while no encounter runs, opened
 * when one starts or the viewer's turn begins, collapsed again when it ends. Never disabled.
 * Here, in the always-mounted panel, so a turn or encounter change on another tab still counts.
 */
function useQuietAttackSection(state: RoomState, you: Participant) {
  const sections = useSectionCollapse();
  const activeId = state.initiative?.order[state.initiative.activeIndex] ?? null;
  const activeToken = activeId ? state.tokens[activeId] : undefined;
  const inEncounter = state.initiative !== null;
  const yourTurn = !!activeToken && can.attackWith(you, activeToken);
  const previous = useRef<EncounterView | null>(null);
  useEffect(() => {
    const next = { inEncounter, yourTurn };
    const prev = previous.current;
    previous.current = next;
    if (!prev) {
      // First look: quiet by default outside combat, open if it's already your go.
      if (!inEncounter && !sections.hasChoice(ATTACK_SECTION)) sections.setCollapsed(ATTACK_SECTION, true);
      else if (inEncounter && yourTurn) sections.setCollapsed(ATTACK_SECTION, false);
      return;
    }
    const change = attackSectionChange(prev, next, sections.toggledSince(ATTACK_SECTION));
    if (change) sections.setCollapsed(ATTACK_SECTION, change === "collapse");
  }, [inEncounter, yourTurn, sections]);
}

const ATTACK_SECTION = "attack";
