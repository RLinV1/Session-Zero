import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_TOOL_OPTIONS, ToolRail, toolFor, type ToolOptions } from "../src/ui/ToolRail";
import type { BoardTool } from "../src/board/tools";

const render = (isGm: boolean, active: BoardTool["kind"] = "select", options: ToolOptions = DEFAULT_TOOL_OPTIONS) =>
  renderToStaticMarkup(
    <ToolRail active={active} options={options} isGm={isGm} onSelect={() => {}} onOptions={() => {}} onClear={() => {}} />,
  );

describe("board Fog tool on the tool rail (FR-GM-17)", () => {
  it("gives the GM a Fog button", () => {
    expect(render(true)).toContain('title="Fog"');
  });

  it("never shows players a Fog button, not even a disabled one", () => {
    expect(render(false)).not.toContain('title="Fog"');
  });

  it("offers Rectangle, Polygon and Reveal while the GM's Fog tool is active", () => {
    const html = render(true, "fog");
    expect(html).toContain('aria-label="Fog options"');
    for (const label of ["Fog rectangle", "Fog polygon", "Reveal (remove fog)"]) expect(html).toContain(label);
  });

  it("starts in Rectangle mode and keeps the chosen mode", () => {
    expect(toolFor("fog", DEFAULT_TOOL_OPTIONS)).toEqual({ kind: "fog", mode: "rect" });
    expect(toolFor("fog", { ...DEFAULT_TOOL_OPTIONS, fog: { mode: "reveal" } })).toEqual({ kind: "fog", mode: "reveal" });
  });
});

describe("the Area tool's options (FR-TAC-06, ADR 0058)", () => {
  it("offers shape, colour and, for lines, width, but no size", () => {
    const html = render(false, "area");
    expect(html).not.toContain("<select");
    expect(render(false, "area", { ...DEFAULT_TOOL_OPTIONS, area: { ...DEFAULT_TOOL_OPTIONS.area, shape: "line" } })).toContain('type="number"');
  });
});
