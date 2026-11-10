import { PencilSimple, Trash } from "@phosphor-icons/react";
import { IconAction } from "../ui/IconAction";
import { useEffect, useId, useState, type FormEvent } from "react";
import { CreatureFields, MAX_TOKEN_ATTACKS, MIN_HP, creatureHpValid, type AttackPreset, type ConditionId, type LibraryAsset, type LibraryCreature } from "@vtt/shared";
import { PresetEditor } from "../panels/AttackPanel";
import { presetSummary } from "../panels/attackRoll";
import { ConditionPicker } from "../panels/ConditionMarker";
import { api } from "../net/api";
import { randomTokenColor } from "../ui/tokenColors";
import { isBuiltin } from "../net/builtinAssets";
import { BUILTIN_CREATURES } from "../net/builtinCreatures";
import { Modal } from "../ui/Modal";
import { TokenPreview } from "../ui/TokenPreview";
import { creatureSummary, type CreaturePrefill } from "./creatureDraft";
import { LibraryPicker } from "./LibraryPicker";
import { TokenDisc } from "../ui/TokenDisc";
import { t } from "../i18n/locale";

/** A creature in the library's Creatures tab (library-creatures): its art or a colour disc, name and stats. */
export function CreatureCard(props: {
  creature: LibraryCreature;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { creature } = props;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    try {
      await api.library.creatures.remove(creature.id);
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.deleteFailed"));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <li className="asset-card creature-card">
      <div className="asset-thumb token">
        <TokenDisc name={creature.name} color={creature.color} image={creature.imageUrl} size="5.5rem" />
      </div>
      <strong className="asset-name" title={creature.name}>{creature.name}</strong>
      <span className="muted asset-meta">{creatureSummary(creature)}</span>
      {error && <p role="alert" className="error">{error}</p>}
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={t("common.deleteNamedQ", { name: creature.name })}>
          <p>{t("creature.deleteBody", { name: creature.name })}</p>
          <div className="row">
            <button type="button" className="secondary small" disabled={deleting} onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </button>
            <button type="button" className="small danger-fill" disabled={deleting} onClick={() => void remove()}>
              {deleting ? t("common.deleting") : t("common.delete")}
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <IconAction icon={<PencilSimple size={16} aria-hidden="true" />} label={t("common.edit")} onClick={props.onEdit} />
          <IconAction icon={<Trash size={16} aria-hidden="true" />} label={t("common.delete")} danger onClick={() => setConfirming(true)} />
        </div>
      )}
    </li>
  );
}

/** A creature included with the app: read-only art, name and stats; GMs place it from "From creature". */
export function BuiltinCreatureCard(props: { creature: LibraryCreature }) {
  const { creature } = props;
  const stats: [string, number | null][] = [[t("creature.stat.hp"), creature.maxHp ?? null], [t("creature.stat.ac"), creature.ac ?? null]];
  return (
    <li className="asset-card creature-card builtin-creature">
      <TokenDisc name={creature.name} color={creature.color} image={creature.imageUrl} size="6rem" className="builtin-creature-portrait" />
      <strong className="asset-name" title={creature.name}>{creature.name}</strong>
      <dl className="builtin-creature-stats">
        {stats.map(([label, value]) => value !== null && (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
        <div><dt>{t("creature.attacks")}</dt><dd>{creature.attacks?.length ?? 0}</dd></div>
      </dl>
    </li>
  );
}

/** Read when the form renders, so the hints follow the reader's language. */
const fieldHint = (field: string): string | undefined => ({
  name: t("creature.hint.name"),
  size: t("creature.hint.size"),
  hp: t("creature.hint.hp", { min: MIN_HP }),
  maxHp: t("creature.hint.maxHp"),
  ac: t("creature.hint.ac"),
} as Record<string, string>)[field];

const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * New or Edit creature. The name is the name its tokens show on the board, so players see
 * it (ADR 0012). The image is only ever the GM's own token art.
 */
export function CreatureForm(props: {
  creature: LibraryCreature | null;
  /** Values for a new creature, e.g. from a token on the board (Save as creature, KAN-70). */
  prefill?: CreaturePrefill;
  onSaved: (creature: LibraryCreature) => void;
  onCancel: () => void;
}) {
  const { creature } = props;
  const from = creature ?? props.prefill ?? null;
  const [name, setName] = useState(from?.name ?? "");
  const [size, setSize] = useState(String(from?.size ?? 1));
  const [hp, setHp] = useState(from?.hp == null ? "" : String(from.hp));
  const [maxHp, setMaxHp] = useState(from?.maxHp == null ? "" : String(from.maxHp));
  const [ac, setAc] = useState(from?.ac == null ? "" : String(from.ac));
  // A new creature gets a random disc colour for when it has no art; an existing one keeps its own.
  const [color] = useState(() => from?.color ?? randomTokenColor());
  const [conditions, setConditions] = useState<ConditionId[]>(from?.conditions ?? []);
  const [attacks, setAttacks] = useState<AttackPreset[]>(structuredClone(from?.attacks ?? []));
  const [editingAttack, setEditingAttack] = useState<number | "new" | null>(null);
  const [image, setImage] = useState<{ assetId: string; url: string; label: string } | null>(
    from?.imageAssetId && from.imageUrl ? { assetId: from.imageAssetId, url: from.imageUrl, label: creature ? t("creature.currentArt") : t("creature.tokensArt") } : null,
  );
  const [picking, setPicking] = useState(false);
  const conditionsLabelId = useId();
  /** Advanced settings: open when it starts with a value in it; only ever opened automatically, never closed. */
  const [advancedOpen, setAdvancedOpen] = useState(from?.hp != null || (from?.conditions.length ?? 0) > 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = CreatureFields.refine(creatureHpValid, { path: ["hp"], message: "Starting HP cannot exceed Max HP" }).safeParse({
    name,
    size: size.trim() === "" ? Number.NaN : Number(size),
    hp: optionalNumber(hp),
    maxHp: optionalNumber(maxHp),
    ac: optionalNumber(ac),
    color,
    conditions,
    attacks,
    imageAssetId: image?.assetId ?? null,
  });
  const hint = parsed.success ? null : parsed.error.issues[0]?.message === "Starting HP cannot exceed Max HP"
    ? t("creature.hpOverMax")
    : fieldHint(String(parsed.error.issues[0]?.path[0])) ?? t("creature.checkValues");
  const touched = creature !== null || name !== "";
  // A hint about Starting HP must not point at a closed section: open it before this render paints.
  const hpHinted = touched && !parsed.success && parsed.error.issues[0]?.path[0] === "hp";
  if (hpHinted && !advancedOpen) setAdvancedOpen(true);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!parsed.success || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = creature
        ? await api.library.creatures.update(creature.id, parsed.data)
        : await api.library.creatures.create(parsed.data);
      props.onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("creature.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <>
      <form className="stack creature-form" onSubmit={(e) => void save(e)}>
        <label>
          {t("creature.nameOnBoard")}
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus aria-describedby="creature-name-hint" />
          <span id="creature-name-hint" className="muted">{t("creature.nameHint")}</span>
        </label>
        <div className="token-setup-grid token-setup-grid-3">
          <label>{t("creature.size")}<input type="number" value={size} onChange={(e) => setSize(e.target.value)} required min="0.25" max="10" step="any" /></label>
          <label>{t("creature.maxHp")}<input type="number" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" /></label>
          <label>{t("creature.ac")}<input type="number" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" /></label>
        </div>
        <div className="stack" role="group" aria-label={t("creature.attacksLabel")}>
          <span className="field-label">{t("creature.attacks")}</span>
          {attacks.map((attack, index) => (
            <div className="row" key={attack.name}>
              <span>{attack.name} · {presetSummary(attack)}</span>
              <button type="button" className="link" onClick={() => setEditingAttack(index)}>{t("common.edit")}</button>
            </div>
          ))}
          <button type="button" className="secondary" disabled={attacks.length >= MAX_TOKEN_ATTACKS} onClick={() => setEditingAttack("new")}>{t("creature.addAttack")}</button>
        </div>
        <div className="stack token-image-field">
          <span className="field-label">{t("creature.image")}</span>
          {image ? (
            <div className="row token-image-chosen">
              <TokenPreview url={image.url} color={color} />
              <span className="token-name" title={image.label}>{image.label}</span>
              <button type="button" className="link" onClick={() => setImage(null)}>{t("common.remove")}</button>
            </div>
          ) : (
            <div className="row creature-image-choose">
              <button type="button" className="secondary" onClick={() => setPicking(true)}>{t("creature.chooseArt")}</button>
            </div>
          )}
        </div>
        {/* Rarely changed, so tucked away as in Add Token; open whenever it holds a value or the HP hint
            (creature-form-advanced-settings). */}
        <details className="token-editor-section" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
          <summary>{t("creature.advanced")}</summary>
          <div className="stack">
            <label>
              {t("creature.startingHp")}
              <input type="number" value={hp} onChange={(e) => setHp(e.target.value)} min={MIN_HP} max="9999" step="1" />
              <span className="muted small-print">{t("creature.startingHpHint")}</span>
            </label>
            <div className="stack" role="group" aria-labelledby={conditionsLabelId}>
              <span id={conditionsLabelId} className="field-label">{t("creature.startingConditions")}</span>
              <ConditionPicker value={conditions} onChange={setConditions} />
            </div>
          </div>
        </details>
        {touched && hint && <p className="error" role="alert">{hint}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row modal-actions">
          <button type="button" className="secondary" disabled={saving} onClick={props.onCancel}>{t("common.cancel")}</button>
          <button className="primary" type="submit" disabled={!parsed.success || saving}>
            {saving ? t("common.saving") : creature ? t("creature.save") : t("creature.create")}
          </button>
        </div>
      </form>
      {/* Stacked over this one, outside the form so its buttons can never submit it. */}
      <Modal open={picking} title={t("creature.chooseArt")} onClose={() => setPicking(false)}>
        <LibraryPicker
          kind="token"
          onPick={async (asset) => {
            try {
              // Shipped art is not a library row, and a creature needs one: copy it in once, then reuse the copy.
              const own = isBuiltin(asset) ? await importBuiltinArt(asset) : asset;
              setImage({ assetId: own.id, url: own.url, label: own.name });
              setPicking(false);
            } catch {
              setError(t("creature.artFailed"));
              setPicking(false);
            }
          }}
        />
      </Modal>
      <Modal open={editingAttack !== null} title={editingAttack === "new" ? t("creature.addAttack") : t("creature.editAttack")} onClose={() => setEditingAttack(null)}>
        {editingAttack !== null && <PresetEditor
          key={editingAttack}
          initial={typeof editingAttack === "number" ? attacks[editingAttack] ?? null : null}
          taken={attacks.filter((_, index) => index !== editingAttack).map((a) => a.name)}
          onSave={(attack) => {
            setAttacks((all) => editingAttack === "new" ? [...all, attack] : all.map((a, index) => index === editingAttack ? attack : a));
            setEditingAttack(null);
          }}
          onRemove={typeof editingAttack === "number" ? () => {
            setAttacks((all) => all.filter((_, index) => index !== editingAttack));
            setEditingAttack(null);
          } : undefined}
          onCancel={() => setEditingAttack(null)}
        />}
      </Modal>
    </>
  );
}

/** Add Token's "From creature" list (library-creatures): the GM's creatures, searchable by name. */
export function CreaturePicker(props: { onPick: (creature: LibraryCreature) => void }) {
  const [creatures, setCreatures] = useState<LibraryCreature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    api.library.creatures.list().then(
      (list) => live && setCreatures(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : t("library.creaturesLoadFailed")),
    );
    return () => {
      live = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = [...(creatures ?? []), ...(creatures ? BUILTIN_CREATURES : [])].filter((c) => !q || c.name.toLowerCase().includes(q));

  return (
    <div className="library-picker" role="group" aria-label={t("creature.choose")}>
      <input type="search" aria-label={t("creature.search")} placeholder={t("creature.search")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      {error && <p role="alert" className="error">{error}</p>}
      {!creatures && !error && <p className="muted">{t("common.loading")}</p>}
      {creatures && shown.length === 0 && (
        <p className="muted">
          {creatures.length === 0 && !q ? t("creature.noneYet") : t("common.nothingMatches")}
        </p>
      )}
      <ul className="plain picker-grid">
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" className="picker-item" onClick={() => props.onPick(c)} title={c.name}>
              {c.imageUrl
                ? <img src={c.imageUrl} alt="" loading="lazy" className="round" />
                : <span className="creature-disc" style={{ background: c.color }} aria-hidden="true" />}
              <span>{c.name}</span>
              <span className="muted small-print">{creatureSummary(c)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The GM's own copy of a built-in token image: an existing one of the same name, else a fresh upload. */
async function importBuiltinArt(asset: LibraryAsset): Promise<LibraryAsset> {
  const existing = (await api.library.list()).find((a) => a.kind === "token" && a.name === asset.name);
  if (existing) return existing;
  // The server accepts only png/jpeg/webp (imageUpload.ts IMAGE_TYPES), so upload the shipped PNG source, not the SVG.
  const src = asset.url.replace(/([^/]+)\.svg$/, "source/$1.png");
  const blob = await (await fetch(src)).blob();
  const file = new File([blob], `${asset.name}.${src.split(".").pop() ?? "webp"}`, { type: blob.type });
  return api.library.upload(file, { kind: "token", name: asset.name, width: asset.width, height: asset.height });
}
