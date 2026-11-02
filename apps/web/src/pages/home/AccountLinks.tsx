import { useAccount } from "../../account/accountStore";
import { Link } from "../../Link";

/** Top bar: sign in or create an account; signed in, the way back to your rooms. */
export function AccountLinks() {
  const account = useAccount();
  if (account.status === "loading") return null;
  if (account.status === "signedIn") {
    return (
      <Link href="/gm-dashboard" className="nav-cta">
        Your rooms
      </Link>
    );
  }
  // One group, so a phone can give the pair a row of its own and keep the toggle top right.
  return (
    <span className="account-pair">
      <Link href="/signin" className="nav-link">
        Sign in
      </Link>
      <Link href="/signup" className="nav-cta">
        Create account
      </Link>
    </span>
  );
}
