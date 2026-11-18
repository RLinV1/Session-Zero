import { useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { CONDITIONS, type AttackRange, type BuildFileView, type ConditionId, type DraftCreatureState, type DraftEncounterState, type TerrainRun } from "@vtt/shared";
import { IconAction } from "../../ui/IconAction";
import { DiceField } from "../../panels/AttackPanel";
import { poolOf, type DicePool } from "../../ui/dicePool";
import { tokenOrder } from "./buildOrder";
import { DraftEncounterMap, type EncounterEditGrid } from "./DraftEncounterMap";

const optionalNumber = (text: string): number | null => (text.trim() === "" ? null : Number(text));
/** A draft attack: its rolls are built with the dice builder (dice-pool); null is a blank roll. */
interface AttackRow { name: string; toHit: DicePool | null; damage: DicePool | null; maxTargets?: number; range?: AttackRange }

/** Everything a draft creature can hold. The server applies the same limits as for the AI. */
export function DraftCreatureEditor({ data, files, onSave, onCancel }: {
  data: DraftCreatureState;
  files: readonly BuildFileView[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(data.name);
  const [size, setSize] = useState(String(data.size));
  const [hp, setHp] = useState(data.hp === null ? "" : String(data.hp));
  const [maxHp, setMaxHp] = useState(data.maxHp === null ? "" : String(data.maxHp));
  const [ac, setAc] = useState(data.ac === null ? "" : String(data.ac));
  const [color, setColor] = useState(data.color);
  const [art, setArt] = useState(data.imageFileId ?? "");
  const [conditions, setConditions] = useState<ConditionId[]>(data.conditions);
  const [attacks, setAttacks] = useState<AttackRow[]>(data.attacks.map((a) => ({ name: a.name, toHit: a.toHit, damage: a.damage, ...(a.maxTargets ? { maxTargets: a.maxTargets } : {}), ...(a.range ? { range: a.range } : {}) })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tokens = files.filter((f) => f.kind === "token");

  const setAttack = (index: number, change: Partial<AttackRow>) => setAttacks((all) => all.map((a, i) => (i === index ? { ...a, ...change } : a)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name, size: Number(size), hp: optionalNumber(hp), maxHp: optionalNumber(maxHp), ac: optionalNumber(ac), color, conditions,
        imageFileId: art || null,
        attacks: attacks.map((r) => ({
          name: r.name,
          toHit: r.toHit,
          damage: r.damage,
          ...(r.maxTargets ? { maxTargets: r.maxTargets } : {}),
          // Kept as the AI set it; this form has no range field (ADR 0067).
          ...(r.range ? { range: r.range } : {}),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this.");
      setSaving(false);
    }
  }

  return (
    <form className="build-form" onSubmit={(e) => void save(e)}>
      <label>Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <div className="build-fields">
        <label>Size<input inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} /></label>
        <label>HP<input inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
        <label>Max HP<input inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} /></label>
        <label>AC<input inputMode="numeric" value={ac} onChange={(e) => setAc(e.target.value)} /></label>
        <label>Colour<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      </div>
      <label>Art
        <select value={art} onChange={(e) => setArt(e.target.value)}>
          <option value="">None: a coloured disc</option>
          {tokens.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>Attacks</legend>
        {attacks.map((attack, i) => (
          <div className="build-attack" key={i}>
            <input aria-label={`Attack ${i + 1} name`} placeholder="Name" value={attack.name} maxLength={40} onChange={(e) => setAttack(i, { name: e.target.value })} />
            <DiceField label={`Attack ${i + 1} to-hit`} kind="toHit" value={attack.toHit} fallback={poolOf(20)} onChange={(toHit) => setAttack(i, { toHit })} />
            <DiceField label={`Attack ${i + 1} damage`} kind="damage" value={attack.damage} fallback={poolOf(6)} onChange={(damage) => setAttack(i, { damage })} />
            <IconAction icon={<Trash size={16} aria-hidden="true" />} label={`Remove ${attack.name.trim() || `attack ${i + 1}`}`} danger onClick={() => setAttacks((all) => all.filter((_, n) => n !== i))} />
          </div>
        ))}
        {attacks.length < 8 && <button type="button" className="link build-text-action" onClick={() => setAttacks((all) => [...all, { name: "", toHit: null, damage: null }])}><Plus size={16} aria-hidden="true" />Add attack</button>}
      </fieldset>
      <fieldset>
        <legend>Conditions</legend>
        <div className="build-conditions">
          {CONDITIONS.map((c) => (
            <label key={c.id} className="build-check">
              <input
                type="checkbox"
                checked={conditions.includes(c.id)}
                onChange={(e) => setConditions((all) => (e.target.checked ? [...all, c.id] : all.filter((x) => x !== c.id)))}
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="error build-error">{error}</p>}
      <div className="row build-form-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>Save</button>
      </div>
    </form>
  );
}

interface TokenRow { authoringId?: string | null; creatureKey: string; name: string; square: { column: number; row: number } | null; hidden: boolean }

/**
 * A draft encounter's name and tokens. Squares are the top-left square a token covers.
 *
 * Place tokens directly on their map. The roster groups each creature's tokens for readability;
 * saving preserves the AI's original order.
 */
export function DraftEncounterEditor({ data, ids, mapFile, files, grid, terrain, onSave, onCancel, creature }: {
  data: DraftEncounterState;
  mapFile?: BuildFileView;
  files: readonly BuildFileView[];
  ids?: readonly (string | null)[];
  grid: EncounterEditGrid | null;
  terrain: readonly TerrainRun[];
  creature: (key: string) => DraftCreatureState | undefined;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const creatureName = (key: string) => creature(key)?.name ?? key;
  const [name, setName] = useState(data.name);
  const [tokens, setTokens] = useState<TokenRow[]>(data.tokens.map((t, index) => ({
    authoringId: ids?.[index], creatureKey: t.creatureKey, name: t.name ?? "", square: t.square, hidden: t.hidden,
  })));
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setToken = (index: number, change: Partial<TokenRow>) => setTokens((all) => all.map((t, i) => (i === index ? { ...t, ...change } : t)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name,
        ...(ids ? { studioIds: { placements: tokens.map((t) => t.authoringId ?? null) } } : {}),
        tokens: tokens.map((t) => ({
          creatureKey: t.creatureKey,
          ...(t.name.trim() ? { name: t.name.trim() } : {}),
          square: t.square,
          hidden: t.hidden,
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this.");
      setSaving(false);
    }
  }

  return (
    <form className="build-form" onSubmit={(e) => void save(e)}>
      <label>Name<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <fieldset>
        <legend>Tokens</legend>
        <p className="muted small-print">Drag tokens to move them. Choose Place on map for an unplaced token, then click an open space. Changes are applied when you save.</p>
        {mapFile && grid ? (
          <DraftEncounterMap file={mapFile} files={files} grid={grid} terrain={terrain} tokens={tokens} creature={creature}
            selected={selected} onSelect={setSelected} disabled={saving} onMove={(index, square) => setToken(index, { square })} />
        ) : <p className="muted small-print">{mapFile ? "Set this map's grid before placing tokens." : "Add this encounter's map before placing tokens."}</p>}
        {tokens.length > 0 && <div className="build-token-row build-token-head" aria-hidden="true">
          <span>Creature</span><span>Name on the board</span><span>Position</span><span>Hidden</span><span />
        </div>}
        {tokenOrder(tokens, creature).map((i, n, order) => {
          const token = tokens[i]!;
          const of = creatureName(token.creatureKey);
          // A creature's name is said on its first token only; the rest of its tokens follow under it.
          const firstOfCreature = n === 0 || tokens[order[n - 1]!]!.creatureKey !== token.creatureKey;
          const who = token.name.trim() || of;
          return (
            <div className={`build-token-row${firstOfCreature ? " build-token-first" : ""}${selected === i ? " is-selected" : ""}`} key={i}>
              <span className="build-token-of">{firstOfCreature ? of : ""}</span>
              <input aria-label={`${who}: name on the board`} placeholder={of} value={token.name} maxLength={60} onChange={(e) => setToken(i, { name: e.target.value })} />
              <button type="button" className="small build-token-place" aria-label={`${token.square ? "Reposition" : "Place"} ${who} on map`}
                aria-pressed={selected === i} disabled={!mapFile || !grid || saving} onClick={() => setSelected(selected === i ? null : i)}>
                {selected === i ? "Click map to place" : token.square ? "Reposition" : "Place on map"}
              </button>
              <label className="build-token-hidden">
                <input type="checkbox" checked={token.hidden} onChange={(e) => setToken(i, { hidden: e.target.checked })} />
                <span className="build-token-hidden-word" aria-hidden="true">Hidden</span>
                <span className="sr-only">{who} is hidden</span>
              </label>
              <IconAction icon={<Trash size={16} aria-hidden="true" />} label={`Remove ${who}`} danger onClick={() => { setSelected(null); setTokens((all) => all.filter((_, x) => x !== i)); }} />
            </div>
          );
        })}
      </fieldset>
      {error && <p role="alert" className="error build-error">{error}</p>}
      <div className="row build-form-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>Save</button>
      </div>
    </form>
  );
}
