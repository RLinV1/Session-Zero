// @vitest-environment jsdom
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DiceBoard } from "../src/board/Board";

const shake = vi.hoisted(() => ({ move: vi.fn(), stop: vi.fn() }));
const startDiceShake = vi.hoisted(() => vi.fn(() => shake));
vi.mock("../src/board/fxSound", () => ({ startDiceShake }));

import { DiceThrowHandle } from "../src/panels/DiceThrowHandle";

beforeAll(() => {
  // jsdom has no pointer events or pointer capture: a mouse event with a pointer id stands in.
  class FakePointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  vi.stubGlobal("PointerEvent", FakePointerEvent);
  HTMLElement.prototype.setPointerCapture = () => {};
});

afterEach(() => vi.clearAllMocks());

function mount() {
  // Off the map wherever it is let go: nothing is rolled.
  const board = { aimThrow: () => null } as unknown as DiceBoard;
  const view = render(<DiceThrowHandle sides={20} gmOnly={false} blocker={null} busy={false} board={board} onThrow={() => Promise.resolve(false)} />);
  return view.container.querySelector(".dice-throw-handle")!;
}

const at = (x: number) => ({ pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: x, clientY: 300 });

describe("rattle of the held die (FR-TAC-09)", () => {
  it("starts when the die is picked up, hears every move, and stops when it is let go", () => {
    const handle = mount();
    fireEvent.pointerDown(handle, at(100));
    expect(startDiceShake).toHaveBeenCalledOnce();
    expect(shake.move).toHaveBeenCalledTimes(1);
    for (const x of [140, 180, 120, 160]) fireEvent.pointerMove(handle, at(x));
    expect(shake.move).toHaveBeenCalledTimes(5);
    expect(shake.move.mock.calls.at(-1)![0]).toMatchObject({ x: 160, y: 300 });
    expect(shake.stop).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { ...at(160), buttons: 0 });
    expect(shake.stop).toHaveBeenCalled();
  });

  it("stops when the die is put back with Escape", () => {
    const handle = mount();
    fireEvent.pointerDown(handle, at(100));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(shake.stop).toHaveBeenCalled();
  });

  it("does not rattle a die that cannot be picked up", () => {
    const board = { aimThrow: () => null } as unknown as DiceBoard;
    const view = render(<DiceThrowHandle sides={20} gmOnly={false} blocker="Throwing needs a map on the board" busy={false} board={board} onThrow={() => Promise.resolve(false)} />);
    fireEvent.pointerDown(view.container.querySelector(".dice-throw-handle")!, at(100));
    expect(startDiceShake).not.toHaveBeenCalled();
  });
});
