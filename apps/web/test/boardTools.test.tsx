// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyRoomState, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../src/net/roomConnection";
import type { BoardCallbacks } from "../src/board/boardView";

const mock = vi.hoisted(() => ({ callbacks: null as BoardCallbacks | null, terrain: [] as boolean[], portals: [] as boolean[], tools: [] as string[], dimmed: [] as boolean[] }));
vi.mock("../src/board/boardView", () => ({ BoardView: class {
  constructor(_host: unknown, callbacks: BoardCallbacks) { mock.callbacks = callbacks; }
  init = async () => {};
  destroy() {} update() {} setGmFogView() {} setShowWalls() {} setReadOnly() {} setGridPreview() {} setPlacement() {} setViewedTokens() {} setGroupSelection() {}
  setRepositionToken() {} refreshMovementPreview() {} cancelMovement() { return false; } setMovementRuler() {} clearMarks() {}
  setShowTerrain(show: boolean) { mock.terrain.push(show); }
  setShowPortals(show: boolean) { mock.portals.push(show); }
  setWallsDimmed(dim: boolean) { mock.dimmed.push(dim); }
  setTool(tool: { kind: string }) { mock.tools.push(tool.kind); }
} }));
const card = vi.hoisted(() => ({ props: null as null | { token: { id: string }; onSetStats?: (stats: unknown) => Promise<unknown> } }));
vi.mock("../src/board/TokenCard", () => ({ TokenCard: (props: never) => { card.props = props; return null; } }));
import { Board } from "../src/board/Board";
import { ToolRail, DEFAULT_TOOL_OPTIONS } from "../src/ui/ToolRail";

afterEach(() => { cleanup(); localStorage.clear(); vi.clearAllMocks(); mock.terrain = []; mock.portals = []; mock.tools = []; mock.dimmed = []; });

const gm: Participant = { id: "g", displayName: "GM", role: "gm" };
const player: Participant = { id: "p", displayName: "Player", role: "player" };
function connect(command = vi.fn(async () => ({ ok: true as const }))) {
  return { command, preview: vi.fn(), ephemeral: vi.fn(), onCommitted: () => () => {}, onEphemeral: () => () => {}, store: { subscribe: () => () => {} } } as unknown as RoomConnection;
}
async function mount(you: Participant, state: RoomState = emptyRoomState("r"), connection = connect()) {
  render(<Board connection={connection} state={state} you={you} gridPreview={null} />);
  await act(async () => {});
  return connection;
}

describe("Show menu is GM-only and terrain shows by default (board-view-filters, FR-GM-17)", () => {
  it("a player gets no Show control and their board draws terrain", async () => {
    await mount(player);
    expect(screen.queryByRole("button", { name: /^show$/i })).toBeNull();
    expect(mock.terrain.at(-1)).toBe(true);
  });

  it("doors and windows are shown whenever the board opens, even if hidden last time", async () => {
    localStorage.setItem("vtt.ui.gmShowPortals", "false");
    const state = emptyRoomState("r");
    state.walls = { door: { id: "door", a: { x: 0, y: 0 }, b: { x: 70, y: 0 }, portal: { kind: "door", state: "closed" } } };
    await mount(gm, state);
    expect(mock.portals.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^show$/i }));
    expect((screen.getByLabelText("Doors and windows") as HTMLInputElement).checked).toBe(true);
  });

  it("the GM's Show lists Terrain checked, and unchecking it hides terrain on their board only", async () => {
    await mount(gm);
    expect(mock.terrain.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^show$/i }));
    const terrain = screen.getByLabelText("Terrain") as HTMLInputElement;
    expect(terrain.checked).toBe(true);
    fireEvent.click(terrain);
    expect(mock.terrain.at(-1)).toBe(false);
  });
});


/** The rail's buttons and dividers in order, as names and "|". */
function railOrder(): string[] {
  const rail = screen.getByRole("toolbar", { name: "Board tools" });
  return [...rail.children].flatMap((el) => el.classList.contains("rail-divider") ? ["|"] : el.classList.contains("rail-toggle") ? [] : [el.getAttribute("title") ?? ""]);
}

describe("rail groups play tools and GM tools (board-tool-rail)", () => {
  const rail = (isGm: boolean, selectOnly = false) => render(
    <ToolRail active="select" options={DEFAULT_TOOL_OPTIONS} isGm={isGm} onSelect={() => {}} onOptions={() => {}} onClear={() => {}} selectOnly={selectOnly} lineOfSight={false} onToggleLineOfSight={() => {}} />,
  );

  it("the GM sees play tools, a divider, Fog, Terrain, Doors and Sight, a divider and Clear", () => {
    rail(true);
    expect(railOrder()).toEqual(["Select", "Measure", "Draw", "AoE", "Eraser", "|", "Fog", "Terrain", "Doors", "Line of sight: off", "|", "Clear all my marks"]);
  });

  it("a player sees no GM tool and only the divider before Clear", () => {
    rail(false);
    expect(railOrder()).toEqual(["Select", "Measure", "Draw", "AoE", "Eraser", "|", "Clear all my marks"]);
  });

  it("a select-only rail shows no divider", () => {
    rail(true, true);
    expect(railOrder()).toEqual(["Select"]);
  });
});

describe("the GM paints terrain from the rail (board-terrain-tool, FR-TAC-02)", () => {
  const withMap = (): RoomState => {
    const state = emptyRoomState("r");
    state.scene = { ...state.scene, map: { url: "/m.png", width: 700, height: 700 } };
    state.terrain = { base: [], effects: [{ id: "ice", name: "Ice", runs: [] }] } as unknown as RoomState["terrain"];
    return state;
  };

  it("offers shape and paint options only, with no layer choice and no Paint terrain button", async () => {
    await mount(gm, withMap());
    expect(screen.queryByRole("button", { name: "Paint terrain" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Terrain" }));
    expect(mock.tools.at(-1)).toBe("terrain");
    const options = screen.getByRole("group", { name: "Terrain options" });
    expect(options.querySelector("select")).toBeNull();
    expect(screen.queryByRole("button", { name: "Manage layers" })).toBeNull();
  });

  it("draws terrain while the tool is active even with Terrain unchecked in Show, and leaves Show alone", async () => {
    await mount(gm, withMap());
    fireEvent.click(screen.getByRole("button", { name: /^show$/i }));
    fireEvent.click(screen.getByLabelText("Terrain"));
    expect(mock.terrain.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Terrain" }));
    expect(mock.terrain.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(mock.terrain.at(-1)).toBe(false);
  });

  it("sends a stroke as terrain.paint and shows the server's refusal", async () => {
    const command = vi.fn(async () => ({ ok: false as const, code: "conflict", message: "Terrain changed; try again." }));
    await mount(gm, withMap(), connect(command as never));
    const paint = [{ row: 0, start: 0, end: 2, kind: "difficult" as const }];
    let ok: boolean | undefined;
    await act(async () => { ok = await mock.callbacks!.paintTerrain!("base", paint, { boardEpoch: 0, revision: 3 }); });
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ type: "terrain.paint", layerId: "base", paint, context: { boardEpoch: 0, revision: 3 } }));
    expect(ok).toBe(false);
    expect(screen.getByRole("alert").textContent).toBe("Terrain changed; try again.");
  });

  it("says why a stroke cannot be painted", async () => {
    await mount(gm);
    act(() => mock.callbacks!.terrainNotice!("needsMap"));
    expect(screen.getByText("Add a map first to paint terrain.")).toBeTruthy();
    act(() => mock.callbacks!.terrainNotice!("rectTooBig"));
    expect(screen.getByRole("alert").textContent).toMatch(/10,000 cells/);
  });

  it("players get no Terrain tool", async () => {
    await mount(player, withMap());
    expect(screen.queryByRole("button", { name: "Terrain" })).toBeNull();
  });
});

describe("the GM's Doors tool (board-doors-tool, FR-GM-18)", () => {
  const withDoor = (state: "open" | "closed" | "locked"): RoomState => {
    const room = emptyRoomState("r");
    room.walls = { door: { id: "door", a: { x: 0, y: 0 }, b: { x: 70, y: 0 }, portal: { kind: "door", state } } };
    return room;
  };

  it("offers Open/Close and Lock/Unlock, shows portals and dims walls while active, leaving Show alone", async () => {
    await mount(gm, withDoor("closed"));
    expect(mock.portals.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^show$/i }));
    fireEvent.click(screen.getByLabelText("Doors and windows"));
    expect(mock.portals.at(-1)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Doors" }));
    expect(mock.tools.at(-1)).toBe("doors");
    expect(screen.getByRole("button", { name: "Open / close" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lock / unlock" })).toBeTruthy();
    expect(mock.portals.at(-1)).toBe(true);
    expect(mock.dimmed.at(-1)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(mock.portals.at(-1)).toBe(false);
    expect(mock.dimmed.at(-1)).toBe(false);
  });

  it.each([
    ["toggle", "closed", "open"], ["toggle", "locked", "open"], ["toggle", "open", "closed"],
    ["lock", "closed", "locked"], ["lock", "open", "locked"], ["lock", "locked", "closed"],
  ] as const)("in %s mode, a %s door becomes %s", async (mode, from, to) => {
    const command = vi.fn(async () => ({ ok: true as const }));
    await mount(gm, withDoor(from), connect(command as never));
    act(() => mock.callbacks!.setPortal!("door", mode));
    expect(command).toHaveBeenCalledWith(expect.objectContaining({ type: "portal.setState", wallId: "door", state: to }));
  });

  it("shows the server's refusal", async () => {
    const command = vi.fn(async () => ({ ok: false as const, code: "conflict", message: "That door changed." }));
    await mount(gm, withDoor("closed"), connect(command as never));
    await act(async () => { mock.callbacks!.setPortal!("door", "lock"); });
    expect(screen.getByRole("alert").textContent).toBe("That door changed.");
  });

  it("players get no Doors tool", async () => {
    await mount(player, withDoor("closed"));
    expect(screen.queryByRole("button", { name: "Doors" })).toBeNull();
  });
});

describe("the board's token card sends quick HP (token-quick-hp)", () => {
  const withGoblin = (): RoomState => {
    const state = emptyRoomState("r");
    state.tokens = { g1: { id: "g1", name: "Goblin", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null, ownerIds: [], hidden: false, stats: { hp: 12, maxHp: 12, ac: 15 }, conditions: [] } };
    return state;
  };


  it("quick HP sends token.setStats for the selected token", async () => {
    const command = vi.fn(async () => ({ ok: true as const }));
    await mount(gm, withGoblin(), connect(command as never));
    act(() => mock.callbacks!.selectToken("g1"));
    await act(async () => { await card.props!.onSetStats!({ hp: 7, maxHp: 12, ac: 15 }); });
    expect(command).toHaveBeenCalledWith({ type: "token.setStats", tokenId: "g1", stats: { hp: 7, maxHp: 12, ac: 15 } });
  });
});
