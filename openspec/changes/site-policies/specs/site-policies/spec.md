## ADDED Requirements

### Requirement: Privacy notice
The app SHALL serve a privacy notice at `/privacy` as a policy page, showing the date it was last updated. It SHALL cover what is kept, what is not done (no analytics, tracking or outside scripts), the cookie and browser storage, who sees what in a room, and how each kind of data is deleted.

#### Scenario: Reading the privacy notice
- **WHEN** anyone opens `/privacy`
- **THEN** the page shows a "Privacy" heading, the last-updated date, and sections for what is kept, what is not done, cookies and browser storage, who sees what, and deleting data

#### Scenario: Asking to delete an account
- **WHEN** a GM reads how to delete their account
- **THEN** the notice says there is no button for it yet and names the people to ask

### Requirement: Policy statements match the code
Every statement in the privacy notice and terms SHALL be true of the code at the date shown. A change to what the app stores, the cookie, browser storage, outside hosts it loads, or deletion SHALL update the pages and their date in the same change.

#### Scenario: Adding an analytics script
- **WHEN** a change adds a script loaded from another site
- **THEN** the same change updates "What we don't do" and the last-updated date

### Requirement: Terms of use
The app SHALL serve terms of use at `/terms` as a policy page. They SHALL state that the app is a free student project provided as is and may be reset or taken down; that uploaders keep the rights to their uploads, must have the right to use them, and grant only what the app needs to store and show them in their rooms; the rules of conduct; and the source code's licence. They SHALL link to the privacy notice and show the date they were last updated.

#### Scenario: Reading the terms
- **WHEN** anyone opens `/terms`
- **THEN** the page shows a "Terms of use" heading, the last-updated date, a section on uploads, and a link to `/privacy`

### Requirement: Policy pages follow the design language
A policy page SHALL be a reading page, not an entry card: the shared header (the mark and name linking home, Privacy and Terms as its navigation with the current one in the selected treatment, the account control and the theme toggle), one left-aligned column at most 65 characters wide, and sections grouped by hairline and space. It SHALL sit on the hub layer's ground and follow the stored light or dark choice. Headings SHALL set hierarchy by weight and colour, as on the hub pages.

#### Scenario: Reading on a phone
- **WHEN** a visitor opens `/terms` at 375 px wide
- **THEN** the page has no sideways scroll, the header's navigation takes its own row, and "What we keep" on `/privacy` stacks each label above its text

#### Scenario: Knowing which policy is open
- **WHEN** a visitor opens `/privacy`
- **THEN** Privacy is marked as the current page in the header's navigation and in the footer, and Terms is not

### Requirement: One footer
The home page and both policy pages SHALL end with the same footer: who built the app at the left and a "Policies" navigation with Privacy and Terms at the right, under a fading hairline on the header's width. Its links SHALL be quiet (muted, the text colour on hover or when current) and show the focus ring from the keyboard. On a phone the links SHALL wrap under the credit.

#### Scenario: From the home page
- **WHEN** a visitor reaches the home page's footer
- **THEN** it has a "Policies" navigation with Privacy and Terms links, and following one opens that page at its top

### Requirement: Where the policies are linked
The sign-up form SHALL state, below its fields and above its submit button, that creating an account means agreeing to the terms and the privacy notice, with a link to each. It SHALL NOT add a checkbox.

#### Scenario: Signing up
- **WHEN** a signed-out visitor opens `/signup`
- **THEN** the form says that creating an account means agreeing to the terms and the privacy notice, links each, and has no checkbox
