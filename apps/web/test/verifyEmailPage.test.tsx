// @vitest-environment jsdom
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { ApiError } from "../src/net/api";

const verifyEmail = vi.fn();
const resend = vi.fn();
const navigate = vi.fn();
vi.mock("../src/account/accountStore", async (orig) => ({
  ...(await orig<typeof import("../src/account/accountStore")>()),
  verifyEmail: (token: string) => verifyEmail(token),
  resendVerification: (email: string) => resend(email),
}));
vi.mock("../src/router", async (orig) => ({
  ...(await orig<typeof import("../src/router")>()),
  navigate: (...args: unknown[]) => navigate(...args),
}));

import { VerifyEmailPage } from "../src/account/AccountPages";
import { parseRoute } from "../src/router";

beforeEach(() => {
  for (const mock of [verifyEmail, resend, navigate]) mock.mockReset();
  accountStore.setState({ status: "signedOut" });
});
afterEach(cleanup);

describe("the verify-email page (FR-GM-01)", () => {
  it("is its own route", () => {
    expect(parseRoute("/verify-email")).toEqual({ page: "verifyEmail" });
  });

  it("submits the token once, even when effects run twice, and continues to the destination", async () => {
    history.replaceState(null, "", "/verify-email?token=abc123&next=%2Flibrary");
    verifyEmail.mockResolvedValue(undefined);
    render(
      <StrictMode>
        <VerifyEmailPage />
      </StrictMode>,
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/library", { replace: true }));
    expect(verifyEmail).toHaveBeenCalledTimes(1);
    expect(verifyEmail).toHaveBeenCalledWith("abc123");
  });

  it("falls back to the dashboard with no next", async () => {
    history.replaceState(null, "", "/verify-email?token=abc123");
    verifyEmail.mockResolvedValue(undefined);
    render(<VerifyEmailPage />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/gm-dashboard", { replace: true }));
  });

  it("shows the expired-link state with a resend field for a bad token", async () => {
    history.replaceState(null, "", "/verify-email?token=old");
    verifyEmail.mockRejectedValue(new ApiError("expired", 400, {}));
    resend.mockResolvedValue(undefined);
    render(<VerifyEmailPage />);
    expect(await screen.findByRole("heading", { name: "This link no longer works" })).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    const send = screen.getByRole("button", { name: "Send a new link" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "sam@example.com" } });
    fireEvent.click(send);
    await waitFor(() => expect(resend).toHaveBeenCalledWith("sam@example.com"));
    expect(verifyEmail).toHaveBeenCalledTimes(1);
  });

  it("shows the expired-link state without posting when the token is missing", () => {
    history.replaceState(null, "", "/verify-email");
    render(<VerifyEmailPage />);
    expect(screen.getByRole("heading", { name: "This link no longer works" })).toBeTruthy();
    expect(verifyEmail).not.toHaveBeenCalled();
  });
});
