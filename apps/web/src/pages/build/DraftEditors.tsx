import { useState } from "react";
import { CONDITIONS, conditionLabel, formatExpression, parseDiceExpression, type BuildFileView, type ConditionId, type DraftCreatureState, type DraftEncounterState } from "@vtt/shared";
import { getLocale, useT } from "../../i18n/locale";

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
  const t = useT();
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
      setError(bad.name ? t("build.edit.badDiceNamed", { name: bad.name }) : t("build.edit.badDice"));
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
      setError(err instanceof Error ? err.message : t("build.edit.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <form className="build-form" onSubmit={(e) => void save(e)}>
      <label>{t("common.name")}<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <div className="build-fields">
        <label>{t("build.stat.size")}<input inputMode="decimal" value={size} onChange={(e) => setSize(e.target.value)} /></label>
        <label>{t("build.stat.hp")}<input inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} /></label>
        <label>{t("build.stat.maxHp")}<input inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} /></label>
        <label>{t("build.stat.ac")}<input inputMode="numeric" value={ac} onChange={(e) => setAc(e.target.value)} /></label>
        <label>{t("build.edit.colour")}<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
      </div>
      <label>{t("build.edit.art")}
        <select value={art} onChange={(e) => setArt(e.target.value)}>
          <option value="">{t("build.edit.noArt")}</option>
          {tokens.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </label>
      <fieldset>
        <legend>{t("build.edit.attacks")}</legend>
        {attacks.map((attack, i) => (
          <div className="build-attack" key={i}>
            <input aria-label={t("build.edit.attackName", { n: i + 1 })} placeholder={t("common.name")} value={attack.name} maxLength={40} onChange={(e) => setAttack(i, { name: e.target.value })} />
            <input aria-label={t("build.edit.attackToHit", { n: i + 1 })} placeholder={t("build.edit.toHitPlaceholder")} value={attack.toHit} onChange={(e) => setAttack(i, { toHit: e.target.value })} />
            <input aria-label={t("build.edit.attackDamage", { n: i + 1 })} placeholder={t("build.edit.damagePlaceholder")} value={attack.damage} onChange={(e) => setAttack(i, { damage: e.target.value })} />
            <button type="button" aria-label={t("build.edit.removeAttack", { n: i + 1 })} onClick={() => setAttacks((all) => all.filter((_, n) => n !== i))}>{t("common.remove")}</button>
          </div>
        ))}
        {attacks.length < 8 && <button type="button" onClick={() => setAttacks((all) => [...all, { name: "", toHit: "", damage: "" }])}>{t("creature.addAttack")}</button>}
      </fieldset>
      <fieldset>
        <legend>{t("build.edit.conditions")}</legend>
        <div className="build-conditions">
          {CONDITIONS.map((c) => (
            <label key={c.id} className="build-check">
              <input
                type="checkbox"
                checked={conditions.includes(c.id)}
                onChange={(e) => setConditions((all) => (e.target.checked ? [...all, c.id] : all.filter((x) => x !== c.id)))}
              />
              {conditionLabel(c.id, getLocale())}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="error build-error">{error}</p>}
      <div className="row build-form-actions">
        <button type="button" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="submit" className="primary" disabled={saving}>{t("common.save")}</button>
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
  const t = useT();
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
      setError(err instanceof Error ? err.message : t("build.edit.saveFailed"));
      setSaving(false);
    }
  }

  return (
    <form className="build-form" onSubmit={(e) => void save(e)}>
      <label>{t("common.name")}<input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></label>
      <fieldset>
        <legend>{t("build.edit.tokens")}</legend>
        <p className="muted small-print">{t("build.edit.squareHint")}</p>
        {tokens.map((token, i) => (
          <div className="build-token-row" key={i}>
            <span className="build-token-of">{creatureName(token.creatureKey)}</span>
            <input aria-label={t("build.edit.tokenName", { n: i + 1 })} placeholder={t("creature.nameOnBoard")} value={token.name} maxLength={60} onChange={(e) => setToken(i, { name: e.target.value })} />
            <input aria-label={t("build.edit.tokenColumn", { n: i + 1 })} placeholder={t("build.edit.col")} inputMode="numeric" value={token.column} onChange={(e) => setToken(i, { column: e.target.value })} />
            <input aria-label={t("build.edit.tokenRow", { n: i + 1 })} placeholder={t("build.edit.row")} inputMode="numeric" value={token.row} onChange={(e) => setToken(i, { row: e.target.value })} />
            <label className="build-check"><input type="checkbox" checked={token.hidden} onChange={(e) => setToken(i, { hidden: e.target.checked })} />{t("build.edit.hidden")}</label>
            <button type="button" aria-label={t("build.edit.removeToken", { n: i + 1 })} onClick={() => setTokens((all) => all.filter((_, n) => n !== i))}>{t("common.remove")}</button>
          </div>
        ))}
      </fieldset>
      {error && <p role="alert" className="error build-error">{error}</p>}
      <div className="row build-form-actions">
        <button type="button" onClick={onCancel}>{t("common.cancel")}</button>
        <button type="submit" className="primary" disabled={saving}>{t("common.save")}</button>
      </div>
    </form>
  );
}
