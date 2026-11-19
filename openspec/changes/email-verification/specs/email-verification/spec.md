## Purpose

Proves that a person controls the email address of an account before the live site lets that account sign in, while leaving local development free of mail and waiting.

## ADDED Requirements

### Requirement: Verification applies in production only
The server SHALL require email verification when it runs in production (`NODE_ENV=production`) and SHALL NOT require it otherwise. In production the server SHALL refuse to start unless mail sending is configured.

#### Scenario: Production without mail configuration
- **WHEN** the server starts with `NODE_ENV=production` and no SMTP host, user, password or sender
- **THEN** it fails at startup with a message naming the missing settings

#### Scenario: Development sign-up
- **WHEN** someone signs up on a server that is not in production
- **THEN** the account is created already verified, a session starts, and no email is sent

### Requirement: Sign-up in production sends a verification link
In production, sign-up SHALL create an unverified account, send one verification link to the given address, start no session, and answer that verification is required. The answer SHALL NOT contain the account or any token.

#### Scenario: Successful production sign-up
- **WHEN** a valid sign-up is submitted in production
- **THEN** the response says verification is required, sets no session cookie, and an email with a link is sent to the address

#### Scenario: Mail provider fails during sign-up
- **WHEN** the mail provider refuses or times out while sending the first link
- **THEN** the account still exists, the response is the same as for a sent link, the failure is logged without the token, and the person can ask for another link

#### Scenario: Address already registered
- **WHEN** sign-up uses an address that already has an account
- **THEN** the server refuses it as it does today, and sends no email

### Requirement: Unverified accounts cannot sign in
In production, sign-in SHALL be refused for an account whose address is not verified, after the password has been checked. The refusal SHALL be distinguishable from a wrong password only to a caller who supplied the correct password.

#### Scenario: Correct password, unverified
- **WHEN** the owner of an unverified account signs in with the right password
- **THEN** no session starts and the response says the address is not verified

#### Scenario: Wrong password, unverified
- **WHEN** someone signs in to an unverified account with a wrong password
- **THEN** the response is the ordinary failed-sign-in answer, identical to an unknown address

### Requirement: Verification links are one-time and expire
A verification link SHALL carry a random token that works once and expires 24 hours after it was issued. The server SHALL store only a hash of the token. Issuing a new link for an account SHALL invalidate that account's earlier links.

#### Scenario: Using a valid link
- **WHEN** a person submits a valid, unexpired, unused token
- **THEN** the account becomes verified, the token cannot be used again, and a session starts

#### Scenario: Expired token
- **WHEN** a person submits a token issued more than 24 hours ago
- **THEN** the server refuses it and the account stays unverified

#### Scenario: Reused token
- **WHEN** a token that was already used is submitted again
- **THEN** the server refuses it

#### Scenario: Superseded token
- **WHEN** a new link is issued for an account and the earlier link is then submitted
- **THEN** the server refuses the earlier link

#### Scenario: Unknown token
- **WHEN** a token that was never issued is submitted
- **THEN** the server refuses it with the same answer as an expired one

### Requirement: Opening the link does not consume it
Loading the verification page SHALL NOT verify the account. The token SHALL be consumed only by an explicit request from the page, so mail scanners that fetch links do not use them up.

#### Scenario: Scanner fetches the link
- **WHEN** an automated scanner requests the link's URL without running the page
- **THEN** the token remains unused and valid

### Requirement: A new link can be requested
The server SHALL accept a request for a new verification link by email address. It SHALL answer the same way whether or not the address has an unverified account, and SHALL send mail only when it does. Requests SHALL be rate limited per address and per client address.

#### Scenario: Resend for an unverified account
- **WHEN** a link is requested for an address with an unverified account
- **THEN** a new link is sent and earlier links stop working

#### Scenario: Resend for an unknown or verified address
- **WHEN** a link is requested for an address with no account or an already verified account
- **THEN** the response is identical to the one above and no email is sent

#### Scenario: Too many requests
- **WHEN** one address or client exceeds the resend limit
- **THEN** the server answers 429 with the time to wait and sends no email

### Requirement: Existing accounts stay usable
Accounts that exist when verification is introduced SHALL be treated as verified.

#### Scenario: Deploy with existing users
- **WHEN** the change is deployed to a database that already has accounts
- **THEN** every existing account is verified and can sign in with no link

### Requirement: Email content and language
The verification email SHALL contain the link to the site's own address, be written in the language of the request that caused it (English or Traditional Chinese), and come from the configured sender address.

#### Scenario: Link target
- **WHEN** a verification email is built
- **THEN** its link points to the verify page under the site's configured public origin, with the token as a query parameter

#### Scenario: Traditional Chinese sign-up
- **WHEN** the sign-up request asks for Traditional Chinese
- **THEN** the email subject and body are in Traditional Chinese

### Requirement: Verification screens
The web app SHALL, in production, show a "check your email" screen after sign-up with a way to resend the link, SHALL show a verify page that completes verification and then continues into the app, and SHALL tell an unverified person at sign-in that the address needs verifying, with the same resend action. All text SHALL be available in English and Traditional Chinese.

#### Scenario: After sign-up
- **WHEN** production sign-up succeeds
- **THEN** the person sees the address the link was sent to and a resend action, and is not signed in

#### Scenario: Link opened with a good token
- **WHEN** the person opens the link and the page submits the token successfully
- **THEN** they are signed in and sent to the page they were heading to

#### Scenario: Link opened with a bad token
- **WHEN** the token is expired, used or unknown
- **THEN** the page says the link no longer works and offers to send a new one

### Requirement: Account deletion removes pending links
Deleting an account SHALL also delete its verification tokens.

#### Scenario: Delete with a pending link
- **WHEN** an account with an unused token is deleted
- **THEN** deletion succeeds and no token for it remains
