## ADDED Requirements

### Requirement: Signing in leads to the person's rooms
The home page's header SHALL link a signed-out visitor to sign-in: "Sign in" to `/signin` and "Create account" to `/signup`. Signing in or creating an account SHALL return the person to the page that sent them (`next`) and, with no `next`, SHALL land on their rooms at `/gm-dashboard`. It SHALL NOT end on the account page. `/account/new`, where "Create account" used to point, SHALL show the create-account form.

#### Scenario: Signing in from the home page
- **WHEN** a signed-out visitor on `/` follows "Sign in" and signs in
- **THEN** they are on `/gm-dashboard`, shown as signed in

#### Scenario: Creating an account from the home page
- **WHEN** a signed-out visitor on `/` follows "Create account" and creates an account
- **THEN** they are on `/gm-dashboard`, shown as signed in

#### Scenario: A refused sign-in
- **WHEN** a sign-in is refused
- **THEN** the message appears beside the form, the typed email stays, and the password is cleared

#### Scenario: Pages that need an account are unchanged
- **WHEN** a signed-out visitor opens `/gm-dashboard`
- **THEN** they are sent to `/signin`, which returns them to the dashboard after signing in

### Requirement: The account page opens from the account menu
The account page at `/account` SHALL be for a signed-in person, and "Your account" in the account menu SHALL be the link to it. A signed-out visitor who opens `/account` SHALL be sent to `/signin` with no `next`, so signing in leads to their rooms.

#### Scenario: Reaching the page when signed in
- **WHEN** a signed-in person opens the account menu and chooses "Your account"
- **THEN** they are on `/account` and see their display name and email

#### Scenario: Opening the page signed out
- **WHEN** a signed-out visitor opens `/account`
- **THEN** they are on `/signin`, and signing in takes them to `/gm-dashboard`

### Requirement: The account page shows the account
A signed-in person on `/account` SHALL see the shared header with the account control, their display name and email, and controls for changing their password, this browser's sound and graphics, signing out and deleting their account, grouped by what each one touches with deletion last. Signing out SHALL return to the home page.

#### Scenario: Signing out from the page
- **WHEN** a signed-in person chooses "Sign out" on the account page
- **THEN** the session ends and they land on the home page

#### Scenario: Deleting from the page
- **WHEN** a signed-in person chooses "Delete account" on the account page
- **THEN** the deletion dialog opens, under the confirmation rules in `account-deletion`

### Requirement: The account menu keeps to everyday actions
The account menu SHALL show who is signed in and offer "Your account", sound and graphics, and "Sign out", as rows in the shared popover. It SHALL NOT offer changing the password or deleting the account, which are on the account page. It SHALL close on Escape, returning focus to its button, and on a press outside it.

#### Scenario: Opening the menu
- **WHEN** a signed-in person opens the account menu
- **THEN** they see their display name and email, and the three actions, with no "Delete account"

#### Scenario: Dismissing the menu
- **WHEN** the account menu is open and the person presses Escape
- **THEN** it closes and focus returns to its button
