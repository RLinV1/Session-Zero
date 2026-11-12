import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
/** A migrated file: the guard applies to it (eslint.config.js `LOCALIZED_FILES`). */
const migrated = path.join(root, "apps/web/src/ui/SettingsMenu.tsx");

async function restricted(code: string) {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText(code, { filePath: migrated });
  return result!.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.line);
}

describe("lint keeps text in the catalogs (localization)", () => {
  it("leaves out only the AI builder's screens, which are not translated yet", async () => {
    const config = readFileSync(path.join(root, "eslint.config.js"), "utf8");
    expect(config.match(/^export const NOT_YET_LOCALIZED = (.*);$/m)?.[1]).toBe("['apps/web/src/pages/build/**']");
    const eslint = new ESLint({ cwd: root });
    const code = `export const A = () => <button type="button">Save</button>;\n`;
    const [inBuild] = await eslint.lintText(code, { filePath: path.join(root, "apps/web/src/pages/build/BuildPage.tsx") });
    expect(inBuild!.messages.filter((m) => m.ruleId === "no-restricted-syntax")).toEqual([]);
  });

  it("fails on a literal label in a migrated component", async () => {
    expect(await restricted(`export const A = () => <button type="button">Save</button>;\n`)).toEqual([1]);
  });

  it("fails on literal accessible names, tooltips, placeholders and alt text", async () => {
    const code = [
      `export const A = () => <button type="button" aria-label="Close" />;`,
      `export const B = () => <input title={"Search tokens"} />;`,
      `export const C = ({ n }: { n: number }) => <input placeholder={\`Room \${n}\`} />;`,
      `export const D = () => <img alt="Map preview" src="x.png" />;`,
    ].join("\n");
    expect(await restricted(code)).toEqual([1, 2, 3, 4]);
  });

  it("fails on words a child expression renders: conditionals, && and templates", async () => {
    const code = [
      `export const A = ({ n }: { n: number }) => <span>{n === 1 ? "token" : "tokens"}</span>;`,
      `export const B = ({ busy }: { busy: boolean }) => <span>{busy && "Saving"}</span>;`,
      `export const C = ({ n }: { n: number }) => <span>{\`\${n} rolls\`}</span>;`,
      `export const D = ({ on }: { on: boolean }) => <div className={on ? "is-on" : "is-off"} />;`,
    ].join("\n");
    expect(await restricted(code)).toEqual([1, 1, 2, 3]);
  });

  it("accepts text from t(), numbers and punctuation", async () => {
    const code = [
      `declare const t: (k: string) => string;`,
      `export const A = ({ n }: { n: number }) => <button type="button" aria-label={t("common.done")}>{t("common.done")} {n}% · ✓</button>;`,
    ].join("\n");
    expect(await restricted(code)).toEqual([]);
  });
}, 60_000);
