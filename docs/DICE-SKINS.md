# Dice skins

**Status:** the "how it's built" section describes the code as it is. The colour skin format (v1) is a **proposal**: the app does not read it yet (see [What the app needs](#what-the-app-needs-to-read-skins)). **Image dice looks** work on branch `feat/dice-image-skins` for all six dice (see [Dice looks](#dice-looks-image-skins)): they're kept in the browser, and only the person who made one sees it.

The same 3D dice appear everywhere:
- the public rolls thrown in the centre of the board (board-dice-rolls);
- dice dropped onto the map (throw-dice-on-board);
- the GM-only rolls in the panel trays;
- the home page demo.

They all use one renderer, so one skin would change all of them.

## How a die's look is built today

A die is built in four layers. Only the third layer is style; the other three are rules that keep a roll fair and readable.

| Layer | What it decides | Where | Skinnable? |
|---|---|---|---|
| 1. Shape | The polyhedron for each die size (d4, d6, d8, d10, d12, d20), the numbering (opposite faces sum to N+1), where each numeral sits, the 6/9 underline, and which face shows the result | `apps/web/src/ui/diceGeometry.ts` | No. It decides what the die *reads*. |
| 2. Pose and light | The resting tilt, seeded by roll id so every viewer sees the same die. Lambert shading from one light, painted once at rest. The numeral size. | `apps/web/src/ui/Die3D.tsx`: `layoutDice`, `LIGHT` | Partly: shading strength and numeral scale |
| 3. Paint | Face colour, edge line, how dark the shaded faces get, the highlight on the result face, numeral colour and font, the floor shadow | `apps/web/src/styles.css`: the `.die3d-*` rules and the `--die-*` custom properties | Yes. This is the skin. |
| 4. Size and motion | Die size in the tray and on the board, throw timing, bounces, and how long dice stay on the map | `DiceTray.tsx`: `dieSize`; `board/diceThrow.ts`: `DIE_CELLS`, `MIN_DIE_SCREEN_PX`; `diceGeometry.ts`: `THROW_MS` | No. The Dice panel and Rulings list time the result reveal to `throwDuration`. |

Each face is a flat `<div>` placed in 3D with `matrix3d`. It holds one SVG `<polygon>` for the face and one `<text>` per numeral, plus a `<line>` under 6 and 9. The paint layer colours those elements with CSS:

```css
/* styles.css, today's look */
.dice-tray, .thrown-dice-roll, .dice-ghost, .dice-throw-handle, .dice-look-preview {
  --die-body: var(--accent);        /* #b9582f rust */
  --die-ink: var(--accent-ink);     /* #fff8f3 */
  --die-shadow: rgba(0, 0, 0, 0.6);
}
.die3d-face polygon {
  fill: color-mix(in srgb, var(--die-body), #05070a var(--shade));    /* --shade: 0–62%, from layoutDice */
  stroke: color-mix(in srgb, var(--die-body), #fff 18%); stroke-opacity: 0.35; stroke-width: 0.8;
}
.die3d-face.front polygon { fill: color-mix(in srgb, var(--die-body), #fff 8%); }  /* the result face */
.die3d-face text { fill: var(--die-ink); font-weight: 800; }                        /* font: the page's body font */
.die3d-face line { stroke: var(--die-ink); }                                        /* 6 / 9 underline */
```

GM-only rolls are repainted in slate and amber (`--die-body: #39404b; --die-ink: var(--warn)`), so the GM can tell a private roll at a glance.

### Editing the look by hand today

| To change | Edit |
|---|---|
| Die and numeral colour | `--die-body` / `--die-ink` in `styles.css`, the rule for `.dice-tray, .thrown-dice-roll, …` |
| GM-only colours | The `.dice-tray.private, …` rule right below it |
| Edge line | `.die3d-face polygon` stroke |
| How dark the side faces get | `62` in `Die3D.tsx` (`shade: …(1 - lit) * 62`) and `#05070a` in the polygon fill |
| Highlight on the result face | `#fff 8%` in `.die3d-face.front polygon` |
| Numeral weight and size | `font-weight: 800` in `.die3d-face text`; the `fontSize` formula in `Die3D.tsx` |
| Shadow under the dice | `--die-shadow` (the map uses its own value in `.board-dice-roll`) |

## Skin format, v1 (proposed)

A skin is one JSON object. Every field except `format`, `version` and `name` is optional. A missing field keeps the default look, so `{"format":"vtt-dice-skin","version":1,"name":"Default"}` is the rust dice with pure white numerals (see rule 2).

```jsonc
{
  "format": "vtt-dice-skin",        // required, always this string
  "version": 1,                     // required
  "name": "Obsidian & Gold",        // required, 1–40 characters
  "author": "Aria",                 // optional, up to 40 characters

  "body": {
    "color": "#1b1b21",             // face colour
    "edge": {
      "color": "#d4af37",           // optional; when left out, the body colour lightened 18%
      "opacity": 0.6,               // 0–1, default 0.35
      "width": 1.2                  // 0–3 px, default 0.8
    },
    "shading": 0.5,                 // 0–0.8, how dark faces turned from the light get; default 0.62
    "shadeColor": "#05070a",        // what faces darken toward; default #05070a
    "resultHighlight": 0.12         // 0–0.3, how much the result face lightens; default 0.08
  },

  "ink": {
    "color": "#d4af37",             // numerals and the 6/9 underline
    "font": "body",                 // "body" (Alegreya Sans) | "ui" (Geist Sans) | "mono" (Geist Mono)
    "weight": 700,                  // 400–800, default 800
    "scale": 1.0                    // 0.8–1.2, numeral size; default 1
  },

  "shadow": { "color": "#00000099" },  // the soft shadow under each die; #rrggbbaa

  "dice": {                          // optional, per die type; each takes a partial "body" and "ink"
    "d20": { "body": { "color": "#3a0d12" } },
    "d4":  { "ink": { "color": "#ffffff" } }
  }
}
```

The keys for `dice` are `d4`, `d6`, `d8`, `d10`, `d12` and `d20`. Other sizes use the body they're drawn on: a d2 or d3 is a d6, and a d100 is a d20.

### Rules a skin must follow

These are checked when a skin is loaded. A skin that breaks one is rejected, not repaired.

1. **Colours are hex only:** `#rrggbb`, or `#rrggbbaa` for `shadow.color`. There are no CSS keywords, `rgb()`, `url()` or gradients. A skin is data, never CSS.
2. **Numerals stay readable.** The contrast ratio between `ink.color` and `body.color` must be at least **4.5:1** (WCAG AA). This is checked for the base skin and for every `dice.*` override after merging. Today's rust dice measure **4.44:1** (`#fff8f3` on `#b9582f`), just under the line, so the default skin uses pure white numerals (4.67:1). The GM-only slate and amber measure 4.65:1.
3. **Fonts come from the list** (`body`, `ui`, `mono`). The app loads only these, and any other name would silently fall back.
4. **Numbers stay in their ranges** (above). `ink.scale` above 1.2 makes numerals overflow the faces of a d20.
5. **No unknown keys.** A typo is an error, not an ignored field.
6. **GM-only rolls ignore the skin.** They always use the private slate and amber, so a skin can never make a hidden roll look public.

### What a skin cannot change, and why

- **Shape, numbering and which face shows the result.** The die must read as the server's roll, with opposite faces summing like real dice.
- **Resting tilt.** It is seeded per roll so every viewer sees the same landing.
- **Size and throw timing.** Totals, the Rulings list and the attack card wait for `throwDuration`. A slower throw would reveal the total before the dice land.
- **Textures and images.** v1 is flat colour. Images would need asset storage and moderation, so they're left for a v2.

### JSON Schema

This schema validates the shape and the ranges. Rule 2 (contrast) needs a computed check, so the app and any generating AI must check it separately.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "vtt-dice-skin.v1.json",
  "title": "Session Zero dice skin, v1",
  "type": "object",
  "additionalProperties": false,
  "required": ["format", "version", "name"],
  "$defs": {
    "hex": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
    "hexAlpha": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$" },
    "body": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "color": { "$ref": "#/$defs/hex" },
        "edge": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "color": { "$ref": "#/$defs/hex" },
            "opacity": { "type": "number", "minimum": 0, "maximum": 1 },
            "width": { "type": "number", "minimum": 0, "maximum": 3 }
          }
        },
        "shading": { "type": "number", "minimum": 0, "maximum": 0.8 },
        "shadeColor": { "$ref": "#/$defs/hex" },
        "resultHighlight": { "type": "number", "minimum": 0, "maximum": 0.3 }
      }
    },
    "ink": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "color": { "$ref": "#/$defs/hex" },
        "font": { "enum": ["body", "ui", "mono"] },
        "weight": { "type": "integer", "minimum": 400, "maximum": 800, "multipleOf": 100 },
        "scale": { "type": "number", "minimum": 0.8, "maximum": 1.2 }
      }
    },
    "override": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "body": { "$ref": "#/$defs/body" }, "ink": { "$ref": "#/$defs/ink" } }
    }
  },
  "properties": {
    "format": { "const": "vtt-dice-skin" },
    "version": { "const": 1 },
    "name": { "type": "string", "minLength": 1, "maxLength": 40 },
    "author": { "type": "string", "maxLength": 40 },
    "body": { "$ref": "#/$defs/body" },
    "ink": { "$ref": "#/$defs/ink" },
    "shadow": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "color": { "$ref": "#/$defs/hexAlpha" } }
    },
    "dice": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "d4": { "$ref": "#/$defs/override" },
        "d6": { "$ref": "#/$defs/override" },
        "d8": { "$ref": "#/$defs/override" },
        "d10": { "$ref": "#/$defs/override" },
        "d12": { "$ref": "#/$defs/override" },
        "d20": { "$ref": "#/$defs/override" }
      }
    }
  }
}
```

### Examples

Today's look, written out in full, with pure white numerals so it passes rule 2:

```json
{
  "format": "vtt-dice-skin", "version": 1, "name": "Table rust",
  "body": { "color": "#b9582f", "edge": { "opacity": 0.35, "width": 0.8 }, "shading": 0.62, "shadeColor": "#05070a", "resultHighlight": 0.08 },
  "ink": { "color": "#ffffff", "font": "body", "weight": 800, "scale": 1 },
  "shadow": { "color": "#00000099" }
}
```

A dark set with a different colour per die type:

```json
{
  "format": "vtt-dice-skin", "version": 1, "name": "Obsidian & Gold", "author": "Aria",
  "body": { "color": "#1b1b21", "edge": { "color": "#d4af37", "opacity": 0.6, "width": 1.2 }, "shading": 0.45, "resultHighlight": 0.12 },
  "ink": { "color": "#d4af37", "font": "ui", "weight": 700 },
  "dice": {
    "d20": { "body": { "color": "#3a0d12" } },
    "d4": { "body": { "color": "#0f2a24" } }
  }
}
```

## Prompt for another AI

Paste this, then add the user's request at the end:

> You design dice skins for Session Zero, a browser virtual tabletop. Reply with **one JSON object and nothing else**, following the "vtt-dice-skin" v1 format below. Rules:
> - Use `"format": "vtt-dice-skin"` and `"version": 1`, and give the skin a `name` of up to 40 characters.
> - Colours must be hex: `#rrggbb`, or `#rrggbbaa` for `shadow.color` only. No CSS, gradients, images or other colour syntax.
> - Keep every number within its range: `edge.opacity` 0–1, `edge.width` 0–3, `shading` 0–0.8, `resultHighlight` 0–0.3, `ink.weight` 400–800 in steps of 100, `ink.scale` 0.8–1.2.
> - `ink.font` is one of `"body"`, `"ui"`, `"mono"`.
> - Per-die overrides go under `dice` with keys `d4`, `d6`, `d8`, `d10`, `d12`, `d20`. Each holds a partial `body` and/or `ink`.
> - Before answering, check that `ink.color` against `body.color` has a WCAG contrast ratio of at least 4.5:1, for the base skin and for every override. If it doesn't, change the colours.
> - Leave out any field you don't need to change; missing fields keep the default look.
> - Don't add keys that aren't in the format.
>
> [Paste the "Skin format, v1" block and the JSON Schema here.]
>
> The user wants: …

## What the app needs to read skins

This is not built yet:

1. **A `DiceSkin` zod schema in `packages/shared`,** mirroring the JSON Schema plus the contrast check. Skins can come from users and other AIs, so they cross a trust boundary (CLAUDE.md: zod for anything crossing one). It's a new schema, so it needs no ADR by itself.
2. **Applying a skin:**
   - Map it onto the dice containers as CSS custom properties: `--die-body`, `--die-ink`, `--die-shadow`, plus new ones for the edge, the shade colour, the result highlight, the font and the weight.
   - Pass `shading` and `ink.scale` into `layoutDice`, which turns them into the `--shade` percentage and the numeral size.
   - Per-die overrides apply by die type.
   - Only the parsed skin is used, so no raw string reaches CSS.
3. **Choosing a skin for yourself:** a picker plus local storage is enough, since only your own screen changes.
4. **Letting other players see your dice:** the skin, or a skin id, has to reach other viewers, for example on the participant or on the roll. That changes existing shared schemas, so it needs an ADR and the Real-Time Architecture owner's review. It belongs with the sync work (the broadcast follow-up to throw-dice-on-board). Sharing a skin reveals nothing hidden, and GM-only rolls still ignore it (rule 6).

## Dice looks (image skins)

A **dice look** is a named set of pictures, one per die type. Your own public rolls are drawn in the look you pick: when they're thrown in the centre of the board, when you drop a die on the map, and on the die you drag. Die types without a picture keep the classic look, and GM-only rolls always keep the private slate look.

- **Make and edit looks** in the asset library's **Dice** tab (`/library?tab=dice`). This tab opens for players too, because looks involve no GM data.
- **Pick the look in use** in a room: Dice panel → **Dice look**. **Edit looks** opens the library in a new tab, and changes there show up in the open room at once.
- **Storage:** looks are kept in this browser (IndexedDB). Nobody else sees them yet; sharing them is part of the sync work.

### Making a look with an image AI

A look's editor shows its six dice as cards: a preview of the die in the look, its name, and a single **Edit** menu:
- **Copy template:** puts the die's template image on the clipboard, ready to paste into an image AI. If the browser won't copy images, the template is saved as a file instead.
- **Upload picture** (or **Replace picture**): a painted template, or any square picture, which then goes on every face.
- **Reset to classic:** only when the die has a picture.

For a few seconds after an action, a small note over the die's preview says what happened.

**Copy AI prompt**, next to the editor's Pictures heading, copies the one prompt for every die: give an image AI a die's template together with the prompt, or the prompt alone for one square picture that goes on every face of every die. The Dice tab works like the other library tabs: search by name, **New dice look**, and cards with **Use**, **Edit** and **Delete**.

### The templates

Every template is the same **1536 × 1024** canvas, which image AIs produce readily. Faces sit in a centred grid of square cells, numbered left to right, top to bottom, as on a standard die.

| Die | Grid | Cell | Face shape | File |
|---|---|---|---|---|
| d4 | 2 × 2 | 512 px | triangle, numbers at the corners | [d4-skin-template.png](dice-templates/d4-skin-template.png) |
| d6 | 3 × 2 | 512 px | square | [d6-skin-template.png](dice-templates/d6-skin-template.png) |
| d8 | 4 × 2 | 384 px | triangle | [d8-skin-template.png](dice-templates/d8-skin-template.png) |
| d10 | 5 × 2 | 300 px | kite | [d10-skin-template.png](dice-templates/d10-skin-template.png) |
| d12 | 4 × 3 | 340 px | pentagon | [d12-skin-template.png](dice-templates/d12-skin-template.png) |
| d20 | 5 × 4 | 256 px | triangle | [d20-skin-template.png](dice-templates/d20-skin-template.png) |

In each cell:
- The outlined shape is the face, drawn from the die's real geometry and centred in the cell. Everything around it is bleed: paint to the cell's edge, but only the outline shows.
- **Up** is the top of the cell, and the numbers are printed upright, except on the d4, whose three numbers turn toward its corners.
- The **dashed box** (or circles on the d4) is where the app prints the number, white with a dark outline, over your art. Keep it calm there.
- Anything outside the grid is ignored.

The templates are generated by `templateSvg` in `apps/web/src/ui/diceSkin.ts`, so **Copy template** always matches how the dice are drawn. The files in `docs/dice-templates/` are snapshots of them.

### What the app does with a picture

- It accepts PNG, JPEG or WebP up to 5 MB, either 3:2 (a painted template, at any size) or 1:1 (one picture for every face).
- It redraws the picture on a canvas at no more than 1536 × 1024 (512 × 512 for a square) and keeps plain pixels only.
- Each face shows its cell, clipped to its outline.
- The die's shading and the result-face highlight lie over the picture, so it still looks 3D.
- The app prints the numerals itself, over the art, so a look can't show a different number than the roll.

### Prompt for an image AI

**Copy AI prompt** copies this (`DICE_PROMPT` in `apps/web/src/ui/diceSkin.ts`). Each die's grid, numbering and outlines are in its template picture, so one prompt covers every die:

> Paint a skin for a die, for Session Zero, a virtual tabletop.
>
> **If a die template is attached** (a 1536 × 1024 sheet of cells, one outlined face per cell):
> - Output one PNG of exactly 1536 × 1024 px that keeps the template's layout exactly: the same grid of cells in the same places, one face per cell, in the template's order.
> - The outlined shape in each cell is the visible face. Paint the whole cell anyway, because everything around the outline is bleed. The top of each cell is the top of the face.
> - Keep the areas marked with dashed boxes (or dashed circles, on a d4) calm, with an even tone and no fine detail or hard edges: the app prints each face's number there, in white with a dark outline.
> - Make the faces one set: the same material, palette and style, with a different motif per face if you like. Don't rely on a pattern continuing from one cell into the next.
>
> **If no template is attached,** paint one seamless square texture, 1024 × 1024 px, which the app puts on every face of every die. Keep its centre calm, because each face's number goes there.
>
> **Either way, do not draw:**
> - any numbers, pips, letters, text or symbols meant to be read;
> - the template's guide lines, labels, arrows, circles or grey numbers;
> - shadows, perspective or a 3D die. Paint flat, lit evenly, seen straight on: the app adds the shading.
>
> **Style:** [describe it here].

For a frame around each face, ask the AI to keep the border inside the face outline. The bleed around it is cut off.
