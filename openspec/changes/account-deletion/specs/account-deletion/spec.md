## ADDED Requirements

### Requirement: Self-serve account deletion
A signed-in user SHALL be able to delete their own account by sending their current password. The server MUST verify the password before deleting anything, and MUST rate-limit wrong passwords per account with the same budget as password change.

#### Scenario: Correct password deletes the account
- **WHEN** a signed-in user sends `DELETE /api/auth/account` with the correct password
- **THEN** the response is 204, the session cookie is cleared, and signing in with that email fails afterwards

#### Scenario: Wrong password deletes nothing
- **WHEN** the password is wrong
- **THEN** the response is 403 with field `password`, and the account, rooms and library are unchanged

#### Scenario: Signed out
- **WHEN** the request has no valid session
- **THEN** the response is 401 and nothing is deleted

### Requirement: Deletion removes everything the account owns
Deleting an account SHALL remove every room it owns (with each room's history, uploads and seat credentials), its whole library (assets, creatures, dice looks, animations, encounter templates), the stored objects behind them, all its sessions, its room memberships in other people's rooms, and the user and owner rows. Open connections on those rooms and sessions MUST be closed.

#### Scenario: Owned rooms and library are gone
- **WHEN** an account owning two rooms and library items is deleted
- **THEN** both rooms return 404, connected clients are told the room was deleted, and the library listing and stored objects are empty

#### Scenario: Other people's rooms keep running
- **WHEN** the deleted user was a participant in a room owned by someone else
- **THEN** that room continues, the user's membership row is removed, and their seat can no longer be resumed

### Requirement: Deletion is confirmed in the UI
The account page SHALL offer "Delete account". The dialog MUST state that deletion is permanent, require the user to type their email address, and require their password before the delete button enables.

#### Scenario: Confirmation gate
- **WHEN** the dialog is open and the typed email does not match the account email
- **THEN** the delete button is disabled

#### Scenario: Success returns home
- **WHEN** deletion succeeds
- **THEN** the client shows the signed-out state on the home page
