## Purpose

Keeps an account safe when someone else signs up with its email, and lets the person who controls an email address get into its account by choosing a new password.

## ADDED Requirements

### Requirement: A repeat sign-up never changes the account
In production, a sign-up for an email that already has an account SHALL NOT change that account's password, verification state, or any other field, and SHALL NOT create a second account. The response SHALL be identical in status and body to a successful sign-up with a new email, and SHALL set no session cookie.

#### Scenario: Someone signs up with an unverified owner's email
- **WHEN** an account exists unverified with password A and another sign-up for the same email uses password B
- **THEN** the response says verification is required, password A still signs in once the email is verified, and password B never does

#### Scenario: Someone signs up with a verified owner's email
- **WHEN** a verified account exists and a sign-up for the same email is submitted
- **THEN** the response is the same as for a new email, the account is unchanged, and its sessions keep working

### Requirement: The owner is emailed about a repeat sign-up
In production, a repeat sign-up SHALL email the address. For an unverified account the email SHALL be a verification link for the account's existing credentials, and earlier verification links SHALL stop working. For a verified account the email SHALL say that someone tried to sign up with this address and give links to sign in and to reset the password. These emails SHALL share the per-email limit of verification link requests, and over that limit the sign-up SHALL still get the same response and no email SHALL be sent.

#### Scenario: Repeat sign-up for an unverified account
- **WHEN** a repeat sign-up is submitted for an unverified account within the limit
- **THEN** the address receives a new verification link and the previous link is refused

#### Scenario: Repeat sign-up for a verified account
- **WHEN** a repeat sign-up is submitted for a verified account within the limit
- **THEN** the address receives the "someone tried to sign up" notice with sign-in and reset links, and no verification link

#### Scenario: Repeated sign-ups over the limit
- **WHEN** repeat sign-ups for one email exceed the per-email limit
- **THEN** each still gets the normal sign-up response and no further email is sent

### Requirement: A reset link can be requested
The server SHALL accept a request for a password reset link by email address. It SHALL answer the same way whether or not the address has an account, and SHALL send a reset link only when an account exists, verified or not. Requests SHALL be rate limited per email address and per client address. A new reset link SHALL make that account's earlier reset links stop working.

#### Scenario: Request for an existing account
- **WHEN** a reset link is requested for an address with an account
- **THEN** the response is 204 and the address receives a link to the reset page

#### Scenario: Request for an unknown address
- **WHEN** a reset link is requested for an address with no account
- **THEN** the response is identical and no email is sent

#### Scenario: Too many requests
- **WHEN** one email address or one client address exceeds its limit
- **THEN** the server answers 429 with the time to wait for the client-address limit, sends no email, and the per-email limit is applied silently with the same 204 answer

### Requirement: Reset links are one-time and short-lived
A reset link SHALL carry a random token that works once and expires one hour after it was issued. The server SHALL store only a hash of the token. Opening the reset page SHALL NOT consume the token; only submitting a new password from the page SHALL.

#### Scenario: Expired, used or unknown token
- **WHEN** a password is submitted with a token that is expired, already used, superseded or never issued
- **THEN** the server refuses it with one answer and the password does not change

#### Scenario: Scanner fetches the link
- **WHEN** an automated scanner requests the reset link's URL without running the page
- **THEN** the token remains unused and valid

### Requirement: Resetting the password takes over the account safely
Submitting a valid reset token with a new password SHALL set the account's password, SHALL mark the email verified if it was not, SHALL make every outstanding verification and reset link for the account stop working, SHALL end every existing session of the account and its delegated access, and SHALL start a new session. The new password SHALL meet the same rules as sign-up, including the common-password check and not equal to the email.

#### Scenario: Owner reclaims a squatted address
- **WHEN** a squatter created an unverified account with the owner's email and the owner resets the password through a link sent to that email
- **THEN** the account is verified with the owner's new password, the squatter's password no longer signs in, and the squatter's verification link is refused

#### Scenario: Reset ends other sessions
- **WHEN** a verified account with two signed-in devices is reset
- **THEN** both earlier sessions end and only the session started by the reset is signed in

#### Scenario: Weak new password
- **WHEN** the new password is too short, too common, or equal to the email
- **THEN** the server refuses it with a field error and the token stays usable until it expires

### Requirement: Recovery emails
Reset links and repeat sign-up notices SHALL link to the site's own configured public origin, SHALL be written in the language of the request that caused them (English or Traditional Chinese), and SHALL say what to do if the person did not ask for them.

#### Scenario: Traditional Chinese reset request
- **WHEN** a reset link is requested with Traditional Chinese as the request language
- **THEN** the reset email subject and body are in Traditional Chinese

### Requirement: Recovery screens
The web app SHALL offer "Forgot password?" from sign-in, a page to request a reset link that always confirms the email was sent if an account exists, and a reset page that takes a new password, then signs the person in and continues into the app. A bad token SHALL show that the link no longer works and offer to request a new one. All text SHALL be available in English and Traditional Chinese.

#### Scenario: Reset from the link
- **WHEN** a person opens a valid reset link and submits an acceptable new password
- **THEN** they are signed in and sent to the dashboard

#### Scenario: Link no longer works
- **WHEN** the reset page submits a token that is expired, used or unknown
- **THEN** the page says the link no longer works and offers to send a new one

### Requirement: Account deletion removes reset links
Deleting an account SHALL also delete its reset tokens.

#### Scenario: Delete with a pending reset link
- **WHEN** an account with an unused reset token is deleted
- **THEN** deletion succeeds and no reset token for it remains
