## REMOVED Requirements

### Requirement: Taken email is reported without email verification
**Reason**: Production now verifies email (the `email-verification` change), and a repeat sign-up must not reveal or change an existing account (`account-recovery`).
**Migration**: Production sign-up answers a registered email like a new one and emails the owner instead. Development keeps the 409 under the requirement below.

## ADDED Requirements

### Requirement: Registered email disclosure by environment
In production, sign-up SHALL NOT reveal whether an email is registered: a registered email SHALL get the same response as a new one, and the owner is emailed as described in `account-recovery`. On a server that is not in production, where no mail is sent, sign-up for a registered email SHALL respond 409 and mark the email field, so a developer can switch to signing in.

#### Scenario: Registered email in production
- **WHEN** a person signs up in production with an email that already has an account, within the limit
- **THEN** the response is the same as for a new email and no account is created or changed

#### Scenario: Registered email in development
- **WHEN** a person signs up on a non-production server with an email that already has an account
- **THEN** the server responds 409, marks the email field, and creates no account
