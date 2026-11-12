import { AccountMenu } from "../../account/AccountPages";
import { useAccount } from "../../account/accountStore";
import { Link } from "../../Link";
import { t } from "../../i18n/locale";

/** Top bar: sign in or create an account; signed in, the account menu and the way back to your rooms. */
export function AccountLinks() {
  const account = useAccount();
  if (account.status === "loading") return null;
  if (account.status === "signedIn") {
    return (
      <span className="account-pair">
        <Link href="/gm-dashboard" className="nav-cta">
          {t("home.yourRooms")}
        </Link>
        <AccountMenu />
      </span>
    );
  }
  // One group, so a phone can give the pair a row of its own and keep the toggle top right.
  return (
    <span className="account-pair">
      <Link href="/signin" className="nav-link">
        {t("home.signIn")}
      </Link>
      <Link href="/signup" className="nav-cta">
        {t("home.createAccount")}
      </Link>
    </span>
  );
}
