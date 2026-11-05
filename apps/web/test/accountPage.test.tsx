// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AccountView } from "@vtt/shared";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accountStore } from "../src/account/accountStore";
import { ApiError } from "../src/net/api";

const sam: AccountView = { id: "u1", email: "sam@example.com", displayName: "Sam" };

const signIn = vi.fn();
const signUp = vi.fn();
const signOut = vi.fn();
const navigate = vi.fn();
vi.mock("../src/account/accountStore", async (orig) => ({
  ...(await orig<typeof import("../src/account/accountStore")>()),
  signIn: (email: string, password: string) => signIn(email, password),
  signUp: (email: string, password: string, name: string) => signUp(email, password, name),
  signOut: () => signOut(),
}));
vi.mock("../src/router", async (orig) => ({
  ...(await orig<typeof import("../src/router")>()),
  navigate: (...args: unknown[]) => navigate(...args),
}));

import { AccountMenu, AccountPage, SignInPage, SignUpPage } from "../src/account/AccountPages";
import { AccountLinks } from "../src/pages/home/AccountLinks";
import { parseRoute } from "../src/router";
import { layerFor } from "../src/theme";

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
  for (const mock of [signIn, signUp, signOut, navigate]) mock.mockReset();
  accountStore.setState({ status: "signedOut" });
  history.replaceState(null, "", "/account");
});
afterEach(cleanup);

const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const hrefOf = (name: string) => screen.getByRole("link", { name }).getAttribute("href");

/** What the real store does on a successful sign-in, which the page reacts to. */
const signsIn = () => accountStore.setState({ status: "signedIn", account: sam });

describe("the account page's address (account-page)", () => {
  it("is its own route on the hub's ground", () => {
    expect(parseRoute("/account")).toEqual({ page: "account", creating: false });
    expect(parseRoute("/account/")).toEqual({ page: "account", creating: false });
    expect(parseRoute("/account/new")).toEqual({ page: "account", creating: true });
    expect(layerFor({ page: "account", creating: false })).toBe("hub");
  });
});

describe("the home page's way in (account-page)", () => {
  it("sends a signed-out visitor to the account page, not the pages that move them on", () => {
    render(<AccountLinks />);
    expect(hrefOf("Sign in")).toBe("/account");
    expect(hrefOf("Create account")).toBe("/account/new");
  });

  it("reaches the account page from the account menu", () => {
    accountStore.setState({ status: "signedIn", account: sam });
    render(<AccountMenu />);
    fireEvent.click(screen.getByRole("button", { name: "Sam" }));
    fireEvent.click(screen.getByRole("button", { name: "Your account" }));
    expect(navigate).toHaveBeenCalledWith("/account");
  });
});

describe("signed out on the account page (account-page)", () => {
  it("shows nothing until it knows who this is", () => {
    accountStore.setState({ status: "loading" });
    const { container } = render(<AccountPage creating={false} />);
    expect(container.textContent).toBe("");
  });

  it("offers sign-in, and a link to create an account that stays on this page", () => {
    render(<AccountPage creating={false} />);
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(hrefOf("Create an account")).toBe("/account/new");
  });

  it("stays here once signed in, showing the account", async () => {
    signIn.mockImplementation(async () => signsIn());
    render(<AccountPage creating={false} />);
    type(/^Email/, "sam@example.com");
    type(/^Password/, "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeTruthy();
    expect(signIn).toHaveBeenCalledWith("sam@example.com", "correct horse");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows a refusal in place, keeps the email and clears the password", async () => {
    signIn.mockRejectedValue(new ApiError("Email or password is incorrect.", 401, {}));
    render(<AccountPage creating={false} />);
    type(/^Email/, "sam@example.com");
    type(/^Password/, "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Email or password is incorrect.");
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe("sam@example.com");
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe("");
  });

  it("creates an account at /account/new, then settles on /account", async () => {
    signUp.mockImplementation(async () => signsIn());
    render(<AccountPage creating />);
    expect(hrefOf("Sign in")).toBe("/account");
    type(/^Display name/, "Sam");
    type(/^Email/, "sam@example.com");
    type(/^Password/, "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeTruthy();
    expect(signUp).toHaveBeenCalledWith("sam@example.com", "correct horse", "Sam");
    expect(navigate).toHaveBeenCalledWith("/account", { replace: true });
  });
});

describe("signed in on the account page (account-page)", () => {
  beforeEach(() => signsIn());

  it("shows who is signed in and the way to their rooms", () => {
    render(<AccountPage creating={false} />);
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText("sam@example.com")).toBeTruthy();
    expect(hrefOf("Your rooms")).toBe("/gm-dashboard");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("opens the password and delete dialogs", () => {
    render(<AccountPage creating={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText(/^Current password/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByText(/permanent and cannot be undone/)).toBeTruthy();
  });

  it("returns home on sign out", async () => {
    signOut.mockResolvedValue(undefined);
    render(<AccountPage creating={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
  });
});

describe("the pages that send a person back (gm-home: Account screens)", () => {
  it("still returns sign-in to `next`, and keeps it on the way to sign-up", async () => {
    history.replaceState(null, "", "/signin?next=%2Flibrary");
    signIn.mockResolvedValue(undefined);
    render(<SignInPage />);
    expect(hrefOf("Create an account")).toBe("/signup?next=%2Flibrary");
    type(/^Email/, "sam@example.com");
    type(/^Password/, "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/library", { replace: true }));
  });

  it("still sends sign-up to the dashboard without a `next`", async () => {
    history.replaceState(null, "", "/signup");
    signUp.mockResolvedValue(undefined);
    render(<SignUpPage />);
    expect(hrefOf("Sign in")).toBe("/signin");
    type(/^Display name/, "Sam");
    type(/^Email/, "sam@example.com");
    type(/^Password/, "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/gm-dashboard", { replace: true }));
  });
});
