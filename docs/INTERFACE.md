# Interface and Page Design — Virtual Tabletop

Part of the [design document](DESIGN.md) — see also [`DELIVERY.md`](DELIVERY.md) and
[`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md).

Page inventory, information architecture, per-page specifications and the design system.

> Section numbers (§11.x) are kept from when this was `DESIGN.md` §11, so existing
> references still resolve. Where this document and `FRONTEND-CONTRACT.md` disagree, the
> contract wins — it was written later and accepts or supersedes what is proposed here.

---

## 11.1 Status

§11.4 onward records the original interface proposal.
**[`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) now accepts or supersedes its individual
decisions**; historical alternatives below are not implementation options. Interface direction is the Board owner's call
(Antonio) and the page inventory is a team decision; this section exists so there is
something concrete to argue with, because until now the document said nothing about what
the application is beyond one room screen.

Two corrections to what this section used to claim. The boards it referenced —
`room-setup.png`, `at-the-table.png`, `between-sessions.png` — **were never produced**;
`assets/ui-reference/` held only a README describing them, and has since been removed. And the
palette that README called "already applied" (deep slate-teal ground, parchment text, gold accent) was
never what shipped: `apps/web/src/styles.css` used a neutral charcoal ground with a blue accent.
§11.9 now records the palette that replaced both, a slate ground with a single rust accent (KAN-60).

## 11.2 Page inventory

What exists today, and what a usable product still needs:

| Route | Page | State | Serves |
| --- | --- | --- | --- |
| `/` | Home — the product, Play, and sign in | Built — a bare create form only | Entry for every journey (§11.5) |
| `/join/:inviteCode` | Guest join | Built | FR-PL-01, FR-PL-02 |
| `/r/:roomId` | The table | Built | most of the FR set |
| — | 404 | Built — an unstyled card | — |
| `/signup`, `/login` | Account — any role, role is per room | **Missing** | FR-GM-01, [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1 |
| `/rooms` | Room hub — rooms you belong to | **Missing** | FR-GM-01 (`DESIGN.md` §5: an account exists so a user can return and find their rooms). Also where Leave table returns a signed-in user ([`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1) |
| `/r/:roomId/prepare` | Scene preparation | **Missing** — currently crammed into the table's side panel | FR-GM-02 … FR-GM-07, FR-GM-11 |
| `/r/:roomId/log` | Activity log and undo | **Missing** | FR-REC-01, FR-REC-02 |
| — (no route) | Access, invites, revocation | Built as in-room controls: Remove in the Participants popover, Reset link beside Share | FR-GM-20 |
| `/library` | Saved maps, token art, encounter templates | **Deferred — do not build** | [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1 defers saved assets and omits their navigation from the initial release; needs ownership, quota and reuse requirements first |

The gap is not decoration. Some of those rows are requirements with no surface at all: a GM
cannot currently find a room they made last week, or read the log that FR-REC-01 requires. Map preparation lives in a scrolling side panel beside the live table,
which means the GM does setup and play in the same cramped column.

## 11.3 Information architecture

Three layers, distinguished by how long a person stays and how much they are asked to think:

1. **Entry** (`/`, `/join/:code`, `/login`, `/signup`) — originating at the home page,
   which is the only surface that explains the product and carries both Play and sign in
   (§11.5). Past it, one decision per screen and no navigation chrome. A player arriving from an invite link must reach the table in under
   30 seconds (README §6), so this layer is a corridor, not a lobby.
2. **Hub** (`/rooms`, `/library`, account) — the between-sessions layer. Persistent left
   navigation, list-dense, optimised for finding one room among many.
3. **Table** (`/r/:roomId` and its sub-surfaces) — the encounter. No global chrome at all:
   the board owns the viewport and everything else is a panel over it. Sub-surfaces
   (prepare, log, settings) open as overlays rather than page navigations, because leaving
   the table would drop the socket and force a resync.

The rule that follows: **navigation chrome decreases as you go deeper.** Entry has none,
hub has a sidebar, the table has none again.

## 11.4 What we take from mature VTTs, and what we refuse

Roll20 is the reference point because README §3 already names its tradeoff: broad
functionality at the cost of onboarding and interface overhead. That is a statement about
*pages*, not features. A mature VTT accretes surfaces — marketplace, compendium, character
sheets, forums, a tabletop sidebar with a dozen tabs — and every one of them is a decision
the user has to route around before play starts.

README §7 already excludes most of that surface area: no character sheets, no rules
automation, no marketplace, no video. The page design should make that exclusion *visible*
rather than leaving room for it.

| Pattern | Take | Refuse |
| --- | --- | --- |
| Persistent list of games you belong to | Yes — §11.2 `/rooms`. Returning to last week's table is FR-GM-01's whole purpose | — |
| Invite link that drops a player at the table | Yes, and go further: no account at all (FR-PL-01) | An account wall anywhere in the player path |
| Tabletop with a side panel | Yes, one panel | A sidebar of many tabs; ours caps at four |
| Layer controls (map / token / fog / GM) | Yes, as board layers | Exposing them as a persistent toolbar the player also sees |
| Settings, permissions, asset library | Yes, as overlays over the table | A settings tree the GM navigates away from play to reach |
| Marketplace, compendium, forums, sheets | — | All of it. Out of scope, and each is a top-level page we then owe navigation to |

The concrete rule this produces: **a player's path from link to playing contains exactly one
screen and one field.** A GM's path from logging in to a prepared map contains no more than
three. Any page proposal that lengthens either is rejected on that basis alone.

## 11.5 The home page

**This is where everything starts.** One page for everyone: a GM deciding whether to run a
game here, a player holding an invite link, someone coming back. It shows what the product
does with the product's own code, never a picture of an interface. Each section is a file in
`apps/web/src/pages/home/`, and `HomePage.tsx` composes them. The shared header (§11.9) sits
on top: the mark and name on the left; Sign in and Create account (or Your rooms, signed in)
and the theme toggle on the right.

**Above the fold: two ways in, and they are not equals** (`Hero.tsx`).

- **Start a room** is the primary action, the page's one rust fill above the fold. It goes to
  the GM dashboard; a browser that isn't signed in reaches the sign-in page first and carries
  on from there. Room creation stays behind a free account (`FRONTEND-CONTRACT.md` §13.1
  records why, and why an unclaimed room was rejected).
- **Join a game** is the second action. It opens the page's only join form in place and moves
  focus to its field, which takes a full invite link or a bare code. A browser that has joined
  rooms before opens with the form showing and those rooms listed above the field, marked as
  saved in this browser only.
- The headline is "Your battle map, ready to play tonight." with one line under it. Both
  actions are on the first screen at 1366x768, and at 390x844, where they come before the scene.
- The scene is a table in play, made of the board's own pieces: the canal market's crop as the
  page's largest image (`fetchpriority="high"`), its faint grid, three tokens drawn as the board
  draws them, and a thin drifting fog around what the party can see (line of sight over the
  map's walls). There is no template in it; the play section shows those. Under reduced motion
  it is shown settled.

**Facts row** (`FactsRow.tsx`): no account for players; up to `MAX_PLAYERS_PER_ROOM` players
in a room; pings under 150 ms (the latency benchmark's p95 target); undo for moves, fog,
walls and hit points. Every figure comes from a constant or a target the tests measure, and
`homeFacts.test.tsx` fails if either moves. Undo names what it covers because the table
can't undo every action.

**Running a game.** One heading makes every "you" below it the GM; players are "your
players".

1. **Prepare** (`PrepareSection.tsx`). The file types the library's map upload takes, from
   the one list both use (`net/mapFileTypes.ts`). The grid demo: a slider sizes the table's
   grid over a real map's own squares until the two line up. A built-in map's stored walls,
   doors and windows, drawn in the board's colours over its crop.
2. **Play** (`PlaySection.tsx`). The line-of-sight stage: move the torch bearer by dragging or
   with the arrow keys, and `sightPolygon` recomputes the lit area over the map's walls. Outside
   it the player view dims the map in the board's own darkness colour at `DIMMED_ALPHA`; the
   hero instead keeps a thin drifting fog as atmosphere. A Player view / GM view switch shows a
   hidden monster to the GM only. Then exactly five tiles: area templates (`areaShape` and
   `tokensTouchingArea`, placed with a click or a drag or moved with the arrow keys, and left
   where they are placed), dice (the shared parser and roller, opening on a settled roll), attacks (the
   animation editor's preview stage; a captured still under reduced motion), the turn order
   (`decide` and `reduce`, with the table's `TurnNotice`) and conditions (`ConditionMarker`).
3. **Recover** (`RecoverSection.tsx`). A local room built by `reduce`. The visitor's moves go
   through `decide` as `token.move`, Undo is `history.undo`, and the log's lines are
   `formatActivity`'s. The undo is its own entry and the original is marked Undone, as at the
   table.
4. **The library** (`LibraryStrip.tsx`). The page's own maps, whole, each with its pixel size
   and squares, drifting past as a strip, with a caption saying they are this page's maps;
   under reduced motion, a still row that scrolls a map at a time. It says the library is kept on the GM's account, there on any device they
   sign in on, and doesn't link to `/library`: the rooms page is the way in.

**Joining a game.** The second heading; under it, "you" is the player. A capture of the
player's board on a phone (`PlayersSection.tsx`) and a Join a game action that takes the
visitor back to the hero's form, open and focused. The page never has a second join form.

**Closing band** (`ClosingBand.tsx`): "Ready to run a game?" and the hero's own Start a room,
over the closing photograph, then the footer.

**Rules for the whole page.**

- One label per intent: every way into running a game says Start a room, and every way into
  joining says Join a game.
- Demos run the table's code (`@vtt/shared`, `board/tools.ts`). Nothing that needs the board's
  renderer loads before the visitor scrolls near it, and the demos that run `decide` (the turn
  order, the recovery board) load as their own chunks near the viewport too.
- One map per section, each drawn for this page in its own theme and style, never the asset
  library's art (the attack tile's preview stage is the one exception):

  | Section | Map | Style |
  | --- | --- | --- |
  | Hero | A canal market | Ink and watercolour |
  | Sight | A desert tomb | Gouache |
  | Grid demo | A dwarven forge | Coloured pencil |
  | Walls | A coaching inn | Technical-pen plan |
  | Templates tile | A goblin ruin | Linocut |
  | Recovery | A ship's deck | Risograph |

  Each scene's tokens are drawn in its map's style. Every crop is 20 squares wide from a grid
  line, cut by `scripts/home-maps.mjs` from the table in `homeCrops.json` that the page reads
  too. The walls the demos run on are traced in `pages/home/homeWalls.ts`.
- The copy names what the table does, never how it is built: no server, client, filter,
  snapshot, update stream, parser, overlay or code identifier; no partial feature (movement
  budget, shared drawing, door or window detection); no em dashes. `homeCopy.test.tsx` checks
  the rendered page in both views and after a valid and an invalid roll.

**Banned on this page:** a row of three equal feature cards; section eyebrows reading
"FEATURES" or "HOW IT WORKS"; a centred hero; testimonials the project does not have;
invented usage statistics; a second call to action of equal weight to Start a room.

## 11.6 Entry pages

**`/join/:inviteCode`** — one field, one button, no chrome. A player who is already known to
this browser skips the field entirely and gets "Resume as Alice" instead, because re-typing
a name to rejoin a room you were in five minutes ago is a needless step and risks creating a
second identity (`DESIGN.md` §5).

- Primary action: join
- States: validating the code, invalid or expired code with a plain explanation, submitting
- Not here: anything about accounts. The offer to claim one belongs after the session, on
  the way out — never on the way in (`FRONTEND-CONTRACT.md` §13.1)

**`/login` and `/signup`** — for anyone who wants to be found again, not GM-only (`FRONTEND-CONTRACT.md` §13.1). A
player reaches these only *after* a session, never before: the invite path must not prompt
for an account ahead of play. A single column at reading width, the form
above the fold with no scrolling, and the opposite link (sign in / create account) as quiet
text rather than a second button. Password rules stated *before* the field, not as an error
after submitting.

## 11.7 The room hub

The between-sessions surface, and the one most likely to be built as a wall of identical
cards. It should be a list, because a list scans and a card grid does not.

**Layout.** A single column of rooms at reading width, one row per room, separated by
hairlines rather than boxed. Each row: scene thumbnail at a fixed small size, room name,
when it was last played, participant count. The row is the click target.

**Ordering** is by last played, descending — not alphabetical and not by creation date. The
room you want is almost always the one you were just in.

**States.** Skeleton rows shaped like real rows while loading. The empty state is the first
thing a new GM ever sees and should read as an invitation with the create action inline, not
as an error. Room creation happens here too, so the hub is never a dead end.

## 11.8 The table: layers and panels

The most complex screen and the one with the strictest rule: **the board owns the viewport.**
Everything else is a panel over it or a column beside it, and nothing may push the board
smaller than it needs to be.

**Regions.**

- **Board** — the full remaining area, with no global navigation bar above it. There is
  nowhere to navigate to; leaving would drop the socket
- **Panel** — a fixed column on the right at desktop width, beneath the board as tabs below
  720px, beside it again in landscape (KAN-55). Four tabs at most: Play, Tokens, Dice, and
  Manage for the GM. When a fifth is proposed, something merges
- **Board controls** — a small cluster floating over the board's corner: fit, zoom, and
  the layer switcher. Floating rather than docked, because a docked toolbar costs board
  height permanently for controls used occasionally
- **Status** — connection state and seq, inline in the panel header. Never a modal. A
  reconnect must not interrupt play, and a dialog over the board does exactly that

**Layers,** in draw order, bottom to top: map, grid, drawings and templates, tokens,
condition markers, fog, ephemeral effects (pings, drag previews, rulers). The GM can target
a layer for editing; a player never sees a layer control, because administrative layer targeting is GM-only. Players still receive permitted
drawing and AoE tools; tool access is distinct from layer administration (`FRONTEND-CONTRACT.md` §13.5). Fog and GM-only geometry are not merely hidden in the player's
renderer — they are absent from the payload (FR-GM-23), and the interface should not imply
otherwise by showing a disabled control.

**Overlays** open over the table and never navigate away from it: scene preparation, the
activity log, room settings. Each is a wide sheet rather than a column, dismissible with
Escape, and returns focus to the control that opened it. Preparation in particular needs
width — a GM aligning a grid against a map is comparing two things and cannot do it in a
20rem strip.

**Density** is highest here and only here. The panel may compress padding and use tabular
figures at a smaller size; the entry and hub pages may not. A GM tracking eight tokens
through an encounter wants information per square inch, and the same person on the landing
page wants space.

## 11.9 Design system

**Direction.** Slate and rust: a wet-erase battle mat under a marker, not a SaaS dashboard.
One cool neutral family for every surface, and a **single warm accent** that marks the one
thing to act on. It avoids the blue-on-charcoal default that every developer tool already
uses. `apps/web/src/styles.css` `:root` is the source of truth; this table mirrors it.

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#121417` | Page and board surround. Never pure black |
| `--panel` | `#181b20` | Panels |
| `--raised` | `#20242a` | Overlays, menus, raised controls |
| `--field` | `#0e1013` | Input wells |
| `--border` | `#272c33` | 1px decorative separators — the primary grouping device |
| `--border-strong` | `#6a7280` | Control boundaries; at least 3:1 on every surface (WCAG 1.4.11) |
| `--text` | `#e3e6ea` | Body |
| `--muted` | `#8e96a2` | Secondary, labels |
| `--accent` | `#b3552d` | The single accent (rust): primary action, active turn |
| `--accent-ink` | `#fff8f3` | Text on accent fills |
| `--accent-text` | `#e08a62` | Rust as text on dark surfaces (badges); `--accent` itself is only 3.5:1 on the panel |
| `--focus` | `#e08a62` | Focus ring, a lighter rust that shows on rust fills too |
| `--ok` `--warn` `--danger` | `#6fbf73` `#d9a441` `#e0685c` | Status only, never decoration. The board reads these too (`ui/palette.ts`), so an HP bar has one colour everywhere |
| `--danger-strong` | `#b5463d` | Fill of destructive buttons, under `--accent-ink` |
| `--control-border` | `#646a78` | Boundary of the neutral control family (icon buttons, header links); 3.46:1 on `--ground` |
| `--hover` | `rgba(227, 230, 234, 0.06)` | Hover fill of neutral controls and rows |
| `--rule` | `rgba(227, 230, 234, 0.14)` | Hairlines on the ambient ground |
| `--ground` | `#0f1216` | The ambient ground behind the home, entry and hub pages; the lighting tokens (`--key-warm`, `--fill-cool`, `--shaft`, `--vignette`, `--grain-opacity` and the rest) sit on it |

One accent, under 80% saturation (rust is 60%). Status colours are never the only signal —
the active turn carries a glyph and position as well as rust, conditions carry a shape and
an abbreviation as well as a fill (FR-TAC-08).

**Rust marks one action.** Buttons are neutral by default: a transparent fill, a
`--border-strong` boundary and `--text`. Rust is `button.primary`, given to the one main
action of a page section, a dialog or a collapsible section of the table's side panel, so no
such region shows two rust fills at once. Everything else that is rust is the active turn, a
count badge or a slider's fill. A selected tab, tool or segment is not a rust fill: it is a
raised surface (`--raised`), a 2px rust underline and a semibold label, with the selection
also in `aria-selected` or `aria-pressed`.

Measured contrast on `--panel`: text 13.8:1, muted 5.8:1, danger 5.2:1, focus 6.6:1,
border-strong 3.6:1, border 1.2:1 (decorative only, so inputs use `--border-strong`). Accent ink on accent is 4.7:1
and on `--danger-strong` 5.1:1; `--accent` was darkened from `#b9582f` (4.4:1) to clear WCAG AA 4.5:1, and hover
darkens rather than brightens so it stays above it.

**Light theme and layers.** Every route belongs to one of four layers, set on `<html>` as
`data-layer` by `App.tsx` (`theme.ts`): **home** (`/`), **entry** (sign-in, sign-up, join,
not found), **hub** (GM dashboard, library) and **table** (a room, and the encounter editor
that reuses it). The home, entry and hub layers follow one stored choice, light, dark or the
system's, kept under `vtt.theme` and applied before the first render so a light page never
flashes dark. The table is always dark: the board is the lit surface and Pixi renders
against it. Light overrides these tokens under `:root[data-theme="light"]`; everything else
keeps its dark value.

| Token | Light value |
| --- | --- |
| `--bg`, `--ground` | `#eceef1` |
| `--panel` | `#fbfcfd` |
| `--raised` | `#f4f6f8` |
| `--field` | `#fbfcfe` |
| `--border` | `#d5dae2` |
| `--text` | `#15171b` |
| `--muted` | `#5b6270` (5.27:1) |
| `--accent-hover` | `#a04a28` |
| `--control-border` | `#7a8394` (3.28:1) |
| `--hover` | `rgba(21, 23, 27, 0.05)` |
| `--rule` | `rgba(21, 23, 27, 0.16)` |

The lighting tokens have light values too (`--key-warm`, `--shaft`, `--vignette` and the rest);
`styles.css` lists them. Light also deepens `--focus` to `#a04a28` and `--accent-text` to
`#9c4726`, since the dark theme's light rust is only 2.26:1 on the light ground. This closes
the UI audit's conflict C12: the light theme is no longer the home page's alone.

**Background by layer.** `ui/Ambient.tsx` draws the lit table behind a page, fixed to the
viewport and inert to the pointer, in the amount its layer gets:

| Layer | What is drawn |
| --- | --- |
| home | The full rig: warm key light upper right, cool fill, a light shaft, vignette, grain; the battle-grid pattern behind the hero; fog between sections |
| entry | The table photograph (`public/img/ambient/table-*-blur.webp`), dimmed; the same rig at half strength; grain |
| hub | A faint warm and cool glow along the top; grain |
| table | Nothing: the board's own fog and line of sight light the table |

**Shared components.** One of each, used everywhere it applies:

- **`ui/SiteHeader.tsx`**: the mark and the product name (`PRODUCT_NAME`, one constant), the
  page's navigation, the account control and the theme toggle, in the same place on the home
  and hub pages at every width. Entry pages show the mark and name only (`EntryPage`). The
  hub's navigation marks the current page with the selected treatment.
- **`ui/TokenDisc.tsx`**: a token outside the board, drawn as the board draws it: disc, art
  clipped to the circle, ring, hit-point bar in the status colours, initial when there is no art.
  Home page maps, library creature cards, roster and My Tokens rows.
- **`ui/MapThumbnail.tsx`** with **`ui/MapGrid.tsx`**: a map cropped to its frame with its grid
  at a lighter weight. A shipped map loads its prepared thumbnail, never the full map, and a
  placeholder the frame's shape holds its place while it loads.
- **`ui/EmptyState.tsx`**: a picture from the lighting brief, a short line, and the action
  that fills it unless that action already sits beside it. The dashboard's no-rooms state,
  library tabs with nothing in them, and the board with no map (`ui/BoardEmptyState.tsx`:
  "Choose a map" for the GM, the sentence alone for players).

**Typography.** A geometric grotesk for the interface and a true monospace for anything
numeric — initiative scores, hit points, dice results, seq numbers all need tabular figures
so they stop jittering as they change.

```
--font-ui:   "Geist Sans", system-ui, -apple-system, "Segoe UI", sans-serif
--font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace
```

Geist is the only typeface, on every surface: the home and entry pages, the hub, the table,
dialogs, and the labels the board draws on tokens. The table used Alegreya Sans, loaded from
Google Fonts, until the design-language change; that request is gone and the UI audit's
conflict C5 is resolved. Every number (hit points, initiative, dice and roll totals, grid
sizes, distances, counts, log times, number fields) is Geist Mono with tabular figures. The
faces of the 3D dice are dice art and keep the dice look's own figures. The board waits for
both faces before its first label (`board/boardFont.ts`), because Pixi never redraws a label
when a better font arrives.

Serifs are out: this is software, not editorial. Headings control hierarchy through weight
and colour rather than size — a room name is `text-lg font-semibold tracking-tight`, not a
display heading. A panel heading is sentence case, 14px, semibold and muted. Body copy caps
at 65 characters. Names wrap rather than ellipsize, so a long token name is never cut short.

**Space and materiality.** Group by hairline and negative space, not by boxing everything in
a card. A card is justified only when elevation means something — an overlay above the
table, a menu above the panel. Panels sit flat on the ground with a single hairline.
Shadows, when used, are tinted to the ground rather than black. One corner scale:
`--radius-control` (6px) for controls, `--radius-surface` (12px) for anything that groups or
floats content; tokens, avatars and swatches are circles. Spacing steps are `--space-1` to
`--space-8`: 4, 8, 12, 16, 24, 32, 48 and 64px.

**Motion.** Fluid but not cinematic. One curve, `--ease: cubic-bezier(0.16, 1, 0.3, 1)`, and
three durations: `--dur-fast` (120ms) for hover feedback, `--dur` (240ms) for state changes
and `--dur-slow` (480ms) for entrances. Spring physics for anything the user drags or
drops. Animate `transform` and `opacity` only — never `width`, `height`, `top` or `left`,
which would fight the Pixi canvas for the compositor. At the table, two things earn continuous
motion and nothing else does: the active-turn indicator and the connection status. On the home
page the fog drifts (between sections only at 720px and wider) and the library strip moves,
both only when motion is welcome.

Reduced motion has one switch. The system's `prefers-reduced-motion` or the in-app Reduced
animations setting puts `data-motion="reduced"` on `<html>` (`ui/motion.ts`); then no CSS
animation or transition runs, and every element renders in its settled state. Animations
started from script (the 3D dice, screen shake, board effects) check the same two inputs
themselves.

**Density** varies by layer: airy at entry (generous spacing, one decision per view),
moderate in the hub, and tight at the table, where a GM tracking eight tokens needs
information per square inch. The table panel is the only surface that may compress padding.

**Icons.** One family, Phosphor, at its regular weight; the fill weight marks a selected tool
and nothing else. No emoji anywhere in the interface, ever — they render differently on every
platform and read as placeholder.

**Imagery.** A picture of the product is always the product: a running component, the
table's own code running on the page, or a capture of the real app
(`public/img/home/CREDITS.md` records how each capture was taken). Generated pictures are of
two kinds.

The first is atmosphere: the table photographs behind the entry pages and the hero, the closing
band, the empty-state pictures and the wood texture. Every one follows one lighting brief, so
they read as the same room:

> Photographic. One warm tungsten lamp from the upper right, deep slate-blue shadows, low
> saturation, walnut wood and dark slate stone, shallow depth of field. No text, screens,
> paper, interface or logos.

Each image's prompt, size and byte budget are in `public/img/ambient/CREDITS.md`, and
`npm run images:ambient -w @vtt/web` turns the sources into WebP and the blurred entry plates.
A light-theme variant shares its image's name with a `-light` suffix.

The second is the home page's demo art: each scene's map and tokens, drawn for the page rather
than taken from the library. Each scene has its own theme and drawing style, with its tokens in
its map's style. Each map is top-down on a square grid, with room to move.
`public/img/home/CREDITS.md` has every prompt.

## 11.10 Interface states

Every data surface specifies four states, not one. Prototypes ship the success case and
discover the rest in front of a grader.

- **Loading** — skeletons shaped like the content that will replace them. No spinners
- **Empty** — says what to do next. "No rooms yet — create one to get started", not a blank
  panel. The empty table and empty roster are the first thing a new GM sees
- **Error** — inline and specific, next to the thing that failed. Errors that need a retry
  carry the retry. A rejected command surfaces the server's reason, since `decide` already
  returns one
- **Offline** — the board stays interactive and visibly stale rather than blanking. The
  status line owns this; nothing modal

## 11.11 Responsive and accessibility

Breakpoints at 720px and 1024px. Below 720 the panel moves beneath the board and becomes
tabs; in landscape on a phone the panel returns to the side, because width is what a
landscape phone has (see KAN-55). The board refits when the viewport changes only if the
viewer has not positioned their own camera — an independent viewport is FR-TAC-01, and a
rotation must not undo a deliberate pan (KAN-54).

Accessibility is a stated target (README §6: WCAG 2.2 AA for non-canvas UI), which means
concretely: every interactive element reachable by keyboard and visible when focused; touch
targets at least 44px on coarse pointers; colour never the sole carrier of meaning; the
canvas paired with a DOM equivalent for anything it expresses — the roster is the keyboard
path to token selection (FR-GM-24), and any future canvas-only affordance needs the same
treatment.

---

