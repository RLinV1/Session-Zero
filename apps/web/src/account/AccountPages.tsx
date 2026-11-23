import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { t } from "../i18n/locale";
import { CaretDown } from "@phosphor-icons/react";
import { ReferralSource, EMAIL_UNVERIFIED_CODE, PASSWORD_MAX, PASSWORD_MIN, type AccountView } from "@vtt/shared";
import { Link } from "../Link";
import { EntryPage, HubNav, SiteHeader } from "../ui/SiteHeader";
import { ApiError } from "../net/api";
import { navigate } from "../router";
import { Modal } from "../ui/Modal";
import { PopoverButton } from "../ui/Popover";
import { SettingsMenu } from "../ui/SettingsMenu";
import { SiteFooter } from "../ui/SiteFooter";
import { changePassword, deleteAccount, forgotPassword, resendVerification, resetPassword, signIn, signOut, signUp, useAccount, verifyEmail } from "./accountStore";
import { DEFAULT_NEXT, safeNext, signInFor } from "./safeNext";

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
  compact?: boolean;
  error: string | null;
  errorAction?: ReactNode;
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
      <div className="guest-option">
        <Link href="/start" className="cta" aria-describedby={props.compact ? undefined : "account-guest-hint"}>
          {t("account.continueGuest")}
        </Link>
        {!props.compact && <p id="account-guest-hint" className="muted small-print">{t("account.guestHint")}</p>}
      </div>
      <div className="guest-divider">{t(props.compact ? "account.or" : "account.orUseAccount")}</div>
      {props.children}
      {props.error && (
        <p role="alert" className="error">
          {props.error}
        </p>
      )}
      {props.error && props.errorAction}
      <button className="primary" type="submit" disabled={props.busy}>
        {props.busy ? props.busyLabel : props.submitLabel}
      </button>
      <div className="account-form-footer">
        <p className="muted small-print">{props.footer}</p>
        {!props.compact && <Link href="/">{t("account.backHome")}</Link>}
      </div>
    </form>
  );
}


function ResendButton({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function resend() {
    setBusy(true);
    setFeedback(null);
    try {
      await resendVerification(email.trim());
      setFeedback({ ok: true, text: t("account.verify.resent") });
    } catch (err) {
      setFeedback({ ok: false, text: describe(err).message });
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" disabled={busy || !email.trim()} onClick={() => void resend()}>
        {busy ? t("account.verify.resending") : t("account.verify.resend")}
      </button>
      {feedback && (
        <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "muted small-print" : "error"}>
          {feedback.text}
        </p>
      )}
    </>
  );
}

function CheckEmailPanel({ email, signInHref }: { email: string; signInHref: string }) {
  return (
    <section className="card account-form">
      <h1>{t("account.verify.sentTitle")}</h1>
      <p>{t("account.verify.sentBody", { email })}</p>
      <ResendButton email={email} />
      <p className="muted small-print">
        <Link href={signInHref}>{t("account.signIn")}</Link>
      </p>
      <Link href="/">{t("account.backHome")}</Link>
    </section>
  );
}

function SignInForm({ createHref, onSignedIn }: { createHref: string; onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      await signIn(email, password);
      onSignedIn();
    } catch (err) {
      const needsVerifying = err instanceof ApiError && err.detail.code === EMAIL_UNVERIFIED_CODE;
      setUnverified(needsVerifying);
      setError(needsVerifying ? t("account.verify.unverified") : describe(err).message);
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
      errorAction={unverified ? <ResendButton email={email} /> : undefined}
      onSubmit={() => void submit()}
      footer={
        <>
          {t("account.newHere")} <Link href={createHref}>{t("account.createAnAccount")}</Link>
        </>
      }
    >      <label>
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
      <Link href="/forgot-password">{t("account.forgot.link")}</Link>
    </AccountForm>
  );
}

function SignUpForm({ signInHref, onSignedUp }: { signInHref: string; onSignedUp: () => void }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [source] = useState(() => ReferralSource.safeParse(new URLSearchParams(location.search).get("r")).data);

  async function submit() {
    if (password !== confirmPassword) {
      setError({ message: t("account.passwordMismatch"), field: "confirmPassword" });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pending = await signUp(email, password, displayName, source);
      if (pending) setSentTo(pending.email);
      else onSignedUp();
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  if (sentTo) return <CheckEmailPanel email={sentTo} signInHref={signInHref} />;

  const fieldError = (field: string) =>
    error?.field === field ? (
      <span id={`signup-${field}-error`} role="alert" className="error small">
        {error.message}
      </span>
    ) : null;

  return (
    <AccountForm
      compact
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
      <div className="account-password-field">
        <div className="account-password-label">
          <label htmlFor="signup-password">{t("account.password")}</label>
          <span id="signup-password-hint" className="muted small">{t("account.passwordLength", { min: PASSWORD_MIN, max: PASSWORD_MAX })}</span>
        </div>
        <input
          id="signup-password"
          aria-describedby="signup-password-hint"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {fieldError("password")}
      </div>
      <div className="account-password-field">
        <label htmlFor="signup-confirm-password">{t("account.confirmPassword")}</label>
        <input
          id="signup-confirm-password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={PASSWORD_MAX}
          value={confirmPassword}
          aria-invalid={error?.field === "confirmPassword" || undefined}
          aria-describedby={error?.field === "confirmPassword" ? "signup-confirmPassword-error" : undefined}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {fieldError("confirmPassword")}
      </div>
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

export function VerifyEmailPage() {
  const [next] = useState(nextFromUrl);
  const [token] = useState(() => new URLSearchParams(location.search).get("token"));
  const [failed, setFailed] = useState(!token);
  const [verified, setVerified] = useState(false);
  const [email, setEmail] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    history.replaceState(history.state, "", location.pathname);
    verifyEmail(token).then(
      () => setVerified(true),
      () => setFailed(true),
    );
  }, [token]);

  return (
    <EntryPage>
      <section className="card account-form">
        {failed ? (
          <>
            <h1>{t("account.verify.failedTitle")}</h1>
            <p>{t("account.verify.failedBody")}</p>
            <label>
              {t("account.email")}
              <input type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <ResendButton email={email} />
            <Link href="/signin">{t("account.signIn")}</Link>
          </>
        ) : verified ? (
          <>
            <h1>{t("account.verify.doneTitle")}</h1>
            <p role="status">{t("account.verify.doneBody")}</p>
            <Link href={signInFor(next)}>{t("account.signIn")}</Link>
          </>
        ) : (
          <p role="status">{t("account.verify.working")}</p>
        )}
      </section>
    </EntryPage>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(describe(err).message);
    }
    setBusy(false);
  }

  return (
    <EntryPage>
      <form className="card account-form" onSubmit={(e) => void submit(e)}>
        <h1>{t("account.forgot.title")}</h1>
        {sent ? (
          <p role="status">{t("account.forgot.sent")}</p>
        ) : (
          <>
            <p>{t("account.forgot.body")}</p>
            <label>
              {t("account.email")}
              <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t("account.verify.resending") : t("account.forgot.submit")}
            </button>
          </>
        )}
        <Link href="/signin">{t("account.signIn")}</Link>
      </form>
    </EntryPage>
  );
}

export function ResetPasswordPage() {
  const [token] = useState(() => new URLSearchParams(location.search).get("token"));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(!token);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      navigate(DEFAULT_NEXT, { replace: true });
    } catch (err) {
      const described = describe(err);
      if (err instanceof ApiError && err.status === 400 && !described.field) setFailed(true);
      else setError(described.message);
      setBusy(false);
    }
  }

  if (failed) {
    return (
      <EntryPage>
        <section className="card account-form">
          <h1>{t("account.reset.failedTitle")}</h1>
          <p>{t("account.reset.failedBody")}</p>
          <Link href="/forgot-password">{t("account.reset.requestNew")}</Link>
          <Link href="/signin">{t("account.signIn")}</Link>
        </section>
      </EntryPage>
    );
  }

  return (
    <EntryPage>
      <form className="card account-form" onSubmit={(e) => void submit(e)}>
        <h1>{t("account.reset.title")}</h1>
        <label>
          {t("account.newPassword")}
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
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? t("common.saving") : t("account.reset.submit")}
        </button>
      </form>
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
              {account.isAdmin && (
                <Link href="/admin/stats" className="menu-item" onClick={close}>{t("adminStats.menu")}</Link>
              )}
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
