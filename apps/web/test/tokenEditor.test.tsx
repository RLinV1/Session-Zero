import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Token } from "@vtt/shared";
import { TokenEditor } from "../src/panels/TokenRoster";

const token: Token = {
  id: "t1",
  name: "Goblin King",
  position: { x: 2889.8, y: 539.2 },
  size: 2,
  rotation: 0,
  color: "#b5543a",
  imageUrl: null,
  assetId: null,
  ownerIds: [],
  hidden: false,
  stats: { hp: 7, maxHp: 7, ac: 15 },
  conditions: ["prone", "poisoned"],
};

function render(isGm: boolean, overrides: Partial<Token> = {}) {
  return renderToStaticMarkup(
    <TokenEditor
      token={{ ...token, ...overrides }}
      roomToken="room"
      isGm={isGm}
      players={[]}
      departedOwner={null}
      error={null}
      onSave={async () => {}}
      onDelete={() => {}}
    />,
  );
}

/** Each collapsible section: its header text, whether it starts open, and its body markup. */
function sections(html: string) {
  return [...html.matchAll(/<details([^>]*)><summary>(.*?)<\/summary>(.*?)<\/details>/g)].map(([, attrs, summary, body]) => ({
    title: summary!.replace(/<span.*$/, "").replace(/&amp;/g, "&").trim(),
    summary: summary!.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim(),
    open: /\bopen\b/.test(attrs!),
    body: body!,
  }));
}

/** Markup outside every collapsible section, i.e. what is always visible. */
const alwaysVisible = (html: string) => html.replace(/<details.*?<\/details>/g, "");

describe("condensed token editor (condense-token-editor)", () => {
  it("opens with every section closed", () => {
    const found = sections(render(true));
    expect(found.map((s) => s.title)).toEqual(["Conditions", "Attacks", "Control & visibility", "Advanced"]);
    expect(found.every((s) => !s.open)).toBe(true);
  });

  it("keeps name and HP/Max/AC always visible", () => {
    const visible = alwaysVisible(render(true));
    for (const label of ["Name", "HP", "Max", "AC"]) expect(visible).toContain(`${label}<input`);
  });

  it("puts board X, board Y, size, rotation and the image in Advanced only", () => {
    const html = render(true, { imageUrl: "/uploads/art.png" });
    const advanced = sections(html).find((s) => s.title === "Advanced")!;
    for (const label of ["Board X", "Board Y", "Size (cells)", "Rotation (°)"]) expect(advanced.body).toContain(`${label}<input`);
    expect(advanced.body).toContain("Remove image");
    expect(advanced.body).toContain("Replace image");
    const elsewhere = html.replace(advanced.body, "");
    for (const label of ["Board X", "Size (cells)", "Rotation (°)", "Remove image"]) expect(elsewhere).not.toContain(label);
  });

  it("summarises closed sections in their headers", () => {
    const found = sections(render(true, { hidden: true }));
    expect(found.find((s) => s.title === "Conditions")!.summary).toBe("Conditions 2");
    expect(found.find((s) => s.title === "Control & visibility")!.summary).toBe("Control & visibility GM only · hidden");
    expect(found.find((s) => s.title === "Advanced")!.summary).toBe("Advanced 2 cells · 0° · no image");
  });

  it("shows a player (an owner) only stats and closed Conditions and Attacks sections (shared-token-attacks)", () => {
    const html = render(false);
    expect(sections(html).map((s) => s.title)).toEqual(["Conditions", "Attacks"]);
    for (const label of ["Name<input", "Board X", "Controlled by", "Remove image", "Upload image"]) expect(html).not.toContain(label);
  });
});

describe("the owner's token editor (FR-PL-04, WCAG 2.5.7)", () => {
  it("offers one-square Move steps when given a move, for the keyboard path from the roster", () => {
    const html = renderToStaticMarkup(
      <TokenEditor
        token={token}
        roomToken="room"
        isGm={false}
        players={[]}
        departedOwner={null}
        error={null}
        move={{ step: 70, onMove: async () => {} }}
        onSave={async () => {}}
        onDelete={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Move Goblin King"');
    expect(html).toContain('aria-label="Move Goblin King down one square"');
  });

  it("offers none without one", () => {
    expect(render(false)).not.toContain('aria-label="Move Goblin King"');
  });
});
