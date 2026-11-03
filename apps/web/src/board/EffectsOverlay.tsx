import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { QUALITY, useClientSettings } from "../ui/clientSettings";
import { motion } from "framer-motion";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { ConditionId, RoomState, Token } from "@vtt/shared";
import type { BoardTransform } from "./diceThrow";
import {
  CONDITION_GLOW,
  CONDITION_VISUALS,
  IMPACT_S,
  SPARK_REACH,
  conditionParticleOptions,
  conditionTokenInView,
  particleBox,
  particleConditions,
  pickEmitterTokens,
  sparkVectors,
} from "./effectPresets";
import { NUKE_DROP_SHARE } from "./fxBudget";
import { attackPlan, effectiveReducedMotion, prefersReducedMotion, watchReducedMotion, type AttackEffect } from "./effects";

/** An attack effect the overlay is playing, until its plan duration is over. */
export interface OverlayEffect {
  id: number;
  effect: AttackEffect;
}

/** The board's token radius, matching `drawToken`: the edge of the disc, in board pixels. */
const radiusOf = (token: Token, cellSize: number) => (token.size * cellSize) / 2 - 2;

let engineReady: Promise<void> | null = null;
/** The particle engine, started once for the whole page with only the slim feature set. */
function useParticleEngine(wanted: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    engineReady ??= initParticlesEngine(loadSlim);
    let live = true;
    engineReady.then(() => live && setReady(true), () => {});
    return () => {
      live = false;
    };
  }, [wanted]);
  return ready;
}

/** Whether the page is shown, so looping glows can stop while it is hidden. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

/** The device preference or the GM's table-wide "Reduced animations" setting; follows both live. */
function useReducedMotion(tableReduced: boolean): boolean {
  const settings = useClientSettings();
  const [os, setOs] = useState(prefersReducedMotion);
  useEffect(() => watchReducedMotion(setOs), []);
  return effectiveReducedMotion({ reducedEffects: tableReduced || settings.reducedAnimations }, os);
}

/**
 * Attack and condition effects (board-effects-overlay): a DOM layer over the Pixi canvas. Its one
 * inner element follows the board's world transform, so everything inside sits in board
 * coordinates and pans and zooms with the map. It reads only the viewer's own state, takes no
 * input, and is hidden from assistive technology: badges and the activity log say the same things.
 */
export default function EffectsOverlay({
  state,
  effects,
  subscribe,
  onDone,
  isGm,
}: {
  state: RoomState;
  effects: OverlayEffect[];
  /** Follow the board's world transform; returns the unsubscribe. */
  subscribe: (fn: (view: BoardTransform) => void) => () => void;
  /** An effect's time is up and it can go. */
  onDone: (id: number) => void;
  isGm: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion(state.reducedEffects ?? false);
  const settings = useClientSettings();
  const budget = QUALITY[settings.graphicsQuality];
  /** The board point at the middle of the view, for ranking which tokens get particles. */
  const [centre, setCentre] = useState({ x: 0, y: 0, halfWidth: Infinity, halfHeight: Infinity });
  const cell = state.scene.grid.cellSize;

  useLayoutEffect(() => {
    let latest: BoardTransform | null = null;
    let timer = 0;
    let last = -Infinity;
    const measure = () => {
      timer = 0;
      const el = root.current;
      if (!el || !latest) return;
      last = performance.now();
      const view = latest;
      setCentre({ x: (el.clientWidth / 2 - view.x) / view.scale, y: (el.clientHeight / 2 - view.y) / view.scale,
        halfWidth: el.clientWidth / (2 * view.scale), halfHeight: el.clientHeight / (2 * view.scale) });
    };
    const queue = () => {
      if (timer) return;
      const delay = Math.max(0, 250 - (performance.now() - last));
      if (delay === 0) measure();
      else timer = window.setTimeout(measure, delay);
    };
    const stop = subscribe((view) => {
      latest = view;
      if (world.current) world.current.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      queue();
    });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(queue);
    if (root.current) observer?.observe(root.current);
    return () => { stop(); observer?.disconnect(); window.clearTimeout(timer); };
  }, [subscribe]);

  // Only tokens in the viewer's own state, and never one hidden from a player.
  const visible = useMemo(
    () => Object.values(state.tokens).filter((t) => isGm || !t.hidden),
    [state.tokens, isGm],
  );
  const conditioned = useMemo(() => visible.filter((t) => t.conditions.length > 0 && conditionTokenInView(t, centre, cell)), [visible, centre, cell]);
  const animatedTokens = useMemo(() => new Set(pickEmitterTokens(conditioned, centre, budget.conditions).map((t) => t.id)), [conditioned, centre, budget.conditions]);
  const withParticles = useMemo(
    () => pickEmitterTokens(conditioned.filter((t) => particleConditions(t.conditions).length > 0), centre, budget.emitters),
    [conditioned, centre, budget.emitters],
  );
  const particleTokens = useMemo(() => new Set(withParticles.map((t) => t.id)), [withParticles]);
  const pageVisible = usePageVisible();
  const engine = useParticleEngine(pageVisible && !reduced && withParticles.length > 0);

  return (
    <div ref={root} className="effects-overlay" aria-hidden="true">
      <div ref={world} className="effects-overlay-world">
        {pageVisible && conditioned.map((token) => (
          <ConditionLayer
            key={token.id}
            token={token}
            radius={radiusOf(token, cell)}
            // Under reduced motion no particle canvas runs, even if the engine loaded earlier.
            particles={pageVisible && !reduced && engine && particleTokens.has(token.id)}
            reduced={reduced || !animatedTokens.has(token.id)}
            pageVisible={pageVisible}
          />
        ))}
        {effects.map((e) => (
          <AttackEffectView key={e.id} entry={e} state={state} cell={cell} reduced={reduced} isGm={isGm} onDone={onDone} />
        ))}
      </div>
    </div>
  );
}

// ---------- conditions ----------

const ConditionLayer = memo(function ConditionLayer({ token, radius, particles, reduced, pageVisible }: { token: Token; radius: number; particles: boolean; reduced: boolean; pageVisible: boolean }) {
  const style: CSSProperties = { left: token.position.x, top: token.position.y };
  const particleId = particleConditions(token.conditions)[0];
  return (
    <div className="effects-anchor" style={style}>
      {token.conditions.map((id) => (
        <ConditionVisualView key={id} id={id} radius={radius} particles={particles && id === particleId} reduced={reduced} pageVisible={pageVisible} />
      ))}
    </div>
  );
});

function ConditionVisualView({ id, radius, particles, reduced, pageVisible }: { id: ConditionId; radius: number; particles: boolean; reduced: boolean; pageVisible: boolean }) {
  const visual = CONDITION_VISUALS[id];
  switch (visual.kind) {
    case "particles":
      return particles ? <TokenParticles id={id} radius={radius} pageVisible={pageVisible} /> : null;
    case "ring":
      return (
        <div
          className={reduced || !pageVisible || !visual.pulse ? "effects-ring" : "effects-ring condition-pulse"}
          style={{
            width: radius * 2 + 10,
            height: radius * 2 + 10,
            marginLeft: -radius - 5,
            marginTop: -radius - 5,
            borderColor: visual.color,
            borderStyle: visual.dashed ? "dashed" : "solid",
            borderWidth: Math.max(2, radius * 0.07),
            boxShadow: `0 0 ${radius * 0.4}px ${visual.color}`,
          }}
        />
      );
    case "text":
      return (
        <span
          className={reduced || !pageVisible ? "effects-text" : "effects-text condition-float"}
          style={{ left: radius * 0.4, top: -radius * 1.5, fontSize: radius * 0.8, color: visual.color, "--condition-rise": `${-radius * 0.4}px` } as CSSProperties}
        >
          {visual.text}
        </span>
      );
    case "veil":
      return (
        <div
          className="effects-veil"
          style={{ width: radius * 2, height: radius, marginLeft: -radius, marginTop: -radius, borderRadius: `${radius}px ${radius}px 0 0` }}
        />
      );
  }
}

/** One token's particles, in a small canvas of their own so they cost nothing elsewhere on the board. */
function TokenParticles({ id, radius, pageVisible }: { id: ConditionId; radius: number; pageVisible: boolean }) {
  // Fixed for as long as the condition and the token's size stay: a new object reloads the canvas.
  const options = useMemo(() => conditionParticleOptions(id, radius, false), [id, radius]);
  const key = useParticleKey();
  const box = particleBox(radius);
  const glow = CONDITION_GLOW[id];
  if (!options) return null;
  return (
    <>
      {glow && pageVisible && (
        <div
          className="effects-glow condition-glow"
          style={{ width: radius * 2.6, height: radius * 2.6, marginLeft: -radius * 1.3, marginTop: -radius * 1.3, background: `radial-gradient(circle, ${glow}, transparent 70%)` }}
        />
      )}
      <Particles
        id={`fx-${id}-${Math.round(radius)}-${key}`}
        options={options}
        style={{ position: "absolute", left: box.offsetX, top: box.offsetY, width: box.width, height: box.height }}
      />
    </>
  );
}

/** A unique number for each mounted canvas: tsparticles finds its element by id. */
let nextParticleKey = 0;
function useParticleKey(): number {
  const key = useRef<number | null>(null);
  key.current ??= nextParticleKey++;
  return key.current;
}

// ---------- attacks ----------

function AttackEffectView({
  entry,
  state,
  cell,
  reduced,
  isGm,
  onDone,
}: {
  entry: OverlayEffect;
  state: RoomState;
  cell: number;
  reduced: boolean;
  isGm: boolean;
  onDone: (id: number) => void;
}) {
  const { effect, id } = entry;
  const plan = attackPlan(effect, reduced);
  useEffect(() => {
    const timer = window.setTimeout(() => onDone(id), plan.durationMs);
    return () => window.clearTimeout(timer);
  }, [id, plan.durationMs, onDone]);

  const find = (tokenId: string) => {
    const token = state.tokens[tokenId];
    // A token that left the viewer's state, or is hidden from a player, ends the effect at once.
    return token && (isGm || !token.hidden) ? token : null;
  };
  // Strikes and the nuke blast are drawn by the Pixi board (fx.ts); the overlay adds the nuke numbers.
  if (effect.kind === "strike") return null;
  if (effect.kind === "nuke") {
    return (
      <>
        {effect.tokenIds.map((tokenId, index) => {
          const token = find(tokenId);
          return token ? <Damage key={tokenId} at={token.position} r={radiusOf(token, cell)} amount={effect.amount} reduced={reduced || index >= 24} delay={reduced ? 0 : effect.animation.duration * NUKE_DROP_SHARE} /> : null;
        })}
      </>
    );
  }
  if (effect.kind === "damages") {
    return (
      <>
        {effect.hits.map((hit, index) => {
          const token = find(hit.tokenId);
          // Past a couple of dozen, the rest show still, as the nuke's numbers do.
          return token ? <Damage key={hit.tokenId} at={token.position} r={radiusOf(token, cell)} amount={hit.amount} reduced={reduced || index >= 24} /> : null;
        })}
      </>
    );
  }
  const target = find(effect.tokenId);
  if (!target) return null;
  const r = radiusOf(target, cell);
  const at = target.position;

  switch (effect.kind) {
    case "hit":
      return <Hit at={at} r={r} seed={id} reduced={reduced} />;
    case "miss":
      return <Miss at={at} r={r} reduced={reduced} />;
    case "damage":
      return <Damage at={at} r={r} amount={effect.amount} reduced={reduced} />;
  }
}

/**
 * A layered impact: white core flash, two shockwave rings, a ring of sparks with long and short
 * rays, tumbling shards, and optional crossed slash marks. All of it plays inside `IMPACT_S`.
 */
function Impact({ at, r, seed, delay, palette, count, slashes }: { at: { x: number; y: number }; r: number; seed: number; delay: number; palette: string[]; count: number; slashes: boolean }) {
  const sparks = useMemo(() => sparkVectors(count, seed), [count, seed]);
  const shards = useMemo(() => sparkVectors(7, seed + 5), [seed]);
  const size = Math.max(5, r * 0.15);
  const ringWidth = Math.max(2, r * 0.09);
  const accent = palette[2]!;
  return (
    <>
      <motion.div
        className="effects-orb"
        style={{ left: at.x, top: at.y, width: r * 2.4, height: r * 2.4, marginLeft: -r * 1.2, marginTop: -r * 1.2, background: `radial-gradient(circle, ${palette[0]}, ${accent}55 45%, transparent 70%)` }}
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1.1, 1.5], opacity: [0, 1, 0] }}
        transition={{ duration: IMPACT_S, delay, ease: "easeOut", times: [0, 0.25, 1] }}
      />
      {[0, 0.08].map((extra, i) => (
        <motion.div
          key={i}
          className="effects-ring"
          style={{ left: at.x, top: at.y, width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, borderColor: palette[i + 1], borderWidth: ringWidth * (i ? 0.6 : 1.2), boxShadow: `0 0 ${r * 0.3}px ${palette[i + 1]}` }}
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: [0.3, 1.7 + i * 0.5], opacity: [1, 0] }}
          transition={{ duration: IMPACT_S, delay: delay + extra, ease: "easeOut" }}
        />
      ))}
      {slashes &&
        [-38, 38].map((deg, i) => (
          <motion.div
            key={deg}
            className="effects-slash"
            style={{ left: at.x, top: at.y, width: r * 2.8, height: Math.max(4, r * 0.14), marginLeft: -r * 1.4, marginTop: -r * 0.07, rotate: deg }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: [0, 1, 1], opacity: [1, 1, 0] }}
            transition={{ duration: IMPACT_S, delay: delay + i * 0.07, ease: "easeOut", times: [0, 0.35, 1] }}
          />
        ))}
      {sparks.map((v, i) => {
        const reach = r * 1.9 * SPARK_REACH[i % SPARK_REACH.length]!;
        const color = palette[i % palette.length]!;
        return (
          <motion.div
            key={i}
            className="effects-orb"
            style={{ left: at.x, top: at.y, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, background: color, boxShadow: `0 0 ${size * 2.5}px ${color}` }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 1 }}
            animate={{ x: v.x * reach, y: v.y * reach + r * 0.25, opacity: [0, 1, 0], scale: [1, 1.4, 0.1] }}
            transition={{ duration: IMPACT_S * 1.1, delay, ease: "easeOut" }}
          />
        );
      })}
      {shards.map((v, i) => {
        const reach = r * (1.1 + (i % 3) * 0.3);
        return (
          <motion.div
            key={`s${i}`}
            className="effects-shard"
            style={{ left: at.x, top: at.y, width: size * 1.6, height: size * 0.7, marginLeft: -size * 0.8, marginTop: -size * 0.35, background: palette[(i + 1) % palette.length] }}
            initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
            animate={{ x: v.x * reach, y: v.y * reach + r * 0.5, opacity: [0, 1, 0], rotate: (i % 2 ? 1 : -1) * 320 }}
            transition={{ duration: IMPACT_S * 1.2, delay, ease: "easeOut" }}
          />
        );
      })}
    </>
  );
}

function Hit({ at, r, seed, reduced }: { at: { x: number; y: number }; r: number; seed: number; reduced: boolean }) {
  if (reduced) return <Marker at={at} r={r} color="#ef4444" />;
  return (
    <>
      {/* A red flash over the whole token, then the layered impact. */}
      <motion.div
        className="effects-orb"
        style={{ left: at.x, top: at.y, width: r * 2, height: r * 2, marginLeft: -r, marginTop: -r, background: "#ef4444", mixBlendMode: "screen" }}
        initial={{ opacity: 0.85, scale: 1 }}
        animate={{ opacity: [0.85, 0.2, 0.6, 0], scale: [1, 1.15, 1.05, 1.2] }}
        transition={{ duration: 0.45, ease: "easeOut", times: [0, 0.2, 0.4, 1] }}
      />
      <Impact at={at} r={r} seed={seed} delay={0} palette={["#ffffff", "#fecaca", "#ef4444", "#b91c1c"]} count={18} slashes />
    </>
  );
}

function Miss({ at, r, reduced }: { at: { x: number; y: number }; r: number; reduced: boolean }) {
  if (reduced) return <Marker at={at} r={r} color="#cbd5e1" label="Miss" />;
  const size = r * 2.6;
  return (
    <>
      {[0, 1].map((i) => {
        const s = size * (1 - i * 0.18);
        return (
          <motion.div
            key={i}
            className="effects-whiff"
            style={{ left: at.x, top: at.y, width: s, height: s, marginLeft: -s / 2, marginTop: -s / 2, borderWidth: Math.max(3, r * (0.14 - i * 0.05)), borderColor: i ? "#94a3b8 transparent transparent transparent" : undefined }}
            initial={{ rotate: -150 + i * 40, opacity: 0, scale: 0.8 }}
            animate={{ rotate: 70, opacity: [0, 1, 0], scale: [0.8, 1.15, 1.3] }}
            transition={{ duration: 0.6, delay: i * 0.06, ease: "easeOut" }}
          />
        );
      })}
      {/* Dust kicked up where the blow lands short. */}
      {[-1, 0, 1].map((side) => (
        <motion.div
          key={side}
          className="effects-orb"
          style={{ left: at.x, top: at.y + r * 0.6, width: r * 0.5, height: r * 0.5, marginLeft: -r * 0.25, marginTop: -r * 0.25, background: "radial-gradient(circle, rgba(226, 232, 240, 0.8), transparent 70%)" }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{ x: side * r * 1.1, y: -r * 0.2, opacity: [0, 0.9, 0], scale: [0.4, 1.3, 1.8] }}
          transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
        />
      ))}
      <motion.span
        className="effects-label effects-miss"
        style={{ left: at.x, top: at.y - r, fontSize: Math.max(20, r * 0.7), color: "#e2e8f0" }}
        initial={{ y: 0, opacity: 0, scale: 0.4, rotate: -8 }}
        animate={{ y: -r * 0.9, opacity: [0, 1, 1, 0], scale: [0.4, 1.35, 1, 1], rotate: [-8, 5, -3, 0] }}
        transition={{ duration: 0.85, ease: "easeOut", times: [0, 0.2, 0.7, 1] }}
      >
        MISS
      </motion.span>
    </>
  );
}

function Damage({ at, r, amount, reduced, delay = 0 }: { at: { x: number; y: number }; r: number; amount: number; reduced: boolean; delay?: number }) {
  // Bigger blows get a bigger, hotter number.
  const weight = Math.min(1, amount / 20);
  const size = Math.max(28, r * (1.1 + weight * 0.7));
  const color = weight > 0.6 ? "#ff3b2f" : weight > 0.3 ? "#ff6b3d" : "#ffb347";
  if (reduced) {
    return (
      <span className="effects-label" style={{ left: at.x, top: at.y - r, fontSize: size, color, ...(delay > 0 && { animation: `effects-static-damage 1.4s linear ${delay}s both` }) }}>
        −{amount}
      </span>
    );
  }
  return (
    <>
      <motion.div
        className="effects-orb"
        style={{ left: at.x, top: at.y - r, width: size * 3, height: size * 3, marginLeft: -size * 1.5, marginTop: -size * 1.5, background: `radial-gradient(circle, ${color}aa, transparent 65%)` }}
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: [0.2, 1, 1.3], opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.6, delay, ease: "easeOut" }}
      />
      <motion.span
        className="effects-label effects-damage"
        style={{ left: at.x, top: at.y - r, fontSize: size, color }}
        initial={{ y: 0, scale: 0.2, opacity: 0, rotate: -10 }}
        animate={{
          y: [0, -r * 0.2, -r * 1.5],
          scale: [0.2, 1.8, 1.1, 1.1],
          opacity: [0, 1, 1, 0],
          rotate: [-10, 6, -2, 0],
        }}
        transition={{ duration: 1.4, delay, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
      >
        −{amount}
      </motion.span>
    </>
  );
}

/** A still marker on the target for reduced motion: it appears and goes with the plan's duration. */
function Marker({ at, r, color, label }: { at: { x: number; y: number }; r: number; color: string; label?: string }) {
  return (
    <>
      <div
        className="effects-ring"
        style={{ left: at.x, top: at.y, width: r * 2.2, height: r * 2.2, marginLeft: -r * 1.1, marginTop: -r * 1.1, borderColor: color, borderWidth: 4 }}
      />
      {label && (
        <span className="effects-label" style={{ left: at.x, top: at.y - r, fontSize: Math.max(16, r * 0.5), color }}>
          {label}
        </span>
      )}
    </>
  );
}
