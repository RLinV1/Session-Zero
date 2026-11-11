import { useState } from "react";
import { CONDITIONS, formatExpression, parseDiceExpression, type BuildFileView, type ConditionId, type DraftCreatureState, type DraftEncounterState } from "@vtt/shared";

const optionalNumber = (text: string): number | null => (text.trim() === "" ? null : Number(text));
const diceText = (dice: { count: number; sides: number; modifier: number } | null) => (dice ? formatExpression(dice) : "");

interface AttackRow { name: string; toHit: string; damage: string; maxTargets?: number }

/** "" is a blank roll; anything else must read as dice. Sides are checked by the server. */
function readDice(text: string) {
  if (text.trim() === "") return { ok: true as const, dice: null };
  const parsed = parseDiceExpression(text.trim());
  return parsed.ok ? { ok: true as const, dice: parsed.expression } : { ok: false as const, message: parsed.message };
}

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
  const [attacks, setAttacks] = useState<AttackRow[]>(data.attacks.map((a) => ({ name: a.name, toHit: diceText(a.toHit), damage: diceText(a.damage), ...(a.maxTargets ? { maxTargets: a.maxTargets } : {}) })));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const tokens = files.filter((f) => f.kind === "token");

  const setAttack = (index: number, change: Partial<AttackRow>) => setAttacks((all) => all.map((a, i) => (i === index ? { ...a, ...change } : a)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const rolls = attacks.map((a) => ({ ...a, hit: readDice(a.toHit), dmg: readDice(a.damage) }));
    const bad = rolls.find((r) => !r.hit.ok || !r.dmg.ok);
    if (bad) {
      setError(`${bad.name || "An attack"}: use dice such as 1d20+5, or leave it blank.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name, size: Number(size), hp: optionalNumber(hp), maxHp: optionalNumber(maxHp), ac: optionalNumber(ac), color, conditions,
        imageFileId: art || null,
        attacks: rolls.map((r) => ({
          name: r.name,
          toHit: r.hit.ok ? r.hit.dice : null,
          damage: r.dmg.ok ? r.dmg.dice : null,
          ...(r.maxTargets ? { maxTargets: r.maxTargets } : {}),
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
            <input aria-label={`Attack ${i + 1} to-hit`} placeholder="To hit, 1d20+5" value={attack.toHit} onChange={(e) => setAttack(i, { toHit: e.target.value })} />
            <input aria-label={`Attack ${i + 1} damage`} placeholder="Damage, 1d6+2" value={attack.damage} onChange={(e) => setAttack(i, { damage: e.target.value })} />
            <button type="button" aria-label={`Remove attack ${i + 1}`} onClick={() => setAttacks((all) => all.filter((_, n) => n !== i))}>Remove</button>
          </div>
        ))}
        {attacks.length < 8 && <button type="button" onClick={() => setAttacks((all) => [...all, { name: "", toHit: "", damage: "" }])}>Add attack</button>}
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

interface TokenRow { creatureKey: string; name: string; column: string; row: string; hidden: boolean }

/** A draft encounter's name and tokens. Squares are the top-left square a token covers. */
export function DraftEncounterEditor({ data, onSave, onCancel, creatureName }: {
  data: DraftEncounterState;
  creatureName: (key: string) => string;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(data.name);
  const [tokens, setTokens] = useState<TokenRow[]>(data.tokens.map((t) => ({
    creatureKey: t.creatureKey, name: t.name ?? "", column: t.square ? String(t.square.column) : "", row: t.square ? String(t.square.row) : "", hidden: t.hidden,
  })));
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
        tokens: tokens.map((t) => ({
          creatureKey: t.creatureKey,
          ...(t.name.trim() ? { name: t.name.trim() } : {}),
          square: t.column.trim() === "" || t.row.trim() === "" ? null : { column: Number(t.column), row: Number(t.row) },
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
        <p className="muted small-print">A square is the top-left square the token covers. Leave both blank to place it later.</p>
        {tokens.map((token, i) => (
          <div className="build-token-row" key={i}>
            <span className="build-token-of">{creatureName(token.creatureKey)}</span>
            <input aria-label={`Token ${i + 1} name`} placeholder="Name on the board" value={token.name} maxLength={60} onChange={(e) => setToken(i, { name: e.target.value })} />
            <input aria-label={`Token ${i + 1} column`} placeholder="Col" inputMode="numeric" value={token.column} onChange={(e) => setToken(i, { column: e.target.value })} />
            <input aria-label={`Token ${i + 1} row`} placeholder="Row" inputMode="numeric" value={token.row} onChange={(e) => setToken(i, { row: e.target.value })} />
            <label className="build-check"><input type="checkbox" checked={token.hidden} onChange={(e) => setToken(i, { hidden: e.target.checked })} />Hidden</label>
            <button type="button" aria-label={`Remove token ${i + 1}`} onClick={() => setTokens((all) => all.filter((_, n) => n !== i))}>Remove</button>
          </div>
        ))}
      </fieldset>
      {error && <p role="alert" className="error build-error">{error}</p>}
      <div className="row build-form-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>Save</button>
      </div>
    </form>
  );
}
