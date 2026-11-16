// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GUEST_ROOM_IDLE_DAYS } from "@vtt/shared";
import { SessionGuide } from "../src/pages/home/SessionGuide";

afterEach(cleanup);

it("explains the first session and the guest/account choices without a sign-in detour", () => {
  render(<SessionGuide />);
  expect(within(screen.getByRole("list", { name: "Set up, invite and play" })).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Try without signing in" }).getAttribute("href")).toBe("/start");
  expect(screen.getByRole("link", { name: "Create a free account" }).getAttribute("href")).toContain("/signup");
  expect(screen.getByText(new RegExp(`${GUEST_ROOM_IDLE_DAYS} days without play`))).toBeTruthy();
});
