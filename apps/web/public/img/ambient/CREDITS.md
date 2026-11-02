# Ambient imagery

The pictures behind the home, entry and empty-state surfaces (design-language: "Imagery is real
or atmospheric"). They are atmosphere only: no picture here shows the product. Anything that
shows the app is the real app, running or captured.

All of them are generated for this project with ChatGPT's built-in image generation, from the
brief and prompts below, then converted with `npm run images:ambient -w @vtt/web`. They are
generated illustrations, not works attributed to a human artist, and reuse no other artwork.

## How to add or replace one

1. Generate it from its prompt below, with the shared lighting brief pasted first.
2. Check it against the review list at the end of this file.
3. Save the download, at full size, as `apps/web/scripts/ambient-src/<name>.png` (or `.jpg`).
   That folder is not committed.
4. Run `npm run images:ambient -w @vtt/web`. It writes `<name>.webp` here, plus the blurred
   entry variants, and fails if any file is over its size budget.
5. Commit the `.webp` files and update this list if a prompt changed.

## The shared lighting brief

Every prompt starts with this paragraph, word for word, so every image reads as the same room:

> Photographic. One warm tungsten lamp from the upper right, deep slate-blue shadows, low
> saturation, walnut wood and dark slate stone, shallow depth of field. No text, screens,
> paper, interface or logos.

## The images

| File | Size | Budget | Used by |
| --- | --- | --- | --- |
| `table-dark.webp` | 2560×1440 (16:9) | 300 KB | Home hero backdrop, dark theme |
| `table-light.webp` | 2560×1440 (16:9) | 300 KB | Home hero backdrop, light theme |
| `table-dark-blur.webp`, `table-light-blur.webp` | 1280×720, blurred | 300 KB | Entry pages (sign in, sign up, join, not found), written by the script |
| `closing.webp` | 2400×1000 | 300 KB | Home closing band |
| `empty-rooms.webp` | 800×600 | 80 KB | Dashboard with no rooms |
| `empty-library.webp` | 800×600 | 80 KB | A library tab with nothing in it |
| `empty-map.webp` | 800×600 | 80 KB | A room with no map |
| `wood-tile.webp` | 1024×1024, seamless | 120 KB | The faint table texture under the home ground |

Sizes are the largest the script keeps; it never enlarges a smaller download.

### `table-dark` (16:9, wide)

> [brief] A top-down photograph of a walnut gaming table at night in a dark room. Resin
> polyhedral dice and a few painted miniatures sit out of focus along the right and bottom
> edges. The lamp pools light on the upper right; the rest of the table falls off to near
> black at the edges. The left 45% of the frame is empty, dark wood with no objects, as quiet
> space for a headline. Wide 16:9 composition.

### `table-light` (16:9, wide)

> [brief, with the lamp line replaced by: "Cool daylight from a window at the upper left."]
> The same tabletop as `table-dark`, by day, on pale grey slate instead of walnut. Resin dice
> and painted miniatures out of focus along the right and bottom edges. The left 45% of the
> frame is empty stone with no objects. Soft, even, cool light; no warm cast. Wide 16:9
> composition.

### `closing` (wide, about 12:5)

> [brief] Eye-level close-up of a hand releasing two dice above a vinyl battle mat printed with
> fantasy terrain, lying on the table, dice caught mid-air with slight motion blur. Shallow depth
> of field, the mat soft behind. The left third of the frame is dark and empty, for a headline. Very wide
> panoramic composition.

### `empty-rooms` (4:3)

> [brief] A closed leather map case and a small stack of rolled battle maps on the table, lit
> by the lamp, with plenty of dark empty table around them. Centred, calm, nothing open yet.

### `empty-library` (4:3)

> [brief] A single resin twenty-sided die alone on an empty stretch of the table, catching the
> lamp light, with a long soft shadow. Centred, lots of empty dark wood around it.

### `empty-map` (4:3)

> [brief] Top-down view of a blank, unprinted battle mat with a faint square grid, lying on the
> table, with one painted miniature standing on it at the centre. The mat is otherwise empty.

### `wood-tile` (1:1, seamless)

> [brief, without the lamp: "Even, flat, low light."] A seamless, tileable texture of dark
> stained walnut grain, very low contrast, no knots, no seams, no lighting gradient, so it can
> repeat across a page without a visible edge.

## Review list

Before an image is committed, check every point:

- It follows the brief: one warm light from the upper right (daylight from the upper left for
  `table-light`), slate-blue shadows, low saturation, walnut and slate.
- It contains **no** text, letters, numbers, screens, devices, paper, interface or logos. A
  die's pips or numerals are fine; a vinyl battle mat may show terrain but no labels.
- The empty space a prompt asks for is really empty, so a headline over it stays readable.
- Nothing in it looks like the app's interface; the product is shown only by the real app.
- Hands and dice look physically right (count the fingers; dice are regular polyhedra).
