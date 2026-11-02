import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { ANIMATION_SHAPES, AnimationDef, MAX_ANIMATION_NAME, PARTICLE_SHAPES, type LibraryAnimation, type ParticleShape } from "@vtt/shared";
import { SHAPE_DEFAULTS, withDefaults } from "../../board/effectPresets";
import { api } from "../../net/api";
import { AnimationPreviewStage } from "../../ui/AnimationPreviewStage";
import { Modal } from "../../ui/Modal";
import { SHAPE_LABELS } from "./animationLabels";
import { StageButton, StagePanel } from "./StagePanel";
import { clearStagePick, stageScene, useStagePicks } from "./stagePicks";

const NEW_ANIMATION_NAME = "New animation";
const PARTICLE_LABELS: Record<ParticleShape, string> = { spark: "Spark", star: "Star", square: "Square", shard: "Shard", ring: "Ring" };
type Step = "appearance" | "timing" | "motion";
const STEPS: { key: Step; label: string }[] = [
  { key: "appearance", label: "Appearance" }, { key: "timing", label: "Timing & power" }, { key: "motion", label: "Motion" },
];

/** A labelled slider with its value shown, for one numeric field of the definition. */
function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** How the value reads beside the label: "1.3 s", "×1.5", "72%". */
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  // The filled part of the track, as a share of the range.
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <label className="animation-slider" style={{ "--fill": `${fill}%` } as CSSProperties}>
      <span className="animation-slider-label">{props.label}</span>
      <output className="animation-slider-value">{props.format(props.value)}</output>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

const seconds = (v: number) => `${v.toFixed(1)} s`;
const times = (v: number) => `×${v.toFixed(1)}`;
const count = (v: number) => `${v}`;
const percent = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** New or Edit animation: every field of the definition, and a preview that plays the values as they are now. */
export function AnimationEditor({ animation, onSaved, onCancel }: { animation: LibraryAnimation | null; onSaved: (animation: LibraryAnimation) => void; onCancel: () => void }) {
  const formId = useId();
  const [step, setStep] = useState<Step>("appearance");
  /** The side panel shows the stage art instead of a step's settings. */
  const [stageOpen, setStageOpen] = useState(false);
  const stagePicks = useStagePicks();
  const scene = useMemo(() => stageScene(stagePicks), [stagePicks]);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(animation?.name ?? NEW_ANIMATION_NAME);
  const [def, setDef] = useState<AnimationDef>(animation?.def ?? SHAPE_DEFAULTS.slash);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = name !== (animation?.name ?? NEW_ANIMATION_NAME) || JSON.stringify(def) !== JSON.stringify(animation?.def ?? SHAPE_DEFAULTS.slash);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const set = <K extends keyof AnimationDef>(key: K, value: AnimationDef[K]) => setDef((d) => ({ ...d, [key]: value }));
  const parsed = AnimationDef.safeParse(def);
  // What the form shows: the stored fields, with the shape's defaults for any the definition leaves out.
  const v = withDefaults(def);
  const loadDefaults = (shape: AnimationDef["shape"]) => setDef(SHAPE_DEFAULTS[shape]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) { setStep("appearance"); return setError("Give the animation a name."); }
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the values.");
    setSaving(true);
    try {
      const saved = animation
        ? await api.library.animations.update(animation.id, { name: trimmed, def: parsed.data })
        : await api.library.animations.create({ name: trimmed, def: parsed.data });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  const onTabKey = (event: KeyboardEvent<HTMLElement>) => {
    const at = STEPS.findIndex(s => s.key === step);
    const next = event.key === "ArrowRight" ? (at + 1) % STEPS.length
      : event.key === "ArrowLeft" ? (at + STEPS.length - 1) % STEPS.length
      : event.key === "Home" ? 0 : event.key === "End" ? STEPS.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const key = STEPS[next]!.key;
    setStep(key);
    setStageOpen(false);
    document.getElementById(`${formId}-${key}`)?.focus();
  };
  const title = animation ? `Edit ${animation.name}` : "New animation";
  const close = () => {
    if (saving) return;
    if (dirty) setConfirming(true);
    else onCancel();
  };

  return (
    <>
      <Modal open title={title} className="map-editor animation-editor-modal" onClose={close}
        headerContent={(
          <>
            <nav className="map-editor-steps animation-editor-tabs" role="tablist" aria-label="Animation settings sections" onKeyDown={onTabKey}>
              {STEPS.map(({ key, label }) => (
                <button key={key} id={`${formId}-${key}`} type="button" role="tab" tabIndex={step === key ? 0 : -1} aria-selected={!stageOpen && step === key}
                  aria-controls={`${formId}-settings`} className="map-editor-step" onClick={() => { setStep(key); setStageOpen(false); }}>{label}</button>
              ))}
            </nav>
            <div className="animation-editor-actions">
              {dirty && <span className="map-editor-draft">Unsaved changes</span>}
              <button type="button" className="secondary" disabled={saving} onClick={close}>Cancel</button>
              <button className="primary" type="submit" form={formId} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
            </div>
          </>
        )}
      >
        <form id={formId} className="animation-editor-workspace" onSubmit={save} aria-label={title}>
          <section className="animation-editor-canvas" aria-label="Animation preview">
            <AnimationPreviewStage def={parsed.success ? parsed.data : def} scene={scene} onSceneMissing={clearStagePick}>
              <span className="animation-preview-meta">{SHAPE_LABELS[def.shape]} · {seconds(def.duration)}</span>
              <StageButton picks={stagePicks} open={stageOpen} controls={`${formId}-stage`} onToggle={() => setStageOpen((o) => !o)} />
            </AnimationPreviewStage>
          </section>
          <aside className="animation-editor-controls" aria-label="Animation settings">
            <div className="animation-editor-panel-heading">
              <h3>{stageOpen ? "Map & tokens" : STEPS.find(s => s.key === step)!.label}</h3>
              <p className="muted small-print">{stageOpen ? "Preview on art from your library. Only the preview changes; the animation saves without it."
                : step === "appearance" ? "Choose the shape and its colours." : step === "timing" ? "Set the pace, scale and impact." : "Tune the path and particle movement."}</p>
            </div>
            {error && <p role="alert" className="error animation-editor-save-error">{error}</p>}
            {stageOpen ? <StagePanel id={`${formId}-stage`} picks={stagePicks} onDone={() => setStageOpen(false)} /> : <div id={`${formId}-settings`} role="tabpanel" aria-labelledby={`${formId}-${step}`} className="animation-editor-fields">
              {step === "appearance" && <div className="stack">
                <label>
                  Name
                  <input value={name} maxLength={MAX_ANIMATION_NAME} onChange={(e) => setName(e.target.value)} autoFocus />
                </label>
                <label>
                  Shape
                  <select value={def.shape} onChange={(e) => loadDefaults(e.target.value as AnimationDef["shape"])}>
                    {ANIMATION_SHAPES.map((shape) => (
                      <option key={shape} value={shape}>{SHAPE_LABELS[shape]}</option>
                    ))}
                  </select>
                </label>
                <div className="animation-colours">
                  <label>
                    Primary colour
                    <input type="color" value={def.primary} onChange={(e) => set("primary", e.target.value)} />
                  </label>
                  <label>
                    Secondary colour
                    <input type="color" value={def.secondary} onChange={(e) => set("secondary", e.target.value)} />
                  </label>
                  <label>
                    Accent colour
                    <input type="color" value={def.accent ?? SHAPE_DEFAULTS[def.shape].accent} disabled={def.accent === undefined} onChange={(e) => set("accent", e.target.value)} />
                  </label>
                </div>
                <div className="stack">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={def.accent !== undefined}
                      onChange={(e) => set("accent", e.target.checked ? SHAPE_DEFAULTS[def.shape].accent : undefined)}
                    />
                    Use accent
                  </label>
                  <label>
                    Particle look
                    <select value={v.particleShape} onChange={(e) => set("particleShape", e.target.value as ParticleShape)}>
                      {PARTICLE_SHAPES.map((look) => (
                        <option key={look} value={look}>{PARTICLE_LABELS[look]}</option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="secondary small" onClick={() => loadDefaults(def.shape)}>Reset to shape default</button>
                </div>

              </div>}
              {step === "timing" && <div className="animation-sliders">
                <fieldset>
                  <legend>Timing and size</legend>
                  <Slider label="Duration" value={def.duration} min={0.2} max={8} step={0.1} format={seconds} onChange={(v) => set("duration", Math.round(v * 10) / 10)} />
                  <Slider label="Size" value={def.size} min={0.5} max={3} step={0.1} format={times} onChange={(v) => set("size", Math.round(v * 10) / 10)} />
                  <Slider label="Particles" value={def.particles} min={0} max={120} step={1} format={count} onChange={(v) => set("particles", v)} />
                </fieldset>
                <fieldset>
                  <legend>Intensity</legend>
                  <Slider label="Glow" value={def.glow} min={0} max={1} step={0.05} format={percent} onChange={(v) => set("glow", Math.round(v * 100) / 100)} />
                  <Slider label="Shake" value={def.shake} min={0} max={1} step={0.05} format={percent} onChange={(v) => set("shake", Math.round(v * 100) / 100)} />
                  <Slider label="Flash" value={def.flash} min={0} max={1} step={0.05} format={percent} onChange={(v) => set("flash", Math.round(v * 100) / 100)} />
                </fieldset>

              </div>}
              {step === "motion" && <div className="animation-sliders">
                <fieldset>
                  <legend>Motion</legend>
                  <Slider label="Count" value={v.count} min={1} max={12} step={1} format={count} onChange={(n) => set("count", n)} />
                  <Slider label="Spread" value={v.spread} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("spread", round2(n))} />
                  <Slider label="Arc" value={v.arc} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("arc", round2(n))} />
                  <Slider label="Trail" value={v.trail} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("trail", round2(n))} />
                  <Slider label="Spin" value={v.spin} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("spin", round2(n))} />
                  <Slider label="Gravity" value={v.gravity} min={-1} max={1} step={0.05} format={signed} onChange={(n) => set("gravity", round2(n))} />
                  <Slider label="Rings" value={v.rings} min={0} max={5} step={1} format={count} onChange={(n) => set("rings", n)} />
                </fieldset>

              </div>}
            </div>}
          </aside>
        </form>
      </Modal>
      <Modal open={confirming} title="Discard animation changes?" onClose={() => setConfirming(false)}>
        <p>Your changes to this animation haven't been saved.</p>
        <div className="row">
          <button type="button" className="secondary" onClick={() => setConfirming(false)}>Keep editing</button>
          <button type="button" className="danger-fill" onClick={onCancel}>Discard changes</button>
        </div>
      </Modal>
    </>
  );
}
