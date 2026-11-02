/**
 * The guided tour's content and card placement (room-sidebar-layout: Guided tour on demand).
 *
 * Pure data and geometry, so the step list and positioning are unit-tested without a DOM.
 * Each step names a `data-tour` target; the tour skips any step whose target is not on
 * screen, so one list serves desktop, the phone tabs and a collapsed section alike.
 */

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
  title: string;
  /** Text for both roles, or per role. A role missing from the map skips the step. */
  body: string | Partial<Record<Role, string>>;
  interactive?: boolean;
}

const STEPS: StepSpec[] = [
  {
    target: "board",
    title: "The map",
    body: {
      gm: "Drag empty space to pan and scroll to zoom. Drag any token to move it. Double-click to ping a spot for everyone.",
      player: "Drag empty space to pan and scroll to zoom. Drag your own token to move it. Double-click to ping a spot so everyone looks there.",
    },
  },
  { target: "fit", title: "Fit", body: "Lost your place? Fit brings the whole map back into view." },
  {
    target: "tools",
    title: "Board tools",
    body: {
      gm: "Select moves tokens. Measure and Draw leave marks only you see. AoE places a spell area everyone sees, unless you tick GM only. Hold Alt to place off the grid. Drag the Eraser over marks and areas to remove them, anyone's areas included. Fog hides or reveals part of the map for players straight away. Clear removes all of yours.",
      player: "Select moves tokens. Measure and Draw leave marks only you see. AoE places a spell area everyone sees. Hold Alt to place off the grid. Drag the Eraser over your marks and areas to remove them, or Clear to remove them all.",
    },
  },
  {
    target: "participants",
    title: "Who's here",
    body: {
      gm: "See everyone in the room. Remove ends a player's seat and their tokens stay for you to hand on. They can rejoin as a new player through the current invite link until you reset it.",
      player: "See everyone in the room. The GM is marked.",
    },
  },
  {
    target: "share",
    title: "Invite players",
    body: {
      gm: "Share, up here in the corner, copies the invite link for your players. If a link leaks, open the arrow beside it and choose Reset link to make a new one; nobody already here is affected.",
    },
  },
  {
    target: "tab-play",
    title: "Play tab",
    body: {
      gm: "Your table at a glance: rulings waiting on you, tokens you control, attacks and the initiative tracker, where you start and run encounters.",
      player: "Your characters, your attacks and the turn order. Most of a session happens here.",
    },
  },
  {
    target: "tab-tokens",
    title: "Tokens tab",
    body: {
      gm: "Every token in the room. Search, find one on the map, edit its stats and owners, or add new ones.",
      player: "Every token you can see. Search, find one on the map, and edit your own.",
    },
  },
  {
    target: "tab-dice",
    title: "Dice tab",
    body: {
      gm: "Roll dice and see what everyone has rolled. Change or clear a Hit or Miss here after it leaves the Rulings list.",
      player: "Roll dice and see what everyone has rolled, including the GM's Hit or Miss on your attacks.",
    },
  },
  { target: "tab-gm", title: "Manage tab", body: { gm: "Room setup: the battle map, the grid, and players who have left." } },
  { target: "gm-map", title: "Battle map", body: { gm: "Your map, its grid and its walls." } },
  { target: "gm-grid", title: "Map setup", body: { gm: "Upload a map or choose one from your library. Once there is one, Edit map opens the map editor: swap the map, line up its grid, detect or draw its walls, fog the parts the table shouldn't see yet, and set line of sight." } },
  {
    target: "rulings",
    title: "Rulings",
    body: {
      gm: "Attack rolls waiting on you. Mark a to-hit roll Hit or Miss, and press Apply on a damage roll to take that HP off the target. The app never decides a hit for you.",
    },
  },
  {
    target: "my-tokens",
    title: "My tokens",
    body: { player: "Your characters. Click a name to find it on the map, and use the buttons to take damage or heal." },
  },
  {
    target: "attack",
    title: "Attack",
    body: {
      gm: "Attack with any token. Choose a target from the list or Pick on board, then tap a saved attack to roll it, or open Custom roll. Rule on your own rolls right here.",
      player: "Choose your target from the list or Pick on board, then tap a saved attack to roll it, or open Custom roll. The GM calls Hit or Miss and applies the damage; you see it here.",
    },
  },
  {
    target: "initiative",
    title: "Initiative",
    body: {
      gm: "When a fight starts, press Start encounter and type each token's initiative. Next turn then moves play along.",
      player: "When a fight starts, the turn order shows here and your turn is marked.",
    },
  },
  {
    target: "tokens",
    title: "Tokens",
    body: {
      gm: "All your token controls live here. Click a name to find it on the map. Edit sets HP, AC, conditions, who controls it and whether players can see it.",
      player: "Every token you can see. Search, click one to find it on the map, and Edit your own to update HP and conditions.",
    },
  },
  { target: "gm-add-token", title: "Add tokens", body: { gm: "New Token creates a token for a character or monster; Saved Creatures puts one of your library creatures straight on the board, hidden if you tick it. Then click a square for each one you want, or use the arrow keys and Enter, and press Esc when you're done. Pick who controls a token in New Token, or hide it until you reveal it." } },
  {
    target: "dice",
    title: "Dice",
    body: {
      gm: "Roll any expression, like 1d20+5. Everyone sees the result, unless you tick Roll privately.",
      player: "Roll any expression, like 1d20+5. Everyone sees the result.",
    },
  },
  {
    target: "sidebar-handle",
    title: "More room",
    body: "Hide the sidebar to give the map the whole screen. Click again to bring it back.",
    interactive: true,
  },
  {
    target: "guide",
    title: "More",
    body: {
      gm: "The activity log (everything that has happened, move by move, with undo), a replay of the session, and this guide again.",
      player: "A replay of the session, and this guide again.",
    },
  },
];

export function guideSteps(role: Role): GuideStep[] {
  return STEPS.flatMap((s) => {
    const body = typeof s.body === "string" ? s.body : s.body[role];
    return body ? [{ target: s.target, title: s.title, body, ...(s.interactive && { interactive: true }) }] : [];
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
