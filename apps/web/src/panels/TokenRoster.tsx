import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { presetOf, type PresetFeatures } from "@vtt/shared";
import { Copy, PencilSimple, Trash } from "@phosphor-icons/react";
import {
  can,
  CreatureFields,
  hpFraction,
  isActive,
  type AttackPreset,
  type ConditionId,
  type Participant,
  type RoomState,
  type Token,
  type TokenGroup,
  type TokenUpdate,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { api } from "../net/api";
import { useAccount } from "../account/accountStore";
import { libraryAssetId } from "../net/builtinAssets";
import { LibraryPicker } from "../pages/LibraryPicker";
import { useAttackListEditor } from "./AttackListEditor";
import { creatureFromToken } from "../pages/creatureDraft";
import { TokenPreview } from "../ui/TokenPreview";
import { useDisplayedStats } from "../board/nukeHealth";
import { ConditionMarker, ConditionPicker } from "./ConditionMarker";
import type { TokenDraft } from "../board/placement";
import { AddTokenButton } from "./AddToken";
import { Modal } from "../ui/Modal";
import { isCroppable, TokenArtCropper } from "../ui/TokenArtCropper";
import { PanelSection } from "../ui/PanelSection";
import { CollapseToggle, GroupHeading, NewGroupButton } from "./GroupHeading";
import { groupedTokens } from "./tokenGroups";
import { GroupMoveMenu } from "./GroupMoveMenu";
import { hpLevel } from "../ui/palette";
import { TokenDisc } from "../ui/TokenDisc";
import { t } from "../i18n/locale";

import { inactiveText } from "../i18n/labels";
/**
 * Focusable token roster (FR-GM-24), showing stats and conditions (FR-TAC-07/08).
 *
 * For the GM this is also where tokens are added and managed, so every token control is
 * in one section: Add token at the top, and Edit on a row opens a modal with stats,
 * conditions, owner, visibility and delete.
 *
 * The canvas is a mouse-first surface: finding a token on a crowded map means aiming at
 * it. This list is the keyboard and search path to the same thing — every row is a real
 * button, so Tab and Enter reach every token, and selecting one centres the board on it.
 */
export function TokenRoster({
  connection,
  state,
  you,
  token: guestToken,
  onFocusToken,
  onPlaceToken,
  onDuplicateToken,
  editingTokenId,
  onEditToken,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  /** Room credential, for the GM's token image uploads. */
  token: string;
  onFocusToken: (tokenId: string) => void;
  /** GM: place a token filled in by New Token or Saved Creatures, once per click (token-placement-flow). */
  onPlaceToken: (draft: TokenDraft) => void;
  /** GM: place copies of a token, once per click (token-placement-flow, ADR 0033). */
  onDuplicateToken: (tokenId: string) => void;
  /** The token whose editor is open. The room page owns it, so the board's token card can open it too. */
  editingTokenId: string | null;
  onEditToken: (tokenId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Group ids the GM collapsed; "" is the Ungrouped section (KAN-82). */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const isGm = you.role === "gm";
  const editing = editingTokenId ? state.tokens[editingTokenId] : undefined;
  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    const r = await connection.command(command);
    setError(r.ok ? null : r.message);
    return r.ok;
  };

  /** The token being dragged by its grip, and the section under it ("" is Ungrouped) (roster-group-move). */
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  /** After a move from the menu: where focus goes once the token's row has moved. */
  const [refocus, setRefocus] = useState<{ tokenId: string; groupId: string | null } | null>(null);
  const groups = Object.values(state.groups);
  const groupOf = (tokenId: string) => state.tokenGroups[tokenId] ?? null;

  /** One token into a group, or out of any with null: one undoable action, as the editor's Group field. */
  const moveToGroup = async (tokenId: string, groupId: string | null) => {
    if (groupOf(tokenId) === groupId) return false;
    return send({ type: "group.assign", groupId, tokenIds: [tokenId] });
  };

  // The row is rebuilt in its new section, so its grip lost focus; give it back, or to the
  // section's heading when that section is collapsed.
  useEffect(() => {
    if (!refocus || (state.tokenGroups[refocus.tokenId] ?? null) !== refocus.groupId) return;
    setRefocus(null);
    const handle = document.querySelector<HTMLElement>(`[data-move-handle="${refocus.tokenId}"]`);
    const heading = document.querySelector<HTMLElement>(`[data-group-section="${refocus.groupId ?? ""}"] .group-toggle`);
    (handle ?? heading)?.focus();
  }, [refocus, state.tokenGroups]);

  /** Drag-and-drop handlers for one group's section, heading and list together. */
  const dropZone = (groupId: string | null) => {
    const key = groupId ?? "";
    return {
      "data-group-section": key,
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!dragging) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget((t) => (t === key ? null : t));
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        const tokenId = dragging;
        setDragging(null);
        setDropTarget(null);
        if (tokenId) void moveToGroup(tokenId, groupId);
      },
    };
  };

  const tokens = Object.values(state.tokens)
    .filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeId = state.initiative?.order[state.initiative.activeIndex] ?? null;
  const row = (token: Token) => (
    <RosterRow
      key={token.id}
      token={token}
      you={you}
      isActive={token.id === activeId}
      onFocus={() => onFocusToken(token.id)}
      onEdit={() => {
        setError(null);
        onEditToken(token.id);
      }}
      // The board places each copy where the GM clicks, until they're done (ADR 0033).
      onDuplicate={isGm ? () => onDuplicateToken(token.id) : undefined}
      handle={isGm && groups.length > 0 ? (
        <GroupMoveMenu
          token={token}
          groups={groups}
          groupId={groupOf(token.id)}
          onMove={async (groupId) => {
            if (await moveToGroup(token.id, groupId)) setRefocus({ tokenId: token.id, groupId });
          }}
          onDragStart={() => setDragging(token.id)}
          onDragEnd={() => {
            setDragging(null);
            setDropTarget(null);
          }}
        />
      ) : undefined}
    />
  );

  return (
    <PanelSection id="tokens" title={t("panel.tokens")} actions={isGm ? <NewGroupButton connection={connection} onError={setError} /> : undefined}>
      <label htmlFor="roster-search" className="sr-only">
        {t("roster.search")}
      </label>
      <input
        id="roster-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("roster.searchPlaceholder")}
        autoComplete="off"
      />

      {isGm ? (
        // The GM's roster is grouped (KAN-82); players never receive groups, so theirs is one list.
        <>
          {groupedTokens(state, tokens).map(({ group, tokens: members }) =>
            // An empty Ungrouped appears while dragging, so a token can be dropped out of its group.
            group || members.length > 0 || tokens.length === 0 || dragging ? (
              <section key={group?.id ?? "ungrouped"} {...dropZone(group?.id ?? null)}
                className={dropTarget === (group?.id ?? "") ? "roster-group drop-target" : "roster-group"} aria-label={group?.name ?? t("roster.ungroupedTokens")}>
                {group ? (
                  <GroupHeading group={group} tokens={members} others={Object.values(state.tokens).filter((t) => state.tokenGroups[t.id] !== group.id).slice(0, 100)} connection={connection} onError={setError}
                    collapsed={collapsed.has(group.id)} onToggle={() => toggle(group.id)} />
                ) : (
                  <div className="group-heading">
                    <CollapseToggle label={Object.keys(state.groups).length > 0 ? t("group.ungrouped") : t("roster.all")} count={members.length}
                      collapsed={collapsed.has("")} onToggle={() => toggle("")} />
                  </div>
                )}
                {collapsed.has(group?.id ?? "") ? null : members.length === 0 ? (
                  <p className="muted">{group ? t("roster.emptyGroup") : query ? t("roster.noMatch") : t("roster.none")}</p>
                ) : (
                  <ul className="plain roster">
                    {members.map((token) => row(token))}
                  </ul>
                )}
              </section>
            ) : null,
          )}
        </>
      ) : tokens.length === 0 ? (
        <p className="muted">{query ? t("roster.noMatch") : t("roster.none")}</p>
      ) : (
        <ul className="plain roster">
          {tokens.map((token) => row(token))}
        </ul>
      )}
      {error && !editing && <p role="alert" className="error">{error}</p>}
      {isGm && <AddTokenButton state={state} token={guestToken} onPlace={onPlaceToken} />}

      <Modal open={!!editing} title={editing ? t("roster.editNamed", { name: editing.name }) : t("roster.edit")} onClose={() => onEditToken(null)}>
        {editing && (
          <TokenEditor
            key={editing.id}
            token={editing}
            roomToken={guestToken}
            isGm={isGm}
            players={Object.values(state.participants).filter((p) => p.role === "player" && isActive(p))}
            departedOwner={departedOwner(state, editing.ownerIds)}
            error={error}
            groups={Object.values(state.groups)}
            groupId={state.tokenGroups[editing.id] ?? null}
            features={presetOf(state).features}
            onSave={async (changes, groupId) => {
              if (Object.keys(changes).length > 0 && !(await send({ type: "token.configure", tokenId: editing.id, changes }))) return;
              if (groupId !== undefined && !(await send({ type: "group.assign", groupId, tokenIds: [editing.id] }))) return;
              onEditToken(null);
            }}
            onDuplicate={() => {
              // The board places each copy where the GM clicks, until they're done (ADR 0033).
              onDuplicateToken(editing.id);
              onEditToken(null);
            }}
            onDelete={async () => {
              if (await send({ type: "token.delete", tokenId: editing.id })) onEditToken(null);
            }}
          />
        )}
      </Modal>
    </PanelSection>
  );
}

function RosterRow({
  token,
  you,
  isActive,
  onFocus,
  onEdit,
  onDuplicate,
  handle,
}: {
  token: Token;
  you: Participant;
  isActive: boolean;
  onFocus: () => void;
  onEdit: () => void;
  /** GM only (token-card-actions). */
  onDuplicate?: () => void;
  /** GM only, when the room has groups: the grip that moves the token to another group (roster-group-move). */
  handle?: ReactNode;
}) {
  // Same rule the server enforces; this only decides whether to draw the controls.
  const editable = can.editToken(you, token);
  const stats = useDisplayedStats(token);
  const fraction = hpFraction(stats);

  return (
    <li className={isActive ? "roster-row active" : "roster-row"}>
      <div className="roster-main">
        {handle}
        <button type="button" className="roster-focus" onClick={onFocus}>
          <TokenDisc name={token.name} color={token.color} image={token.imageUrl} size="1.5rem" className="small" />
          <span className="token-name">{token.name}</span>
          {token.hidden && <span className="badge">{t("roster.hidden")}</span>}
          {isActive && <span className="badge active-badge">{t("roster.activeTurn")}</span>}
          {token.stats.hp !== null && (
            <span className="hp">
              {stats.hp}
              {token.stats.maxHp !== null && `/${token.stats.maxHp}`} {t("creature.stat.hp")}
            </span>
          )}
          {token.stats.ac !== null && <span className="muted num">{t("creature.ac")} {token.stats.ac}</span>}
        </button>
        {editable && (
          <button type="button" className="icon-button roster-edit" onClick={onEdit} aria-label={t("roster.editNamed", { name: token.name })} title={t("common.edit")}>
            <PencilSimple size={16} aria-hidden="true" />
          </button>
        )}
        {onDuplicate && (
          <button type="button" className="icon-button roster-edit" onClick={onDuplicate} aria-label={t("roster.duplicateNamed", { name: token.name })} title={t("common.duplicate")}>
            <Copy size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {fraction !== null && (
        <div
          className="hp-bar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={token.stats.maxHp ?? 0}
          aria-valuenow={stats.hp ?? 0}
          aria-label={t("roster.hpOf", { name: token.name })}
        >
          <span style={{ width: `${fraction * 100}%` }} data-level={hpLevel(fraction)} />
        </div>
      )}

      {token.conditions.length > 0 && (
        <ul className="plain marker-row">
          {token.conditions.map((c) => (
            <li key={c}>
              <ConditionMarker id={c} size={22} />
            </li>
          ))}
        </ul>
      )}

    </li>
  );
}

/** The token's owner if they left or were removed, so the picker can show them instead of "No one" (ADR 0006). */
function departedOwner(state: RoomState, ownerIds: string[]): Participant | null {
  const owner = ownerIds[0] ? state.participants[ownerIds[0]] : undefined;
  return owner && !isActive(owner) ? owner : null;
}

/**
 * Edits are a draft until Save, and Save asks once more before anything is sent, so a
 * stray click in the modal never changes a token everyone can see. Delete asks too.
 */
export function TokenEditor({
  token,
  roomToken,
  isGm,
  players,
  departedOwner,
  error,
  groups = [],
  groupId: savedGroupId = null,
  features = ALL_FEATURES,
  onSave,
  onDelete,
  onDuplicate,
}: {
  token: Token;
  roomToken: string;
  isGm: boolean;
  players: Participant[];
  /** Set when the current owner left the room and the GM hasn't resolved the token yet. */
  departedOwner: Participant | null;
  error: string | null;
  /** GM: the room's groups and this token's, for the Group field (KAN-82). */
  groups?: readonly TokenGroup[];
  groupId?: string | null;
  /** What the room's game preset turns on (KAN-63); everything when omitted. */
  features?: PresetFeatures;
  /** A one-square Move control, the keyboard path to moving this token (WCAG 2.5.7). */
  /** `groupId` is undefined when the group did not change. */
  onSave: (changes: TokenUpdate, groupId?: string | null) => Promise<void>;
  onDelete: () => void;
  /** GM: start placing copies of this token on the board (KAN-82, token-placement-flow). */
  onDuplicate?: () => void;
}) {
  const [hp, setHp] = useState(token.stats.hp?.toString() ?? "");
  const [name, setName] = useState(token.name);
  const [x, setX] = useState(String(token.position.x));
  const [y, setY] = useState(String(token.position.y));
  const [size, setSize] = useState(String(token.size));
  const [rotation, setRotation] = useState(String(token.rotation));
  const [image, setImage] = useState({ url: token.imageUrl, assetId: token.assetId ?? null });
  const hasLibrary = useAccount().status === "signedIn";
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [maxHp, setMaxHp] = useState(token.stats.maxHp?.toString() ?? "");
  const [ac, setAc] = useState(token.stats.ac?.toString() ?? "");
  const [conditions, setConditions] = useState<ConditionId[]>(token.conditions);
  // Shared with everyone who may see them, saved with the rest of the form (ADR 0034).
  const [attacks, setAttacks] = useState<AttackPreset[]>(token.attacks ?? []);
  const attackList = useAttackListEditor({ attacks, onChange: setAttacks });
  const [ownerId, setOwnerId] = useState(token.ownerIds[0] ?? "");
  const [hidden, setHidden] = useState(token.hidden);
  const [groupId, setGroupId] = useState(savedGroupId ?? "");
  const [confirming, setConfirming] = useState<"save" | "delete" | null>(null);
  /** Save as creature (KAN-70): the token as it is now, saved at once as a new library creature. */
  const [creatureStatus, setCreatureStatus] = useState("");
  const [savingCreature, setSavingCreature] = useState(false);
  const saveAsCreature = async () => {
    setSavingCreature(true);
    setCreatureStatus("");
    try {
      // Its art comes along only when it is the GM's own token art; an unreadable library means none.
      const ownArt = await api.library.list().catch(() => []);
      // The token's own attacks, as the GM and its owners see them (ADR 0034).
      const { imageUrl: _imageUrl, ...fields } = creatureFromToken(token, ownArt);
      const saved = await api.library.creatures.create(CreatureFields.parse(fields));
      setCreatureStatus(t("roster.savedCreature", { name: saved.name }));
    } catch (err) {
      setCreatureStatus(err instanceof Error ? err.message : t("roster.saveCreatureFailed"));
    } finally {
      setSavingCreature(false);
    }
  };
  const [busy, setBusy] = useState(false);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const stats = { hp: num(hp), maxHp: num(maxHp), ac: num(ac) };
  const sameConditions =
    conditions.length === token.conditions.length && conditions.every((c) => token.conditions.includes(c));

  const changes: TokenUpdate = {};
  if (isGm && (name.trim() !== token.name || Number(size) !== token.size || Number(rotation) !== token.rotation))
    Object.assign(changes, { name, size: Number(size), rotation: Number(rotation) });
  if (isGm && (Number(x) !== token.position.x || Number(y) !== token.position.y))
    changes.position = { x: Number(x), y: Number(y) };
  if (isGm && (image.url !== token.imageUrl || image.assetId !== (token.assetId ?? null)))
    Object.assign(changes, { imageUrl: image.url, assetId: image.assetId });
  if (stats.hp !== token.stats.hp || stats.maxHp !== token.stats.maxHp || stats.ac !== token.stats.ac)
    changes.stats = stats;
  if (!sameConditions) changes.conditions = conditions;
  // Only when changed here, so an unrelated Save never overwrites an owner's edit made meanwhile.
  if (features.attacks && JSON.stringify(attacks) !== JSON.stringify(token.attacks ?? [])) changes.attacks = attacks;
  if (isGm && ownerId !== (token.ownerIds[0] ?? ""))
    changes.ownerIds = ownerId ? [ownerId] : [];
  if (isGm && hidden !== token.hidden) changes.hidden = hidden;
  const groupChanged = isGm && groupId !== (savedGroupId ?? "");
  const hasChanges = Object.keys(changes).length > 0 || groupChanged;

  const save = async () => {
    setBusy(true);
    try {
      await onSave(changes, groupChanged ? groupId || null : undefined);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  /** Token art is framed first (token-art-cropper); other file types upload as they are. */
  function pickArt(file: File | undefined) {
    if (file && isCroppable(file)) setCropFile(file);
    else void onUpload(file);
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { url } = await api.upload(file, roomToken);
      setImage({ url, assetId: null });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("common.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
    <form
      className="token-editor"
      // A field that fails validation inside a closed section can't show its message; open the section.
      onInvalidCapture={(e) => (e.target as HTMLElement).closest("details")?.setAttribute("open", "")}
      onSubmit={(e) => {
        e.preventDefault();
        if (hasChanges && !uploading) setConfirming("save");
      }}
    >
      {isGm && <label>{t("common.name")}<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus /></label>}
      <div className="stats-row">
        <label>
          {t("creature.stat.hp")}
          <input type="number" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} min="-999" max="9999" step="1" autoFocus={!isGm} />
        </label>
        <label>
          {t("roster.max")}
          <input type="number" inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" />
        </label>
        {features.armorClass && (
          <label>
            {t("creature.ac")}
            <input type="number" inputMode="numeric" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" />
          </label>
        )}
      </div>

      {features.conditions && (
        <details className="token-editor-section">
          <summary>{t("home.play.conditions")}<span className="token-editor-summary">{conditions.length || t("card.noneLower")}</span></summary>
          <ConditionPicker value={conditions} onChange={setConditions} />
        </details>
      )}

      {features.attacks && attackList.section}

      {isGm && (
        <details className="token-editor-section">
          <summary>
            {t("roster.control")}
            <span className="token-editor-summary">
              {players.find((p) => p.id === ownerId)?.displayName ?? (ownerId ? departedOwner?.displayName : t("rail.gmOnly"))}
              {groups.find((g) => g.id === groupId) && ` · ${groups.find((g) => g.id === groupId)!.name}`}
              {hidden && ` · ${t("roster.hidden")}`}
            </span>
          </summary>
          <label>
            {t("roster.controlledBy")}
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{t("roster.noOneGm")}</option>
              {departedOwner && (
                <option value={departedOwner.id} disabled>
                  {departedOwner.displayName} ({inactiveText(departedOwner)})
                </option>
              )}
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          {groups.length > 0 && (
            <label className="token-group-field">
              {t("add.group")}
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">{t("add.noGroup")}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
          )}
          <label className="inline">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            {t("add.hidden")}
          </label>
        </details>
      )}


      {isGm && (
        <details className="token-editor-section">
          <summary>{t("common.advanced")}<span className="token-editor-summary">{t("roster.cells", { n: Number(size) })} · {rotation}° · {image.url ? t("roster.image") : t("roster.noImage")}</span></summary>
          <div className="token-setup-grid">
            <label>{t("roster.boardX")}<input type="number" value={x} onChange={(e) => setX(e.target.value)} required step="any" /></label>
            <label>{t("roster.boardY")}<input type="number" value={y} onChange={(e) => setY(e.target.value)} required step="any" /></label>
            <label>{t("creature.size")}<input type="number" value={size} onChange={(e) => setSize(e.target.value)} required min="0.25" max="10" step="any" /></label>
            <label>{t("add.rotation")}<input type="number" value={rotation} onChange={(e) => setRotation(e.target.value)} required step="any" /></label>
          </div>
          <div className="stack token-image-field">
            <span className="field-label">{t("creature.image")}</span>
            {image.url && (
              <div className="row token-image-chosen">
                <TokenPreview url={image.url} color={token.color} hidden={hidden} />
                <button type="button" className="link" disabled={uploading} onClick={() => setImage({ url: null, assetId: null })}>{t("roster.removeImage")}</button>
              </div>
            )}
            <div className="row">
              <label className="upload-button secondary">
                <span>{uploading ? t("common.uploading") : image.url ? t("roster.replaceImage") : t("roster.uploadImage")}</span>
                <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={uploading}
                  onChange={(e) => { pickArt(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              <button type="button" className="secondary" disabled={uploading} onClick={() => setPicking(true)}>{hasLibrary ? t("guide.map.library.title") : t("add.builtInArt")}</button>
            </div>
          </div>
        </details>
      )}

      {(error || uploadError) && <p role="alert" className="error">{error || uploadError}</p>}

      {confirming === "save" ? (
        <div className="confirm" role="group" aria-label={t("roster.confirmChanges")}>
          <p>
            {t("roster.saveQ", { name: token.name })}
          </p>
          <div className="row">
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(null)}>
              {t("common.back")}
            </button>
            <button className="primary" type="button" disabled={busy || uploading} onClick={() => void save()} autoFocus>
              {t("roster.confirm")}
            </button>
          </div>
        </div>
      ) : confirming === "delete" ? (
        <div className="confirm" role="group" aria-label={t("roster.confirmDelete")}>
          <p>{t("roster.deleteQ", { name: token.name })}</p>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setConfirming(null)}>
              {t("common.keep")}
            </button>
            <button type="button" className="danger-fill" onClick={onDelete} autoFocus>
              {t("depart.deleteToken")}
            </button>
          </div>
        </div>
      ) : (
        <div className="token-editor-actions">
          {isGm && onDuplicate && (
            <button type="button" className="secondary" disabled={busy} title={t("roster.duplicateHint")} onClick={onDuplicate}>
              {t("common.duplicate")}
            </button>
          )}
          {isGm && hasLibrary && (
            <button type="button" className="secondary token-save-creature" disabled={savingCreature} onClick={() => void saveAsCreature()}>
              {savingCreature ? t("common.saving") : t("roster.saveCreature")}
            </button>
          )}
          {isGm && (
            <button
              type="button"
              className="icon-button token-delete"
              aria-label={t("common.deleteNamed", { name: token.name })}
              title={t("depart.deleteToken")}
              onClick={() => setConfirming("delete")}
            >
              <Trash size={18} aria-hidden />
            </button>
          )}
          <button type="submit" className="token-save primary" disabled={!hasChanges || uploading}>
            {t("common.save")}
          </button>
        </div>
      )}
    </form>
    {/* Outside the editor's form: a form nested in a form would submit the editor instead. */}
    {features.attacks && attackList.editor}
    <p role="status" className={creatureStatus ? "muted small-print" : "sr-only"}>{creatureStatus}</p>
    {cropFile && <TokenArtCropper file={cropFile} onCancel={() => setCropFile(null)} onConfirm={(f) => { setCropFile(null); void onUpload(f); }} />}
    {isGm && (
      <Modal open={picking} title={t("add.chooseImage")} onClose={() => setPicking(false)}>
        <LibraryPicker kind="token" onPick={(asset) => {
          setImage({ url: asset.url, assetId: libraryAssetId(asset) });
          setPicking(false);
        }} />
      </Modal>
    )}
    </>
  );
}

/** Every rules feature on: the editor outside a room, and in a Dungeons & Dragons room. */
const ALL_FEATURES: PresetFeatures = { attacks: true, conditions: true, armorClass: true };
