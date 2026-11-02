import { useId, useRef, useState, type ReactNode } from "react";
import { presetOf, type PresetFeatures } from "@vtt/shared";
import { DEFAULT_TOKEN_COLOR, isActive, type AttackPreset, type ConditionId, type LibraryCreature, type RoomState, type TokenStats } from "@vtt/shared";
import type { TokenDraft } from "../board/placement";
import { api } from "../net/api";
import { useAccount } from "../account/accountStore";
import { libraryAssetId } from "../net/builtinAssets";
import { creatureDraft } from "../pages/creatureDraft";
import { CreaturePicker } from "../pages/LibraryCreatures";
import { LibraryPicker } from "../pages/LibraryPicker";
import { Modal } from "../ui/Modal";
import { TokenPreview } from "../ui/TokenPreview";
import { ConditionPicker } from "./ConditionMarker";
import { statsWithDefaults } from "./tokenDefaults";
import { useAttackListEditor } from "./AttackListEditor";

import { randomTokenColor } from "../ui/tokenColors";

/**
 * The GM's New Token and Saved Creatures buttons and their modals (room-sidebar-layout: GM setup
 * forms open in modals). They live at the top of the Tokens section so every token control is in
 * one place. Neither creates anything: the GM then places on the board, one token per click, until
 * done (token-placement-flow).
 */
export function AddTokenButton({
  state,
  token,
  onPlace,
}: {
  state: RoomState;
  token: string;
  /** Hand the filled-in token to the board, where the GM chooses its square. */
  onPlace: (draft: TokenDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creaturesOpen, setCreaturesOpen] = useState(false);
  /** Saved Creatures' Hidden checkbox: unticked each time the dialog opens, so nothing stays hidden by surprise. */
  const [creatureHidden, setCreatureHidden] = useState(false);
  /** The group the new tokens join; reset each time a dialog opens. */
  const [groupId, setGroupId] = useState("");
  const groups = Object.values(state.groups);
  const groupField = groups.length > 0 && (
    <label className="token-group-field">
      Group
      <select value={groups.some((g) => g.id === groupId) ? groupId : ""} onChange={(e) => setGroupId(e.target.value)}>
        <option value="">No group</option>
        {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
    </label>
  );
  const place = (draft: TokenDraft) => onPlace(groups.some((g) => g.id === groupId) ? { ...draft, groupId } : draft);
  /** Filled in and waiting for the dialog to finish closing, so the board takes focus after it. */
  const pending = useRef<TokenDraft | null>(null);
  // The library belongs to the signed-in account (ADR 0017); a signed-out GM uploads directly.
  const hasLibrary = useAccount().status === "signedIn";
  const players = Object.values(state.participants).filter((p) => p.role === "player" && isActive(p));

  return (
    <>
      <div className="row add-token-buttons" data-tour="gm-add-token">
        <button type="button" className="primary" onClick={() => { setGroupId(""); setOpen(true); }}>
          New Token
        </button>
        {hasLibrary && (
          <button type="button" onClick={() => { setCreatureHidden(false); setGroupId(""); setCreaturesOpen(true); }}>
            Saved Creatures
          </button>
        )}
      </div>
      <Modal
        open={open}
        title="New Token"
        onClose={() => setOpen(false)}
        onAfterClose={() => {
          const draft = pending.current;
          pending.current = null;
          if (draft) place(draft);
        }}
      >
        <AddToken
          players={players}
          token={token}
          hasLibrary={hasLibrary}
          groupField={groupField}
          features={presetOf(state).features}
          onAdd={(draft) => {
            pending.current = draft;
            setOpen(false);
          }}
        />
      </Modal>
      {hasLibrary && (
        <Modal
          open={creaturesOpen}
          title="Saved Creatures"
          onClose={() => setCreaturesOpen(false)}
          onAfterClose={() => {
            const draft = pending.current;
            pending.current = null;
            if (draft) place(draft);
          }}
        >
          <div className="stack">
            <CreaturePicker
              onPick={(creature) => {
                pending.current = savedCreatureDraft(creature, creatureHidden, presetOf(state).features);
                setCreaturesOpen(false);
              }}
            />
            {/* Chosen before anything is created, so an ambush never reaches players (token-placement-flow). */}
            <div className="stack">
              {groupField}
              <label className="inline">
                <input type="checkbox" checked={creatureHidden} onChange={(e) => setCreatureHidden(e.target.checked)} />
                Hidden from players
              </label>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

interface TokenImage {
  url: string;
  assetId: string | null;
  label: string;
}

function AddToken(props: {
  players: { id: string; displayName: string }[];
  token: string;
  hasLibrary: boolean;
  /** The Group select, when the room has groups. */
  groupField: ReactNode;
  /** What the room's game preset turns on (KAN-63). */
  features: PresetFeatures;
  /** The form is complete; the token is created once the GM picks its square on the board. */
  onAdd: (draft: TokenDraft) => void;
}) {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [hidden, setHidden] = useState(false);
  const [size, setSize] = useState("1");
  const [rotation, setRotation] = useState("0");
  const [hp, setHp] = useState("");
  const [maxHp, setMaxHp] = useState("");
  const [ac, setAc] = useState("");
  const [image, setImage] = useState<TokenImage | null>(null);
  /** Starts with the next palette colour, editable or replaced by a creature (KAN-70). */
  // Without art a token gets a random disc colour.
  const [color] = useState(randomTokenColor);
  const [conditions, setConditions] = useState<ConditionId[]>([]);
  const conditionsLabelId = useId();
  const [attacks, setAttacks] = useState<AttackPreset[]>([]);
  // A creature fills these in; the GM can see and change them before placing (shared-token-attacks).
  const attackList = useAttackListEditor({ attacks, onChange: setAttacks });
  const features = props.features;
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typedStats = { hp: optionalNumber(hp), maxHp: optionalNumber(maxHp), ac: optionalNumber(ac) };
  // What each blank field will become, given the others as typed now (token-stat-defaults).
  const defaults = statsWithDefaults(typedStats);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.upload(file, props.token);
      setImage({ url, assetId: null, label: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          props.onAdd(tokenDraftFor({
            name, hidden, ownerIds: ownerId ? [ownerId] : [], size: Number(size), rotation: Number(rotation),
            stats: typedStats, image, color, conditions, attacks,
          }, features));
        }}
      >
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            autoFocus
            aria-describedby="add-token-name-hint"
          />
          {/* The server does the numbering (KAN-62); this only tells the GM to expect it. */}
          <span id="add-token-name-hint" className="muted">
            Duplicate names are numbered automatically, e.g. Goblin 2.
          </span>
        </label>
        {/* Blank HP and AC fall back to the defaults shown as placeholders (token-stat-defaults). */}
        <div className="token-setup-grid token-setup-grid-3">
          <label>HP<input type="number" value={hp} onChange={(e) => setHp(e.target.value)} min="-999" max="9999" step="1" placeholder={String(defaults.hp)} /></label>
          <label>Max HP<input type="number" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" placeholder={String(defaults.maxHp)} /></label>
          {features.armorClass && <label>AC<input type="number" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" placeholder={String(defaults.ac)} /></label>}
        </div>
        <details className="token-editor-section">
          <summary>Control &amp; visibility</summary>
          <div className="stack">
            <label>
              Owner
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">No owner (GM only)</option>
                {props.players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
            {props.groupField}
            <label className="inline">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              Hidden from players
            </label>
          </div>
        </details>
        {/* Rarely changed from their defaults, so tucked away (token-stat-defaults). No position
            fields: the GM points at the square on the board next (place-token-on-board). */}
        {features.attacks && attackList.section}
        <details className="token-editor-section">
          <summary>Image<span className="token-editor-summary">{image ? image.label : "none"}</span></summary>
        <div className="stack token-image-field">
          {image ? (
            <div className="row token-image-chosen">
              <TokenPreview url={image.url} color={color ?? DEFAULT_TOKEN_COLOR} hidden={hidden} />
              <span className="token-name" title={image.label}>{image.label}</span>
              <button type="button" className="link" onClick={() => setImage(null)}>
                Remove
              </button>
            </div>
          ) : (
            <div className="row">
              <label className="upload-button secondary">
                <span>{uploading ? "Uploading…" : "Upload new"}</span>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(e) => void onUpload(e.target.files?.[0])}
                />
              </label>
              <button type="button" className="secondary" disabled={uploading} onClick={() => setPicking(true)}>
                {props.hasLibrary ? "From library" : "Built-in art"}
              </button>
            </div>
          )}
        </div>
        </details>
        <details className="token-editor-section">
          <summary>Advanced settings</summary>
          <div className="stack">
            {/* A creature fills these in; the GM can change them before placing (KAN-70). */}
            {features.conditions && (
              <div className="stack" role="group" aria-labelledby={conditionsLabelId}>
                <span id={conditionsLabelId} className="field-label">Starting conditions</span>
                <ConditionPicker value={conditions} onChange={setConditions} />
              </div>
            )}
            <div className="token-setup-grid">
              <label>Size (cells)<input type="number" value={size} onChange={(e) => setSize(e.target.value)} required min="0.25" max="10" step="any" /></label>
              <label>Rotation (°)<input type="number" value={rotation} onChange={(e) => setRotation(e.target.value)} required step="any" /></label>
            </div>
          </div>
        </details>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" type="submit" disabled={uploading}>Choose a square</button>
        <p className="muted">Next, click the square on the map where it should go.</p>
      </form>
      {/* The attack editor is a form of its own, so it can't be nested in this one. */}
      {features.attacks && attackList.editor}
      <Modal open={picking} title="Choose a token image" onClose={() => setPicking(false)}>
        <LibraryPicker
          kind="token"
          onPick={(asset) => {
            // The token name is left to the GM on purpose: prefilling the library name
            // would put it in front of players (asset-library: details stay private).
            setImage({ url: asset.url, assetId: libraryAssetId(asset), label: asset.name });
            setPicking(false);
          }}
        />
      </Modal>
    </>
  );
}

/** A token's values as New Token's form or a saved creature gives them, before the preset's gating. */
export interface TokenFields {
  name: string;
  hidden: boolean;
  ownerIds: string[];
  size: number;
  rotation: number;
  /** As typed or saved: blanks are filled by `statsWithDefaults` (token-stat-defaults). */
  stats: TokenStats;
  image: { url: string; assetId: string | null } | null;
  color: string;
  conditions: ConditionId[];
  attacks: AttackPreset[];
}

/**
 * The draft placing sends for each token: blank stats defaulted, and whatever the room's game preset
 * turns off left out (KAN-63). New Token and Saved Creatures both go through here, so they can't drift.
 * No count: placing repeats one token per click instead (token-placement-flow).
 */
export function tokenDraftFor(f: TokenFields, features: PresetFeatures): TokenDraft {
  const stats = statsWithDefaults(f.stats);
  return {
    type: "token.create", name: f.name, hidden: f.hidden, ownerIds: f.ownerIds, size: f.size, rotation: f.rotation,
    stats: features.armorClass ? stats : { ...stats, ac: null },
    imageUrl: f.image?.url ?? null, assetId: f.image?.assetId ?? null,
    color: f.color,
    conditions: features.conditions ? f.conditions : [],
    attacks: features.attacks ? f.attacks : [],
  };
}

/** A saved creature placed straight from Saved Creatures: its values, no owner, Hidden as ticked. */
export function savedCreatureDraft(creature: LibraryCreature, hidden: boolean, features: PresetFeatures): TokenDraft {
  const values = creatureDraft(creature);
  return tokenDraftFor({
    name: values.name, hidden, ownerIds: [], size: values.size, rotation: 0, stats: values.stats,
    image: values.image, color: values.color, conditions: values.conditions, attacks: values.attacks,
  }, features);
}

const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);
