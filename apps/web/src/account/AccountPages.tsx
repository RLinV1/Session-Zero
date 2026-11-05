import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PASSWORD_MAX, PASSWORD_MIN, type AccountView } from "@vtt/shared";
import { Link } from "../Link";
import { EntryPage, HubNav, SiteHeader } from "../ui/SiteHeader";
import { ApiError } from "../net/api";
import { loadGmToken } from "../net/identity";
import { navigate } from "../router";
import { Modal } from "../ui/Modal";
import { SettingsMenu } from "../ui/SettingsMenu";
import { SiteFooter } from "../ui/SiteFooter";
import { changePassword, deleteAccount, signIn, signOut, signUp, useAccount } from "./accountStore";
import { safeNext } from "./safeNext";

/** Where to go after signing in: the page that sent the person here, if it is on this site. */
const nextFromUrl = () => safeNext(new URLSearchParams(location.search).get("next"));

/** Keeps `next` when switching between sign-in and sign-up. */
const withNext = (path: string) => {
  const next = new URLSearchParams(location.search).get("next");
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
};

/** A message for a refused account request, worded for the person, not the HTTP status. */
function describe(err: unknown): { message: string; field?: string } {
  if (err instanceof ApiError) {
    if (err.status === 429) {
      const minutes = Math.max(1, Math.ceil((err.detail.retryAfterSec ?? 60) / 60));
      return { message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
    }
    return { message: err.message, field: err.detail.field };
  }
  return { message: "Something went wrong. Check your connection and try again." };
}

/**
 * Where this screen sends the person once they are signed in, read once as it renders: by the
 * time a submit finishes, the address may already be the destination's. A visitor who is signed
 * in already is sent straight on.
 */
function useDestination() {
  const account = useAccount();
  const [next] = useState(nextFromUrl);
  useEffect(() => {
    if (account.status === "signedIn") navigate(next, { replace: true });
  }, [account.status, next]);
  return { status: account.status, next };
}

function AccountForm(props: {
  title: string;
  submitLabel: string;
  busyLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <form
      className="card account-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      <h1>{props.title}</h1>
      {props.children}
      {props.error && (
        <p role="alert" className="error">
          {props.error}
        </p>
      )}
      <button className="primary" type="submit" disabled={props.busy}>
        {props.busy ? props.busyLabel : props.submitLabel}
      </button>
      <p className="muted small-print">{props.footer}</p>
      <Link href="/">Back to home</Link>
    </form>
  );
}

/** Rooms made on this browser before accounts can come along once the GM signs in (gm-dashboard). */
function LegacyNote() {
  if (!loadGmToken()) return null;
  return (
    <p className="notice">
      This browser has rooms or library art from before accounts. Sign in or create an account, and you can bring them
      with you from your rooms page.
    </p>
  );
}

/** The sign-in form. Where it leads is its page's choice: `onSignedIn`, and the link to create an account. */
function SignInForm({ createHref, onSignedIn }: { createHref: string; onSignedIn?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      onSignedIn?.();
    } catch (err) {
      setError(describe(err).message);
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <AccountForm
      title="Sign in"
      submitLabel="Sign in"
      busyLabel="Signing in…"
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      footer={
        <>
          New here? <Link href={createHref}>Create an account</Link>
        </>
      }
    >
      <LegacyNote />
      <label>
        Email
        <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
    </AccountForm>
  );
}

/** The sign-up form, with the same two choices left to its page as `SignInForm`. */
function SignUpForm({ signInHref, onSignedUp }: { signInHref: string; onSignedUp?: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signUp(email, password, displayName);
      onSignedUp?.();
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  const fieldError = (field: string) =>
    error?.field === field ? (
      <span role="alert" className="error small">
        {error.message}
      </span>
    ) : null;

  return (
    <AccountForm
      title="Create an account"
      submitLabel="Create account"
      busyLabel="Creating…"
      busy={busy}
      error={error && !error.field ? error.message : null}
      onSubmit={() => void submit()}
      footer={
        <>
          A free account is needed to host a game; players join from your invite link with no account. Already have one?{" "}
          <Link href={signInHref}>Sign in</Link>
        </>
      }
    >
      <LegacyNote />
      <label>
        Display name
        <input autoComplete="nickname" required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        {fieldError("displayName")}
      </label>
      <label>
        Email
        <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        {fieldError("email")}
      </label>
      <label>
        Password
        <span className="muted small">
          {PASSWORD_MIN} to {PASSWORD_MAX} characters.
        </span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {fieldError("password")}
      </label>
      <p className="muted small-print">
        By creating an account you agree to the <Link href="/terms">terms</Link> and the{" "}
        <Link href="/privacy">privacy notice</Link>.
      </p>
    </AccountForm>
  );
}

export function SignInPage() {
  const { status, next } = useDestination();
  if (status !== "signedOut") return null;
  return (
    <EntryPage>
      <SignInForm createHref={withNext("/signup")} onSignedIn={() => navigate(next, { replace: true })} />
    </EntryPage>
  );
}

export function SignUpPage() {
  const { status, next } = useDestination();
  if (status !== "signedOut") return null;
  return (
    <EntryPage>
      <SignUpForm signInHref={withNext("/signin")} onSignedUp={() => navigate(next, { replace: true })} />
    </EntryPage>
  );
}

/**
 * The account page (account-page), one step from the home page's header. Signed out, it is where a
 * visitor signs in or creates an account, and they stay here afterwards: `/signin` and `/signup`
 * are for a page that needs an account and sends the person back to it. Signed in, it is the
 * account itself.
 */
export function AccountPage({ creating }: { creating: boolean }) {
  const account = useAccount();
  const signedIn = account.status === "signedIn";
  useEffect(() => {
    if (signedIn && creating) navigate("/account", { replace: true });
  }, [signedIn, creating]);

  if (account.status === "loading") return null;
  if (account.status === "signedIn") return <AccountOverview account={account.account} />;
  return (
    <div className="entry">
      <div className="page-shell page-bar">
        <SiteHeader />
      </div>
      <main className="entry-main">
        {creating ? <SignUpForm signInHref="/account" /> : <SignInForm createHref="/account/new" />}
      </main>
      <SiteFooter />
    </div>
  );
}

function AccountRow({ title, detail, action }: { title: string; detail: string; action: ReactNode }) {
  return (
    <section className="account-row">
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action}
    </section>
  );
}

/** Signed in: who this is, and what the account menu offers, as a page of its own. */
function AccountOverview({ account }: { account: AccountView }) {
  const [changing, setChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="account-page">
      <div className="page-shell page-bar">
        <SiteHeader nav={<HubNav />} />
      </div>
      <main className="page-shell">
        <div className="account-overview">
          <header>
            <h1>Your account</h1>
            <p>
              <strong>{account.displayName}</strong>
              <br />
              <span className="muted">{account.email}</span>
            </p>
          </header>
          <AccountRow
            title="Sound and graphics"
            detail="Saved in this browser."
            action={
              <button type="button" className="secondary" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
            }
          />
          <AccountRow
            title="Password"
            detail="Changing it signs out your other devices."
            action={
              <button type="button" className="secondary" onClick={() => setChanging(true)}>
                Change password
              </button>
            }
          />
          <AccountRow
            title="This device"
            detail="Your other devices stay signed in."
            action={
              <button
                type="button"
                className="secondary"
                onClick={() => void signOut().then(() => navigate("/", { replace: true }))}
              >
                Sign out
              </button>
            }
          />
          <AccountRow
            title="Delete account"
            detail="Permanently removes your rooms, library and uploaded images."
            action={
              <button type="button" className="secondary danger" onClick={() => setDeleting(true)}>
                Delete account
              </button>
            }
          />
        </div>
      </main>
      <SiteFooter />
      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
      <DeleteAccountDialog open={deleting} email={account.email} onClose={() => setDeleting(false)} />
      <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/** The header's account menu on GM surfaces: who is signed in, change password, sign out. */
export function AccountMenu() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  if (account.status !== "signedIn") return null;
  return (
    <div className="account-menu">
      <button
        type="button"
        className="secondary small"
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={() => setOpen(!open)}
      >
        {account.account.displayName}
      </button>
      {open && (
        <div id="account-menu-panel" className="account-menu-panel">
          <p>
            <strong>{account.account.displayName}</strong>
            <br />
            <span className="muted">{account.account.email}</span>
          </p>
          <button type="button" className="secondary small" onClick={() => navigate("/account")}>
            Your account
          </button>
          <button type="button" className="secondary small" onClick={() => { setOpen(false); setSettingsOpen(true); }}>
            Settings
          </button>
          <button type="button" className="secondary small" onClick={() => setChanging(true)}>
            Change password
          </button>
          <button type="button" className="secondary small" onClick={() => setDeleting(true)}>
            Delete account
          </button>
          <button
            type="button"
            className="secondary small"
            onClick={() => void signOut().then(() => navigate("/", { replace: true }))}
          >
            Sign out
          </button>
        </div>
      )}
      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
      <DeleteAccountDialog open={deleting} email={account.account.email} onClose={() => setDeleting(false)} />
      <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  function close() {
    setCurrent("");
    setNext("");
    setError(null);
    setDone(false);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(describe(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Change password" onClose={() => !busy && close()} initialFocus={firstRef}>
      {done ? (
        <>
          <p>Your password is changed. Your other devices are signed out.</p>
          <div className="row modal-actions">
            <button type="button" className="primary" onClick={close}>
              Done
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <label>
            Current password
            <input
              ref={firstRef}
              type="password"
              autoComplete="current-password"
              required
              maxLength={PASSWORD_MAX}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            New password
            <span className="muted small">
              {PASSWORD_MIN} to {PASSWORD_MAX} characters. Your other devices will be signed out.
            </span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <button type="button" className="secondary" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? "Changing…" : "Change password"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Permanent account deletion, gated by the typed email and the password (account-deletion). */
export function DeleteAccountDialog({ open, email, onClose }: { open: boolean; email: string; onClose: () => void }) {
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  const emailMatches = typedEmail.trim().toLowerCase() === email.trim().toLowerCase();
  const ready = emailMatches && password.length > 0 && !busy;

  function close() {
    setTypedEmail("");
    setPassword("");
    setError(null);
    onClose();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      close();
      navigate("/", { replace: true });
    } catch (err) {
      setError(describe(err));
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  const passwordError = error?.field === "password" ? error.message : null;
  const otherError = error && error.field !== "password" ? error.message : null;

  return (
    <Modal open={open} title="Delete account" onClose={() => !busy && close()} initialFocus={firstRef}>
      <form onSubmit={(e) => void submit(e)}>
        <div className="notice delete-account-warning" role="note">
          <p>
            <strong>Deleting your account is permanent and cannot be undone.</strong> This removes:
          </p>
          <ul>
            <li>your rooms and their history</li>
            <li>your library</li>
            <li>uploaded images</li>
            <li>your sessions on every device</li>
          </ul>
        </div>
        <label>
          Type <strong>{email}</strong> to confirm
          <input
            ref={firstRef}
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
            value={typedEmail}
            onChange={(e) => setTypedEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            maxLength={PASSWORD_MAX}
            value={password}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={passwordError ? "delete-account-password-error" : undefined}
            onChange={(e) => setPassword(e.target.value)}
          />
          {passwordError && (
            <span id="delete-account-password-error" role="alert" className="error small">
              {passwordError}
            </span>
          )}
        </label>
        {otherError && (
          <p role="alert" className="error">
            {otherError}
          </p>
        )}
        <div className="row modal-actions">
          <button type="button" className="secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button className="danger-fill" type="submit" disabled={!ready}>
            {busy ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
