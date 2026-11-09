// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** What the real store does on a successful sign-in. */
const signsIn = () => accountStore.setState({ status: "signedIn", account: sam });
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Sam" }));

describe("the account page's address (account-page)", () => {
  it("is its own route on the hub's ground", () => {
    expect(parseRoute("/account")).toEqual({ page: "account" });
    expect(parseRoute("/account/")).toEqual({ page: "account" });
    expect(layerFor({ page: "account" })).toBe("hub");
  });

  it("sends an old create-account link to the sign-up form", () => {
    expect(parseRoute("/account/new")).toEqual({ page: "signup" });
  });
});

describe("signing in from the home page (account-page)", () => {
  it("links to the sign-in and sign-up pages, not the account page", () => {
    render(<AccountLinks />);
    expect(hrefOf("Sign in")).toBe("/signin");
    expect(hrefOf("Create account")).toBe("/signup");
  });

  it("lands on the person's rooms after signing in", async () => {
    history.replaceState(null, "", "/signin");
    signIn.mockImplementation(async () => signsIn());
    render(<SignInPage />);
    type(/^Email/, "sam@example.com");
    type(/^Password/, "correct horse");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/gm-dashboard", { replace: true }));
    expect(signIn).toHaveBeenCalledWith("sam@example.com", "correct horse");
    expect(navigate).not.toHaveBeenCalledWith("/account", expect.anything());
  });

  it("shows a refusal in place, keeps the email and clears the password", async () => {
    history.replaceState(null, "", "/signin");
    signIn.mockRejectedValue(new ApiError("Email or password is incorrect.", 401, {}));
    render(<SignInPage />);
    type(/^Email/, "sam@example.com");
    type(/^Password/, "wrong");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Email or password is incorrect.");
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe("sam@example.com");
    expect((screen.getByLabelText(/^Password/) as HTMLInputElement).value).toBe("");
  });
});

describe("the account menu (account-page)", () => {
  beforeEach(() => signsIn());

  it("is the way to the account page", () => {
    render(<AccountMenu />);
    openMenu();
    expect(hrefOf("Your account")).toBe("/account");
    fireEvent.click(screen.getByRole("link", { name: "Your account" }));
    expect(navigate).toHaveBeenCalledWith("/account");
  });

  it("says who is signed in and keeps to the everyday actions", () => {
    render(<AccountMenu />);
    openMenu();
    const menu = within(screen.getByRole("dialog", { name: "Account" }));
    expect(menu.getByText("sam@example.com")).toBeTruthy();
    expect(menu.getByRole("button", { name: "Sound and graphics" })).toBeTruthy();
    expect(menu.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(menu.queryByRole("button", { name: "Delete account" })).toBeNull();
    expect(menu.queryByRole("button", { name: "Change password" })).toBeNull();
  });

  it("closes on Escape and hands focus back to its button", () => {
    render(<AccountMenu />);
    openMenu();
    fireEvent.keyDown(screen.getByRole("link", { name: "Your account" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Account" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sam" }));
  });

  it("hands focus back to its button when the settings it opened close", () => {
    render(<AccountMenu />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Sound and graphics" }));
    expect(screen.queryByRole("dialog", { name: "Account" })).toBeNull();
    const settings = screen.getByRole("heading", { name: "Settings" }).closest("dialog")!;
    fireEvent(settings, new Event("close"));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sam" }));
  });

  it("marks the account page as the current one only when on it", () => {
    render(<AccountMenu onAccountPage />);
    openMenu();
    expect(screen.getByRole("link", { name: "Your account" }).getAttribute("aria-current")).toBe("page");
    cleanup();
    render(<AccountMenu />);
    openMenu();
    expect(screen.getByRole("link", { name: "Your account" }).getAttribute("aria-current")).toBeNull();
  });

  it("returns home on sign out", async () => {
    signOut.mockResolvedValue(undefined);
    render(<AccountMenu />);
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
  });
});

describe("signed out on the account page (account-page)", () => {
  it("shows nothing until it knows who this is", () => {
    accountStore.setState({ status: "loading" });
    const { container } = render(<AccountPage />);
    expect(container.textContent).toBe("");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("hands over to sign-in with no way back to this page", () => {
    const { container } = render(<AccountPage />);
    expect(container.textContent).toBe("");
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/signin", { replace: true });
  });
});

describe("signed in on the account page (account-page)", () => {
  beforeEach(() => signsIn());

  it("shows who is signed in and the way to their rooms", () => {
    render(<AccountPage />);
    const page = within(screen.getByRole("main"));
    expect(page.getByRole("heading", { name: "Your account" })).toBeTruthy();
    expect(page.getByText("Sam")).toBeTruthy();
    expect(page.getByText("sam@example.com")).toBeTruthy();
    expect(hrefOf("Your rooms")).toBe("/gm-dashboard");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("groups what the account can do by what it touches, deletion last", () => {
    render(<AccountPage />);
    const groups = within(screen.getByRole("main")).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(groups).toEqual(["Signed in as", "Security", "This browser", "Your data"]);
  });

  it("keeps the account control in the header", () => {
    render(<AccountPage />);
    expect(screen.getByRole("button", { name: "Sam" })).toBeTruthy();
  });

  it("opens the password, delete and settings dialogs", () => {
    render(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText(/^Current password/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(screen.getByText(/permanent and cannot be undone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy();
  });

  it("returns home on sign out, and can only be pressed once", async () => {
    signOut.mockResolvedValue(undefined);
    render(<AccountPage />);
    const button = screen.getByRole("button", { name: "Sign out" }) as HTMLButtonElement;
    fireEvent.click(button);
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/", { replace: true }));
    expect(signOut).toHaveBeenCalledTimes(1);
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
