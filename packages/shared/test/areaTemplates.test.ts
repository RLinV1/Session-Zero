import { describe, expect, it } from "vitest";
import {
  AreaTemplate,
  EphemeralPayload,
  formatActivity,
  INITIAL_SCENE_ID,
  filterEventForViewer,
  filterStateForViewer,
  MAX_AREA_TEMPLATES,
  reduce,
  templateConcealedFrom,
  type CommandInput,
  type Concealment,
  type Point,
  type CommittedEvent,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, bob, gm, run } from "./fixtures";

const place = (overrides: Partial<Extract<CommandInput, { type: "template.place" }>> = {}): CommandInput => ({
  type: "template.place",
  shape: "cone",
  origin: { x: 70, y: 70 },
  toward: { x: 210, y: 70 },
  size: 15,
  ...overrides,
});

const committed = (event: CommittedEvent["event"], seq = 10): CommittedEvent => ({ seq, at: "2026-09-26T00:00:00.000Z", actorId: gm.id, event });

describe("shared area templates (FR-TAC-06, ADR 0007)", () => {
  it("lets any participant place a template everyone can see", () => {
    const { state, events } = run(baseRoom(), alice, place());
    expect(events).toHaveLength(1);
    const placed = events[0];
    if (placed?.type !== "TemplatePlaced") throw new Error("expected TemplatePlaced");
    expect(placed.template).toMatchObject({ shape: "cone", size: 15, ownerId: alice.id, gmOnly: false });
    expect(state.templates[placed.template.id]).toEqual(placed.template);
    expect(filterStateForViewer(state, bob).templates[placed.template.id]).toEqual(placed.template);
  });

  it("refuses a GM-only template from a player (FR-GM-15)", () => {
    expect(attempt(baseRoom(), alice, place({ gmOnly: true }))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("lets the owner or the GM remove a template, but not another player", () => {
    const { state, events } = run(baseRoom(), alice, place());
    const id = events[0]!.type === "TemplatePlaced" ? events[0].template.id : "";
    expect(attempt(state, bob, { type: "template.remove", templateId: id })).toMatchObject({ ok: false, code: "forbidden" });

    const byOwner = run(state, alice, { type: "template.remove", templateId: id });
    expect(byOwner.events[0]).toMatchObject({ type: "TemplateRemoved", template: { id, ownerId: alice.id } });
    expect(byOwner.state.templates[id]).toBeUndefined();

    expect(run(state, gm, { type: "template.remove", templateId: id }).state.templates[id]).toBeUndefined();
  });

  it("carries the whole removed template so undo can restore it (invariant 6)", () => {
    const { state, events } = run(baseRoom(), gm, place({ shape: "box", size: 10 }));
    const template = events[0]!.type === "TemplatePlaced" ? events[0].template : null;
    const removed = run(state, gm, { type: "template.remove", templateId: template!.id }).events[0];
    expect(removed).toEqual({ type: "TemplateRemoved", template });
  });

  it("never sends a GM-only template to a player, in state or as an event (FR-GM-23)", () => {
    const before: RoomState = baseRoom();
    const { state, events } = run(before, gm, place({ gmOnly: true }));
    const template = events[0]!.type === "TemplatePlaced" ? events[0].template : null;

    expect(filterStateForViewer(state, alice).templates).toEqual({});
    expect(filterStateForViewer(state, gm).templates[template!.id]).toEqual(template);
    expect(filterEventForViewer(committed(events[0]!), before, alice)).toEqual({ kind: "redacted", seq: 10 });
    expect(filterEventForViewer(committed(events[0]!), before, gm)).toMatchObject({ kind: "event" });

    const removed = run(state, gm, { type: "template.remove", templateId: template!.id }).events[0]!;
    expect(filterEventForViewer(committed(removed, 11), state, alice)).toEqual({ kind: "redacted", seq: 11 });
  });

  it("answers a player removing a GM-only template exactly as if it didn't exist", () => {
    const { state, events } = run(baseRoom(), gm, place({ gmOnly: true }));
    const id = events[0]!.type === "TemplatePlaced" ? events[0].template.id : "";
    expect(attempt(state, alice, { type: "template.remove", templateId: id })).toEqual(
      attempt(state, alice, { type: "template.remove", templateId: "no-such-template" }),
    );
  });

  it("caps how many templates a room holds", () => {
    let state = baseRoom();
    for (let i = 0; i < MAX_AREA_TEMPLATES; i++) {
      state = reduce(state, {
        type: "TemplatePlaced",
        template: { id: `t${i}`, shape: "circle", origin: { x: 0, y: 0 }, toward: { x: 0, y: 0 }, size: 5, ownerId: gm.id, gmOnly: false },
      });
    }
    expect(attempt(state, alice, place())).toMatchObject({ ok: false, code: "invalid" });
  });

  it("rejects a malformed template command before decide (zod at the trust boundary)", () => {
    expect(() => attempt(baseRoom(), alice, place({ size: -5 }))).toThrow();
    expect(() => attempt(baseRoom(), alice, { ...place(), shape: "hexagon" } as unknown as CommandInput)).toThrow();
    expect(() => attempt(baseRoom(), alice, place({ shape: "line", width: 0 }))).toThrow();
  });
});

describe("line templates (KAN-35, FR-TAC-06)", () => {
  it("places a line with a width, one cell when left out", () => {
    const wide = run(baseRoom(), alice, place({ shape: "line", size: 60, width: 10 }));
    expect(Object.values(wide.state.templates)[0]).toMatchObject({ shape: "line", size: 60, width: 10 });
    const plain = run(baseRoom(), alice, place({ shape: "line", size: 60 }));
    expect(Object.values(plain.state.templates)[0]).not.toHaveProperty("width");
  });

  it("refuses a line wider than 10 cells, and ignores width on other shapes", () => {
    expect(attempt(baseRoom(), alice, place({ shape: "line", size: 30, width: 55 }))).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(baseRoom(), alice, place({ shape: "line", size: 30, width: 50 })).ok).toBe(true);
    const cone = run(baseRoom(), alice, place({ shape: "cone", width: 10 }));
    expect(Object.values(cone.state.templates)[0]).not.toHaveProperty("width");
  });

  it("still reads a template placed before lines existed", () => {
    expect(AreaTemplate.safeParse({ id: "t", shape: "cone", origin: { x: 0, y: 0 }, toward: { x: 1, y: 0 }, size: 15, ownerId: "p", gmOnly: false }).success).toBe(true);
  });

  it("logs a line's length, and its width when it isn't one cell", () => {
    const state = baseRoom();
    const line = (width?: number) => ({ id: "t", shape: "line" as const, origin: { x: 0, y: 0 }, toward: { x: 1, y: 0 }, size: 60, ownerId: alice.id, gmOnly: false, ...(width && { width }) });
    expect(formatActivity({ type: "TemplatePlaced", template: line() }, "Pat", state)).toBe("Pat placed a 60 ft line");
    expect(formatActivity({ type: "TemplatePlaced", template: line(10) }, "Pat", state)).toBe("Pat placed a 60 ft line, 10 ft wide");
  });
});

describe("area colour (FR-TAC-06, ADR 0040)", () => {
  const aim = (color: unknown) => ({
    type: "templatePreview",
    preview: { shape: "circle", origin: { x: 70, y: 70 }, toward: { x: 71, y: 70 }, size: 20, gmOnly: false, color },
  });

  it("keeps a placed template's colour in the event and the state, for everyone who sees it", () => {
    const { state, events } = run(baseRoom(), alice, place({ color: "red" }));
    const placed = events[0];
    if (placed?.type !== "TemplatePlaced") throw new Error("expected TemplatePlaced");
    expect(placed.template.color).toBe("red");
    expect(state.templates[placed.template.id]?.color).toBe("red");
    expect(filterStateForViewer(state, bob).templates[placed.template.id]?.color).toBe("red");
  });

  it("leaves the colour out when none was chosen", () => {
    const { state } = run(baseRoom(), alice, place());
    expect(Object.values(state.templates)[0]).not.toHaveProperty("color");
  });

  it("refuses a colour outside the fixed list, in a placement and in an aim", () => {
    expect(() => attempt(baseRoom(), alice, place({ color: "white" as never }))).toThrow();
    expect(() => attempt(baseRoom(), alice, place({ color: "#ff0000" as never }))).toThrow();
    expect(EphemeralPayload.safeParse(aim("white")).success).toBe(false);
    expect(EphemeralPayload.safeParse(aim("blue")).success).toBe(true);
  });

  it("still reduces a template placed before colours existed", () => {
    const old = { id: "t-old", shape: "box" as const, origin: { x: 0, y: 0 }, toward: { x: 1, y: 0 }, size: 10, ownerId: alice.id, gmOnly: false };
    expect(AreaTemplate.safeParse(old).success).toBe(true);
    const state = reduce(baseRoom(), { type: "TemplatePlaced", template: old });
    expect(state.templates["t-old"]).toEqual(old);
  });

  it("names the colour in the activity log", () => {
    const state = baseRoom();
    const circle = (color?: "red" | "orange") => ({ id: "t", shape: "circle" as const, origin: { x: 0, y: 0 }, toward: { x: 1, y: 0 }, size: 20, ownerId: alice.id, gmOnly: false, ...(color && { color }) });
    expect(formatActivity({ type: "TemplatePlaced", template: circle("red") }, "Pat", state)).toBe("Pat placed a red 20 ft circle");
    expect(formatActivity({ type: "TemplatePlaced", template: circle("orange") }, "Pat", state)).toBe("Pat placed an orange 20 ft circle");
    expect(formatActivity({ type: "TemplatePlaced", template: circle() }, "Pat", state)).toBe("Pat placed a 20 ft circle");
  });
});

describe("editing placed areas (FR-TAC-06, ADR 0058)", () => {
  const placed = (actor = alice, overrides: Partial<Extract<CommandInput, { type: "template.place" }>> = {}) => {
    const { state, events } = run(baseRoom(), actor, place(overrides));
    const event = events[0];
    if (event?.type !== "TemplatePlaced") throw new Error("expected TemplatePlaced");
    return { state, template: event.template };
  };
  const update = (t: AreaTemplate, to: Partial<Pick<AreaTemplate, "origin" | "toward" | "size" | "width">>): CommandInput => ({
    type: "template.update",
    templateId: t.id,
    origin: to.origin ?? t.origin,
    toward: to.toward ?? t.toward,
    size: to.size ?? t.size,
    ...((to.width ?? t.width) !== undefined && { width: to.width ?? t.width }),
    expected: { origin: t.origin, toward: t.toward, size: t.size, ...(t.width !== undefined && { width: t.width }) },
  });
  const fogged = (state: RoomState): RoomState => reduce(state, {
    type: "FogAdded",
    region: { id: "fog", shape: "rect", points: [{ x: 700, y: 0 }, { x: 1400, y: 0 }, { x: 1400, y: 700 }, { x: 700, y: 700 }] },
  });

  it("lets the owner move their area, keeping its identity, owner and colour", () => {
    const { state, template } = placed(alice, { color: "red" });
    const moved = run(state, alice, update(template, { origin: { x: 140, y: 70 }, toward: { x: 280, y: 70 } }));
    expect(moved.events).toEqual([{
      type: "TemplateChanged",
      templateId: template.id,
      from: { origin: template.origin, toward: template.toward, size: template.size },
      to: { origin: { x: 140, y: 70 }, toward: { x: 280, y: 70 }, size: template.size },
    }]);
    expect(moved.state.templates[template.id]).toEqual({ ...template, origin: { x: 140, y: 70 }, toward: { x: 280, y: 70 } });
  });

  it("lets the GM edit a player's area, but not another player", () => {
    const { state, template } = placed(alice);
    expect(run(state, gm, update(template, { size: 30 })).state.templates[template.id]?.size).toBe(30);
    expect(attempt(state, bob, update(template, { size: 30 }))).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("refuses an edit made on another scene, for the owner and the GM alike", () => {
    const { state, template } = placed(alice);
    const stale = { ...update(template, { size: 30 }), expectedSceneId: "other-scene" } as CommandInput;
    expect(attempt(state, alice, stale)).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(state, gm, stale)).toMatchObject({ ok: false, code: "invalid" });
    const current = { ...update(template, { size: 30 }), expectedSceneId: state.activeSceneId ?? INITIAL_SCENE_ID } as CommandInput;
    expect(run(state, alice, current).state.templates[template.id]?.size).toBe(30);
  });

  it("answers a player editing a GM-only area exactly as if it didn't exist (FR-GM-23)", () => {
    const { state, template } = placed(gm, { gmOnly: true });
    expect(attempt(state, alice, update(template, { size: 30 }))).toEqual(
      attempt(state, alice, { ...update(template, { size: 30 }), templateId: "no-such-template" } as CommandInput),
    );
  });

  it("refuses an edit made from geometry someone else has since changed", () => {
    const { state, template } = placed(alice);
    const afterGm = run(state, gm, update(template, { size: 30 })).state;
    expect(attempt(afterGm, alice, update(template, { origin: { x: 140, y: 70 } }))).toMatchObject({ ok: false, code: "invalid" });
    expect(afterGm.templates[template.id]?.size).toBe(30);
  });

  it("refuses a line widened past 10 cells, ignores width on other shapes, and refuses no change", () => {
    const line = placed(alice, { shape: "line", size: 30 });
    expect(attempt(line.state, alice, update(line.template, { width: 55 }))).toMatchObject({ ok: false, code: "invalid" });
    expect(run(line.state, alice, update(line.template, { width: 15 })).state.templates[line.template.id]?.width).toBe(15);
    const cone = placed(alice);
    expect(run(cone.state, alice, update(cone.template, { size: 20, width: 15 })).state.templates[cone.template.id]).not.toHaveProperty("width");
    expect(attempt(cone.state, alice, update(cone.template, {}))).toMatchObject({ ok: false, code: "invalid" });
  });

  it("redacts a GM-only area's edit for players", () => {
    const { state, template } = placed(gm, { gmOnly: true });
    const event = run(state, gm, update(template, { size: 30 })).events[0]!;
    expect(filterEventForViewer(committed(event), state, alice)).toEqual({ kind: "redacted", seq: 10 });
    expect(filterEventForViewer(committed(event), state, gm)).toMatchObject({ kind: "event" });
  });

  it("resyncs other players when an area moves into or out of fog, and passes it for the owner and the GM (FR-GM-17)", () => {
    const { state: lit, template } = placed(alice);
    const state = fogged(lit);
    const into = run(state, alice, update(template, { origin: { x: 980, y: 350 }, toward: { x: 1120, y: 350 } }));
    expect(filterEventForViewer(committed(into.events[0]!), state, bob)).toEqual({ kind: "resync" });
    expect(filterEventForViewer(committed(into.events[0]!), state, alice)).toMatchObject({ kind: "event" });
    expect(filterEventForViewer(committed(into.events[0]!), state, gm)).toMatchObject({ kind: "event" });
    expect(filterStateForViewer(into.state, bob).templates[template.id]).toBeUndefined();

    const moved = into.state.templates[template.id]!;
    const out = run(into.state, alice, update(moved, { origin: { x: 70, y: 70 }, toward: { x: 210, y: 70 } }));
    expect(filterEventForViewer(committed(out.events[0]!), into.state, bob)).toEqual({ kind: "resync" });

    const between = run(state, alice, update(template, { origin: { x: 140, y: 140 }, toward: { x: 280, y: 140 } }));
    expect(filterEventForViewer(committed(between.events[0]!), state, bob)).toMatchObject({ kind: "event" });
  });

  it("logs a move, a turn and a change of size, in both languages", () => {
    const { state, template } = placed(alice, { color: "red", size: 15 });
    const event = (to: Partial<AreaTemplate>) => run(state, alice, update(template, to)).events[0]!;
    expect(formatActivity(event({ origin: { x: 140, y: 70 }, toward: { x: 280, y: 70 } }), "Pat", state)).toBe("Pat moved a red 15 ft cone");
    expect(formatActivity(event({ toward: { x: 70, y: 210 } }), "Pat", state)).toBe("Pat turned a red 15 ft cone");
    expect(formatActivity(event({ size: 30 }), "Pat", state)).toBe("Pat changed a red 15 ft cone to a red 30 ft cone");
    expect(formatActivity(event({ size: 30 }), "Pat", state, "zh-TW")).toMatch(/Pat 將.*15 ft.*改為.*30 ft/);
    expect(formatActivity(event({ origin: { x: 140, y: 70 }, toward: { x: 280, y: 70 } }), "Pat", state, "zh-TW")).toMatch(/Pat 移動了/);
    const gmOnly = placed(gm, { gmOnly: true, size: 10, shape: "circle" });
    const grown = run(gmOnly.state, gm, update(gmOnly.template, { size: 20 })).events[0]!;
    expect(formatActivity(grown, "GM", gmOnly.state)).toBe("GM changed a 10 ft circle to a 20 ft circle (GM only)");
  });

  it("logs a line set back to the default one-cell width without its old width, in both languages", () => {
    const { state, template } = placed(alice, { shape: "line", size: 60, width: 10 });
    const narrowed = run(state, alice, { ...update(template, {}), width: undefined } as CommandInput).events[0]!;
    expect(narrowed).toMatchObject({ type: "TemplateChanged", to: { size: 60 } });
    expect(formatActivity(narrowed, "Pat", state)).toBe("Pat changed a 60 ft line, 10 ft wide to a 60 ft line");
    expect(formatActivity(narrowed, "Pat", state, "zh-TW")).not.toMatch(/改為.*寬/);
  });
});

describe("edit previews (FR-TAC-06, ADR 0058)", () => {
  const preview = { shape: "circle", origin: { x: 70, y: 70 }, toward: { x: 71, y: 70 }, size: 20, gmOnly: false };
  it("still reads an aim preview, and reads one naming the template being edited", () => {
    expect(EphemeralPayload.safeParse({ type: "templatePreview", preview }).success).toBe(true);
    expect(EphemeralPayload.safeParse({ type: "templatePreview", preview, templateId: "t1" }).success).toBe(true);
    expect(EphemeralPayload.safeParse({ type: "templatePreview", preview: null, gmOnly: false, templateId: "t1" }).success).toBe(true);
  });
});

describe("areas visible in part (FR-GM-17, ADR 0059)", () => {
  // Fog over x 700–1400; the rest of the map is lit.
  const fogged = (state: RoomState): RoomState => reduce(state, {
    type: "FogAdded",
    region: { id: "fog", shape: "rect", points: [{ x: 700, y: 0 }, { x: 1400, y: 0 }, { x: 1400, y: 1400 }, { x: 700, y: 1400 }] },
  });
  const placedBy = (actor: typeof gm, input: Partial<Extract<CommandInput, { type: "template.place" }>>) => {
    const { state, events } = run(fogged(baseRoom()), actor, place(input));
    const event = events[0];
    if (event?.type !== "TemplatePlaced") throw new Error("expected TemplatePlaced");
    return { state, template: event.template, event };
  };
  const conc = (state: RoomState, sight: Point[][] | null = null): Concealment => ({ fog: state.fog, sight, grid: state.scene.grid });

  it("sends another player a cone aimed out of fog, and one aimed into fog", () => {
    const outOf = placedBy(gm, { shape: "cone", origin: { x: 770, y: 350 }, toward: { x: 0, y: 350 }, size: 30 });
    expect(filterStateForViewer(outOf.state, alice).templates[outOf.template.id]).toEqual(outOf.template);
    const into = placedBy(bob, { shape: "cone", origin: { x: 560, y: 350 }, toward: { x: 1400, y: 350 }, size: 30 });
    expect(filterStateForViewer(into.state, alice).templates[into.template.id]).toBeDefined();
  });

  it("withholds a circle wholly in fog, and its placement event", () => {
    const deep = placedBy(gm, { shape: "circle", origin: { x: 1050, y: 700 }, toward: { x: 1051, y: 700 }, size: 10 });
    expect(filterStateForViewer(deep.state, alice).templates).toEqual({});
    expect(filterEventForViewer(committed(deep.event), fogged(baseRoom()), alice)).toEqual({ kind: "redacted", seq: 10 });
    const outOf = placedBy(gm, { shape: "cone", origin: { x: 770, y: 350 }, toward: { x: 0, y: 350 }, size: 30 });
    expect(filterEventForViewer(committed(outOf.event), fogged(baseRoom()), alice)).toMatchObject({ kind: "event" });
  });

  it("answers a player removing another player's area wholly in fog as if it didn't exist", () => {
    const deep = placedBy(bob, { shape: "circle", origin: { x: 1050, y: 700 }, toward: { x: 1051, y: 700 }, size: 10 });
    expect(attempt(deep.state, alice, { type: "template.remove", templateId: deep.template.id })).toMatchObject({ ok: false, code: "not_found" });
  });

  it("resyncs a player when fog covers the last part of an area they could see", () => {
    const { state, template } = placedBy(bob, { shape: "circle", origin: { x: 630, y: 700 }, toward: { x: 631, y: 700 }, size: 5 });
    expect(filterStateForViewer(state, alice).templates[template.id]).toBeDefined();
    const cover = { type: "FogAdded" as const, region: { id: "more", shape: "rect" as const, points: [{ x: 500, y: 500 }, { x: 700, y: 500 }, { x: 700, y: 900 }, { x: 500, y: 900 }] } };
    expect(filterEventForViewer(committed(cover), state, alice)).toEqual({ kind: "resync" });
    expect(filterStateForViewer(reduce(state, cover), alice).templates[template.id]).toBeUndefined();
  });

  it("tests sight as well as fog, and hides everything from an empty sight", () => {
    const state = baseRoom();
    const line = { shape: "line" as const, origin: { x: 100, y: 100 }, toward: { x: 600, y: 100 }, size: 30, ownerId: bob.id, gmOnly: false };
    const sightBox = (x0: number, x1: number) => [[{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 300 }, { x: x0, y: 300 }]];
    expect(templateConcealedFrom(conc(state, sightBox(0, 200)), line, alice)).toBe(false);
    expect(templateConcealedFrom(conc(state, sightBox(1000, 1200)), line, alice)).toBe(true);
    expect(templateConcealedFrom(conc(state, []), line, alice)).toBe(true);
    // Owners, the GM and GM-only areas are as before.
    expect(templateConcealedFrom(conc(state, []), { ...line, ownerId: alice.id }, alice)).toBe(false);
    expect(templateConcealedFrom(conc(state, []), line, gm)).toBe(false);
    expect(templateConcealedFrom(conc(state), { ...line, gmOnly: true }, alice)).toBe(true);
  });

  it("doesn't count the part of an area off the map as visible", () => {
    const state = baseRoom();
    // Fog over the whole 700×700 map; the cone pokes 70 px past its right edge.
    const c: Concealment = { ...conc(state), map: { width: 700, height: 700 }, fog: { all: { id: "all", shape: "rect", points: [{ x: 0, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 700 }, { x: 0, y: 700 }] } } };
    const cone = { shape: "cone" as const, origin: { x: 560, y: 350 }, toward: { x: 770, y: 350 }, size: 15, ownerId: bob.id, gmOnly: false };
    expect(templateConcealedFrom(c, cone, alice)).toBe(true);
    expect(templateConcealedFrom({ ...c, map: null }, cone, alice)).toBe(false);
  });

  it("stays quick in the worst case: 200 12-cell circles under 100 fog regions", () => {
    let state = baseRoom();
    for (let i = 0; i < 100; i++) {
      const x = (i % 10) * 140, y = Math.floor(i / 10) * 140;
      state = reduce(state, { type: "FogAdded", region: { id: `f${i}`, shape: "rect", points: [{ x, y }, { x: x + 130, y }, { x: x + 130, y: y + 130 }, { x, y: y + 130 }] } });
    }
    // Wholly under one big region too, so every sample is tested before the area is withheld.
    state = reduce(state, { type: "FogAdded", region: { id: "all", shape: "rect", points: [{ x: -2000, y: -2000 }, { x: 4000, y: -2000 }, { x: 4000, y: 4000 }, { x: -2000, y: 4000 }] } });
    for (let i = 0; i < 200; i++) {
      state = reduce(state, { type: "TemplatePlaced", template: { id: `t${i}`, shape: "circle", origin: { x: 700, y: 700 }, toward: { x: 701, y: 700 }, size: 60, ownerId: bob.id, gmOnly: false } });
    }
    const started = performance.now();
    expect(filterStateForViewer(state, alice).templates).toEqual({});
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
