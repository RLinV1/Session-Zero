import { AccountMenu } from "../../account/AccountPages";
import { useAccount } from "../../account/accountStore";
import { Link } from "../../Link";
import { t } from "../../i18n/locale";

/** Top bar: sign up, or return to your rooms and account menu. */
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
  return <Link href="/signup" className="nav-cta">{t("home.signUp")}</Link>;
}
