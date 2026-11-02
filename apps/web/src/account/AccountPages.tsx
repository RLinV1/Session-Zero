import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { PASSWORD_MAX, PASSWORD_MIN } from "@vtt/shared";
import { Link } from "../Link";
import { EntryPage } from "../ui/SiteHeader";
import { ApiError } from "../net/api";
import { loadGmToken } from "../net/identity";
import { navigate } from "../router";
import { Modal } from "../ui/Modal";
import { SettingsMenu } from "../ui/SettingsMenu";
import { changePassword, signIn, signOut, signUp, useAccount } from "./accountStore";
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
    <EntryPage>
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
    </EntryPage>
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

export function SignInPage() {
  const { status, next } = useDestination();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (status !== "signedOut") return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate(next, { replace: true });
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
          New here? <Link href={withNext("/signup")}>Create an account</Link>
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

export function SignUpPage() {
  const { status, next } = useDestination();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  if (status !== "signedOut") return null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signUp(email, password, displayName);
      navigate(next, { replace: true });
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
          <Link href={withNext("/signin")}>Sign in</Link>
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
    </AccountForm>
  );
}

/** The header's account menu on GM surfaces: who is signed in, change password, sign out. */
export function AccountMenu() {
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
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
          <button type="button" className="secondary small" onClick={() => { setOpen(false); setSettingsOpen(true); }}>
            Settings
          </button>
          <button type="button" className="secondary small" onClick={() => setChanging(true)}>
            Change password
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
