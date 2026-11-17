import type { Locale } from "@vtt/shared";
import { serverZhTW } from "./zh-TW";
import { localizeText } from "./localize";

/** Only deterministic validation copy is translated. Source flags remain the author's text. */
export function studioIssueText(locale: Locale, kind: "problem" | "uncertain", message: string): string {
  if (locale === "en" || kind === "uncertain") return message;
  const known = localizeText(locale, message);
  if (known !== message) return known;
  const rules: readonly [RegExp, keyof typeof serverZhTW][] = [
    [/^Your AI hasn't saved a game profile,/, "studio.issue.profile"],
    [/^It has no grid yet\./, "studio.issue.gridMissing"],
    [/^Its grid is waiting for you\./, "studio.issue.gridWaiting"],
    [/^Your AI's grid \((.+)\) differs from grid detection's \((.+)\)\./, "studio.issue.gridDiffers"],
    [/^Its art isn't in this build any more\.$/, "studio.issue.artMissing"],
    [/^Its file isn't in this build any more\.$/, "studio.issue.fileMissing"],
    [/^(?:Its terrain needs a grid\.|Terrain needs a grid first\.)/, "studio.issue.terrainGrid"],
    [/^Your AI proposed its terrain on (.+), and the grid is now (.+)\. Clear/, "studio.issue.terrainStale"],
    [/^Openings still as the file has them: (.+)\. Set/, "studio.issue.openings"],
    [/^(.+) sits on a wall it doesn't cut,/, "studio.issue.blockedOpening"],
    [/^It names map "(.+)", which isn't in this build\.$/, "studio.issue.mapMissing"],
    [/^Token (\d+) names creature "(.+)", which isn't in this build\.$/, "studio.issue.creatureMissing"],
    [/^(.+) has no square yet\./, "studio.issue.unplaced"],
    [/^(.+) is off the map\.$/, "studio.issue.offMap"],
    [/^(.+) at column (-?\d+), row (-?\d+) stands on Blocked terrain,/, "studio.issue.blockedToken"],
    [/^(HP|Max HP|AC) is blank, and your AI didn't say why\./, "studio.issue.blankValue"],
    [/^(?:Drawing lines|Marking places) needs a grid first\./, "studio.issue.geometryGrid"],
    [/^(.+) has a corner off the map\.$/, "studio.issue.offMap"],
    [/^Mark (\d+) \(column (\d+), row (\d+)\) is off the map\.$/, "studio.issue.markOffMap"],
    [/^Opening (\d+) isn't on this map\./, "studio.issue.openingMissing"],
    [/^This map would have (\d+) walls\./, "studio.issue.tooManyWalls"],
    [/^Terrain run (\d+) .+ has a square off the map\./, "studio.issue.terrainOffMap"],
    [/^(\d+) more terrain runs have squares off the map\./, "studio.issue.moreTerrainOffMap"],
  ];
  for (const [pattern, key] of rules) {
    const match = pattern.exec(message); if (!match) continue;
    const numericDescriptor = key === "studio.issue.gridDiffers" || key === "studio.issue.terrainStale" || key === "studio.issue.blockedOpening";
    return serverZhTW[key].replace(/\{(\d+)\}/g, (_token, index: string) => numericDescriptor ? describe(match[Number(index)] ?? "") : match[Number(index)] ?? "");
  }
  return serverZhTW["studio.issue.review"];
}

/** Descriptors contain native coordinates, not translated user content. */
function describe(text: string): string {
  return text.replace(/([\d.]+)-pixel squares at offset \(([^)]+)\)/g, "每格 $1 像素，偏移量（$2）")
    .replace(/^(Wall|Door|Window) (\d+) \((.+)\)$/, (_all, kind: string, number: string, coords: string) => `${kind === "Wall" ? "牆" : kind === "Door" ? "門" : "窗"} ${number}（${coords}）`);
}
