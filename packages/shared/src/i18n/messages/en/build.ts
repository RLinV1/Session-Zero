/**
 * What the AI game builder's shared checks tell the build's owner (FR-GM-26, FR-GM-27, ADR 0055):
 * `checkBuild` and `creatureProblems` for the owner, the map setup problems `draftMapBoard` finds,
 * and why `draftEncounterToTemplate` or a publish refuses something. The English is exactly what
 * the page showed before these had ids; tests assert it, so edit it here only on purpose. The AI
 * reads its own English, written in `build.ts`, which never goes through this catalog.
 */
type Field = { field: string };
type Token = { token: string };
type Square = { column: number; row: number };

export const buildEn = {
  // The names the page gives the AI's field names, in a flag ("Max HP: two numbers on the sheet").
  "buildCheck.field.hp": "HP",
  "buildCheck.field.maxHp": "Max HP",
  "buildCheck.field.ac": "AC",
  "buildCheck.field.attacks": "Attacks",
  "buildCheck.field.conditions": "Conditions",
  "buildCheck.field.size": "Size",
  "buildCheck.field.name": "Name",
  "buildCheck.field.colour": "Colour",
  "buildCheck.field.art": "Art",
  "buildCheck.field.grid": "Grid",
  "buildCheck.field.square": "Square",
  "buildCheck.field.tokens": "Tokens",
  "buildCheck.field.squareSize": "Square size",
  "buildCheck.field.features": "Features",
  "buildCheck.field.notes": "Notes",

  // What a draft item is, as a publish problem names it ("map cave: …").
  "buildCheck.kind.creature": "creature",
  "buildCheck.kind.map": "map",
  "buildCheck.kind.encounter": "encounter",
  // What a drawn line is.
  "buildCheck.line.wall": "wall",
  "buildCheck.line.door": "door",
  "buildCheck.line.window": "window",

  /** The check's item for the game profile, which has no name of its own. */
  "buildCheck.gameProfile": "Game profile",
  /** A flag the AI left: the field, as the page names it, and the AI's words. */
  "buildCheck.flag": ({ field, message }: Field & { message: string }) => `${field}: ${message}`,
  "buildCheck.noProfile": "Your AI hasn't saved a game profile, so every field counts as in use. Ask it to save one if that's wrong.",
  "buildCheck.blankNoReason": ({ field }: Field) => `${field} is blank, and your AI didn't say why. Fill it in, or publish it blank.`,
  "buildCheck.artGone": "Its art isn't in this build any more.",

  // A map's grid.
  "buildCheck.noGrid": "It has no grid yet. Set the square size on the map below, then confirm it.",
  "buildCheck.gridWords": ({ cellSize, offsetX, offsetY }: { cellSize: number; offsetX: number; offsetY: number }) =>
    `${cellSize}-pixel squares at offset (${offsetX}, ${offsetY})`,
  "buildCheck.gridDiffers": ({ ai, detected }: { ai: string; detected: string }) =>
    `Your AI's grid (${ai}) differs from grid detection's (${detected}). Check the map below and confirm the right one.`,
  "buildCheck.gridWaiting": "Its grid is waiting for you. Check it on the map below, then confirm it.",
  "buildCheck.fileGone": "Its file isn't in this build any more.",

  // A map's walls, doors and windows.
  "buildCheck.openingLeft": ({ number, reason }: { number: number; reason: string }) => `Opening ${number} is left for you: ${reason}`,
  "buildCheck.markLeft": ({ column, row, reason }: Square & { reason: string }) => `Left for you at column ${column}, row ${row}: ${reason}`,
  /** `numbers` is the openings' numbers joined with ", ". */
  "buildCheck.openingsAsFile": ({ numbers }: { numbers: string }) =>
    `Openings still as the file has them: ${numbers}. Set them on the map below, or leave them hidden from players.`,
  "buildCheck.line": ({ number, kind, fromColumn, fromRow, toColumn, toRow }: { number: number; kind: string; fromColumn: number; fromRow: number; toColumn: number; toRow: number }) =>
    `Line ${number} (a ${kind} from column ${fromColumn}, row ${fromRow} to column ${toColumn}, row ${toRow})`,
  "buildCheck.blockedLine": ({ line }: { line: string }) =>
    `${line} sits on a wall it doesn't cut, so the wall still blocks it. Remove the line below, or fix it in the map editor after publishing.`,
  "buildCheck.noSuchOpening": ({ number, count }: { number: number; count: number }) =>
    `Opening ${number} isn't on this map. It has ${count === 1 ? "1 opening" : `${count} openings`}.`,
  "buildCheck.linesNeedGrid": "Drawing lines needs a grid first. Set the map's grid first.",
  "buildCheck.marksNeedGrid": "Marking places needs a grid first. Set the map's grid first.",
  "buildCheck.cornerOff": ({ line }: { line: string }) => `${line} has a corner off the map.`,
  "buildCheck.markOff": ({ number, column, row }: Square & { number: number }) => `Mark ${number} (column ${column}, row ${row}) is off the map.`,
  "buildCheck.tooManyWalls": ({ count, max }: { count: number; max: number }) => `This map would have ${count} walls. A map can hold at most ${max}.`,
  "libraryBoard.fogOffMap": "Fog must lie on the map.",

  // An encounter.
  "buildCheck.unknownMap": ({ map }: { map: string }) => `It names map "${map}", which isn't in this build.`,
  "buildCheck.unknownCreature": ({ number, creature }: { number: number; creature: string }) =>
    `Token ${number} names creature "${creature}", which isn't in this build.`,
  "buildCheck.noSquare": ({ token }: Token) => `${token} has no square yet. Place it in the encounter's editor, or remove it.`,
  "buildCheck.offMap": ({ token }: Token) => `${token} is off the map.`,

  // Why an encounter can't become a template, one token at a time ("Goblin 2: Its square is off the map.").
  "buildCheck.tokenProblem": ({ token, problem }: Token & { problem: string }) => `${token}: ${problem}`,
  "buildCheck.thisEncounter": "This encounter",
  "buildCheck.noCreatureWithKey": "This build has no creature with that key.",
  "buildCheck.tokenNoSquare": "It has no square yet. Place it or remove it.",
  "buildCheck.squareOffMap": "Its square is off the map.",
  "buildCheck.acrossWall": "It would stand across a wall. Move it or remove it.",
  "buildCheck.hpOverMax": "Its HP is more than its Max HP.",

  // Why a publish is refused, item by item ("encounter ambush: …").
  "buildCheck.publishProblem": ({ kind, key, problem }: { kind: string; key: string; problem: string }) => `${kind} ${key}: ${problem}`,
  "buildCheck.notInBuild": "It isn't in this build.",
  "buildCheck.fileDeleted": "Its file was published and then deleted from the library.",
  "buildCheck.publishedThenDeleted": "It was published and then deleted from the library.",
  "buildCheck.drawnWallsNeedGrid": "Its drawn walls need a confirmed grid first.",
  "buildCheck.mapNeedsGrid": ({ map }: { map: string }) => `Its map "${map}" needs a confirmed grid first.`,
} as const;
