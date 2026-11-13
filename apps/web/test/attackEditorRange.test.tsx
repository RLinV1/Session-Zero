// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnimationDef, AttackPreset } from "@vtt/shared";
import { PresetEditor } from "../src/panels/AttackPanel";
import { AttackEditorContext } from "../src/panels/attackEditorContext";
import { SHAPE_DEFAULTS } from "../src/board/effectPresets";
import { chooseLocale } from "../src/i18n/locale";

/** What the preview stage was last asked to show. */
const stage = vi.hoisted(() => ({ props: [] as { def: AnimationDef; autoPlay?: boolean; reducedMotion?: boolean }[] }));
vi.mock("../src/ui/AnimationPreviewStage", () => ({
  AnimationPreviewStage: (props: { def: AnimationDef; autoPlay?: boolean; reducedMotion?: boolean }) => {
    stage.props.push(props);
    return <div data-testid="stage" data-shape={props.def.shape} data-reduced={String(!!props.reducedMotion)} />;
  },
}));
const fireBlade: AnimationDef = { ...SHAPE_DEFAULTS.slash, primary: "#ff2200" };
vi.mock("../src/panels/useLibraryAnimations", () => ({
  useStrikeAnimations: () => [{ id: "lib-1", name: "Fire blade", def: { ...SHAPE_DEFAULTS.slash, primary: "#ff2200" } }],
}));

beforeEach(() => {
  stage.props.length = 0;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(async () => { cleanup(); await chooseLocale("en"); });

const d20 = { terms: [{ count: 1, sides: 20 }], modifier: 5 };

function editor(initial: AttackPreset | null = null, env = { unitsPerCell: 5, unitLabel: "ft", reducedEffects: false }) {
  const save = vi.fn();
  render(
    <AttackEditorContext.Provider value={env}>
      <PresetEditor initial={initial} taken={[]} onSave={save} onCancel={() => {}} />
    </AttackEditorContext.Provider>,
  );
  if (!initial) fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Longbow" } });
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
  return { save, submit, saved: () => save.mock.calls[0]?.[0] as AttackPreset | undefined };
}
const shownShape = async () => (await screen.findByTestId("stage")).getAttribute("data-shape");

describe("a named attack's Range in the attack editor (attack-range)", () => {
  it("offers Unlimited, Melee and Ranged, saving Unlimited as no range", () => {
    const { submit, saved } = editor();
    expect((screen.getByRole("radio", { name: "Unlimited" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("radio", { name: "Melee" })).toBeTruthy();
    submit();
    expect(saved()).not.toHaveProperty("range");
  });

  it("saves a ranged distance as typed, after the room's unit label", () => {
    const { submit, saved } = editor();
    fireEvent.click(screen.getByRole("radio", { name: "Ranged" }));
    expect(screen.getByLabelText("Distance").parentElement!.textContent).toContain("ft");
    fireEvent.change(screen.getByLabelText("Distance"), { target: { value: "80" } });
    submit();
    expect(saved()?.range).toEqual({ kind: "ranged", distance: 80 });
  });

  it("pre-fills Reach with one square and saves that as one square on any map", () => {
    const { submit, saved } = editor(null, { unitsPerCell: 1.5, unitLabel: "m", reducedEffects: false });
    fireEvent.click(screen.getByRole("radio", { name: "Melee" }));
    expect((screen.getByLabelText("Reach") as HTMLInputElement).value).toBe("1.5");
    expect(screen.getByLabelText("Reach").parentElement!.textContent).toContain("m");
    submit();
    expect(saved()?.range).toEqual({ kind: "melee" });
  });

  it("saves a longer reach as typed", () => {
    const { submit, saved } = editor();
    fireEvent.click(screen.getByRole("radio", { name: "Melee" }));
    fireEvent.change(screen.getByLabelText("Reach"), { target: { value: "10" } });
    submit();
    expect(saved()?.range).toEqual({ kind: "melee", reach: 10 });
  });

  it("opens an attack with its saved range", () => {
    editor({ name: "Glaive", toHit: d20, damage: null, range: { kind: "melee", reach: 10 } });
    expect((screen.getByRole("radio", { name: "Melee" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Reach") as HTMLInputElement).value).toBe("10");
  });

  it.each([["0"], [""], ["10000"]])("refuses a distance of %j without saving", (value) => {
    const { submit, save } = editor();
    fireEvent.click(screen.getByRole("radio", { name: "Ranged" }));
    fireEvent.change(screen.getByLabelText("Distance"), { target: { value } });
    submit();
    expect(screen.getByRole("alert").textContent).toMatch(/greater than 0 and at most 9999/);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("previewing an attack's animation (attack-rolls, attack-range)", () => {
  it("shows what Automatic plays for the Range choice, and follows it", async () => {
    editor();
    expect(await shownShape()).toBe("arrow");
    fireEvent.click(screen.getByRole("radio", { name: "Melee" }));
    await waitFor(() => expect(screen.getByTestId("stage").getAttribute("data-shape")).toBe("slash"));
    fireEvent.click(screen.getByRole("radio", { name: "Ranged" }));
    await waitFor(() => expect(screen.getByTestId("stage").getAttribute("data-shape")).toBe("arrow"));
    expect(stage.props.every((p) => p.autoPlay)).toBe(true);
  });

  it("shows the animation chosen in the picker", async () => {
    editor();
    await shownShape();
    fireEvent.click(screen.getByRole("button", { name: "Attack animation" }));
    fireEvent.click(screen.getByRole("button", { name: "Pierce" }));
    await waitFor(() => expect(screen.getByTestId("stage").getAttribute("data-shape")).toBe("pierce"));
  });

  it("shows the still version when the room has animations turned down", async () => {
    editor(null, { unitsPerCell: 5, unitLabel: "ft", reducedEffects: true });
    expect((await screen.findByTestId("stage")).getAttribute("data-reduced")).toBe("true");
  });
});

describe("labels in the Animation picker (attack-rolls)", () => {
  it("is labelled as the attack's animation, with Automatic chosen to start", () => {
    editor();
    expect(screen.getByText("Attack animation", { selector: ".field-label" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attack animation" }).textContent).toBe("Automatic");
  });

  const options = (names = { button: "Attack animation", list: "Animations" }) => {
    fireEvent.click(screen.getByRole("button", { name: names.button }));
    const list = screen.getByRole("group", { name: names.list });
    return within(list).getAllByRole("button").map((b) => b.textContent);
  };

  it("tags only the GM's own animations, with (custom)", () => {
    editor();
    const labels = options();
    expect(labels).toContain("Automatic");
    expect(labels).toContain("Melee slash");
    expect(labels).toContain("Arrow");
    expect(labels).toContain("Fire blade (custom)");
    expect(labels.join("|")).not.toMatch(/\((preset|yours|animation)\)/);
  });

  it("tags a saved copy no longer in the library as custom", () => {
    editor({ name: "Old", toHit: d20, damage: null, animation: { ...fireBlade, primary: "#123456" } });
    expect(options()).toContain("Saved animation (custom)");
  });

  it("shows the names and the tag in zh-TW", async () => {
    await chooseLocale("zh-TW");
    editor({ name: "Old", toHit: d20, damage: null });
    const labels = options({ button: "攻擊動畫", list: "動畫" });
    expect(labels).toContain("自動");
    expect(labels).toContain("單箭");
    expect(labels).toContain("Fire blade (自訂)");
  });
});
