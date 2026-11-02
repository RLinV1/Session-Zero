# Condition icons

One painted icon per condition (FR-TAC-07, FR-TAC-08), named by its `ConditionId`: `blinded`,
`charmed`, `frightened`, `grappled`, `invisible`, `paralyzed`, `poisoned`, `prone`, `restrained`,
`stunned`, `unconscious` and `concentrating`. The panels' markers (`src/panels/ConditionMarker.tsx`)
and the board's (`drawConditions` in `src/board/boardView.ts`) both draw them. Each icon is its own
picture, so two conditions are told apart without colour. Until an icon has loaded on the board,
or if it fails to, the token shows that condition's shape and abbreviation from
`packages/shared/src/conditions.ts` instead.

All twelve were generated for this project with ChatGPT's built-in image generation on 2026-11-01,
as one 1536 × 1024 sheet in a 4 × 3 grid on a transparent background, so they share one style. They
are generated illustrations, not works attributed to a human artist.

The set took three sheets in one chat, each with the same grid, order and colours. A first sheet
in a flat, inked cartoon style was turned down for a realistic one; the realistic one was then
pared back with "make them simple and stylish", and that third sheet is the one used. The
realistic sheet's prompt, which the third kept the subjects of:

> Redo the same 12 icons in the same 4 x 3 grid, same order and same subjects, but in a cool,
> realistic style, like premium dark-fantasy RPG ability/status icons. Realistic materials,
> textures and dramatic lighting … Every icon must keep one strong, clear, instantly recognizable
> silhouette with high contrast so it still reads when shrunk to 24 pixels on a dark background:
> subject large and filling its cell, a subtle dark edge around each subject, keep each icon's main
> colour dominant. Fully transparent background … No text, letters, numbers, frames, borders, round
> badges, background tiles or drop shadows.

| Icon | Subject |
| --- | --- |
| `blinded` | A grey eye under a cloth blindfold |
| `charmed` | A faceted pink crystal heart with sparkles |
| `frightened` | A wailing violet ghost |
| `grappled` | A clenched steel gauntlet, teal-tinted |
| `invisible` | A pale, glassy head-and-shoulders figure |
| `paralyzed` | An amber lightning bolt |
| `poisoned` | A corked flask of green venom with a wisp of vapour |
| `prone` | A figure in an orange cloak lying flat |
| `restrained` | A loop of violet iron chain |
| `stunned` | Three gold stars on a swirling ring |
| `unconscious` | A red crescent moon with a closed sleeping eye |
| `concentrating` | A blue gem inside a ringed sigil |

Each icon was cut from the sheet in the ChatGPT page: the sheet's opaque pixels were grouped into
the twelve separate pictures (a sheet's grid cell doesn't hold each one whole: the flask's vapour
and the lying figure cross the lines), each picture was centred in a square 4% larger than its
longer side, with only its own pixels, and saved as a 192 × 192 WebP with its transparency.
