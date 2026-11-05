## ADDED Requirements

### Requirement: Sign in from the home page and stay
The home page's header SHALL link a signed-out visitor to the account page: "Sign in" to `/account` and "Create account" to `/account/new`. Each of those pages SHALL show its form under the site header and SHALL link to the other. Signing in or creating an account there SHALL leave the person on `/account`, signed in, and SHALL NOT send them to the GM dashboard.

#### Scenario: Signing in from the home page
- **WHEN** a signed-out visitor on `/` follows "Sign in" and signs in
- **THEN** they are on `/account`, shown as signed in

#### Scenario: Creating an account from the home page
- **WHEN** a signed-out visitor on `/` follows "Create account" and creates an account
- **THEN** they are on `/account`, shown as signed in, and `/account/new` is not left in the address

#### Scenario: A refused sign-in
- **WHEN** a sign-in on the account page is refused
- **THEN** the message appears beside the form, the typed email stays, and the password is cleared

#### Scenario: Pages that need an account are unchanged
- **WHEN** a signed-out visitor opens `/gm-dashboard`
- **THEN** they are sent to `/signin`, which returns them to the dashboard after signing in

### Requirement: The account page shows the account
A signed-in person on `/account` SHALL see their display name and email, links to their rooms and library, and controls for settings, changing their password, signing out and deleting their account. Those controls SHALL be the same dialogs and actions as the account menu. Signing out SHALL return to the home page. The account menu SHALL link to this page. A signed-in person who opens `/account/new` SHALL be sent to `/account`.

#### Scenario: Reaching the page when signed in
- **WHEN** a signed-in person opens the account menu and chooses "Your account"
- **THEN** they are on `/account` and see their display name and email

#### Scenario: Signing out from the page
- **WHEN** a signed-in person chooses "Sign out" on the account page
- **THEN** the session ends and they land on the home page

#### Scenario: Deleting from the page
- **WHEN** a signed-in person chooses "Delete account" on the account page
- **THEN** the deletion dialog opens, under the same confirmation rules as from the account menu (`account-deletion`)
