// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomMenu } from "../src/ui/RoomMenu";

afterEach(cleanup);

const open = (onSettings?: () => void) => {
  render(<RoomMenu replaying={false} onGuide={() => {}} onReplay={() => {}} onSettings={onSettings} />);
  fireEvent.click(screen.getByRole("button", { name: "More" }));
};

describe("room More menu (client-settings)", () => {
  it("leaves Settings out on desktop, where it has its own button", () => {
    open();
    expect(screen.getByRole("button", { name: /Replay/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Settings/ })).toBeNull();
  });
  it("lists Settings on phones and opens it", () => {
    const onSettings = vi.fn();
    open(onSettings);
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(onSettings).toHaveBeenCalledOnce();
  });
});
