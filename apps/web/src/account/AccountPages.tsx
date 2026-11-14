import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { t } from "../i18n/locale";
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
      return { message: t("account.tooManyAttempts", { minutes }) };
    }
    return { message: err.message, field: err.detail.field };
  }
  return { message: t("account.networkError") };
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
      <p className="small-print">
        <Link href="/start">{t("account.continueGuest")}</Link>
      </p>
      <Link href="/">{t("account.backHome")}</Link>
    </form>
  );
}

/** Rooms made on this browser before accounts can come along once the GM signs in (gm-dashboard). */
function LegacyNote() {
  if (!loadGmToken()) return null;
  return (
    <p className="notice">{t("account.legacyNote")}</p>
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
      title={t("account.signIn")}
      submitLabel={t("account.signIn")}
      busyLabel={t("account.signingIn")}
      busy={busy}
      error={error}
      onSubmit={() => void submit()}
      footer={
        <>
          {t("account.newHere")} <Link href={createHref}>{t("account.createAnAccount")}</Link>
        </>
      }
    >
      <LegacyNote />
      <label>
        {t("account.email")}
        <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        {t("account.password")}
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
      title={t("account.createAnAccount")}
      submitLabel={t("account.createSubmit")}
      busyLabel={t("account.creating")}
      busy={busy}
      error={error && !error.field ? error.message : null}
      onSubmit={() => void submit()}
      footer={
        <>
          {t("account.signUpFooter")}{" "}
          <Link href={signInHref}>{t("account.signIn")}</Link>
        </>
      }
    >
      <LegacyNote />
      <label>
        {t("account.displayName")}
        <input autoComplete="nickname" required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        {fieldError("displayName")}
      </label>
      <label>
        {t("account.email")}
        <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        {fieldError("email")}
      </label>
      <label>
        {t("account.password")}
        <span className="muted small">{t("account.passwordLength", { min: PASSWORD_MIN, max: PASSWORD_MAX })}</span>
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
        {t("account.agree.before")}<Link href="/terms">{t("account.agree.terms")}</Link>{t("account.agree.middle")}
        <Link href="/privacy">{t("account.agree.privacy")}</Link>{t("account.agree.after")}
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
      {t("account.signOut")}
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
          <h1>{t("account.yourAccount")}</h1>
          <AccountSection title={t("account.signedInAs")}>
            <p className="account-who">
              <strong>{account.displayName}</strong>
              <span>{account.email}</span>
            </p>
          </AccountSection>
          <AccountSection title={t("account.security")}>
            <AccountRow
              title={t("account.password")}
              detail={t("account.passwordDetail")}
              action={
                <button type="button" className="secondary" onClick={() => setChanging(true)}>
                  {t("account.changePassword")}
                </button>
              }
            />
          </AccountSection>
          <AccountSection title={t("account.thisBrowser")}>
            <AccountRow
              title={t("account.soundGraphics")}
              detail={t("account.savedHere")}
              action={
                <button type="button" className="secondary" onClick={() => setSettingsOpen(true)}>
                  {t("account.openSettings")}
                </button>
              }
            />
            <AccountRow
              title={t("account.signedInHere")}
              detail={t("account.otherDevicesStay")}
              action={<SignOutButton className="secondary" />}
            />
          </AccountSection>
          <AccountSection title={t("account.yourData")}>
            <AccountRow
              title={t("account.dataRow")}
              detail={t("account.dataDetail")}
              action={
                <button type="button" className="secondary danger" onClick={() => setDeleting(true)}>
                  {t("account.deleteAccount")}
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
        title={t("account.menu")}
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
                {t("account.yourAccount")}
              </Link>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  close();
                  setSettingsOpen(true);
                }}
              >
                {t("account.soundGraphics")}
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
    <Modal open={open} title={t("account.changePassword")} onClose={() => !busy && close()} initialFocus={firstRef}>
      {done ? (
        <>
          <p>{t("account.passwordChanged")}</p>
          <div className="row modal-actions">
            <button type="button" className="primary" onClick={close}>
              {t("common.done")}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <label>
            {t("account.currentPassword")}
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
            {t("account.newPassword")}
            <span className="muted small">{t("account.newPasswordHint", { min: PASSWORD_MIN, max: PASSWORD_MAX })}</span>
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
              {t("common.cancel")}
            </button>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t("account.changing") : t("account.changePassword")}
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
    <Modal open={open} title={t("account.deleteAccount")} onClose={() => !busy && close()} initialFocus={firstRef}>
      <form onSubmit={(e) => void submit(e)}>
        <div className="notice delete-account-warning" role="note">
          <p>
            <strong>{t("account.delete.warning")}</strong> {t("account.delete.removes")}
          </p>
          <ul>
            <li>{t("account.delete.rooms")}</li>
            <li>{t("account.delete.library")}</li>
            <li>{t("account.delete.uploads")}</li>
            <li>{t("account.delete.sessions")}</li>
          </ul>
        </div>
        <label>
          {t("account.delete.typeBefore")}<strong>{email}</strong>{t("account.delete.typeAfter")}
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
          {t("account.password")}
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
            {t("common.cancel")}
          </button>
          <button className="danger-fill" type="submit" disabled={!ready}>
            {busy ? t("account.deleting") : t("account.deleteAccount")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
