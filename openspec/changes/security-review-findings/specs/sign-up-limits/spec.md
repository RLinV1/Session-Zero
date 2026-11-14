## Purpose

Limits how fast one address can try sign-ups, and records that sign-up tells a person when their email already has an account, since the app does not verify email.

## ADDED Requirements

### Requirement: Sign-up attempts per address
The server SHALL accept at most 50 sign-up attempts per client address per hour, counting successful and failed attempts. Further attempts in that hour SHALL get HTTP 429 with a `Retry-After` header and SHALL NOT create an account or reveal whether the email is registered.

#### Scenario: Fifty-first attempt in an hour
- **WHEN** one address has made 50 sign-up attempts in the last hour and makes another
- **THEN** the server responds 429 with `Retry-After`, creates no account, and does not say whether the email is taken

#### Scenario: Another address is unaffected
- **WHEN** one address is at its sign-up limit and a different address signs up
- **THEN** the second sign-up is processed normally

### Requirement: Taken email is reported without email verification
Sign-up SHALL NOT require email verification. When the email already has an account, sign-up SHALL respond 409 and say so, so a person can switch to signing in. This disclosure is an accepted risk, bounded by the sign-up limit above.

#### Scenario: Email already registered
- **WHEN** a person signs up with an email that already has an account, within the limit
- **THEN** the server responds 409, marks the email field, and creates no account

#### Scenario: No verification step
- **WHEN** a person signs up with a new email
- **THEN** the account is usable at once, with no email sent and no confirmation step
