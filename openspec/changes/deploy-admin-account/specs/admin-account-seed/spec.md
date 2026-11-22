## Purpose

Gives a fresh deploy one ready admin account, the one `/admin/stats` trusts by id, without anyone editing the server by hand.

## ADDED Requirements

### Requirement: The server creates the configured admin account at start
When `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and `ADMIN_ACCOUNT_IDS` holds exactly one account id, the server SHALL, on start, create an account with that id, that email and that password, already verified, if no account with that id exists. It SHALL NOT change an account that already has that id. It SHALL NOT log the password. When any of the three settings is missing, or `ADMIN_ACCOUNT_IDS` holds more than one id, it SHALL create nothing.

#### Scenario: First start
- **WHEN** the server starts on an empty database with the three settings present
- **THEN** an account with the configured id and email exists, is verified, signs in with the configured password, and can open `/admin/stats`

#### Scenario: Later start after a password change
- **WHEN** the admin changed their password and the server restarts with the original `ADMIN_PASSWORD`
- **THEN** the account is unchanged and only the new password signs in

#### Scenario: Settings absent
- **WHEN** the server starts without `ADMIN_EMAIL` or `ADMIN_PASSWORD`
- **THEN** no account is created and the server starts normally

### Requirement: A taken admin email grants nothing
If another account already holds the configured admin email, the server SHALL create no account, SHALL leave the other account unchanged, SHALL log a warning naming the setting but not the email, and SHALL keep starting. Admin access SHALL remain decided by account id only.

#### Scenario: Someone registered the admin email first
- **WHEN** an account with a different id holds `ADMIN_EMAIL` and the server starts
- **THEN** no admin account is created, the existing account cannot open `/admin/stats`, and the server is up

### Requirement: The GCP deploy provides the admin settings
The GCP Terraform stack SHALL require an `admin_email` variable, SHALL generate the admin account id and a password of at least 24 characters, SHALL write `ADMIN_ACCOUNT_IDS`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` into the server's environment file, and SHALL expose the password only as a sensitive output.

#### Scenario: Reading the password
- **WHEN** the operator runs `terraform output -raw admin_password` after apply
- **THEN** it prints the password that signs in to the admin account
