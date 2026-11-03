import { useState } from "react";
import { BUILTIN_ANIMATIONS } from "../../board/effectPresets";
import { AnimationPreviewStage } from "../../ui/AnimationPreviewStage";

/** Three of the built-in attack animations, one of each style. */
const CHOICES = ["fireball", "slash", "volley"] as const;

/** The animation editor's preview stage (ADR 0038), loaded by AttackTile on its own. */
export default function AttackStage() {
  const [shape, setShape] = useState<(typeof CHOICES)[number]>("fireball");
  const chosen = BUILTIN_ANIMATIONS.find((a) => a.def.shape === shape)!;
  return (
    <AnimationPreviewStage def={chosen.def}>
      <label className="attack-pick">
        <span className="sr-only">Animation</span>
        <select value={shape} onChange={(e) => setShape(e.target.value as (typeof CHOICES)[number])}>
          {CHOICES.map((c) => (
            <option key={c} value={c}>
              {BUILTIN_ANIMATIONS.find((a) => a.def.shape === c)!.name}
            </option>
          ))}
        </select>
      </label>
    </AnimationPreviewStage>
  );
}
