import { useEffect, useRef, useState, type FormEvent } from "react";
import { Crosshair, DiceFive, DotsThree, Eye, EyeSlash, Minus, PencilSimple, Plus, SlidersHorizontal, Sword, Target, X } from "@phosphor-icons/react";
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
  clampCount,
  clampModifier,
  DEFAULT_ATTACK,
  DIE_SIDES,
  isSettingsRecord,
  kindOf,
  LAST_USED_KEY,
  MAX_ATTACK_DICE,
  MAX_ATTACK_MODIFIER,
  MAX_PRESETS,
  presetsForToken,
  presetRollLabel,
  presetSummary,
  shouldPingTarget,
  targetsByDistance,
  type AttackDice,
  type AttackPreset,
  type AttackSettings,
} from "./attackRoll";
import type { AttackReset } from "./attackSession";
import { saveTokenAttacks } from "./tokenAttacks";
import { BUILTIN_ANIMATIONS } from "../board/effectPresets";
import { SearchablePicker } from "../ui/SearchablePicker";
import { useStrikeAnimations } from "./useLibraryAnimations";

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
          Attack
          {/* Said in the heading, so the collapsed line explains why it's quiet (attack-ux-polish). */}
          {!state.initiative && <span className="muted"> · no encounter running</span>}
        </>
      }
    >
      {!attacker ? (
        <p className="muted">
          {you.role === "gm" ? "Add a token to attack with." : "The GM has not assigned you a token yet."}
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
          initial={lastUsed[attacker.id] ?? DEFAULT_ATTACK}
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
  // The modifier field's own text, so "-" or an empty box can be typed on the way to "-2".
  const [modifierText, setModifierText] = useState(String(initial.modifier));
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
  const rollLabel = !chosen ? "" : busy ? "Rolling…" : !target ? "Choose a target" : followUp ? `Roll damage ${attackExpression(chosen.damage!)}` : chosen.toHit ? "Roll to hit" : "Roll damage";
  const expression = attackExpression(settings);
  const kind = kindOf(settings);
  const update = (changes: Partial<AttackSettings>) => {
    setSettings((s) => ({ ...s, ...changes }));
    if (changes.modifier !== undefined) setModifierText(String(changes.modifier));
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
    const [dice, rollKind]: [AttackDice, AttackKind] = preset.toHit ? [preset.toHit, "toHit"] : [preset.damage!, "damage"];
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
      aria-label="Roll privately (players won't see it)"
      title={visibility === "gm" ? "Private roll: players won't see it" : "Public roll: click to roll privately"}
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
            {inTurn && <span className="badge active-badge">turn</span>}
          </p>
        ) : (
          <Picker
            label="Attacker"
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
            label="Targets"
            title="Choose targets"
            align="left"
            className="attack-targets-button"
            buttonContent={
              <span className="attack-targets-summary">
                <Target size={16} aria-hidden="true" />
                <strong>{aimed.length === 0 ? (targets.length === 0 ? "No targets" : "Choose targets") : aimed.length === 1 ? target!.token.name : `${aimed.length} targets`}</strong>
                <span className="muted">of up to {maxTargets}</span>
              </span>
            }
          >
            {() => (
              <fieldset className="attack-target-list">
                <legend className="field-label">Choose up to {maxTargets} targets ({aimed.length} chosen)</legend>
                {targets.map((t) => {
                  const on = aimed.includes(t.token.id);
                  return (
                    <label key={t.token.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && aimed.length >= maxTargets}
                        onChange={(e) => {
                          const next = e.target.checked ? [...aimed, t.token.id] : aimed.filter((id) => id !== t.token.id);
                          onTarget(next[0] ?? null);
                          setExtraIds(next.slice(1));
                        }}
                      />
                      {t.token.name}{t.token.hidden ? " (hidden)" : ""} <span className="muted">{t.distance}</span>
                    </label>
                  );
                })}
              </fieldset>
            )}
          </PopoverButton>
        ) : (
          <Picker
            label="Target"
            icon={<Target size={16} aria-hidden="true" />}
            placeholder={targets.length === 0 ? "No targets" : "Target"}
            disabled={targets.length === 0}
            value={target?.token.id ?? null}
            onChange={onTarget}
            options={targets.map((t) => ({ key: t.token.id, label: `${t.token.name}${t.token.hidden ? " (hidden)" : ""}`, detail: t.distance }))}
          />
        )}
        <button type="button" className="icon-button attack-board-pick" onClick={onPickOnBoard} aria-label="Pick target on board" title="Pick target on board">
          <Crosshair size={18} aria-hidden="true" />
        </button>
      </div>

      {isGm && visibility === "public" && (attacker.hidden || target?.token.hidden) && (
        <p className="attack-warning" role="note">
          {attacker.hidden ? `${attacker.name} is hidden.` : `${target!.token.name} is hidden.`} Players will see this roll with the hidden token as Unknown, but they will see the attack's name.
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
                label={`${attacker.name}'s attack`}
                icon={<Sword size={16} aria-hidden="true" />}
                value={String(chosenIndex)}
                onChange={(key) => setSelected(Number(key))}
                options={presets.map((p, i) => ({ key: String(i), label: p.name, detail: presetSummary(p) }))}
              />
            ) : (
              <button type="button" className="secondary attack-add-first" onClick={() => setEditing("new")}>
                <Plus size={14} aria-hidden="true" /> Add an attack
              </button>
            )}
            <PopoverButton
              label="Attack options"
              title="Attack options"
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
                      <PencilSimple size={14} aria-hidden="true" /> Edit {chosen.name}
                    </button>
                  )}
                  <button
                    type="button"
                    className="menu-item"
                    disabled={presets.length >= MAX_PRESETS}
                    title={presets.length >= MAX_PRESETS ? `At most ${MAX_PRESETS} per token; remove one first` : undefined}
                    onClick={() => {
                      close();
                      setEditing("new");
                    }}
                  >
                    <Plus size={14} aria-hidden="true" /> Add attack
                  </button>
                  <button
                    type="button"
                    className="menu-item"
                    onClick={() => {
                      close();
                      onCustomOpen(!customOpen);
                    }}
                  >
                    <SlidersHorizontal size={14} aria-hidden="true" /> {customOpen ? "Hide custom roll" : "Custom roll"}
                  </button>
                </div>
              )}
            </PopoverButton>
          </div>
          {!chosen && <p className="muted small-print">Create an attack or use Custom roll to choose your attack and damage dice.</p>}
          {!chosen && !customOpen && (
            <div className="attack-roll-row">
              <button type="button" className="secondary" onClick={() => onCustomOpen(true)}>
                <SlidersHorizontal size={18} aria-hidden="true" /> Custom roll
              </button>
            </div>
          )}
          {chosen && !customOpen && (
            <div className="attack-roll-row">
              <button
                type="button"
                className="attack-roll primary"
                disabled={!target || busy || rolling}
                title={rolling ? "Your dice are still on the board" : undefined}
                onClick={() => (followUp ? rollDamage(chosen, hits) : rollPreset(chosen))}
                // Starts with the visible words (WCAG 2.5.3), then says which attack at whom.
                aria-label={target ? `${rollLabel}: ${chosen.name} against ${target.token.name}` : undefined}
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
        <section className="attack-custom" aria-label="Custom roll">
          <div className="attack-custom-head">
            <span className="field-label">Custom roll</span>
            <button type="button" className="icon-button" onClick={() => onCustomOpen(false)} aria-label="Close custom roll" title="Close">
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <form className="stack" onSubmit={rollCustom}>
            <div className="attack-kind" role="group" aria-label="Roll type">
              <button type="button" className="chip" aria-pressed={kind === "toHit"} onClick={() => update({ kind: "toHit" })}>
                To hit
              </button>
              <button type="button" className="chip" aria-pressed={kind === "damage"} onClick={() => update({ kind: "damage" })}>
                Damage
              </button>
            </div>

            <fieldset className="attack-dice">
              <legend className="sr-only">Dice</legend>
              <div className="attack-die-types" role="group" aria-label="Die type">
                {DIE_SIDES.map((sides) => (
                  <button key={sides} type="button" className="chip" aria-pressed={settings.sides === sides} onClick={() => update({ sides })}>
                    d{sides}
                  </button>
                ))}
              </div>
              <div className="attack-dice-row">
                <span className="attack-stepper" role="group" aria-label="Number of dice">
                  <button type="button" className="icon-button" onClick={() => update({ count: clampCount(settings.count - 1) })} disabled={settings.count <= 1} aria-label="One die fewer">
                    <Minus size={12} aria-hidden="true" />
                  </button>
                  <output aria-live="polite">{settings.count}</output>
                  <button type="button" className="icon-button" onClick={() => update({ count: clampCount(settings.count + 1) })} disabled={settings.count >= MAX_ATTACK_DICE} aria-label="One die more">
                    <Plus size={12} aria-hidden="true" />
                  </button>
                </span>
                <span className="muted">d{settings.sides}</span>
                <label className="attack-modifier">
                  <span className="muted">+</span>
                  <span className="sr-only">Modifier</span>
                  <input
                    type="number"
                    value={modifierText}
                    min={-MAX_ATTACK_MODIFIER}
                    max={MAX_ATTACK_MODIFIER}
                    step={1}
                    onChange={(e) => {
                      setModifierText(e.target.value);
                      setSettings((s) => ({ ...s, modifier: clampModifier(Number(e.target.value)) }));
                      setError(null);
                    }}
                    onBlur={() => setModifierText(String(settings.modifier))}
                  />
                </label>
              </div>
              <input
                className="attack-custom-label"
                aria-label="Label"
                value={settings.label}
                onChange={(e) => update({ label: e.target.value })}
                maxLength={MAX_ATTACK_LABEL}
                placeholder="Label (optional)"
              />
            </fieldset>

            <div className="attack-roll-row">
              <button
                type="submit"
                className="attack-roll primary"
                disabled={busy || rolling || !target}
                title={rolling ? "Your dice are still on the board" : undefined}
              >
                <DiceFive size={18} aria-hidden="true" />
                {busy ? "Rolling…" : !target ? "Choose a target" : kind === "damage" ? `Roll ${expression} damage` : `Roll ${expression} to hit`}
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
  const [toHit, setToHit] = useState<AttackDice | null>(initial ? initial.toHit : { count: 1, sides: 20, modifier: 0 });
  const [damage, setDamage] = useState<AttackDice | null>(initial ? initial.damage : { count: 1, sides: 6, modifier: 0 });
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
    if (!trimmed) return setError("Give the attack a name.");
    if (taken.some((n) => n.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return setError(`There is already an attack called ${trimmed}.`);
    if (!toHit && !damage) return setError("An attack needs a to-hit roll, a damage roll, or both.");
    onSave({ name: trimmed, toHit, damage, ...(animation && { animation }), ...(multi && { maxTargets }) });
  };

  return (
    <form className="stack attack-editor" onSubmit={save} aria-label={initial ? `Edit ${initial.name}` : "Add attack"}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_ATTACK_LABEL} placeholder="Longsword, Fire Bolt, Claws…" autoFocus />
      </label>
      <DiceField label="To hit" value={toHit} fallback={{ count: 1, sides: 20, modifier: 0 }} onChange={setToHit} />
      <DiceField label="Damage" value={damage} fallback={{ count: 1, sides: 6, modifier: 0 }} onChange={setDamage} />
      <label className="checkbox">
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
        Can attack multiple targets
      </label>
      {multi && (
        <label>
          Most targets at once
          <input type="number" inputMode="numeric" min={2} max={MAX_ATTACK_TARGETS} step={1} value={maxTargetsText}
            onChange={(e) => { setMaxTargetsText(e.target.value); if (e.target.value !== "") setMaxTargets(clampTargets(Number(e.target.value))); }}
            onBlur={() => setMaxTargetsText(String(maxTargets))} />
        </label>
      )}
      <SearchablePicker
        label="Animation"
        value={animationValue === "" ? AUTOMATIC_ANIMATION : animationValue}
        onChange={(key) => {
          if (key === CURRENT_ANIMATION) return;
          // Copied in: later library edits do not change this attack.
          setAnimation(key === AUTOMATIC_ANIMATION ? null : [...library, ...builtins].find((a) => a.id === key)?.def ?? null);
        }}
        options={[
          { key: AUTOMATIC_ANIMATION, label: "Automatic", detail: "animation" },
          ...(animationValue === CURRENT_ANIMATION ? [{ key: CURRENT_ANIMATION, label: "Saved animation" }] : []),
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
            Remove
          </button>
        )}
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">Save</button>
      </div>
    </form>
  );
}

/** An optional roll in the editor: a checkbox to include it, then count, die and modifier. */
function DiceField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: AttackDice | null;
  fallback: AttackDice;
  onChange: (dice: AttackDice | null) => void;
}) {
  const [modifierText, setModifierText] = useState(String(value?.modifier ?? fallback.modifier));
  const dice = value ?? fallback;
  const set = (changes: Partial<AttackDice>) => onChange({ ...dice, ...changes });
  return (
    <fieldset className="attack-dice-field">
      <legend className="sr-only">{label}</legend>
      <label className="checkbox">
        <input type="checkbox" checked={value !== null} onChange={(e) => onChange(e.target.checked ? dice : null)} />
        {label}
      </label>
      {value && (
        <span className="attack-dice-inputs">
          <input
            type="number"
            aria-label={`${label}: number of dice`}
            value={dice.count}
            min={1}
            max={MAX_ATTACK_DICE}
            onChange={(e) => set({ count: clampCount(Number(e.target.value)) })}
          />
          <select aria-label={`${label}: die`} value={dice.sides} onChange={(e) => set({ sides: Number(e.target.value) })}>
            {DIE_SIDES.map((s) => (
              <option key={s} value={s}>
                d{s}
              </option>
            ))}
          </select>
          <span className="muted">+</span>
          <input
            type="number"
            aria-label={`${label}: modifier`}
            value={modifierText}
            min={-MAX_ATTACK_MODIFIER}
            max={MAX_ATTACK_MODIFIER}
            onChange={(e) => {
              setModifierText(e.target.value);
              set({ modifier: clampModifier(Number(e.target.value)) });
            }}
            onBlur={() => setModifierText(String(dice.modifier))}
          />
          <span className="muted attack-dice-preview">{attackExpression(dice)}</span>
        </span>
      )}
    </fieldset>
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
