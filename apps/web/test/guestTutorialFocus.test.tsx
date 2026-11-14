// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RoomState } from "@vtt/shared";
import { t } from "../src/i18n/locale";
import { GuestRoomProvider } from "../src/ui/GuestRoom";
import { GuestTutorial } from "../src/ui/GuestTutorial";

const room = (tokens: Record<string, unknown> = {}) => ({ tokens, fog: {}, rolls: [] }) as unknown as RoomState;
const demo = (state: RoomState): ReactElement => (
  <GuestRoomProvider value={{ guest: true, idleDays: 30 }}>
    <button type="button">board</button>
    <GuestTutorial roomId="r1" state={state} selfId="gm" invites={0} restart={0} />
  </GuestRoomProvider>
);

describe("the demo's focus (guest-gm-hosting: A guest room offers an interactive demo)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it("leaves focus alone when a step is reached by acting elsewhere, and announces it", () => {
    localStorage.setItem("vtt.tutorial.r1", "2"); // Place a token
    const { rerender } = render(demo(room()));
    const outside = screen.getByRole("button", { name: "board" });
    outside.focus();
    rerender(demo(room({ a: { position: { x: 1, y: 1 } } })));
    expect(screen.getByRole("heading").textContent).toBe(t("tutorial.move.title"));
    expect(document.activeElement).toBe(outside);
    expect(screen.getByRole("status").textContent).toBe(t("tutorial.move.title"));
  });

  it("moves focus to the question, then to the step heading after Yes", () => {
    render(demo(room()));
    expect(document.activeElement).toBe(screen.getByRole("heading"));
    fireEvent.click(screen.getByRole("button", { name: t("tutorial.yes") }));
    expect(screen.getByRole("heading").textContent).toBe(t("tutorial.table.title"));
    expect(document.activeElement).toBe(screen.getByRole("heading"));
  });
});
