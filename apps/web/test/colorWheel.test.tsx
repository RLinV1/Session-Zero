// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorWheel } from "../src/ui/ColorWheel";

afterEach(cleanup);

describe("the colour wheel's hex field (grid-line-style, WCAG 1.4.1 / 3.3.1)", () => {
  it("says in words when the hex is invalid, not only with a red border", () => {
    const onChange = vi.fn();
    render(<ColorWheel value="#336699" label="Line colour" onChange={onChange} />);
    const field = screen.getByLabelText("Hex colour");
    expect(screen.queryByText(/Enter a hex colour/)).toBeNull();
    fireEvent.change(field, { target: { value: "#33" } });
    const message = screen.getByText(/Enter a hex colour/);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBe(message.id);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clears the message once the hex is valid again", () => {
    render(<ColorWheel value="#336699" label="Line colour" onChange={() => {}} />);
    const field = screen.getByLabelText("Hex colour");
    fireEvent.change(field, { target: { value: "#33" } });
    fireEvent.change(field, { target: { value: "#a1b2c3" } });
    expect(screen.queryByText(/Enter a hex colour/)).toBeNull();
    expect(field.getAttribute("aria-describedby")).toBeNull();
  });
});
