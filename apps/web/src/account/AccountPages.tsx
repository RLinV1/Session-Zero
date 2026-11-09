import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { PASSWORD_MAX, PASSWORD_MIN, type AccountView } from "@vtt/shared";
import { Link } from "../Link";
import { EntryPage, HubNav, SiteHeader } from "../ui/SiteHeader";
import { ApiError } from "../net/api";
import { loadGmToken } from "../net/identity";
import { navigate } from "../router";
import { Modal } from "../ui/Modal";
import { PopoverButton } from "../ui/Popover";
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

function SignInForm({ createHref, onSignedIn }: { createHref: string; onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      onSignedIn();
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

function SignUpForm({ signInHref, onSignedUp }: { signInHref: string; onSignedUp: () => void }) {
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
      onSignedUp();
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
 * The account page (account-page), reached from "Your account" in the account menu and never as
 * the end of signing in. Signed out there is nothing to show, so it hands over to sign-in with no
 * `next`, and signing in then lands on the person's rooms as usual.
 */
export function AccountPage() {
  const account = useAccount();
  const signedOut = account.status === "signedOut";
  useEffect(() => {
    if (signedOut) navigate("/signin", { replace: true });
  }, [signedOut]);

  if (account.status !== "signedIn") return null;
  return <AccountOverview account={account.account} />;
}

/** Ends this device's session and goes home. Disabled once pressed, so it can't send twice. */
function SignOutButton({ className }: { className: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut().then(() => navigate("/", { replace: true }));
      }}
    >
      Sign out
    </button>
  );
}

/** One subject of the account: its name at the left, what is there to see or do at the right. */
function AccountSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="account-section">
      <h2>{title}</h2>
      <div className="account-rows">{children}</div>
    </section>
  );
}

function AccountRow({ title, detail, action }: { title: string; detail: string; action: ReactNode }) {
  return (
    <div className="account-row">
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

/**
 * Signed in: who this is and everything that changes the account, grouped by what it touches.
 * Nothing here is the page's one main action, so nothing is rust; deleting goes last and only
 * its label is in the danger colour, with the fill kept for the dialog that confirms it.
 */
function AccountOverview({ account }: { account: AccountView }) {
  const [changing, setChanging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="account-page">
      <div className="page-shell page-bar">
        <SiteHeader nav={<HubNav />} account={<AccountMenu onAccountPage />} />
      </div>
      <main className="page-shell">
        <div className="account-overview">
          <h1>Your account</h1>
          <AccountSection title="Signed in as">
            <p className="account-who">
              <strong>{account.displayName}</strong>
              <span>{account.email}</span>
            </p>
          </AccountSection>
          <AccountSection title="Security">
            <AccountRow
              title="Password"
              detail="Changing it signs out your other devices."
              action={
                <button type="button" className="secondary" onClick={() => setChanging(true)}>
                  Change password
                </button>
              }
            />
          </AccountSection>
          <AccountSection title="This browser">
            <AccountRow
              title="Sound and graphics"
              detail="Saved here, not on your account."
              action={
                <button type="button" className="secondary" onClick={() => setSettingsOpen(true)}>
                  Open settings
                </button>
              }
            />
            <AccountRow
              title="Signed in here"
              detail="Your other devices stay signed in."
              action={<SignOutButton className="secondary" />}
            />
          </AccountSection>
          <AccountSection title="Your data">
            <AccountRow
              title="Rooms, library and uploaded images"
              detail="Deleting your account removes these permanently. It can't be undone."
              action={
                <button type="button" className="secondary danger" onClick={() => setDeleting(true)}>
                  Delete account
                </button>
              }
            />
          </AccountSection>
        </div>
      </main>
      <SiteFooter />
      <ChangePasswordDialog open={changing} onClose={() => setChanging(false)} />
      <DeleteAccountDialog open={deleting} email={account.email} onClose={() => setDeleting(false)} />
      <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/**
 * The header's account control: who is signed in and the short list a person wants between pages.
 * Changing the password and deleting the account are on the account page, one step on, so the
 * permanent action never sits beside everyday ones.
 */
export function AccountMenu({ onAccountPage = false }: { onAccountPage?: boolean }) {
  const account = useAccount();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (account.status !== "signedIn") return null;
  const { displayName, email } = account.account;
  return (
    <>
      <PopoverButton
        label={displayName}
        title="Account"
        align="right"
        placement="fixed"
        className="account-trigger"
        buttonRef={buttonRef}
        buttonContent={
          <>
            {displayName}
            <CaretDown aria-hidden="true" />
          </>
        }
      >
        {(close) => (
          <div className="account-menu">
            <p className="account-who">
              <strong>{displayName}</strong>
              <span>{email}</span>
            </p>
            <div className="menu-list">
              <Link href="/account" className="menu-item" aria-current={onAccountPage ? "page" : undefined} onClick={close}>
                Your account
              </Link>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  setSettingsOpen(true);
                }}
              >
                Sound and graphics
              </button>
            </div>
            <div className="menu-list">
              <SignOutButton className="menu-item" />
            </div>
          </div>
        )}
      </PopoverButton>
      <SettingsMenu open={settingsOpen} onClose={() => setSettingsOpen(false)} onAfterClose={() => buttonRef.current?.focus()} />
    </>
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
