// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { GuestRoomNotice, GuestRoomProvider } from "../src/ui/GuestRoom";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const notice = (roomId: string) => <GuestRoomProvider value={{ guest: true, idleDays: 30 }}><GuestRoomNotice key={roomId} roomId={roomId} /></GuestRoomProvider>;

it("remembers a guest room's Not now choice after reopening it (M5/M6)", () => {
  const first = render(notice("room-one"));
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  first.unmount();
  render(notice("room-one"));
  expect(screen.queryByRole("button", { name: "Not now" })).toBeNull();
});

it("still explains retention for a different guest room", () => {
  const { rerender } = render(notice("room-one"));
  fireEvent.click(screen.getByRole("button", { name: "Not now" }));
  rerender(notice("room-two"));
  expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();
});
