/**
 * The guided tour's content and card placement (room-sidebar-layout: Guided tour on demand).
 *
 * Pure data and geometry, so the step list and positioning are unit-tested without a DOM.
 * Each step names a `data-tour` target; the tour skips any step whose target is not on
 * screen, so one list serves desktop, the phone tabs and a collapsed section alike.
 */

import { t, type TextId } from "../i18n/locale";

export type Role = "gm" | "player";

export interface GuideStep {
  /** Matches a `data-tour` attribute on the element to spotlight. */
  target: string;
  /** A CSS selector for the element to spotlight, instead of `[data-tour=target]` (the map editor's tours). */
  selector?: string;
  title: string;
  body: string;
  /** The step asks the viewer to use the spotlit control, so clicks inside it get through. */
  interactive?: boolean;
}

interface StepSpec {
  target: string;
  title: TextId;
  /** Text for both roles, or per role (catalog ids, read when the tour opens). A role missing from the map skips the step. */
  body: TextId | Partial<Record<Role, TextId>>;
  interactive?: boolean;
}

const STEPS: StepSpec[] = [
  {
    target: "board",
    title: "appGuide.map.title",
    body: {
      gm: "appGuide.map.gm",
      player: "appGuide.map.player",
    },
  },
  { target: "fit", title: "common.fit", body: "appGuide.fit.body" },
  {
    target: "tools",
    title: "rail.boardTools",
    body: {
      gm: "appGuide.tools.gm",
      player: "appGuide.tools.player",
    },
  },
  {
    target: "participants",
    title: "appGuide.people.title",
    body: {
      gm: "appGuide.people.gm",
      player: "appGuide.people.player",
    },
  },
  {
    target: "share",
    title: "appGuide.share.title",
    body: {
      gm: "appGuide.share.gm",
    },
  },
  {
    target: "tab-play",
    title: "appGuide.play.title",
    body: {
      gm: "appGuide.play.gm",
      player: "appGuide.play.player",
    },
  },
  {
    target: "tab-tokens",
    title: "appGuide.tokensTab.title",
    body: {
      gm: "appGuide.tokensTab.gm",
      player: "appGuide.tokensTab.player",
    },
  },
  {
    target: "tab-dice",
    title: "appGuide.diceTab.title",
    body: {
      gm: "appGuide.diceTab.gm",
      player: "appGuide.diceTab.player",
    },
  },
  { target: "tab-gm", title: "appGuide.manage.title", body: { gm: "appGuide.manage.gm" } },
  { target: "gm-map", title: "gmMap.battleMap", body: { gm: "appGuide.gmMap.gm" } },
  { target: "gm-grid", title: "appGuide.mapSetup.title", body: { gm: "appGuide.mapSetup.gm" } },
  {
    target: "rulings",
    title: "appGuide.rulings.title",
    body: {
      gm: "appGuide.rulings.gm",
    },
  },
  {
    target: "my-tokens",
    title: "appGuide.myTokens.title",
    body: { player: "appGuide.myTokens.player" },
  },
  {
    target: "attack",
    title: "appGuide.attack.title",
    body: {
      gm: "appGuide.attack.gm",
      player: "appGuide.attack.player",
    },
  },
  {
    target: "initiative",
    title: "appGuide.initiative.title",
    body: {
      gm: "appGuide.initiative.gm",
      player: "appGuide.initiative.player",
    },
  },
  {
    target: "tokens",
    title: "appGuide.tokens.title",
    body: {
      gm: "appGuide.tokens.gm",
      player: "appGuide.tokens.player",
    },
  },
  { target: "gm-add-token", title: "appGuide.addTokens.title", body: { gm: "appGuide.addTokens.gm" } },
  {
    target: "dice",
    title: "appGuide.dice.title",
    body: {
      gm: "appGuide.dice.gm",
      player: "appGuide.dice.player",
    },
  },
  {
    target: "sidebar-handle",
    title: "appGuide.room.title",
    body: "appGuide.room.body",
    interactive: true,
  },
  {
    target: "guide",
    title: "appGuide.more.title",
    body: {
      gm: "appGuide.more.gm",
      player: "appGuide.more.player",
    },
  },
];

export function guideSteps(role: Role): GuideStep[] {
  return STEPS.flatMap((s) => {
    const body = typeof s.body === "string" ? s.body : s.body[role];
    return body ? [{ target: s.target, title: t(s.title), body: t(body), ...(s.interactive && { interactive: true }) }] : [];
  });
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 12;
const MARGIN = 12;

/**
 * Where the explanation card goes: beside the target if there is room (right, then left),
 * else below or above it, else over its bottom edge for targets that fill the screen (the
 * map). Always clamped inside the viewport.
 */
export function placeCard(target: Rect, card: { width: number; height: number }, viewport: { width: number; height: number }) {
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), viewport.width - card.width - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), viewport.height - card.height - MARGIN);
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const midY = target.top + target.height / 2 - card.height / 2;
  const midX = target.left + target.width / 2 - card.width / 2;

  if (right + GAP + card.width + MARGIN <= viewport.width) return { left: right + GAP, top: clampY(midY) };
  if (target.left - GAP - card.width >= MARGIN) return { left: target.left - GAP - card.width, top: clampY(midY) };
  if (bottom + GAP + card.height + MARGIN <= viewport.height) return { left: clampX(midX), top: bottom + GAP };
  if (target.top - GAP - card.height >= MARGIN) return { left: clampX(midX), top: target.top - GAP - card.height };
  return { left: clampX(midX), top: clampY(bottom - card.height - 2 * GAP) };
}
