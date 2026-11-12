import { useEffect, useRef, useState, type FormEvent } from "react";
import { Crosshair, DiceFive, DotsThree, Eye, EyeSlash, PencilSimple, Plus, SlidersHorizontal, Sword, Target, X } from "@phosphor-icons/react";
import {
  can,
  isGroupRoll,
  MAX_ATTACK_LABEL,
  MAX_ATTACK_TARGETS,
  type AttackKind,
  type AnimationDef,
  type DiceRoll,
  type DiceVisibility,
  type LoggedRoll,
  type Participant,
  type Point,
  type RoomState,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { PanelSection } from "../ui/PanelSection";
import { Picker } from "../ui/Picker";
import { PopoverButton } from "../ui/Popover";
import { isBoolean, usePersistentState } from "../ui/usePersistentState";
import {
  attackExpression,
  DEFAULT_ATTACK,
  isSettingsRecord,
  kindOf,
  LAST_USED_KEY,
  MAX_PRESETS,
  presetsForToken,
  presetRollLabel,
  presetSummary,
  shouldPingTarget,
  targetsByDistance,
  readAttackSettings,
  type AttackPreset,
  type AttackSettings,
} from "./attackRoll";
import { DicePoolInput } from "../ui/DicePoolInput";
import { poolOf, type DicePool } from "../ui/dicePool";
import type { AttackReset } from "./attackSession";
import { saveTokenAttacks } from "./tokenAttacks";
import { BUILTIN_ANIMATIONS } from "../board/effectPresets";
import { SearchablePicker } from "../ui/SearchablePicker";
import { useStrikeAnimations } from "./useLibraryAnimations";
import { t } from "../i18n/locale";

/** The Animation select's value for an animation that is on the attack but not (or no longer) in the library. */
const CURRENT_ANIMATION = "__current";
const AUTOMATIC_ANIMATION = "__automatic";

/**
 * Who attacks whom. Held by the room page, so the board's Pick on board can fill it in and the
 * attacker can follow the turn even while this section isn't showing (attack-ux-polish).
 */
export interface AttackPick {
  /** null until chosen: then the viewer's token on the active turn, else the first. */
  attackerId: string | null;
  targetId: string | null;
}

/**
 * The Attack section of the Play tab (attack-targeting, attack-rulings, attack-ux-polish).
 * Top to bottom: who attacks, the latest roll and what the GM made of it, the target, the
 * token's named attacks (one tap rolls), and a collapsed Custom roll for anything else. It
 * rolls and says nothing about hitting: the GM decides that (README §7).
 */
export function AttackPanel({
  connection,
  state,
  you,
  pick,
  onPick,
  reset,
  rolling,
  onPickOnBoard,
  onShowPing,
  visibility,
  onVisibility,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  pick: AttackPick;
  onPick: (pick: AttackPick) => void;
  /** The last encounter end: the outcome card, custom settings and chosen attack start over. */
  reset: AttackReset;
  /** Rolls whose dice are still in the air on this viewer's screen (throw-dice-on-board). */
  /** The viewer's own dice are still showing: rolling again waits until they're gone. */
  rolling: boolean;
  /** Its dice have landed, on the board or in the private tray. */
  /** Put the board into targeting mode for this attacker. */
  onPickOnBoard: (attackerId: string) => void;
  /** Show a ping on this viewer's own board; the relay doesn't echo it back. */
  onShowPing: (at: Point) => void;
  /**
   * The GM's "Roll privately", held by the room page so it survives leaving the Play tab: a
   * setting that quietly reset to public could send a private attack's follow-up to players.
   */
  visibility: DiceVisibility;
  onVisibility: (visibility: DiceVisibility) => void;
}) {
  const attackers = Object.values(state.tokens)
    .filter((t) => can.attackWith(you, t))
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeId = state.initiative?.order[state.initiative.activeIndex] ?? null;
  // In an encounter the token whose turn it is attacks, when you may act for it; otherwise you choose.
  const inTurn = attackers.find((t) => t.id === activeId);
  const chosen = inTurn ? undefined : pick.attackerId ? attackers.find((t) => t.id === pick.attackerId) : undefined;
  const attacker = inTurn ?? chosen ?? attackers[0];
  const target = pick.targetId && pick.targetId !== attacker?.id ? state.tokens[pick.targetId] : undefined;

  // A target that vanished (deleted, or hidden from a player) or became the attacker is dropped.
  const targetStale = pick.targetId !== null && !target;
  useEffect(() => {
    if (targetStale) onPick({ ...pick, targetId: null });
  }, [targetStale, pick, onPick]);

  // Browser-local conveniences, kept here so they outlive a change of attacker.
  const [lastUsed, setLastUsed] = usePersistentState<Record<string, AttackSettings>>(LAST_USED_KEY, {}, isSettingsRecord);
  const [customOpen, setCustomOpen] = usePersistentState("vtt.ui.customRoll", false, isBoolean);

  // An encounter that ends while this is showing clears the custom settings kept in memory too
  // (attack-panel-encounter-reset); the room page has already cleared them in storage.
  const seenReset = useRef(reset.count);
  useEffect(() => {
    if (reset.count === seenReset.current) return;
    seenReset.current = reset.count;
    setLastUsed({});
  }, [reset.count, setLastUsed]);

  // Each token's attacks are the room's, shared by the GM and its owners (ADR 0034).
  const allPresets: Record<string, AttackPreset[]> = Object.fromEntries(Object.values(state.tokens).map((t) => [t.id, presetsForToken(t)]));

  return (
    <PanelSection
      id="attack"
      title={
        <>
          {t("attack.heading")}
          {/* Said in the heading, so the collapsed line explains why it's quiet (attack-ux-polish). */}
          {!state.initiative && <span className="muted"> {t("attack.noEncounter")}</span>}
        </>
      }
    >
      {!attacker ? (
        <p className="muted">
          {you.role === "gm" ? t("attack.addToken") : t("attack.noToken")}
        </p>
      ) : (
        <AttackForm
          // A new attacker starts from the custom settings last used with it.
          // It also starts over when an encounter ends, dropping the chosen attack and any half-set roll.
          key={`${attacker.id}:${reset.count}`}
          connection={connection}
          state={state}
          you={you}
          attackers={attackers}
          attackerId={attacker.id}
          inTurn={inTurn !== undefined}
          targetId={target?.id ?? null}
          rolling={rolling}
          initial={readAttackSettings(lastUsed[attacker.id]) ?? DEFAULT_ATTACK}
          presets={allPresets[attacker.id] ?? []}
          customOpen={customOpen}
          onCustomOpen={setCustomOpen}
          visibility={visibility}
          onVisibility={onVisibility}
          onAttacker={(id) => onPick({ attackerId: id, targetId: pick.targetId === id ? null : pick.targetId })}
          onTarget={(id) => onPick({ attackerId: attacker.id, targetId: id })}
          onPickOnBoard={() => onPickOnBoard(attacker.id)}
          onShowPing={onShowPing}
          onRolledCustom={(settings) => setLastUsed((all) => ({ ...all, [attacker.id]: settings }))}
          onPresets={(update) => saveTokenAttacks(connection, attacker.id, update(presetsForToken(attacker)).slice(0, MAX_PRESETS))}
        />
      )}
    </PanelSection>
  );
}

function AttackForm({
  connection,
  state,
  you,
  attackers,
  attackerId,
  inTurn,
  targetId,
  rolling,
  initial,
  presets,
  customOpen,
  onCustomOpen,
  visibility,
  onVisibility,
  onAttacker,
  onTarget,
  onPickOnBoard,
  onShowPing,
  onRolledCustom,
  onPresets,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  attackers: RoomState["tokens"][string][];
  attackerId: string;
  /** The attacker is the token whose turn it is, so there is nothing to choose. */
  inTurn: boolean;
  targetId: string | null;
  rolling: boolean;
  initial: AttackSettings;
  presets: AttackPreset[];
  customOpen: boolean;
  onCustomOpen: (open: boolean) => void;
  visibility: DiceVisibility;
  onVisibility: (visibility: DiceVisibility) => void;
  onAttacker: (id: string) => void;
  onTarget: (id: string | null) => void;
  onPickOnBoard: () => void;
  onShowPing: (at: Point) => void;
  onRolledCustom: (settings: AttackSettings) => void;
  /** Save the attacker's attacks for the GM and its owners; resolves to why the server refused, else null. */
  onPresets: (update: (presets: AttackPreset[]) => AttackPreset[]) => Promise<string | null>;
}) {
  const [settings, setSettings] = useState<AttackSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The named attack being edited: its index, "new" while adding, or null. */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  /** The named attack the Roll button rolls, picked from the list (attack-panel-encounter-reset). */
  const [selected, setSelected] = useState(0);
  /** Targets picked besides the main one, for an attack that may hit several (multi-target). */
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const isGm = you.role === "gm";
  const chosen = presets.length > 0 ? presets[Math.min(selected, presets.length - 1)] : undefined;
  const chosenIndex = chosen ? presets.indexOf(chosen) : -1;

  const attacker = state.tokens[attackerId]!;
  const targets = targetsByDistance(state, attackerId);
  const target = targets.find((t) => t.token.id === targetId);
  // Every target the chosen attack rolls at: the main one plus the extras it allows.
  const maxTargets = chosen?.maxTargets ?? 1;
  const extras = extraIds.filter((id) => id !== target?.token.id && targets.some((t) => t.token.id === id)).slice(0, maxTargets - 1);
  const aimed = target ? [target.token.id, ...extras] : [];
  // After a Hit with the chosen attack on any aimed target, its one roll button becomes that attack's damage.
  const hits = chosen?.damage ? aimed.map((id) => hitOn(state.rolls, you.id, attackerId, id, chosen)).filter((r): r is DiceRoll => r !== null) : [];
  const followUp = hits[0] ?? null;
  const rollLabel = !chosen ? "" : busy ? t("home.dice.rolling") : !target ? t("attack.chooseTarget") : followUp ? t("attack.rollDamageExpr", { expr: attackExpression(chosen.damage!) }) : chosen.toHit ? t("attack.rollToHit") : t("attack.rollDamage");
  const expression = attackExpression(settings);
  const kind = kindOf(settings);
  const update = (changes: Partial<AttackSettings>) => {
    setSettings((s) => ({ ...s, ...changes }));
    setError(null);
  };

  /** One roll with attack context per target, then a ping on each if everyone may see it. */
  const send = async (roll: { expression: string; kind: AttackKind; label: string; targetId: string; visibility?: DiceVisibility }, alsoTargetIds: readonly string[] = []): Promise<boolean> => {
    if (busy || rolling) return false;
    const rollVisibility = roll.visibility ?? visibility;
    setBusy(true);
    let allRolled = true;
    for (const targetId of [roll.targetId, ...alsoTargetIds]) {
      const result = await connection.command({
        type: "dice.roll",
        expression: roll.expression,
        visibility: rollVisibility,
        attack: { actorTokenId: attackerId, targetTokenId: targetId, kind: roll.kind, ...(roll.label && { label: roll.label }) },
      });
      if (!result.ok) {
        setError(result.message);
        allRolled = false;
        break;
      }
      setError(null);
      // Check the target as it is now, not as it was when the roll was sent: the GM may have
      // hidden it meanwhile, and every event before the roll arrives ahead of its ack (FR-GM-23).
      // While a resync is pending the local view can lag the ack; then skip the ping entirely.
      const snapshot = connection.snapshot;
      const caughtUp = result.seq !== null && snapshot.seq >= result.seq;
      const now = snapshot.state?.tokens[targetId];
      if (caughtUp && now && shouldPingTarget(now, rollVisibility, snapshot.state?.fog ?? {})) {
        onShowPing(now.position);
        connection.ephemeral({ type: "ping", at: now.position });
      }
    }
    setBusy(false);
    return allRolled;
  };

  /** The chosen attack's to-hit roll, or its damage when it has no to-hit, at every aimed target (attack-ux-polish). */
  const rollPreset = (preset: AttackPreset) => {
    if (!target) return;
    const [dice, rollKind]: [DicePool, AttackKind] = preset.toHit ? [preset.toHit, "toHit"] : [preset.damage!, "damage"];
    void send({ expression: attackExpression(dice), kind: rollKind, label: presetRollLabel(preset, rollKind), targetId: target.token.id }, extras);
  };

  const rollCustom = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const label = settings.label.trim();
    if (await send({ expression, kind, label, targetId: target.token.id })) onRolledCustom({ ...settings, label, kind });
  };

  /** After a Hit: that attack's damage in one tap, at every aimed target it hit (attack-ux-polish). */
  const rollDamage = (preset: AttackPreset, hitRolls: DiceRoll[]) => {
    const [first, ...rest] = hitRolls.map((r) => r.attack!.target!.tokenId);
    if (!first || !preset.damage) return;
    // Damage is as private as the attack it follows, whatever the checkbox says now.
    void send({ expression: attackExpression(preset.damage), kind: "damage", label: presetRollLabel(preset, "damage"), targetId: first, visibility: hitRolls[0]!.visibility }, rest);
  };

  const privateToggle = isGm && (
    <button
      type="button"
      className={visibility === "gm" ? "icon-button attack-private on" : "icon-button attack-private"}
      aria-pressed={visibility === "gm"}
      aria-label={t("attack.rollPrivately")}
      title={visibility === "gm" ? t("attack.privateOn") : t("attack.privateOff")}
      onClick={() => onVisibility(visibility === "gm" ? "public" : "gm")}
    >
      {visibility === "gm" ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </button>
  );

  return (
    <div className="stack attack-panel">
      {/* Who attacks whom: the attacker, then the target (attack-section-compact). */}
      <div className="attack-who">
        {attackers.length === 1 || inTurn ? (
          <p className="attack-attacker">
            <Sword size={16} aria-hidden="true" /> <strong>{attacker.name}</strong>
            {inTurn && <span className="badge active-badge">{t("attack.turn")}</span>}
          </p>
        ) : (
          <Picker
            label={t("stage.attacker")}
            icon={<Sword size={16} aria-hidden="true" />}
            value={attackerId}
            onChange={onAttacker}
            options={attackers.map((t) => ({
              key: t.id,
              label: `${t.name}${t.hidden ? " (hidden)" : ""}`,
            }))}
          />
        )}
        {maxTargets > 1 ? (
          <PopoverButton
            label={t("attack.targets")}
            title={t("attack.chooseTargets")}
            align="left"
            className="attack-targets-button"
            buttonContent={
              <span className="attack-targets-summary">
                <Target size={16} aria-hidden="true" />
                <strong>{aimed.length === 0 ? (targets.length === 0 ? t("attack.noTargets") : t("attack.chooseTargets")) : aimed.length === 1 ? target!.token.name : t("attack.nTargets", { n: aimed.length })}</strong>
                <span className="muted">{t("attack.upTo", { max: maxTargets })}</span>
              </span>
            }
          >
            {() => (
              <fieldset className="attack-target-list">
                <legend className="field-label">{t("attack.chooseUpTo", { max: maxTargets, n: aimed.length })}</legend>
                {targets.map((target) => {
                  const on = aimed.includes(target.token.id);
                  return (
                    <label key={target.token.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && aimed.length >= maxTargets}
                        onChange={(e) => {
                          const next = e.target.checked ? [...aimed, target.token.id] : aimed.filter((id) => id !== target.token.id);
                          onTarget(next[0] ?? null);
                          setExtraIds(next.slice(1));
                        }}
                      />
                      {target.token.name}{target.token.hidden ? t("attack.hiddenSuffix") : ""} <span className="muted">{target.distance}</span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </PopoverButton>
        ) : (
          <Picker
            label={t("stage.target")}
            icon={<Target size={16} aria-hidden="true" />}
            placeholder={targets.length === 0 ? t("attack.noTargets") : t("stage.target")}
            disabled={targets.length === 0}
            value={target?.token.id ?? null}
            onChange={onTarget}
            options={targets.map((t) => ({ key: t.token.id, label: `${t.token.name}${t.token.hidden ? " (hidden)" : ""}`, detail: t.distance }))}
          />
        )}
        <button type="button" className="icon-button attack-board-pick" onClick={onPickOnBoard} aria-label={t("attack.pickOnBoard")} title={t("attack.pickOnBoard")}>
          <Crosshair size={18} aria-hidden="true" />
        </button>
      </div>

      {isGm && visibility === "public" && (attacker.hidden || target?.token.hidden) && (
        <p className="attack-warning" role="note">
          {t("attack.hiddenWarning", { name: attacker.hidden ? attacker.name : target!.token.name })}
        </p>
      )}

      {editing !== null ? (
        <PresetEditor
          initial={typeof editing === "number" ? (presets[editing] ?? null) : null}
          taken={presets.filter((_, j) => j !== editing).map((p) => p.name)}
          onSave={(next) => {
            const at = editing;
            void onPresets((list) => (typeof at === "number" ? list.map((p, j) => (j === at ? next : p)) : [...list, next])).then(setError);
            // A new attack is usually the one about to be used.
            if (typeof at !== "number") setSelected(presets.length);
            setEditing(null);
          }}
          {...(typeof editing === "number" && {
            onRemove: () => {
              const at = editing;
              void onPresets((list) => list.filter((_, j) => j !== at)).then(setError);
              setSelected(0);
              setEditing(null);
            },
          })}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          {/* What to roll: one row however many attacks a token has, the rest in a menu. */}
          <div className="attack-row">
            {chosen ? (
              <Picker
                label={t("attack.attackOf", { name: attacker.name })}
                icon={<Sword size={16} aria-hidden="true" />}
                value={String(chosenIndex)}
                onChange={(key) => setSelected(Number(key))}
                options={presets.map((p, i) => ({ key: String(i), label: p.name, detail: presetSummary(p) }))}
              />
            ) : (
              <button type="button" className="secondary attack-add-first" onClick={() => setEditing("new")}>
                <Plus size={14} aria-hidden="true" /> {t("attack.addAttack")}
              </button>
            )}
            <PopoverButton
              label={t("attack.options")}
              title={t("attack.options")}
              align="right"
              className="icon-button attack-more"
              buttonContent={<DotsThree size={20} aria-hidden="true" />}
            >
              {(close) => (
                <div className="menu-list">
                  {chosen && (
                    <button
                      type="button"
                      className="menu-item"
                      onClick={() => {
                        close();
                        setEditing(chosenIndex);
                      }}
                    >
                      <PencilSimple size={14} aria-hidden="true" /> {t("attack.editNamed", { name: chosen.name })}
                    </button>
                  )}
                  <button
                    type="button"
                    className="menu-item"
                    disabled={presets.length >= MAX_PRESETS}
                    title={presets.length >= MAX_PRESETS ? t("attack.presetLimit", { max: MAX_PRESETS }) : undefined}
                    onClick={() => {
                      close();
                      setEditing("new");
                    }}
                  >
                    <Plus size={14} aria-hidden="true" /> {t("creature.addAttack")}
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      close();
                      onCustomOpen(!customOpen);
                    }}
                  >
                    <SlidersHorizontal size={14} aria-hidden="true" /> {customOpen ? t("attack.hideCustom") : t("attack.customRoll")}
                  </button>
                </div>
              )}
            </PopoverButton>
          </div>
          {!chosen && <p className="muted small-print">{t("attack.createHint")}</p>}
          {!chosen && !customOpen && (
            <div className="attack-roll-row">
              <button type="button" className="secondary" onClick={() => onCustomOpen(true)}>
                <SlidersHorizontal size={18} aria-hidden="true" /> {t("attack.customRoll")}
              </button>
            </div>
          )}
          {chosen && !customOpen && (
            <div className="attack-roll-row">
              <button
                type="button"
                className="attack-roll primary"
                disabled={!target || busy || rolling}
                title={rolling ? t("attack.diceOnBoard") : undefined}
                onClick={() => (followUp ? rollDamage(chosen, hits) : rollPreset(chosen))}
                // Starts with the visible words (WCAG 2.5.3), then says which attack at whom.
                aria-label={target ? t("attack.rollAgainst", { roll: rollLabel, attack: chosen.name, target: target.token.name }) : undefined}
              >
                <DiceFive size={18} aria-hidden="true" />
                {rollLabel}
              </button>
              {privateToggle}
            </div>
          )}
        </>
      )}

      {customOpen && (
        <section className="attack-custom" aria-label={t("attack.customRoll")}>
          <div className="attack-custom-head">
            <span className="field-label">{t("attack.customRoll")}</span>
            <button type="button" className="icon-button" onClick={() => onCustomOpen(false)} aria-label={t("attack.closeCustom")} title={t("common.close")}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <form className="stack" onSubmit={rollCustom}>
            <div className="attack-kind" role="group" aria-label={t("attack.rollType")}>
              <button type="button" className="chip" aria-pressed={kind === "toHit"} onClick={() => update({ kind: "toHit" })}>
                {t("attack.toHit")}
              </button>
              <button type="button" className="chip" aria-pressed={kind === "damage"} onClick={() => update({ kind: "damage" })}>
                {t("attack.damage")}
              </button>
            </div>

            <div className="attack-dice">
              <DicePoolInput value={settings} onChange={(pool) => update(pool)} label={t("home.dice.title")} className={kind === "damage" ? "damage" : undefined} />
              <input
                className="attack-custom-label"
                aria-label={t("attack.label")}
                value={settings.label}
                onChange={(e) => update({ label: e.target.value })}
                maxLength={MAX_ATTACK_LABEL}
                placeholder={t("attack.labelOptional")}
              />
            </div>

            <div className="attack-roll-row">
              <button
                type="submit"
                className="attack-roll primary"
                disabled={busy || rolling || !target}
                title={rolling ? t("attack.diceOnBoard") : undefined}
              >
                <DiceFive size={18} aria-hidden="true" />
                {busy ? t("home.dice.rolling") : !target ? t("attack.chooseTarget") : kind === "damage" ? t("attack.rollExprDamage", { expr: expression }) : t("attack.rollExprToHit", { expr: expression })}
              </button>
              {privateToggle}
            </div>
          </form>
        </section>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Add or change one named attack: a name, and a to-hit roll, a damage roll, or both. */
export function PresetEditor({
  initial,
  taken,
  onSave,
  onRemove,
  onCancel,
}: {
  initial: AttackPreset | null;
  /** Names this token's other attacks already use. */
  taken: string[];
  onSave: (preset: AttackPreset) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [toHit, setToHit] = useState<DicePool | null>(initial ? initial.toHit : poolOf(20));
  const [damage, setDamage] = useState<DicePool | null>(initial ? initial.damage : poolOf(6));
  const [multi, setMulti] = useState(initial?.maxTargets !== undefined);
  const [maxTargets, setMaxTargets] = useState(initial?.maxTargets ?? 3);
  const [maxTargetsText, setMaxTargetsText] = useState(String(initial?.maxTargets ?? 3));
  const clampTargets = (n: number) => Math.min(MAX_ATTACK_TARGETS, Math.max(2, Math.round(n) || 2));
  const [error, setError] = useState<string | null>(null);
  /** The attack's own animation: a copy of a library one (ADR 0038). Null leaves the attack's style to decide. */
  const [animation, setAnimation] = useState<AnimationDef | null>(initial?.animation ?? null);
  const library = useStrikeAnimations();
  /** The library entry the animation was copied from, by definition, for the select's value. */
  // Compared by content: a saved copy may list its fields in another order.
  const sameAs = (def: AnimationDef) => animation !== null && stableJson(def) === stableJson(animation);
  const builtins = BUILTIN_ANIMATIONS.filter((b) => b.def.shape !== "nuke");
  const match = animation ? (library.find((a) => sameAs(a.def)) ?? builtins.find((b) => sameAs(b.def))) : undefined;
  const animationValue = !animation ? "" : match ? match.id : CURRENT_ANIMATION;

  const save = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError(t("attack.nameRequired"));
    if (taken.some((n) => n.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return setError(t("attack.nameTaken", { name: trimmed }));
    if (!toHit && !damage) return setError(t("attack.needsRoll"));
    onSave({ name: trimmed, toHit, damage, ...(animation && { animation }), ...(multi && { maxTargets }) });
  };

  return (
    <form className="stack attack-editor" onSubmit={save} aria-label={initial ? t("attack.editNamed", { name: initial.name }) : t("creature.addAttack")}>
      <label>
        {t("common.name")}
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_ATTACK_LABEL} placeholder={t("attack.namePlaceholder")} autoFocus />
      </label>
      <DiceField label={t("attack.toHit")} kind="toHit" value={toHit} fallback={poolOf(20)} onChange={setToHit} />
      <DiceField label={t("attack.damage")} kind="damage" value={damage} fallback={poolOf(6)} onChange={setDamage} />
      <label className="checkbox">
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
        {t("attack.multiTarget")}
      </label>
      {multi && (
        <label>
          {t("attack.mostTargets")}
          <input type="number" inputMode="numeric" min={2} max={MAX_ATTACK_TARGETS} step={1} value={maxTargetsText}
            onChange={(e) => { setMaxTargetsText(e.target.value); if (e.target.value !== "") setMaxTargets(clampTargets(Number(e.target.value))); }}
            onBlur={() => setMaxTargetsText(String(maxTargets))} />
        </label>
      )}
      <SearchablePicker
        label={t("home.attack.animation")}
        value={animationValue === "" ? AUTOMATIC_ANIMATION : animationValue}
        onChange={(key) => {
          if (key === CURRENT_ANIMATION) return;
          // Copied in: later library edits do not change this attack.
          setAnimation(key === AUTOMATIC_ANIMATION ? null : [...library, ...builtins].find((a) => a.id === key)?.def ?? null);
        }}
        options={[
          { key: AUTOMATIC_ANIMATION, label: t("walls.colour.auto"), detail: "animation" },
          ...(animationValue === CURRENT_ANIMATION ? [{ key: CURRENT_ANIMATION, label: t("attack.savedAnimation") }] : []),
          ...builtins.map((b) => ({ key: b.id, label: b.name, detail: "preset" })),
          ...library.map((a) => ({ key: a.id, label: a.name, detail: "yours" })),
        ]}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row attack-editor-actions">
        {onRemove && (
          <button type="button" className="secondary" onClick={onRemove}>
            {t("common.remove")}
          </button>
        )}
        <button type="button" className="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="submit" className="primary">{t("common.save")}</button>
      </div>
    </form>
  );
}

/**
 * An optional roll in the attack editor: a checkbox to include it, then the dice builder
 * (dice-pool). Exported for the other editors of named attacks, such as the AI builder's drafts.
 */
export function DiceField({
  label,
  kind,
  value,
  fallback,
  onChange,
}: {
  label: string;
  /** Which roll this is, so to hit and damage read as separate sections. */
  kind: AttackKind;
  value: DicePool | null;
  fallback: DicePool;
  onChange: (dice: DicePool | null) => void;
}) {
  // Kept while unticked, so ticking it again brings back what was set.
  const [kept, setKept] = useState<DicePool>(value ?? fallback);
  const dice = value ?? kept;
  return (
    <div className={`attack-dice-field ${kind === "toHit" ? "to-hit" : "damage"}${value ? "" : " off"}`}>
      <label className="checkbox attack-dice-field-head">
        <input type="checkbox" checked={value !== null} onChange={(e) => onChange(e.target.checked ? dice : null)} />
        {label}
      </label>
      {value
        ? <DicePoolInput value={value} label={label} onChange={(next) => { setKept(next); onChange(next); }} />
        : <p className="muted small-print attack-dice-field-off">{t("attack.notRolled")}</p>}
    </div>
  );
}

/**
 * The to-hit roll that last decided `preset` against `targetId`, if it was a Hit not yet followed by
 * that attack's damage; the damage button then rolls at that target.
 */
function hitOn(rolls: readonly LoggedRoll[], participantId: string, attackerId: string, targetId: string, preset: AttackPreset): DiceRoll | null {
  const label = (kind: AttackKind) => presetRollLabel(preset, kind);
  for (let i = rolls.length - 1; i >= 0; i--) {
    const roll = rolls[i]!;
    if (isGroupRoll(roll)) continue;
    const attack = roll.attack;
    if (!attack || roll.byParticipantId !== participantId || attack.actor?.tokenId !== attackerId || attack.target?.tokenId !== targetId) continue;
    if (attack.kind === "damage" && attack.label === label("damage")) return null;
    if (attack.kind === "toHit" && attack.label === label("toHit")) return roll.verdict === "hit" ? roll : null;
  }
  return null;
}

const stableJson = (value: object) => JSON.stringify(value, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));
