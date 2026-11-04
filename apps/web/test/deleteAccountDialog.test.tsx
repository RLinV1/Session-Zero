// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/net/api";

const deleteAccount = vi.fn();
const navigate = vi.fn();
vi.mock("../src/account/accountStore", async (orig) => ({
  ...(await orig<typeof import("../src/account/accountStore")>()),
  deleteAccount: (password: string) => deleteAccount(password),
}));
vi.mock("../src/router", async (orig) => ({
  ...(await orig<typeof import("../src/router")>()),
  navigate: (...args: unknown[]) => navigate(...args),
}));

import { DeleteAccountDialog } from "../src/account/AccountPages";

beforeAll(() => {
  // jsdom has no <dialog> modal support.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  deleteAccount.mockReset();
  navigate.mockReset();
});
afterEach(cleanup);

function open(onClose = vi.fn()) {
  render(<DeleteAccountDialog open email="Ada@Example.com" onClose={onClose} />);
  const submit = screen.getByRole("button", { name: "Delete account" }) as HTMLButtonElement;
  const type = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  return { submit, onClose, email: (v: string) => type(/to confirm/, v), password: (v: string) => type(/^Password/, v) };
}

describe("delete account confirmation gate (FR-GM-01)", () => {
  it("states deletion is permanent and lists what goes", () => {
    open();
    expect(screen.getByText(/permanent and cannot be undone/)).toBeTruthy();
    for (const item of ["your rooms and their history", "your library", "uploaded images", "your sessions"]) {
      expect(screen.getByText(new RegExp(item))).toBeTruthy();
    }
  });

  it("keeps the button disabled until the email matches and a password is typed", () => {
    const { submit, email, password } = open();
    expect(submit.disabled).toBe(true);
    password("hunter2hunter2");
    email("someone@else.com");
    expect(submit.disabled).toBe(true);
    email("  ada@example.COM ");
    expect(submit.disabled).toBe(false);
    password("");
    expect(submit.disabled).toBe(true);
  });

  it("deletes with the password and goes home on success", async () => {
    deleteAccount.mockResolvedValue(undefined);
    const { submit, onClose, email, password } = open();
    email("ada@example.com");
    password("hunter2hunter2");
    fireEvent.click(submit);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(deleteAccount).toHaveBeenCalledWith("hunter2hunter2");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows a wrong-password error beside the password field and stays open", async () => {
    deleteAccount.mockRejectedValue(new ApiError("Wrong password.", 403, { field: "password" }));
    const { submit, onClose, email, password } = open();
    email("ada@example.com");
    password("nope-nope-nope");
    fireEvent.click(submit);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Wrong password.");
    expect(screen.getByLabelText(/^Password/).closest("label")?.contains(alert)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
