# Home page images

The home page's maps and tokens were drawn for it, not taken from the asset library. Each scene has
its own theme and drawing style, and its tokens are drawn in that same style so map and tokens
belong together. The only library art on the page is the attack tile's animation stage
(`public/img/preview`). Pictures of the product are captures of the real app.

Generated with ChatGPT image generation on 2026-11-01, one chat per scene: the map first, then its
tokens in the same chat ("in exactly the same style as this map"). Sources are in
`apps/web/scripts/home-src/` (WebP, 1536 × 1024). `npm run maps:home -w @vtt/web` cuts the
crops and thumbnails from them using `src/pages/home/homeCrops.json`. The walls on the tomb, the
quay and the inn are traced by hand in `src/pages/home/homeWalls.ts`.

Every map prompt shares these requirements: top-down with no perspective; a thin faint square grid,
"exactly 24 squares wide and 16 squares tall"; walls, doorways and furniture on the grid; open floor;
no creatures or people, text, labels, frame, vignette or glow. The drawn grids came out close to,
not exactly, that size. Each one's measured cell and offset are in `homeCrops.json`.

| Crop | Scene, section | Style | Prompt (scene and style) |
| --- | --- | --- | --- |
| `canal-market.webp` | Canal-side night market at dusk; the hero | Pen and ink with watercolour washes | "a canal-side night market in an old harbour town at dusk… a stone quay along a dark canal crossed by an arched stone footbridge; market stalls with cloth awnings, crates, barrels and lantern posts; the back walls of two narrow brick houses with doorways… pen-and-ink linework with loose watercolour washes on cold-press paper, like a hand-painted map in a printed adventure module. Muted harbour palette (slate blue, brick red, ochre lantern light), visible paper grain, slightly uneven hand-drawn lines." |
| `sun-tomb.webp` | Sandstone tomb; line of sight, and the phone capture | Flat gouache, limited palette | "the inside of a sandstone desert tomb. A long burial hall with two rows of square pillars and a sarcophagus on a low dais; a separate small side chamber reached through a single one-square doorway, holding urns; an entrance stair and a collapsed passage… flat gouache illustration with a limited palette (warm sand, terracotta, deep teal, charcoal walls), crisp painted shapes, a mid-century picture-book feel." The first result was too flat, so it was repainted with the same layout: "sandstone slabs with chips, cracks, drifted sand and footprints; carved pillar tops; a faded frieze of abstract patterns; offering bowls and bones; rough carved bedrock with chisel marks outside the walls… visible brush texture and slightly imperfect hand-painted lines." |
| `forge-hall.webp` | Dwarven forge hall; the grid demo | Graphite and coloured pencil on toned paper | "a dwarven forge hall cut into the mountain. The floor is laid in large square flagstones, one per grid square, so the floor itself shows the squares. A long forge with two hearths and an anvil, a quench trough, tool racks, a cart track, support columns… graphite and coloured pencil on warm grey toned paper, hand-drawn hatching, a few touches of orange for the fire, like a page from an illustrator's sketchbook." |
| `moor-inn.webp` | Coaching inn ground floor; the walls panel | Technical-pen floor plan with flat watercolour | "the ground floor of a timber-framed coaching inn… a common room with long tables and a hearth, a kitchen, a corridor, two guest rooms, a stable yard. Every room has clearly drawn wooden doors (some open, one barred) and real windows set into the outer walls… confident black ink linework with a technical pen, flat muted watercolour fills (oak brown, slate floor, moss green outside)." |
| `goblin-camp.webp` | Goblin raiders in a ruined watchtower; the area-template tile | Four-ink linocut print | "a goblin raiding camp inside the ruins of a stone watchtower in a pine forest. Tumbled wall sections and rubble that break the ground into areas, the collapsed base of the tower with a ladder, a wolf pen, two hanging cages, a cooking fire with a cauldron, a loot pile, a cart with a broken wheel, tents between the ruins, a stream with stepping stones… lanes and pockets of open ground two to four squares wide… a hand-carved linocut in four inks (deep green, rust red, ochre, black) on off-white paper, bold carved lines and gouge marks, slight misregistration." An earlier camp around one big empty clearing was turned down for having nothing in it. |
| `merchant-deck.webp` | Merchant ship's deck at anchor; the undo demo | Two-colour risograph | "the main deck of a three-masted merchant ship at anchor in a calm grey-green sea… planked deck with two mast bases, a cargo hatch, coiled ropes, a ship's wheel on a raised quarterdeck, cannons along the rails, barrels and crates… a two-colour risograph print in teal and coral pink plus black, halftone dots and grain, slightly off-register layers, bold confident outlines, like an indie zine illustration." |

## Tokens (`tokens/`)

Each sheet was asked for in its map's chat: "in exactly the same … style, palette and paper
texture as this map", as front-facing head-and-shoulders portraits on plain paper with gaps
between them, and no borders, circles or text. Each portrait was cut to a 192 × 192 square around
the face for the board's round token.

| Files | Sheet | Characters |
| --- | --- | --- |
| `canal-*.webp` | Ink and watercolour | Brenna (hooded ranger with a lantern), Toma (halfling dock-hand rogue), Ash (tiefling apothecary) |
| `tomb-*.webp` | Gouache | Nalani (explorer with a torch), Kaveh (guide with a striped cloak), the jackal-headed tomb guardian |
| `camp-*.webp` | Linocut | Mara (warrior with a round shield), Pell (gnome hedge-wizard), the goblin boss, a goblin, a goblin archer, a wolf |
| `ship-*.webp` | Risograph | Sela (the captain), Dunn (the bosun), a cutthroat |

## Captures of the real app

| File | What it is | How it was made |
| --- | --- | --- |
| `player-phone.webp` | A player's board on a phone, 600 × 1298 | The Sun Tomb uploaded to a dev account's library on the isolated dev server and set in a room, with the walls from `homeWalls.ts`, line of sight on and a 30 ft sight range. A guest joined at 390 × 844 (2× pixels) as Nalani, and the board was panned and zoomed toward Nalani's token. The hidden guardian in the side chamber is not in the player's view, as at the table. |
| `attack-still.webp` | The attack tile's still, 960 × 602 | The home page's own attack tile (the animation editor's preview stage) playing Fireball, captured 550 ms in at 2× pixels. Shown instead of the live stage under reduced motion. |

The `*-thumb.webp` files for `broken-span`, `hollowfrost-keep`, `temple-green-sun` and
`sunken-crypt` are the library's thumbnails of its built-in maps (`net/builtinAssets.ts`). The
home page doesn't use them.

Retake a capture whenever the room or the preview stage changes how it looks.
