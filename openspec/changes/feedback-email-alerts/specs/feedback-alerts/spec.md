## Purpose

Tells the team by email when a feedback report arrives, without letting floods or bots exhaust the mail allowance that sign-up verification and password reset share.

## ADDED Requirements

### Requirement: Team notice for each saved report
When a feedback report is saved and both an admin address and mail delivery are configured, the server SHALL send one plain-text email to the admin address. The email SHALL contain the report's reference, kind, summary, full details, whether the reporter was signed in, the reporter's account email when signed in, and every technical detail the report carries. It SHALL attach each of the report's stored screenshots as the cleaned WebP image that was saved, never the original upload. The subject SHALL be the reference, the kind and the summary, on one line with line breaks removed and cut to at most 100 characters.

#### Scenario: Signed-in report
- **WHEN** a signed-in user sends a bug report with two screenshots
- **THEN** the admin address receives one email whose subject holds the reference, "bug" and the summary, whose body holds the summary, the details, the user's email and the technical details, with the two cleaned screenshots attached as WebP files

#### Scenario: Guest report
- **WHEN** a signed-out visitor sends a report
- **THEN** the email says the reporter was not signed in and contains no email address

#### Scenario: Technical details turned off
- **WHEN** a reporter unticks "Include technical details"
- **THEN** the email says no technical details were included

#### Scenario: Attachments are the cleaned images
- **WHEN** a report's screenshot carried EXIF location data on upload
- **THEN** the attached image is the re-encoded WebP with no location data

#### Scenario: Nothing configured
- **WHEN** no admin address or no mail delivery is configured
- **THEN** the report is saved and answered as before, and no email is attempted

### Requirement: Mail never fails a report
A failure to send the notice SHALL NOT change the response to the reporter. The report SHALL already be saved before the notice is sent, and the failure SHALL be logged.

#### Scenario: Mail server down
- **WHEN** sending the notice throws
- **THEN** the reporter still gets 201 with their reference, the report is in storage, and the error is logged

### Requirement: Daily notice cap
The server SHALL send at most 20 feedback notices in any rolling 24 hours. Reports past the cap SHALL be saved and answered normally without a notice.

#### Scenario: Twenty-first report in a day
- **WHEN** 21 reports are saved within 24 hours
- **THEN** 20 notices are sent and the 21st report is saved with no notice

#### Scenario: Cap frees up
- **WHEN** 24 hours pass after the first capped notice
- **THEN** the next saved report sends a notice again

### Requirement: Honeypot drops bot reports
The Feedback form SHALL carry a field that people never see and assistive technology never announces. A submission that fills it in SHALL be answered with 201 and a well-formed reference, SHALL NOT be saved, and SHALL NOT send a notice. A submission that leaves it empty or omits it SHALL be handled as a normal report.

#### Scenario: Bot fills every field
- **WHEN** a submission sends a valid report and a non-empty honeypot field
- **THEN** the response is 201 with a reference, nothing is stored, and no email is sent

#### Scenario: Person submits the form
- **WHEN** a person submits the Feedback form
- **THEN** the honeypot field is empty, and the report is saved and noticed as usual

#### Scenario: Hidden from people
- **WHEN** the Feedback dialog is open
- **THEN** the honeypot field is not visible, not focusable with the keyboard, and not in the accessibility tree
